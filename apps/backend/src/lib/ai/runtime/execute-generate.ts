/**
 * executeGenerate — runtime orchestrator for non-streaming AI calls.
 *
 * Mirrors executeStream but for single-shot generation tasks
 * (e.g. SEO metadata, targeted fixes).
 * Records telemetry after completion.
 */

import type { AIProvider, StreamRequest, GenerateResult } from '../providers/interface';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { RegisteredProvider } from '../providers/registry';

export interface ExecuteGenerateOptions {
  /** The resolved AIProvider instance (from getProvider()). */
  provider: AIProvider;
  /** The normalized generate request (same shape as stream). */
  request: StreamRequest;
  /** Telemetry collector scoped to this request lifecycle. */
  telemetry: AiTelemetryCollector;
  /** Stage label for telemetry. */
  stage: string;
  /** Attempt number for retry loops. Defaults to 1. */
  attempt?: number;
}

/**
 * Runs a non-streaming generation and records telemetry.
 * Returns the full text result.
 */
export async function executeGenerate(opts: ExecuteGenerateOptions): Promise<GenerateResult> {
  const { provider, request, telemetry, stage, attempt = 1 } = opts;
  const startedAt = Date.now();
  let status: 'success' | 'error' = 'success';
  let result: GenerateResult = { text: '' };

  try {
    result = await provider.generate(request);
    return result;
  } catch (err) {
    status = 'error';
    throw err;
  } finally {
    recordTelemetry({
      telemetry,
      provider: provider.name,
      stage,
      model: request.model,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
      attempt,
      status,
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
};

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
          usage: usage
            ? {
                promptTokenCount: usage.promptTokens,
                candidatesTokenCount: usage.completionTokens,
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
    console.warn('[executeGenerate] Telemetry record failed:', telemetryErr);
  }
}
