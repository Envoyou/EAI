/**
 * executeStream — runtime orchestrator for streaming AI calls.
 *
 * Sits between the handler/stage and the provider.
 * Responsibilities:
 *   1. Open a stream from the provider.
 *   2. Yield normalized text chunks to the consumer.
 *   3. Collect usage from the final chunk.
 *   4. Record telemetry after the stream completes (or errors).
 *
 * This removes the need for handlers and stage functions to call
 * telemetry.recordGemini() / recordGroq() / recordOpenRouter() directly.
 */

import type { AIProvider, StreamRequest } from '../providers/interface';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { RegisteredProvider } from '../providers/registry';
import { resolveGeminiServiceTier } from '@/lib/ai/gemini-request-policy';

export interface ExecuteStreamOptions {
  /** The resolved AIProvider instance (from getProvider()). */
  provider: AIProvider;
  /** The normalized stream request. */
  request: StreamRequest;
  /** Telemetry collector scoped to this request lifecycle. */
  telemetry: AiTelemetryCollector;
  /**
   * Stage label used in telemetry (e.g. 'review', 'rewrite_chunk_0', 'seo').
   * Logged per-call to allow cost attribution at granular stage level.
   */
  stage: string;
  /** Attempt number (for retry loops in stage functions). Defaults to 1. */
  attempt?: number;
}

/**
 * Streams from the provider and records telemetry after completion.
 *
 * Yields plain text strings to keep callers simple:
 *   for await (const text of executeStream(opts)) { sendEvent('chunk', text); }
 */
export async function* executeStream(opts: ExecuteStreamOptions): AsyncGenerator<string> {
  const { provider, request, telemetry, stage, attempt = 1 } = opts;
  const startedAt = Date.now();
  let lastUsage: Parameters<typeof telemetry.recordGemini>[0]['usage'] | undefined;
  let status: 'success' | 'error' = 'success';

  try {
    const stream = await provider.stream(request);

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
      // Capture usage from the final chunk (present on most providers' last emission)
      if (chunk.usage) {
        // Convert to the raw usage shape expected by AiTelemetryCollector record methods.
        // We use a discriminated approach via provider.name so telemetry normalization
        // is applied correctly without leaking provider types into the runtime.
        lastUsage = chunk.usage as Parameters<typeof telemetry.recordGemini>[0]['usage'];
      }
    }
  } catch (err) {
    status = 'error';
    throw err;
  } finally {
    recordTelemetry({
      telemetry,
      provider: provider.name,
      stage,
      model: request.model,
      usage: lastUsage,
      durationMs: Date.now() - startedAt,
      attempt,
      status,
      serviceTier: request.serviceTier,
    });
  }
}

// ── Internal telemetry dispatch ───────────────────────────────────────────────

type TelemetryInput = {
  telemetry: AiTelemetryCollector;
  provider: RegisteredProvider;
  stage: string;
  model: string;
  usage: unknown;
  durationMs: number;
  attempt: number;
  status: 'success' | 'error';
  serviceTier?: import('../providers/interface').StreamRequest['serviceTier'];
};

/**
 * Dispatches to the correct telemetry.record*() method based on provider name.
 * This is the single place where the provider-usage shape is matched to the
 * telemetry normalizer — it replaces scattered recordGemini/recordGroq calls.
 */
function recordTelemetry(input: TelemetryInput): void {
  const base = {
    stage: input.stage,
    model: input.model,
    durationMs: input.durationMs,
    attempt: input.attempt,
    status: input.status,
  };

  const usage = input.usage as import('../providers/interface').UsageMetadata | undefined;

  try {
    switch (input.provider) {
      case 'gemini':
        input.telemetry.recordGemini({
          ...base,
          serviceTier: resolveGeminiServiceTier(input.serviceTier),
          usage: usage
            ? {
                promptTokenCount: usage.promptTokens,
                candidatesTokenCount: Math.max(
                  (usage.completionTokens ?? 0) - (usage.reasoningTokens ?? 0),
                  0
                ),
                cachedContentTokenCount: usage.cachedTokens,
                thoughtsTokenCount: usage.reasoningTokens,
                totalTokenCount: usage.totalTokens,
              }
            : undefined,
        });
        break;
      case 'groq':
        input.telemetry.recordGroq({
          ...base,
          usage: usage
            ? {
                prompt_tokens: usage.promptTokens,
                completion_tokens: usage.completionTokens,
                total_tokens: usage.totalTokens,
                prompt_tokens_details: { cached_tokens: usage.cachedTokens ?? 0 },
                completion_tokens_details: { reasoning_tokens: usage.reasoningTokens ?? 0 },
              }
            : undefined,
        });
        break;
      case 'openrouter':
        input.telemetry.recordOpenRouter({
          ...base,
          usage: usage
            ? {
                prompt_tokens: usage.promptTokens,
                completion_tokens: usage.completionTokens,
                total_tokens: usage.totalTokens,
                prompt_tokens_details: { cached_tokens: usage.cachedTokens ?? 0 },
                completion_tokens_details: { reasoning_tokens: usage.reasoningTokens ?? 0 },
              }
            : undefined,
        });
        break;
    }
  } catch (telemetryErr) {
    // Telemetry failure must never propagate — log and continue
    console.warn('[executeStream] Telemetry record failed:', telemetryErr);
  }
}
