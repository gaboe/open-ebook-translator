import { describe, it, expect } from "vitest";
import {
  stripMarkdownCodeFences,
  escapeXml,
  splitIntoChunks,
  validateTranslatedChapter,
} from "../translate";

import { LANGUAGES, PROVIDERS, getDefaultModel, getProviderConcurrency } from "../index.ts";

describe("translate utilities", () => {
  describe("stripMarkdownCodeFences", () => {
    it("removes opening xml code fence", () => {
      const input = "```xml\n<tag>content</tag>\n```";
      const result = stripMarkdownCodeFences(input);
      expect(result).toBe("<tag>content</tag>\n");
    });

    it("removes closing code fence", () => {
      const input = "<tag>content</tag>\n```";
      const result = stripMarkdownCodeFences(input);
      expect(result).toBe("<tag>content</tag>\n");
    });

    it("handles content without fences", () => {
      const input = "<p>Hello world</p>";
      const result = stripMarkdownCodeFences(input);
      expect(result).toBe("<p>Hello world</p>");
    });
  });

  describe("escapeXml", () => {
    it("escapes ampersands", () => {
      expect(escapeXml("A & B")).toBe("A &amp; B");
    });

    it("escapes less than", () => {
      expect(escapeXml("a < b")).toBe("a &lt; b");
    });

    it("escapes greater than", () => {
      expect(escapeXml("a > b")).toBe("a &gt; b");
    });

    it("escapes quotes", () => {
      expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
    });

    it("escapes apostrophes", () => {
      expect(escapeXml("it's fine")).toBe("it&apos;s fine");
    });

    it("handles HTML content", () => {
      const input = '<p class="test">Hello &amp; "world"</p>';
      const expected =
        "&lt;p class=&quot;test&quot;&gt;Hello &amp;amp; &quot;world&quot;&lt;/p&gt;";
      expect(escapeXml(input)).toBe(expected);
    });
  });

  describe("splitIntoChunks", () => {
    it("splits minified xhtml into multiple safe chunks", () => {
      const paragraph =
        '<p class="noindent"><span>Hello world from a very long paragraph with enough words to exceed the token budget.</span></p>';
      const input =
        '<html><head><title>Test</title></head><body>' + paragraph.repeat(12) + '</body></html>';

      const chunks = splitIntoChunks(input, 80);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join("")).toBe(input);
      chunks.forEach((chunk) => {
        expect(chunk).not.toMatch(/<[^>]*$/);
        expect(chunk).not.toMatch(/^[^<]*>/);
      });
    });
  });

  describe("validateTranslatedChapter", () => {
    it("accepts chapters that preserve structure and closing tags", () => {
      const source = '<html><body><p>Hello</p><p>World</p></body></html>';
      const translated = '<html><body><p>Ahoj</p><p>Svet</p></body></html>';

      expect(validateTranslatedChapter(source, translated)).toBe(true);
    });

    it("rejects chapters missing required closing tags", () => {
      const source = '<html><body><p>Hello</p></body></html>';
      const translated = '<html><body><p>Ahoj</p>';

      expect(validateTranslatedChapter(source, translated)).toBe(false);
    });

    it("rejects chapters that lose paragraph structure", () => {
      const source = '<html><body><p>Hello</p><p>World</p></body></html>';
      const translated = '<html><body>Ahoj Svet</body></html>';

      expect(validateTranslatedChapter(source, translated)).toBe(false);
    });

    it("rejects chapters that change inline markup tokens", () => {
      const source = '<html><body><p><span class="lead">Hello</span> <em>world</em>.</p></body></html>';
      const translated = '<html><body><p><span class="lead">Ahoj</span> svet.</p></body></html>';

      expect(validateTranslatedChapter(source, translated)).toBe(false);
    });

    it("rejects well-formed chapters with severe text loss", () => {
      const source = `<html><body><p>${"Hello world ".repeat(120)}</p></body></html>`;
      const translated = `<html><body><p>${"Ahoj ".repeat(20)}</p></body></html>`;

      expect(validateTranslatedChapter(source, translated)).toBe(false);
    });
  });
});

describe("catalog config", () => {
  it("exports required constants", () => {
    expect(LANGUAGES).toContain("Slovak");
    expect(LANGUAGES).toContain("English");

    expect(PROVIDERS.webllm).toBeDefined();
    expect(PROVIDERS.openai).toBeDefined();
    expect(PROVIDERS.openrouter).toBeDefined();
    expect(PROVIDERS.lmstudio).toBeDefined();

    expect(getDefaultModel("openai")).toBe("gpt-4.1-mini");
    expect(getDefaultModel("webllm")).toBe("Qwen3-8B-q4f16_1-MLC");

    expect(getProviderConcurrency("openai")).toBe(32);
    expect(getProviderConcurrency("openrouter")).toBe(1);
  });
});
