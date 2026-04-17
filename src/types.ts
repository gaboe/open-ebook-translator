// Core types for epub-translator-webllm

export type PathLike = string;

export interface TranslateOptions {
  source: ArrayBuffer;
  targetLanguage: string;
  submit: SubmitKind;
  provider: WebLLMProvider;
  userPrompt?: string;
  maxRetries?: number;
  maxGroupTokens?: number;
  concurrency?: number;
  onProgress?: (progress: number) => void;
  onChunkTranslated?: (
    chapterIndex: number,
    chunkIndex: number,
    original: string,
    translated: string,
  ) => void;
  onFillFailed?: (event: FillFailedEvent) => void;
}

export interface TranslateResult {
  epub: ArrayBuffer;
  stats: TranslationStats;
}

export interface TranslationStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  chaptersTranslated: number;
}

export enum SubmitKind {
  REPLACE = "replace",
  APPEND_TEXT = "append_text",
  APPEND_BLOCK = "append_block",
}

export interface FillFailedEvent {
  errorMessage: string;
  retriedCount: number;
  overMaximumRetries: boolean;
}

export interface WebLLMProvider {
  initialize(): Promise<void>;
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  countTokens(text: string): number;
}

export interface ChatCompletionRequest {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface ChatCompletionResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  size: string; // e.g., "4.3 GB"
  vramRequired: number; // MB
  contextWindow: number;
}
