// WebLLM Provider - browser inference
import { CreateMLCEngine, MLCEngine, type ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type { WebLLMProvider, ChatCompletionRequest, ChatCompletionResponse } from "../types";

export interface WebLLMConfig {
  modelId: string;
  initProgressCallback?: (progress: number) => void;
}

export class WebLLMProviderImpl implements WebLLMProvider {
  private engine: MLCEngine | null = null;
  private modelId: string;
  private initCallback?: (progress: number) => void;

  // Stats
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(config: WebLLMConfig) {
    this.modelId = config.modelId;
    this.initCallback = config.initProgressCallback;
  }

  async initialize(): Promise<void> {
    if (this.engine) return;

    this.engine = await CreateMLCEngine(this.modelId, {
      initProgressCallback: (report) => {
        this.initCallback?.(report.progress);
      },
    });
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.engine) {
      throw new Error("WebLLM engine not initialized. Call initialize() first.");
    }

    const messages: ChatCompletionMessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    console.log("WebLLM: Creating chat completion with", messages.length, "messages");

    const reply = await this.engine.chat.completions.create({
      messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
      top_p: request.topP,
    });

    console.log("WebLLM: Response received");

    const choice = reply.choices[0];
    const content = choice?.message?.content ?? "";
    const finishReason = choice?.finish_reason;
    const usage = reply.usage;

    if (usage) {
      this.totalInputTokens += usage.prompt_tokens ?? 0;
      this.totalOutputTokens += usage.completion_tokens ?? 0;
    }

    return {
      content,
      finishReason,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          }
        : undefined,
    };
  }

  countTokens(text: string): number {
    // Approximate: characters / 4 (rough heuristic for WebLLM models)
    // TODO: Use proper tokenizer when available
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

// Supported models
export const SUPPORTED_MODELS = [
  {
    id: "Qwen3-8B-q4f16_1-MLC",
    name: "Qwen 3 8B",
    size: "5.7 GB",
    vramRequired: 5700,
    contextWindow: 4096,
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    name: "Llama 3.1 8B",
    size: "5.0 GB",
    vramRequired: 5000,
    contextWindow: 4096,
  },
  {
    id: "Qwen3-4B-q4f16_1-MLC",
    name: "Qwen 3 4B",
    size: "3.4 GB",
    vramRequired: 3400,
    contextWindow: 4096,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 3B",
    size: "2.3 GB",
    vramRequired: 2300,
    contextWindow: 4096,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    name: "Phi 3.5 Mini",
    size: "2.2 GB",
    vramRequired: 2200,
    contextWindow: 4096,
  },
] as const;
