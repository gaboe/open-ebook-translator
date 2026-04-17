import type { WebLLMProvider, ChatCompletionRequest, ChatCompletionResponse } from "../types";
import { getEnv } from "../utils/env";

export interface LMStudioConfig {
  baseURL?: string;
  model: string;
}

export class LMStudioProviderImpl implements WebLLMProvider {
  private baseURL: string;
  private model: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(config: LMStudioConfig) {
    this.baseURL = config.baseURL || getEnv("LMSTUDIO_URL") || "http://localhost:3500/v1";
    this.model = config.model;
  }

  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: "GET",
      });
      if (!response.ok) {
        console.warn("LM Studio server may not be running");
      }
    } catch (error) {
      console.warn("Could not connect to LM Studio:", error);
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.topP !== undefined) {
      body["top_p"] = request.topP;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LM Studio request body:", JSON.stringify(body));
      throw new Error(
        `LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const content = message?.content || "";
    const finishReason = choice?.finish_reason;
    const usage = data.usage;

    if (usage) {
      this.totalInputTokens += usage.prompt_tokens || 0;
      this.totalOutputTokens += usage.completion_tokens || 0;
    }

    return {
      content,
      finishReason,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getTotalInputTokens(): number {
    return this.totalInputTokens;
  }

  getTotalOutputTokens(): number {
    return this.totalOutputTokens;
  }

  getTotalTokens(): number {
    return this.totalInputTokens + this.totalOutputTokens;
  }
}

export const LMSTUDIO_SUPPORTED_MODELS = [
  {
    id: "qwen2.5-7b-instruct-q4_k_m",
    name: "Qwen 2.5 7B",
    size: "4.7 GB",
    vramRequired: 4700,
    contextWindow: 8192,
  },
  {
    id: "qwen2.5-3b-instruct-q4_k_m",
    name: "Qwen 2.5 3B",
    size: "2.5 GB",
    vramRequired: 2500,
    contextWindow: 8192,
  },
  {
    id: "llama-3.2-3b-instruct-q4_k_m",
    name: "Llama 3.2 3B",
    size: "2.3 GB",
    vramRequired: 2300,
    contextWindow: 8192,
  },
  {
    id: "llama-3.1-8b-instruct-q4_k_m",
    name: "Llama 3.1 8B",
    size: "5.0 GB",
    vramRequired: 5000,
    contextWindow: 8192,
  },
  {
    id: "mistral-7b-instruct-v0.3-q4_k_m",
    name: "Mistral 7B",
    size: "4.4 GB",
    vramRequired: 4400,
    contextWindow: 8192,
  },
  {
    id: "phi-3.5-mini-instruct-q4_k_m",
    name: "Phi 3.5 Mini",
    size: "2.2 GB",
    vramRequired: 2200,
    contextWindow: 4096,
  },
] as const;

export async function listLMStudioModels(
  baseURL: string = "http://localhost:1234/v1",
): Promise<string[]> {
  try {
    const response = await fetch(`${baseURL}/models`);
    const data = await response.json();
    return data.data?.map((m: { id: string }) => m.id) ?? [];
  } catch {
    return [];
  }
}
