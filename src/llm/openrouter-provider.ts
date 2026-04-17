import type { WebLLMProvider, ChatCompletionRequest, ChatCompletionResponse } from "../types";
import { getEnv } from "../utils/env";

export interface OpenRouterConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
}

export class OpenRouterProviderImpl implements WebLLMProvider {
  private baseURL: string;
  private model: string;
  private apiKey: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(config: OpenRouterConfig) {
    this.baseURL = config.baseURL || getEnv("OPENROUTER_URL") || "https://openrouter.ai/api/v1";
    this.model = config.model;
    this.apiKey = config.apiKey || getEnv("OPENROUTER_API_KEY") || "";
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      console.warn("OpenRouter API key not set. Set OPENROUTER_API_KEY environment variable.");
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.topP !== undefined) {
      body["top_p"] = request.topP;
    }

    const maxRetries = 5;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok) {
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

      // Rate limit - use exponential backoff
      if (response.status === 429) {
        // Try to get retry-after from response
        const retryAfter = response.headers.get("retry-after");
        let delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;

        // Cap delay at 30 seconds
        delay = Math.min(delay, 30000);

        console.log(
          `[OpenRouter] Rate limited. Attempt ${attempt + 1}/${maxRetries}. Waiting ${delay}ms...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(`Rate limited after ${attempt + 1} attempts`);
        continue;
      }

      // Non-retryable error
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    throw lastError || new Error("Max retries exceeded");
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

export const OPENROUTER_FREE_MODELS = [
  {
    id: "minimax/minimax-m2:free",
    name: "MiniMax M2 (Free)",
    contextWindow: 196608,
  },
  {
    id: "deepseek/deepseek-r1:free",
    name: "DeepSeek R1 (Free)",
    contextWindow: 128000,
  },
  {
    id: "meta-llama/llama-4-maverick:free",
    name: "Llama 4 Maverick (Free)",
    contextWindow: 200000,
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    name: "Qwen 3 235B (Free)",
    contextWindow: 32768,
  },
] as const;
