import { describe, expect, it, vi, afterEach } from "vitest";
import { OpenAIProviderImpl } from "./openai-provider";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("OpenAIProviderImpl", () => {
  it("uses max_completion_tokens for gpt-5 models", async () => {
    let requestBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = new OpenAIProviderImpl({ model: "gpt-5.4", apiKey: "test-key" });

    await provider.chatCompletion({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 123,
    });

    expect(requestBody?.["max_completion_tokens"]).toBe(123);
    expect(requestBody?.["max_tokens"]).toBeUndefined();
  });

  it("keeps max_tokens for non-gpt-5 models", async () => {
    let requestBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = new OpenAIProviderImpl({ model: "gpt-4.1-mini", apiKey: "test-key" });

    await provider.chatCompletion({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 456,
    });

    expect(requestBody?.["max_tokens"]).toBe(456);
    expect(requestBody?.["max_completion_tokens"]).toBeUndefined();
  });
});
