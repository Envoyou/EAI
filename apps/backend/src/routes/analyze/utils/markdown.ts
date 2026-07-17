/**
 * Markdown cleanup and streaming utilities.
 * Extracted from analyze.ts L566–606, L784–808 (zero logic change).
 */

import { cleanupEscapedMarkdownArtifacts, convertAsciiTablesToMarkdown } from '@/lib/final-quality';
import type { OpenAiCompatibleChunk, OpenAiCompatibleClient, SendEvent } from '../types';

// ── Heading cleanup ───────────────────────────────────────────────────────────

export const removeEmptyHeadings = (text: string): string => {
  const lines = text.split('\n');
  const cleaned: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const trimmed = currentLine.trim();
    const isHeading = /^(##|###)\s+/.test(trimmed);

    if (!isHeading) {
      cleaned.push(currentLine);
      continue;
    }

    let hasContentAhead = false;
    for (let j = i + 1; j < lines.length; j++) {
      const lookahead = lines[j].trim();
      if (!lookahead) continue;
      if (/^(##|###)\s+/.test(lookahead)) break;
      if (/^---$/.test(lookahead)) break;
      hasContentAhead = true;
      break;
    }

    if (hasContentAhead) {
      cleaned.push(currentLine);
    }
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

// ── Rewrite artifact cleanup ──────────────────────────────────────────────────

export const cleanupRewriteArtifacts = (text: string): string =>
  cleanupEscapedMarkdownArtifacts(convertAsciiTablesToMarkdown(text))
    .replace(/\b(paruh\s+(?:pertama|kedua))\s+\1\b/gi, '$1')
    .replace(/\b(paruh\s+(?:pertama|kedua)\s+\d{4})\s+\1\b/gi, '$1')
    .replace(/\$\s*(\d+)\s*-\s*(miliar|juta|triliun)\b/gi, '$$$1 $2')
    .replace(/\$\s*(\d+)\s*miar\b/gi, '$$$1 miliar')
    .replace(/\$\s*(\d+)\s*miilar\b/gi, '$$$1 miliar')
    .replace(/\bdibenankan\b/gi, 'dibelanjakan')
    .replace(/\bsikit\b/gi, 'sirkuit');

// ── OpenAI-compatible streaming ───────────────────────────────────────────────

export const streamOpenAiCompatibleRewrite = async (
  client: OpenAiCompatibleClient,
  modelName: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number,
  sendEvent: SendEvent
): Promise<{ text: string; usage: OpenAiCompatibleChunk['usage'] }> => {
  const stream = await client.chat.completions.create({
    model: modelName,
    messages,
    stream: true,
    max_tokens: maxTokens,
    temperature,
  });
  let usage: OpenAiCompatibleChunk['usage'];
  let text = '';
  for await (const chunk of stream) {
    usage = (chunk as OpenAiCompatibleChunk).usage ?? (chunk as OpenAiCompatibleChunk).x_groq?.usage ?? usage;
    const partText = (chunk as OpenAiCompatibleChunk).choices[0]?.delta?.content ?? '';
    text += partText;
    sendEvent('draft_chunk', partText);
  }
  return { text, usage };
};
