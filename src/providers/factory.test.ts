import { describe, it, expect } from "vitest";
import { createProvider } from "./factory";
import { LMStudioProviderImpl } from "../llm/lmstudio-provider";
import { OpenAIProviderImpl } from "../llm/openai-provider";
import { OpenRouterProviderImpl } from "../llm/openrouter-provider";

describe("createProvider", () => {
  it("creates LMStudio provider with custom baseURL", () => {
    const provider = createProvider({
      providerId: "lmstudio",
      model: "my-model",
      baseUrl: "http://custom-host:1234",
    }) as any;

    expect(provider).toBeInstanceOf(LMStudioProviderImpl);
    expect(provider.baseURL).toBe("http://custom-host:1234");
    expect(provider.model).toBe("my-model");
  });

  it("creates OpenAI provider with custom baseURL", () => {
    const provider = createProvider({
      providerId: "openai",
      model: "gpt-4",
      apiKey: "sk-test",
      baseUrl: "https://custom-openai.com/v1",
    }) as any;

    expect(provider).toBeInstanceOf(OpenAIProviderImpl);
    expect(provider.baseURL).toBe("https://custom-openai.com/v1");
    expect(provider.apiKey).toBe("sk-test");
  });

  it("creates OpenRouter provider with custom baseURL", () => {
    const provider = createProvider({
      providerId: "openrouter",
      model: "google/gemma-3-27b",
      apiKey: "sk-or-test",
      baseUrl: "https://custom-openrouter.com/api",
    }) as any;

    expect(provider).toBeInstanceOf(OpenRouterProviderImpl);
    expect(provider.baseURL).toBe("https://custom-openrouter.com/api");
  });
});
