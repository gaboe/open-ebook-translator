import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { translate } from "../translate";
import {
  SubmitKind,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type WebLLMProvider,
} from "../types";

class FakeProvider implements WebLLMProvider {
  constructor(
    private readonly responder: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>,
  ) {}

  async initialize(): Promise<void> {}

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return this.responder(request);
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

function parseUserPayload(content: string): string[] | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // ignore
  }

  return null;
}

async function createTestEpub(chapterContent: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("OEBPS/chapter1.xhtml", chapterContent);
  zip.file("mimetype", "application/epub+zip");
  return await zip.generateAsync({ type: "arraybuffer" });
}

async function readTranslatedChapter(epub: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(epub);
  const file = zip.file("OEBPS/chapter1.xhtml");
  if (!file) {
    throw new Error("Missing translated chapter");
  }
  return await file.async("string");
}

describe("translate integration", () => {
  it("keeps the original chapter when provider signals truncation", async () => {
    const source =
      '<html><body><p>Hello world.</p><p>This chapter is intentionally long enough to be split into smaller safe chunks for translation.</p></body></html>';

    const provider = new FakeProvider(async () => ({
      content: "<html><body><p>Ahoj",
      finishReason: "length",
      usage: {
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      },
    }));

    const result = await translate({
      source: await createTestEpub(source),
      targetLanguage: "Slovak",
      submit: SubmitKind.REPLACE,
      provider,
      maxRetries: 1,
      maxGroupTokens: 20,
    });

    expect(result.stats.chaptersTranslated).toBe(0);
    expect(await readTranslatedChapter(result.epub)).toBe(source);
  });

  it("preserves markup while translating minified xhtml chunks", async () => {
    const source =
      '<html><body><p>Hello world.</p><p>Hello again from a minified chapter.</p><p>Hello once more.</p></body></html>';

    const provider = new FakeProvider(async (request) => {
      const chunk = request.messages[1]?.content ?? "";
      const segments = parseUserPayload(chunk);

      if (segments) {
        return {
          content: JSON.stringify(
            segments.map((segment) => segment.replaceAll("Hello", "Ahoj").replaceAll("world", "svet")),
          ),
          finishReason: "stop",
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
          },
        };
      }

      return {
        content: chunk.replaceAll("Hello", "Ahoj").replaceAll("world", "svet"),
        finishReason: "stop",
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
      };
    });

    const result = await translate({
      source: await createTestEpub(source),
      targetLanguage: "Slovak",
      submit: SubmitKind.REPLACE,
      provider,
      maxRetries: 1,
      maxGroupTokens: 20,
    });

    const translated = await readTranslatedChapter(result.epub);

    expect(result.stats.chaptersTranslated).toBe(1);
    expect(translated).toContain("<html><body>");
    expect(translated).toContain("<p>Ahoj svet.</p>");
    expect(translated).toContain("</body></html>");
    expect(translated).not.toContain("&lt;p");
  });

  it("falls back to per-segment translation when JSON response is invalid", async () => {
    const source =
      '<html><body><p><span>Hello world.</span></p><p><span>Hello again.</span></p></body></html>';

    let callCount = 0;
    const provider = new FakeProvider(async (request) => {
      callCount++;
      const payload = request.messages[1]?.content ?? "";
      const segments = parseUserPayload(payload);

      if (segments && callCount === 1) {
        return {
          content: '["Ahoj svet", "unterminated"',
          finishReason: "stop",
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
          },
        };
      }

      return {
        content: payload.replaceAll("Hello", "Ahoj").replaceAll("world", "svet"),
        finishReason: "stop",
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
      };
    });

    const result = await translate({
      source: await createTestEpub(source),
      targetLanguage: "Slovak",
      submit: SubmitKind.REPLACE,
      provider,
      maxRetries: 1,
      maxGroupTokens: 20,
    });

    const translated = await readTranslatedChapter(result.epub);

    expect(result.stats.chaptersTranslated).toBe(1);
    expect(translated).toContain("<span>Ahoj svet.</span>");
    expect(translated).toContain("<span>Ahoj again.</span>");
    expect(callCount).toBeGreaterThan(1);
  });

  it("falls back when JSON response leaves segments unchanged", async () => {
    const source = '<html><body><p><span>Hello world.</span></p></body></html>';

    let callCount = 0;
    const provider = new FakeProvider(async (request) => {
      callCount++;
      const payload = request.messages[1]?.content ?? "";
      const segments = parseUserPayload(payload);

      if (segments && callCount === 1) {
        return {
          content: JSON.stringify(segments),
          finishReason: "stop",
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
          },
        };
      }

      return {
        content: payload.replaceAll("Hello", "Ahoj").replaceAll("world", "svet"),
        finishReason: "stop",
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
      };
    });

    const result = await translate({
      source: await createTestEpub(source),
      targetLanguage: "Slovak",
      submit: SubmitKind.REPLACE,
      provider,
      maxRetries: 1,
      maxGroupTokens: 20,
    });

    const translated = await readTranslatedChapter(result.epub);

    expect(result.stats.chaptersTranslated).toBe(1);
    expect(translated).toContain("<span>Ahoj svet.</span>");
    expect(callCount).toBeGreaterThan(1);
  });

  it("retries plain text translation when the output stays unchanged", async () => {
    const source = '<html><body><p>Hello world from a long enough sentence to trigger unchanged retry logic.</p></body></html>';

    let callCount = 0;
    const provider = new FakeProvider(async (request) => {
      callCount++;
      const payload = request.messages[1]?.content ?? "";

      if (callCount === 1) {
        return {
          content: payload,
          finishReason: "stop",
          usage: {
            promptTokens: 10,
            completionTokens: 10,
            totalTokens: 20,
          },
        };
      }

      return {
        content: payload.replaceAll("Hello", "Ahoj").replaceAll("world", "svet"),
        finishReason: "stop",
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
      };
    });

    const result = await translate({
      source: await createTestEpub(source),
      targetLanguage: "Slovak",
      submit: SubmitKind.REPLACE,
      provider,
      maxRetries: 1,
      maxGroupTokens: 200,
    });

    const translated = await readTranslatedChapter(result.epub);

    expect(result.stats.chaptersTranslated).toBe(1);
    expect(translated).toContain("Ahoj svet");
    expect(callCount).toBeGreaterThan(1);
  });
});
