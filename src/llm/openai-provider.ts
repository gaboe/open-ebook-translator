import type { WebLLMProvider, ChatCompletionRequest, ChatCompletionResponse } from "../types";
import { getEnv } from "../utils/env";

export interface OpenAIConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
}

export class OpenAIProviderImpl implements WebLLMProvider {
  private baseURL: string;
  private model: string;
  private apiKey: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(config: OpenAIConfig) {
    this.baseURL = config.baseURL || getEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1";
    this.model = config.model;
    this.apiKey = config.apiKey || getEnv("OPENAI_API_KEY") || "";
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      console.warn("OpenAI API key not set. Set OPENAI_API_KEY environment variable.");
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
    };

    const maxTokenField = this.model.startsWith("gpt-5")
      ? "max_completion_tokens"
      : "max_tokens";
    body[maxTokenField] = request.maxTokens ?? 4096;

    if (request.topP !== undefined) {
      body["top_p"] = request.topP;
    }

    const maxRetries = 3;
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

      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(
          `[OpenAI] Rate limited. Attempt ${attempt + 1}/${maxRetries}. Waiting ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(`Rate limited after ${attempt + 1} attempts`);
        continue;
      }

      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
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

export const OPENAI_MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", price: "$0.15/$0.60 per 1M tokens" },
  { id: "gpt-4o", name: "GPT-4o", price: "$2.50/$10.00 per 1M tokens" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", price: "$10.00/$30.00 per 1M tokens" },
] as const;
