import type { ChatCompletionRequest, ChatCompletionResponse, WebLLMProvider } from "../types";

export interface OpenCodeConfig {
  model?: string;
}

export class OpenCodeProviderImpl implements WebLLMProvider {
  private model: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(config: OpenCodeConfig) {
    this.model = config.model || "opencode/minimax-m2.5-free";
  }

  async initialize(): Promise<void> {
    console.log(`OpenCode provider initialized with model: ${this.model}`);
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const promptText = request.messages.find((msg) => msg.role === "user")?.content;

    if (!promptText) {
      throw new Error("No user message found");
    }

    const { spawn } = await import("child_process");

    return new Promise((resolve, reject) => {
      const args = ["run", "-m", this.model, "--print-logs", promptText];
      const proc = spawn("opencode", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`OpenCode failed with code ${code}: ${stderr || stdout}`));
          return;
        }

        const content = this.extractContent(stdout);
        const promptTokens = Math.ceil(promptText.length / 4);
        const completionTokens = Math.ceil(content.length / 4);

        this.totalInputTokens += promptTokens;
        this.totalOutputTokens += completionTokens;

        resolve({
          content,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        });
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  }

  private extractContent(raw: string): string {
    const stripped = raw
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, "")
      .replace(/^\s*>\s.*$/gm, "")
      .replace(/INFO.*$/gm, "")
      .trim();

    const lines = stripped
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return "";
    }

    return lines[lines.length - 1] || "";
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

export const OPENCODE_MODELS = [
  {
    id: "opencode/minimax-m2.5-free",
    name: "MiniMax M2.5 Free",
  },
  {
    id: "opencode/big-pickle",
    name: "Big Pickle",
  },
  {
    id: "opencode/kimi-k2.5-free",
    name: "Kimi K2.5 Free",
  },
] as const;
