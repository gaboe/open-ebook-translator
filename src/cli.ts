import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Option } from "effect";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { translate } from "./translate";
import { LMStudioProviderImpl } from "./llm/lmstudio-provider";
import { WebLLMProviderImpl } from "./llm/webllm-provider";
import { OpenCodeProviderImpl } from "./llm/opencode-provider";
import { OpenRouterProviderImpl } from "./llm/openrouter-provider";
import { OpenAIProviderImpl } from "./llm/openai-provider";
import { SubmitKind, type WebLLMProvider } from "./types";

const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]!.trim()] = match[2]!.trim();
    }
  }
}

const input = Options.text("input").pipe(
  Options.withAlias("i"),
  Options.withDescription("Input EPUB file"),
);

const output = Options.text("output").pipe(
  Options.withAlias("o"),
  Options.withDescription("Output EPUB file"),
  Options.optional,
);

const targetLang = Options.text("target").pipe(
  Options.withAlias("t"),
  Options.withDescription("Target language"),
  Options.withDefault("Slovak"),
);

const provider = Options.text("provider").pipe(
  Options.withAlias("p"),
  Options.withDescription("Provider: lmstudio, webllm, opencode, openrouter, openai"),
  Options.withDefault("openai"),
);

const model = Options.text("model").pipe(
  Options.withAlias("m"),
  Options.withDescription("Model name"),
  Options.optional,
);

const prompt = Options.text("prompt").pipe(
  Options.withDescription("Custom prompt"),
  Options.optional,
);

const apiKey = Options.text("api-key").pipe(
  Options.withAlias("k"),
  Options.withDescription("API key for OpenRouter"),
  Options.optional,
);

const runTranslate = async (
  inputPath: string,
  outputPath: string,
  targetLanguage: string,
  providerType: string,
  modelId: string,
  userPrompt: string | undefined,
  apiKeyValue: string | undefined,
): Promise<void> => {
  let prov: WebLLMProvider;

  if (providerType === "lmstudio") {
    const m = modelId || "meta-llama-3.1-8b-instruct";
    console.log("Loading LM Studio provider with model: " + m);
    prov = new LMStudioProviderImpl({ model: m });
  } else if (providerType === "opencode") {
    const m = modelId || "opencode/minimax-m2.5-free";
    console.log("Loading OpenCode provider with model: " + m);
    prov = new OpenCodeProviderImpl({ model: m });
  } else if (providerType === "openrouter") {
    const m = modelId || "google/gemma-3-27b-it:free";
    console.log("Loading OpenRouter provider with model: " + m);
    prov = new OpenRouterProviderImpl({ model: m, apiKey: apiKeyValue });
  } else if (providerType === "openai") {
    const m = modelId || "gpt-4.1-mini";
    console.log("Loading OpenAI provider with model: " + m);
    prov = new OpenAIProviderImpl({ model: m, apiKey: apiKeyValue });
  } else {
    const m = modelId || "Qwen3-8B-q4f16_1-MLC";
    console.log("Loading WebLLM provider with model: " + m);
    prov = new WebLLMProviderImpl({ modelId: m });
  }

  await prov.initialize();

  const fileBuffer = readFileSync(inputPath);

  console.log("Starting translation...\n");

  const result = await translate({
    source: fileBuffer.buffer,
    targetLanguage,
    submit: SubmitKind.REPLACE,
    provider: prov,
    userPrompt,
    onProgress: (progress: number) => {
      const percent = Math.round(progress * 100);
      process.stdout.write("\rProgress: " + percent + "%");
    },
  });

  console.log("\n\nTranslation complete!");
  console.log("Chapters translated: " + result.stats.chaptersTranslated);
  console.log("Input tokens: " + result.stats.inputTokens);
  console.log("Output tokens: " + result.stats.outputTokens);
  console.log("Total tokens: " + result.stats.totalTokens);

  writeFileSync(outputPath, Buffer.from(result.epub));
  console.log("\nSaved to: " + outputPath);
};

const cli = Command.make(
  "translate",
  { input, output, targetLang, provider, model, prompt, apiKey },
  ({
    input: inputVal,
    output: outputVal,
    targetLang: targetVal,
    provider: providerVal,
    model: modelVal,
    prompt: promptVal,
    apiKey: apiKeyVal,
  }) => {
    const inputPath = resolve(inputVal);
    const outPath = Option.getOrElse(outputVal, () =>
      inputPath.replace(".epub", ".translated.epub"),
    );
    const outputPath = resolve(outPath);
    const targetLanguage = targetVal;
    const providerType = providerVal;
    const modelId = Option.getOrElse(modelVal, () => "");
    const userPrompt = Option.getOrElse(promptVal, () => undefined);
    const apiKeyValue = Option.getOrElse(apiKeyVal, () => undefined);

    return Effect.gen(function* () {
      yield* Console.log("=== EPUB Translator CLI ===");
      yield* Console.log("Input: " + inputPath);
      yield* Console.log("Output: " + outputPath);
      yield* Console.log("Provider: " + providerType);
      yield* Console.log("Target: " + targetLanguage);
      if (apiKeyValue) {
        yield* Console.log("API Key: ****" + apiKeyValue.slice(-4));
      }
      yield* Console.log("");

      yield* Effect.promise(() =>
        runTranslate(
          inputPath,
          outputPath,
          targetLanguage,
          providerType,
          modelId ?? "",
          userPrompt,
          apiKeyValue,
        ),
      );
    });
  },
);

const app = Command.run(cli, {
  name: "epub-translator",
  version: "1.0.0",
});

app(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
