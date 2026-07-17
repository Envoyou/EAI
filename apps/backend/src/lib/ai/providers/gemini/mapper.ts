/**
 * Mapper utilities for the Gemini provider.
 * Converts raw SDK responses/chunks into the normalized provider interface types.
 */

import type { StreamChunk, UsageMetadata } from '../interface';

// Raw SDK types (kept local — don't leak SDK types across the boundary)
type RawGeminiChunk = {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
};

/**
 * Extracts text from a raw Gemini SDK chunk/response.
 * Handles both the convenience `.text` shorthand and the full candidates tree.
 */
export function extractGeminiText(raw: RawGeminiChunk): string {
  if (raw.text) return raw.text;
  return (
    raw.candidates
      ?.flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('') ?? ''
  );
}

/**
 * Extracts the finish reason from the first candidate.
 */
export function extractGeminiFinishReason(raw: RawGeminiChunk): string | undefined {
  return raw.candidates?.[0]?.finishReason;
}

/**
 * Normalizes Gemini usage metadata into the provider-agnostic UsageMetadata shape.
 */
export function normalizeGeminiUsage(raw: RawGeminiChunk['usageMetadata']): UsageMetadata {
  const promptTokens = raw?.promptTokenCount ?? 0;
  const candidateTokens = raw?.candidatesTokenCount ?? 0;
  const reasoningTokens = raw?.thoughtsTokenCount ?? 0;
  const totalTokenCount = raw?.totalTokenCount ?? 0;
  const outputFromTotal = Math.max(totalTokenCount - promptTokens, 0);

  return {
    promptTokens,
    completionTokens: Math.max(candidateTokens + reasoningTokens, outputFromTotal),
    totalTokens: totalTokenCount || promptTokens + candidateTokens + reasoningTokens,
    cachedTokens: raw?.cachedContentTokenCount ?? 0,
    reasoningTokens,
  };
}

/**
 * Converts a raw Gemini SDK streaming chunk into the normalized StreamChunk.
 */
export function normalizeGeminiChunk(raw: RawGeminiChunk): StreamChunk {
  const text = extractGeminiText(raw);
  const chunk: StreamChunk = { text };

  const finishReason = extractGeminiFinishReason(raw);
  if (finishReason) {
    chunk.finishReason = finishReason;
  }

  // Gemini emits usage metadata on the final chunk
  if (raw.usageMetadata) {
    chunk.usage = normalizeGeminiUsage(raw.usageMetadata);
  }

  return chunk;
}
