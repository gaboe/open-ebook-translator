// Main entry point
export { translate } from "./translate";
export { SubmitKind } from "./types";
export type {
  TranslateOptions,
  TranslateResult,
  TranslationStats,
  WebLLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  Message,
  MessageRole,
  FillFailedEvent,
  ModelInfo,
} from "./types";

// Configuration
export {
  LANGUAGES,
  PROVIDERS,
  WEBLLM_MODELS,
  OPENROUTER_MODELS,
  OPENAI_MODELS,
  getDefaultModel,
  getModelsForProvider,
} from "./config/catalog";
export type { Language, ProviderId } from "./config/catalog";

// Provider factory
export { createProvider, getProviderConcurrency } from "./providers/factory";
export type { ProviderOptions } from "./providers/factory";

// Legacy exports for backward compatibility
export { WebLLMProviderImpl, SUPPORTED_MODELS } from "./llm/webllm-provider";
export { OpenRouterProviderImpl } from "./llm/openrouter-provider";
