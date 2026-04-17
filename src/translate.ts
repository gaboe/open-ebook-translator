// Main translation function
import { EpubZip } from "./epub/zip";
import { WebLLMProviderImpl } from "./llm/webllm-provider";
import { LMStudioProviderImpl } from "./llm/lmstudio-provider";

import { OpenRouterProviderImpl } from "./llm/openrouter-provider";
import { OpenAIProviderImpl } from "./llm/openai-provider";
import { getProviderConcurrency } from "./providers/factory";
import { estimateTokens } from "./prompts/translate";
import type { TranslateOptions, TranslateResult, TranslationStats, Message } from "./types";

export function stripMarkdownCodeFences(text: string): string {
  let result = text;

  const xmlRegex = /^```xml\s*\n?/gm;
  result = result.replace(xmlRegex, "");

  const closingRegex = /```\s*$/gm;
  result = result.replace(closingRegex, "");

  return result;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function looksLikeMarkup(text: string): boolean {
  return /<[^>]+>/.test(text);
}

function buildTextSegmentPrompt(
  targetLanguage: string,
  userPrompt: string | undefined,
  segments: string[],
): Message[] {
  const systemContent = `You are a professional translator. Translate each text segment to ${targetLanguage}.
- Return ONLY a JSON array of strings.
- Keep the same number of items and the same order.
- Translate only the natural language text, not markup or metadata.
- Preserve meaning, punctuation, and surrounding whitespace inside each segment as closely as possible.
- Do not merge, split, or omit segments.${userPrompt ? `\n\nAdditional instructions: ${userPrompt}` : ""}`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: JSON.stringify(segments) },
  ];
}

function buildPlainTextTranslatePrompt(
  targetLanguage: string,
  userPrompt: string | undefined,
): Message[] {
  const systemContent = `You are a professional translator. Translate the user text fully to ${targetLanguage}.
- Return ONLY the translated text.
- Preserve meaning, tone, punctuation, and paragraph breaks.
- Do not leave the source text unchanged except for proper nouns or terms that must stay verbatim.${userPrompt ? `\n\nAdditional instructions: ${userPrompt}` : ""}`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: "{{TEXT}}" },
  ];
}

function parseJsonArrayResponse(text: string): string[] {
  const withoutFences = stripMarkdownCodeFences(text).trim();
  const start = withoutFences.indexOf("[");
  const end = withoutFences.lastIndexOf("]");
  const candidate =
    start >= 0 && end >= start ? withoutFences.slice(start, end + 1) : withoutFences;
  const parsed = JSON.parse(candidate);

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Expected JSON array of translated strings");
  }

  return parsed;
}

function translateTextOnlyChunk(translated: string): string {
  const withoutFences = stripMarkdownCodeFences(translated);
  return escapeXml(withoutFences);
}

function translateMarkupChunk(chunk: string, translatedSegments: string[]): string {
  const parts = chunk.split(/(<[^>]+>)/g).filter((part) => part.length > 0);
  let translatedIndex = 0;

  const result = parts
    .map((part) => {
      if (looksLikeMarkup(part) || part.trim().length === 0) {
        return part;
      }

      const translated = translatedSegments[translatedIndex];
      translatedIndex++;

      if (translated === undefined) {
        throw new Error("Missing translated text segment");
      }

      return escapeXml(translated);
    })
    .join("");

  if (translatedIndex !== translatedSegments.length) {
    throw new Error("Translated segment count mismatch");
  }

  return result;
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shouldRetryUnchangedTranslation(source: string, translated: string): boolean {
  const normalizedSource = normalizeComparableText(source);
  const normalizedTranslated = normalizeComparableText(translated);

  if (normalizedSource === normalizedTranslated) {
    return normalizedSource.length >= 40 && /[A-Za-z]/.test(normalizedSource);
  }

  const sourceWords = normalizedSource
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  const translatedWords = normalizedTranslated
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

  if (sourceWords.length >= 40 && sourceWords.length === translatedWords.length) {
    let sameWordCount = 0;
    for (let i = 0; i < sourceWords.length; i++) {
      if (sourceWords[i] === translatedWords[i]) {
        sameWordCount++;
      }
    }

    if (sameWordCount / sourceWords.length >= 0.85) {
      return true;
    }
  }

  return false;
}

function hasMeaningfulSegmentChanges(sourceSegments: string[], translatedSegments: string[]): boolean {
  if (sourceSegments.length !== translatedSegments.length) {
    return false;
  }

  const changedSegments = sourceSegments.filter(
    (segment, index) => normalizeComparableText(segment) !== normalizeComparableText(translatedSegments[index] ?? ""),
  );
  const changedChars = changedSegments.reduce((sum, segment) => sum + normalizeComparableText(segment).length, 0);
  const sourceChars = sourceSegments.reduce((sum, segment) => sum + normalizeComparableText(segment).length, 0);

  return changedSegments.length > 0 && changedChars >= Math.max(30, sourceChars * 0.1);
}

function shouldUseDirectSegmentTranslation(textSegments: string[]): boolean {
  return (
    textSegments.length > 0 &&
    textSegments.length <= 12 &&
    textSegments.some((segment) => normalizeComparableText(segment).length >= 200)
  );
}

async function translateSegmentsIndividually(
  provider: TranslateOptions["provider"],
  targetLanguage: string,
  userPrompt: string | undefined,
  segments: string[],
): Promise<string[]> {
  const translatedSegments: string[] = [];

  for (const segment of segments) {
    const translateOnce = async (extraPrompt?: string) => {
      const prompt = buildPlainTextTranslatePrompt(targetLanguage, extraPrompt);
      const systemMessage = prompt[0];
      if (!systemMessage) {
        throw new Error("Missing system message");
      }

      const response = await provider.chatCompletion({
        messages: [systemMessage, { role: "user", content: segment }],
        temperature: 0.3,
        maxTokens: 8192,
      });

      if (isTruncatedFinishReason(response.finishReason)) {
        throw new Error(`Translation truncated with finish_reason=${response.finishReason}`);
      }

      return stripMarkdownCodeFences(response.content);
    };

    let translatedSegment = await translateOnce(userPrompt);

    if (shouldRetryUnchangedTranslation(segment, translatedSegment)) {
      translatedSegment = await translateOnce(
        `${userPrompt ? `${userPrompt}\n\n` : ""}CRITICAL: The previous attempt left the source text unchanged. Translate this text fully to ${targetLanguage}. Keep proper nouns unchanged, but translate the surrounding prose.`,
      );
    }

    translatedSegments.push(translatedSegment);
  }

  return translatedSegments;
}

function isTruncatedFinishReason(finishReason?: string): boolean {
  return finishReason === "length" || finishReason === "content_filter";
}

function splitTextByWhitespace(text: string, maxTokens: number): string[] {
  if (!text || estimateTokens(text) <= maxTokens) {
    return text ? [text] : [];
  }

  const maxChars = Math.max(maxTokens * 4, 1);
  const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const token of tokens) {
    if (estimateTokens(token) > maxTokens) {
      pushCurrent();
      for (let i = 0; i < token.length; i += maxChars) {
        chunks.push(token.slice(i, i + maxChars));
      }
      continue;
    }

    if (estimateTokens(current + token) > maxTokens && current) {
      pushCurrent();
    }

    current += token;
  }

  pushCurrent();
  return chunks;
}

function getMarkupTextSegments(chunk: string): string[] {
  return chunk
    .split(/(<[^>]+>)/g)
    .filter((part) => part.length > 0 && !looksLikeMarkup(part) && part.trim().length > 0);
}

function splitOversizedHtmlSegment(segment: string, maxTokens: number): string[] {
  if (estimateTokens(segment) <= maxTokens) {
    return [segment];
  }

  const parts = segment.split(/(<[^>]+>)/g).filter((part) => part.length > 0);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const part of parts) {
    const subparts = looksLikeMarkup(part) ? [part] : splitTextByWhitespace(part, maxTokens);

    for (const subpart of subparts) {
      if (estimateTokens(current + subpart) > maxTokens && current) {
        pushCurrent();
      }

      current += subpart;

      if (estimateTokens(current) > maxTokens) {
        pushCurrent();
      }
    }
  }

  pushCurrent();
  return chunks;
}

function splitByParagraphs(text: string, maxTokens: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
      currentTokens = 0;
    }

    currentChunk += (currentChunk ? "\n\n" : "") + para;
    currentTokens += paraTokens;
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function splitByHtmlBoundaries(text: string): string[] {
  const boundaryRegex =
    /(<\/p>|<\/div>|<\/section>|<\/article>|<\/aside>|<\/nav>|<\/header>|<\/footer>|<\/blockquote>|<\/li>|<\/ul>|<\/ol>|<\/table>|<\/thead>|<\/tbody>|<\/tfoot>|<\/tr>|<\/td>|<\/th>|<\/pre>|<\/figure>|<\/figcaption>|<\/h[1-6]>|<br\s*\/?>|<hr\s*\/?>)/gi;

  const segments: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = boundaryRegex.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const segment = text.slice(cursor, end);
    if (segment) {
      segments.push(segment);
    }
    cursor = end;
  }

  const remainder = text.slice(cursor);
  if (remainder) {
    segments.push(remainder);
  }

  return segments.filter((segment) => segment.length > 0);
}

function combineSegmentsIntoChunks(segments: string[], maxTokens: number): string[] {
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const segment of segments) {
    if (estimateTokens(segment) > maxTokens) {
      pushCurrent();
      chunks.push(...splitOversizedHtmlSegment(segment, maxTokens));
      continue;
    }

    if (estimateTokens(current + segment) > maxTokens && current) {
      pushCurrent();
    }

    current += segment;
  }

  pushCurrent();
  return chunks;
}

function extractMarkupTokens(text: string): string[] {
  const matches = text.match(/<[^>]+>/g) ?? [];
  return matches.filter(
    (token) =>
      !token.startsWith("<?xml") &&
      !token.startsWith("<!DOCTYPE") &&
      !token.startsWith("<!--") &&
      !token.startsWith("<![CDATA["),
  );
}

function normalizeTextContent(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function hasSufficientTextCoverage(source: string, translated: string): boolean {
  const sourceText = normalizeTextContent(source);
  const translatedText = normalizeTextContent(translated);

  if (sourceText.length < 400) {
    return translatedText.length > 0;
  }

  return translatedText.length / sourceText.length >= 0.6;
}

export function validateTranslatedChapter(source: string, translated: string): boolean {
  const sourceTrimmed = source.trimEnd().toLowerCase();
  const translatedTrimmed = translated.trimEnd().toLowerCase();

  if (sourceTrimmed.endsWith("</body></html>")) {
    if (!translatedTrimmed.endsWith("</body></html>")) {
      return false;
    }
  } else if (sourceTrimmed.endsWith("</html>")) {
    if (!translatedTrimmed.endsWith("</html>")) {
      return false;
    }
  }

  const sourceTokens = extractMarkupTokens(source);
  const translatedTokens = extractMarkupTokens(translated);

  if (sourceTokens.length !== translatedTokens.length) {
    return false;
  }

  for (let i = 0; i < sourceTokens.length; i++) {
    if (sourceTokens[i] !== translatedTokens[i]) {
      return false;
    }
  }

  return hasSufficientTextCoverage(source, translated);
}

// Timing utility
const timers = new Map<string, number>();
function timerStart(name: string) {
  timers.set(name, performance.now());
}
function timerEnd(name: string): number {
  const start = timers.get(name) || 0;
  return performance.now() - start;
}
function timerLog(name: string, detail?: string) {
  const ms = timerEnd(name);
  console.log(`[TIMER] ${name}: ${ms.toFixed(0)}ms${detail ? ` (${detail})` : ""}`);
}

export async function translate(options: TranslateOptions): Promise<TranslateResult> {
  timerStart("total");

  const {
    source,
    targetLanguage,
    submit: _submit,
    provider,
    userPrompt,
    maxRetries = 5,
    maxGroupTokens = 1200,
    concurrency = 8,
    onProgress,
    onChunkTranslated,
  } = options;

  if (provider instanceof WebLLMProviderImpl) {
    await provider.initialize();
  } else if (provider instanceof LMStudioProviderImpl) {
    await provider.initialize();
  } else if (provider instanceof OpenRouterProviderImpl) {
    await provider.initialize();
  } else if (provider instanceof OpenAIProviderImpl) {
    await provider.initialize();
  }

  console.log("Opening EPUB...");
  onProgress?.(0.01);
  const zip = await EpubZip.open(source);

  const files = zip.listFiles();
  const chapters = files.filter(
    (f) => f.endsWith(".xhtml") || f.endsWith(".html") || f.endsWith(".htm"),
  );

  console.log("Found chapters:", chapters.length);

  if (chapters.length === 0) {
    throw new Error("No chapter files found in EPUB");
  }

  const stats: TranslationStats = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    chaptersTranslated: 0,
  };

  const isOpenCode = provider.constructor.name === "OpenCodeProviderImpl";
  const isOpenRouter = provider instanceof OpenRouterProviderImpl;
  const isOpenAI = provider instanceof OpenAIProviderImpl;
  const isWebLLM = provider instanceof WebLLMProviderImpl;
  const providerId = isOpenCode
    ? "opencode"
    : isOpenRouter
      ? "openrouter"
      : isOpenAI
        ? "openai"
        : provider instanceof LMStudioProviderImpl
          ? "lmstudio"
          : "webllm";
  const chunkConcurrency = isOpenCode || isWebLLM ? Math.min(concurrency, 1) : concurrency;
  const chapterConcurrency = getProviderConcurrency(providerId);
  const providerName = isOpenCode
    ? "opencode"
    : isOpenRouter
      ? "openrouter"
      : isOpenAI
        ? "openai"
        : "default";
  console.log(
    `Execution plan: provider=${providerName}, chapterConcurrency=${chapterConcurrency}, chunkConcurrency=${chunkConcurrency}`,
  );

  const chapterProgress = Array.from({ length: chapters.length }).fill(0) as number[];
  const updateGlobalProgress = (chapterIndex: number, progress: number) => {
    chapterProgress[chapterIndex] = progress;
    const totalProgress = chapterProgress.reduce((a, b) => a + b, 0) / chapters.length;
    onProgress?.(0.05 + 0.9 * totalProgress);
  };

  async function translateChapter(
    chapterPath: string,
    index: number,
    total: number,
  ): Promise<void> {
    timerStart(`chapter-${index}`);
    console.log(`\n[CHAPTER ${index + 1}/${total}] Starting: ${chapterPath}`);

    const content = await zip.readText(chapterPath);
    if (!content) return;

    const chunks = splitIntoChunks(content, maxGroupTokens);
    console.log(`[CHAPTER ${index + 1}] Split into ${chunks.length} chunks`);

    let translatedContent = content;
    let chapterHadTranslation = false;

    for (let i = 0; i < chunks.length; i += chunkConcurrency) {
      timerStart(`batch-${index}-${i}`);
      const batch = chunks.slice(i, i + chunkConcurrency);
      console.log(
        `[CHAPTER ${index + 1}] Batch ${Math.floor(i / chunkConcurrency) + 1}: ${batch.length} chunks in parallel`,
      );

      const results = await Promise.all(
        batch.map(async (chunk) => {
          const prompt = buildPlainTextTranslatePrompt(targetLanguage, userPrompt);
          const systemMessage = prompt[0];
          if (!systemMessage) {
            return { chunk, translated: "", usage: undefined };
          }
          const messages: Message[] = [systemMessage, { role: "user" as const, content: chunk }];

          let retries = 0;
          let translated = "";

          while (retries < maxRetries) {
            try {
              const hasMarkup = looksLikeMarkup(chunk);
              const textSegments = hasMarkup ? getMarkupTextSegments(chunk) : [];
              const requestMessages = hasMarkup
                ? buildTextSegmentPrompt(targetLanguage, userPrompt, textSegments)
                : messages;

              const response = await provider.chatCompletion({
                messages: requestMessages,
                temperature: 0.3,
                maxTokens: 8192,
              });

              if (isTruncatedFinishReason(response.finishReason)) {
                throw new Error(`Translation truncated with finish_reason=${response.finishReason}`);
              }

              if (hasMarkup) {
                if (shouldUseDirectSegmentTranslation(textSegments)) {
                  const fallbackTranslations = await translateSegmentsIndividually(
                    provider,
                    targetLanguage,
                    userPrompt,
                    textSegments,
                  );
                  translated = translateMarkupChunk(chunk, fallbackTranslations);
                } else {
                  try {
                    const parsedSegments = parseJsonArrayResponse(response.content);
                    if (!hasMeaningfulSegmentChanges(textSegments, parsedSegments)) {
                      throw new Error("Segment translation returned unchanged content");
                    }
                    translated = translateMarkupChunk(chunk, parsedSegments);
                  } catch {
                    const fallbackTranslations = await translateSegmentsIndividually(
                      provider,
                      targetLanguage,
                      userPrompt,
                      textSegments,
                    );
                    translated = translateMarkupChunk(chunk, fallbackTranslations);
                  }
                }

                if (
                  shouldRetryUnchangedTranslation(
                    normalizeTextContent(chunk),
                    normalizeTextContent(translated),
                  )
                ) {
                  throw new Error("Translated markup chunk remained effectively unchanged");
                }
              } else {
                translated = translateTextOnlyChunk(response.content);
                if (shouldRetryUnchangedTranslation(chunk, translated)) {
                  const fallbackTranslations = await translateSegmentsIndividually(
                    provider,
                    targetLanguage,
                    userPrompt,
                    [chunk],
                  );
                  translated = translateTextOnlyChunk(fallbackTranslations[0] ?? translated);
                }
              }

              if (!translated || translated.trim().length === 0) {
                console.warn(`[CHAPTER ${index + 1}] Empty translation, keeping original`);
                return { chunk, translated: chunk, usage: response.usage };
              }

              return { chunk, translated, usage: response.usage };
            } catch (error) {
              retries++;
              if (retries >= maxRetries) {
                console.error(`[CHAPTER ${index + 1}] Failed after ${maxRetries} retries:`, error);
              }
            }
          }
          console.warn(`[CHAPTER ${index + 1}] All retries failed, keeping original`);
          return { chunk, translated: chunk, usage: undefined };
        }),
      );

      timerLog(`batch-${index}-${i}`, `chunks ${batch.length}`);

      results.forEach((result, batchIdx) => {
        if (result.translated) {
          translatedContent = translatedContent.replace(result.chunk, result.translated);
          if (result.translated !== result.chunk) {
            chapterHadTranslation = true;
          }
          onChunkTranslated?.(index, i + batchIdx, result.chunk, result.translated);
        }
        if (result.usage) {
          stats.inputTokens += result.usage.promptTokens;
          stats.outputTokens += result.usage.completionTokens;
        }
      });

      const chunkFraction = (i + batch.length) / chunks.length;
      updateGlobalProgress(index, chunkFraction);
    }

    if (!validateTranslatedChapter(content, translatedContent)) {
      console.warn(
        `[CHAPTER ${index + 1}] Validation failed after translation, keeping original chapter`,
      );
      translatedContent = content;
      chapterHadTranslation = false;
    }

    zip.writeText(chapterPath, translatedContent);
    if (chapterHadTranslation) {
      stats.chaptersTranslated++;
    }
    timerLog(`chapter-${index}`, chapterPath.split("/").pop());
  }

  for (let i = 0; i < chapters.length; i += chapterConcurrency) {
    const batch = chapters.slice(i, i + chapterConcurrency);
    console.log(
      `\n=== Processing chapters ${i + 1}-${Math.min(i + chapterConcurrency, chapters.length)} of ${chapters.length} (parallel: ${chapterConcurrency}) ===\n`,
    );

    await Promise.all(
      batch.map((chapter, batchIdx) => {
        if (!chapter) return Promise.resolve();
        return translateChapter(chapter, i + batchIdx, chapters.length);
      }),
    );
  }

  stats.totalTokens = stats.inputTokens + stats.outputTokens;

  onProgress?.(0.98);
  timerStart("generate-epub");
  const blob = await zip.generate();
  timerLog("generate-epub");

  onProgress?.(1.0);

  timerLog("total");
  console.log("\n[TIMERS SUMMARY]");
  console.log(`  Total: ${timerEnd("total").toFixed(0)}ms`);
  console.log(`  Chapters: ${stats.chaptersTranslated}`);
  console.log(
    `  Tokens: ${stats.totalTokens} (in: ${stats.inputTokens}, out: ${stats.outputTokens})`,
  );

  return {
    epub: await blob.arrayBuffer(),
    stats,
  };
}

// Chunking by estimated tokens with minified XHTML fallback
export function splitIntoChunks(text: string, maxTokens: number): string[] {
  const paragraphChunks = splitByParagraphs(text, maxTokens);
  if (paragraphChunks.length > 1 || estimateTokens(text) <= maxTokens) {
    return paragraphChunks;
  }

  const htmlSegments = splitByHtmlBoundaries(text);
  if (htmlSegments.length > 1) {
    return combineSegmentsIntoChunks(htmlSegments, maxTokens);
  }

  return splitOversizedHtmlSegment(text, maxTokens);
}

// Language constants
export const LANGUAGES = {
  ENGLISH: "English",
  SLOVAK: "Slovak",
  CZECH: "Czech",
  GERMAN: "German",
  FRENCH: "French",
  SPANISH: "Spanish",
  ITALIAN: "Italian",
  PORTUGUESE: "Portuguese",
  RUSSIAN: "Russian",
  UKRAINIAN: "Ukrainian",
  CHINESE: "Simplified Chinese",
  JAPANESE: "Japanese",
  KOREAN: "Korean",
} as const;

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES];

// Re-export
export { WebLLMProviderImpl, SUPPORTED_MODELS } from "./llm/webllm-provider";
export { LMStudioProviderImpl, LMSTUDIO_SUPPORTED_MODELS } from "./llm/lmstudio-provider";
export { SubmitKind, type FillFailedEvent } from "./types";
