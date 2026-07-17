/**
 * Mapper utilities for OpenAI-compatible providers (OpenRouter & Groq).
 * Both use the same OpenAI-compatible API shape, so the mapper is shared.
 */

import type { StreamChunk, UsageMetadata } from '../interface';

// Raw OpenAI-compatible chunk types (kept local)
export type OpenAiCompatibleStreamChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
  // Groq injects usage inside x_groq on some responses
  x_groq?: {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number } | null;
      completion_tokens_details?: { reasoning_tokens?: number } | null;
    } | null;
  };
};

export type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  usage?: OpenAiCompatibleStreamChunk['usage'];
};

/**
 * Extracts text delta from a streaming chunk.
 */
export function extractOpenAiText(chunk: OpenAiCompatibleStreamChunk): string {
  return chunk.choices?.[0]?.delta?.content ?? '';
}

/**
 * Extracts text from a completed (non-streaming) response.
 */
export function extractOpenAiResponseText(response: OpenAiCompatibleResponse): string {
  return response.choices?.[0]?.message?.content ?? '';
}

/**
 * Normalizes usage from an OpenAI-compatible response/chunk into UsageMetadata.
 * Groq may put usage inside `x_groq.usage` instead of top-level `usage`.
 */
export function normalizeOpenAiUsage(
  chunk: OpenAiCompatibleStreamChunk | OpenAiCompatibleResponse
): UsageMetadata | undefined {
  const usage =
    'x_groq' in chunk && chunk.x_groq?.usage
      ? chunk.x_groq.usage
      : chunk.usage;

  if (!usage) return undefined;

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

/**
 * Converts a raw OpenAI-compatible streaming chunk to the normalized StreamChunk.
 */
export function normalizeOpenAiChunk(chunk: OpenAiCompatibleStreamChunk): StreamChunk {
  const text = extractOpenAiText(chunk);
  const finishReason = chunk.choices?.[0]?.finish_reason ?? undefined;
  const usage = normalizeOpenAiUsage(chunk);

  return {
    text,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}
