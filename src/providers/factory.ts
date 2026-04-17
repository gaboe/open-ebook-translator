import { WebLLMProviderImpl } from "../llm/webllm-provider";
import { LMStudioProviderImpl } from "../llm/lmstudio-provider";
import { OpenRouterProviderImpl } from "../llm/openrouter-provider";
import { OpenAIProviderImpl } from "../llm/openai-provider";
import type { WebLLMProvider } from "../types";
import { PROVIDERS, type ProviderId } from "../config/catalog";

export interface ProviderOptions {
  providerId: ProviderId;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  initProgressCallback?: (progress: number) => void;
}

export function createProvider(options: ProviderOptions): WebLLMProvider {
  const { providerId, model, apiKey, baseUrl, initProgressCallback } = options;

  switch (providerId) {
    case "webllm":
      return new WebLLMProviderImpl({
        modelId: model || PROVIDERS.webllm.defaultModel,
        initProgressCallback,
      });

    case "lmstudio":
      return new LMStudioProviderImpl({
        model: model || PROVIDERS.lmstudio.defaultModel,
        baseURL: baseUrl,
      });

    case "opencode":
      throw new Error("OpenCode CLI provider is not available in the browser");

    case "openrouter":
      return new OpenRouterProviderImpl({
        model: model || PROVIDERS.openrouter.defaultModel,
        apiKey,
        baseURL: baseUrl,
      });

    case "openai":
      return new OpenAIProviderImpl({
        model: model || PROVIDERS.openai.defaultModel,
        apiKey,
        baseURL: baseUrl,
      });

    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

export function getProviderConcurrency(providerId: ProviderId): number {
  switch (providerId) {
    case "opencode":
      return 1;
    case "openrouter":
      return 1;
    case "openai":
      return 32;
    case "lmstudio":
    case "webllm":
    default:
      return 4;
  }
}
