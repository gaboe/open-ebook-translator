export const LANGUAGES = [
  "Slovak",
  "English",
  "Czech",
  "German",
  "French",
  "Spanish",
  "Italian",
  "Russian",
  "Ukrainian",
  "Chinese",
  "Japanese",
  "Korean",
] as const;

export type Language = (typeof LANGUAGES)[number];

export const PROVIDERS = {
  webllm: {
    id: "webllm",
    name: "WebLLM (browser)",
    defaultModel: "Qwen3-8B-q4f16_1-MLC",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (cloud)",
    defaultModel: "google/gemma-3-27b-it:free",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4.1-mini",
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio (local)",
    defaultModel: "meta-llama-3.1-8b-instruct",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode CLI",
    defaultModel: "opencode/minimax-m2.5-free",
  },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export const BROWSER_PROVIDERS = Object.fromEntries(
  Object.entries(PROVIDERS).filter(([id]) => id !== "opencode"),
) as Omit<typeof PROVIDERS, "opencode">;

export const WEBLLM_MODELS = [
  { id: "Qwen3-8B-q4f16_1-MLC", name: "Qwen 3 8B", size: "5.7 GB" },
  { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama 3.1 8B", size: "5.0 GB" },
  { id: "Qwen3-4B-q4f16_1-MLC", name: "Qwen 3 4B", size: "3.4 GB" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 3B", size: "2.3 GB" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi 3.5 Mini", size: "2.2 GB" },
] as const;

export const OPENROUTER_MODELS = [
  { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B (free)" },
  { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B (free)" },
  { id: "google/gemma-3-4b-it:free", name: "Gemma 3 4B (free)" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)" },
] as const;

export const OPENAI_MODELS = [
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "gpt-4o", name: "GPT-4o" },
] as const;

export function getDefaultModel(providerId: ProviderId): string {
  return PROVIDERS[providerId]?.defaultModel || "";
}

export function getModelsForProvider(providerId: ProviderId) {
  switch (providerId) {
    case "webllm":
      return WEBLLM_MODELS;
    case "openrouter":
      return OPENROUTER_MODELS;
    case "openai":
      return OPENAI_MODELS;
    default:
      return [];
  }
}
