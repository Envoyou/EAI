import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import { FeedbackOutputSchema, PolishDiagnosisSchema, getFeedbackResponseJsonSchema, type FeedbackOutput, type PolishDiagnosisOutput } from '@eai/shared';
import { extractCompleteObjectsFromJsonArray, extractJsonFromText, extractJsonNumberValue, extractJsonStringValue, parseJsonResponse } from '@eai/shared';
import type { ArticleMetadata, FeedbackItem, ResponseMode, Role } from '@eai/shared';
import type { AiProvider } from './provider-runtime';
import { getProvider } from './providers/registry';
import { resolveOutputLimit } from './model-router';
import {
  buildCompactReviewInstruction,
  buildEditorialUserContent,
  buildManualReviewInstruction,
} from './prompt-context';
import { resolveGeminiServiceTier } from './gemini-request-policy';

export type ReviewOutput = FeedbackOutput | PolishDiagnosisOutput;
type SendEvent = (type: string, data: unknown) => void;

type FeedbackSanitizer = (
  item: FeedbackItem,
  draftText: string
) => FeedbackOutput['feedback'][number];

export class TruncatedModelResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TruncatedModelResponseError';
  }
}

const truncateSummary = (summary: string, maxLength = 280) => {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const suffix = '...';
  const hardLimit = maxLength - suffix.length;
  const clipped = normalized.slice(0, hardLimit).replace(/\s+\S*$/, '').trim();
  return `${clipped || normalized.slice(0, hardLimit).trim()}${suffix}`;
};

const normalizeReviewCandidate = (candidate: unknown, role: Role) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return candidate;
  }
  const nextCandidate = candidate as Record<string, unknown>;
  return {
    ...nextCandidate,
    verdict:
      (role === 'author' || role === 'seo' || role === 'polish') &&
      nextCandidate.verdict === 'reject'
        ? 'revise'
        : nextCandidate.verdict,
    summary: typeof nextCandidate.summary === 'string'
      ? truncateSummary(nextCandidate.summary)
      : nextCandidate.summary,
  };
};

const getAttemptConfig = (basePrompt: string, attempt: number) => {
  if (attempt === 2) {
    return {
      prompt: buildManualReviewInstruction(basePrompt),
      mode: 'manual_fallback' as const,
    };
  }
  if (attempt === 1) {
    return {
      prompt: buildCompactReviewInstruction(basePrompt),
      mode: 'compact' as const,
    };
  }
  return {
    prompt: basePrompt,
    mode: 'standard' as const,
  };
};

const emitIncrementalReview = ({
  rawBuffer,
  isPolishMode,
  draftText,
  sendEvent,
  sanitizeFeedback,
  emitted,
}: {
  rawBuffer: string;
  isPolishMode: boolean;
  draftText: string;
  sendEvent: SendEvent;
  sanitizeFeedback: FeedbackSanitizer;
  emitted: {
    score: boolean;
    verdict: boolean;
    summary: boolean;
    feedbackIndices: Set<number>;
  };
}) => {
  if (!emitted.score) {
    const score = extractJsonNumberValue(rawBuffer, 'score');
    if (score !== null) {
      if (!isPolishMode) sendEvent('score', score);
      emitted.score = true;
    }
  }

  if (!emitted.verdict) {
    const verdict = extractJsonStringValue(rawBuffer, 'verdict');
    if (verdict !== null) {
      if (!isPolishMode) sendEvent('verdict', verdict);
      emitted.verdict = true;
    }
  }

  if (!emitted.summary) {
    const summary = extractJsonStringValue(rawBuffer, 'summary');
    if (summary !== null) {
      if (!isPolishMode) sendEvent('summary', truncateSummary(summary));
      emitted.summary = true;
    }
  }

  const foundObjects = extractCompleteObjectsFromJsonArray(rawBuffer, 'feedback');
  foundObjects.forEach((rawItem, index) => {
    if (emitted.feedbackIndices.has(index)) return;
    try {
      const item = sanitizeFeedback(JSON.parse(rawItem) as FeedbackItem, draftText);
      if (!isPolishMode) sendEvent('feedback_item', { item, index });
      emitted.feedbackIndices.add(index);
    } catch {
      // Wait for a complete feedback object in the next stream chunk.
    }
  });
};

export const runEditorialReviewStage = async ({
  provider,
  modelName,
  role,
  metadata,
  draftText,
  reviewPrompt,
  telemetry,
  sendEvent,
  sanitizeFeedback,
  sanitizeSummary,
  signal,
}: {
  provider: AiProvider;
  modelName: string;
  role: Role;
  metadata?: ArticleMetadata;
  draftText: string;
  reviewPrompt: string;
  telemetry: AiTelemetryCollector;
  sendEvent: SendEvent;
  signal?: AbortSignal;
  sanitizeFeedback: FeedbackSanitizer;
  sanitizeSummary: (
    summary: string,
    feedback: FeedbackOutput['feedback'],
    draftText: string
  ) => string;
}): Promise<{ data: ReviewOutput; responseMode: ResponseMode }> => {
  const isPolishMode = role === 'polish';
  const contents = buildEditorialUserContent({
    metadata,
    data: { article: draftText },
    task: isPolishMode
      ? 'Diagnose the raw draft to determine transformation priorities. Do not give a score or verdict. Return only JSON matching the schema.'
      : 'Evaluate the article according to the role and return only JSON matching the schema.',
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const { prompt, mode } = getAttemptConfig(reviewPrompt, attempt);
    sendEvent('status', 'evaluating');

    const emitted = {
      score: false,
      verdict: false,
      summary: false,
      feedbackIndices: new Set<number>(),
    };
    const startedAt = Date.now();
    let rawBuffer = '';
    let truncated = false;

    // Provider-agnostic streaming via the AIProvider interface.
    // The review stream is intentionally NOT delegated to executeStream() because
    // it requires incremental JSON parsing (emitIncrementalReview) and
    // Gemini-specific config (responseMimeType / responseJsonSchema).
    // We consume StreamChunks directly and record telemetry ourselves.
    const aiProvider = getProvider(provider);
    const outputLimit = resolveOutputLimit(provider, role, mode);
    const streamRequest = {
      signal,
      systemInstruction: prompt,
      userContent: contents,
      model: modelName,
      maxOutputTokens: outputLimit,
      thinkingLevel: 'medium' as const,
      temperature: 0.2,
      responseFormat: 'json' as const,
      // Gemini receives the full JSON schema; OpenAI-compatible providers use
      // response_format: json_object through their adapters.
      responseJsonSchema: provider === 'gemini' ? getFeedbackResponseJsonSchema(role) : undefined,
    };

    // Open the stream — provider normalizes chunks to StreamChunk
    const streamIterable = await aiProvider.stream(streamRequest);
    let lastChunkUsage: import('./providers/interface').UsageMetadata | undefined;

    for await (const chunk of streamIterable) {
      rawBuffer += chunk.text;
      if (chunk.usage) lastChunkUsage = chunk.usage;
      if (chunk.finishReason === 'MAX_TOKENS' || chunk.finishReason === 'length') truncated = true;
      emitIncrementalReview({
        rawBuffer,
        isPolishMode,
        draftText,
        sendEvent,
        sanitizeFeedback,
        emitted,
      });
    }

    let parsed: unknown = null;
    try {
      const jsonText = extractJsonFromText(rawBuffer.trim());
      if (jsonText) parsed = parseJsonResponse(jsonText);
    } catch {
      parsed = null;
    }

    const status = truncated || parsed === null ? 'error' : 'success';
    recordReviewTelemetry({
      telemetry,
      provider,
      stage: 'review',
      model: modelName,
      usage: lastChunkUsage,
      durationMs: Date.now() - startedAt,
      attempt: attempt + 1,
      status,
    });

    if (truncated || parsed === null) {
      if (attempt < 2) {
        telemetry.markFallback();
        if (!isPolishMode) {
          sendEvent('reset', {
            reason: attempt === 0 ? 'compact' : 'manual_fallback',
          });
        }
        continue;
      }

      const providerName = provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : 'Groq';
      throw new TruncatedModelResponseError(
        `${providerName} response reached output token limit before completing valid JSON.`
      );
    }

    const normalized = normalizeReviewCandidate(parsed, role);
    const data = isPolishMode
      ? PolishDiagnosisSchema.parse(normalized)
      : FeedbackOutputSchema.parse(normalized);
    data.feedback = data.feedback.map((item) =>
      sanitizeFeedback(item, draftText)
    );
    data.summary = sanitizeSummary(data.summary, data.feedback, draftText);
    if (!isPolishMode) sendEvent('summary', data.summary);
    return { data, responseMode: mode };
  }

  throw new Error('Editorial review stage exhausted all attempts.');
};

// ── Internal telemetry dispatch ───────────────────────────────────────────────

/**
 * Routes telemetry recording to the correct method on AiTelemetryCollector
 * based on provider name. Replaces scattered recordGemini/recordGroq/recordOpenRouter
 * calls in the review loop — the single place where usage shape is matched to normalizer.
 */
function recordReviewTelemetry(input: {
  telemetry: AiTelemetryCollector;
  provider: AiProvider;
  stage: string;
  model: string;
  usage: import('./providers/interface').UsageMetadata | undefined;
  durationMs: number;
  attempt: number;
  status: 'success' | 'error';
}): void {
  const { telemetry, provider, stage, model, usage, durationMs, attempt, status } = input;
  const base = { stage, model, durationMs, attempt, status };

  // Convert normalized UsageMetadata back to the shape expected by each telemetry method.
  // This is the single seam where we bridge between the provider interface and telemetry.
  const normalizedUsage = usage
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
    : undefined;

  try {
    switch (provider) {
      case 'gemini':
        telemetry.recordGemini({
          ...base,
          usage: normalizedUsage,
          serviceTier: resolveGeminiServiceTier(),
        });
        break;
      case 'groq':
        telemetry.recordGroq({
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
        telemetry.recordOpenRouter({
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
  } catch (err) {
    console.warn('[review-stage] Telemetry record failed:', err);
  }
}
