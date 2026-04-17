// Translation prompts - template literals instead of Jinja2
import type { Message } from "../types";

export function buildTranslatePrompt(targetLanguage: string, userPrompt?: string): Message[] {
  const systemContent = `You are a professional translator. Translate the following text to ${targetLanguage}. 
- Preserve ALL formatting exactly, including paragraphs, line breaks, and whitespace
- Maintain the original tone and style
- CRITICAL: Preserve ALL HTML/XML tags and attributes EXACTLY as they are
- CRITICAL: Do NOT add any markdown code fences like \`\`\`xml or \`\`\`
- Do NOT modify any HTML/XML attributes
- Do not add any explanations or comments
- If you see markup/tags, translate only the text content between tags${userPrompt ? `\n\nAdditional instructions: ${userPrompt}` : ""}`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: "{{TEXT}}" },
  ];
}

export function buildFillPrompt(targetLanguage: string): string {
  return `You are a professional translator. Translate the following XML template to ${targetLanguage}.

The template contains XML tags with placeholders marked as [TRANSLATED_X] where X is a number.
Replace each placeholder with its corresponding translated text segment.

Rules:
1. Preserve ALL XML tags and attributes exactly
2. Replace placeholders [TRANSLATED_1], [TRANSLATED_2], etc. with translations
3. Maintain XML structure and hierarchy
4. Do not modify any XML that is not a placeholder
5. Output ONLY the translated XML, no explanations

Example:
Input: <p>Hello [TRANSLATED_1] world</p>
Output: <p>Ahoj [TRANSLATED_1] svet</p>

Now translate:`;
}

// Simple token estimation for chunking
export function estimateTokens(text: string): number {
  // Rough heuristic: ~4 chars per token for English, adjust for other languages
  return Math.ceil(text.length / 4);
}
