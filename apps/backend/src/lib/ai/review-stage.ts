import { ThinkingLevel } from '@google/genai';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import {
  FeedbackOutputSchema,
  PolishDiagnosisSchema,
  getFeedbackResponseJsonSchema,
  type FeedbackOutput,
  type PolishDiagnosisOutput,
} from '@eai/shared';
import {
  extractCompleteObjectsFromJsonArray,
  extractJsonFromText,
  extractJsonNumberValue,
  extractJsonStringValue,
  parseJsonResponse,
} from '@eai/shared';
import type {
  ArticleMetadata,
  FeedbackItem,
  ResponseMode,
  Role,
} from '@eai/shared';
import {
  type AiProvider,
  extractGeminiText,
  gemini,
  getGeminiFinishReason,
  getGeminiReviewOutputLimit,
  getGeminiSamplingConfig,
  getGroqReviewOutputLimit,
  groq,
} from './provider-runtime';
import {
  buildCompactReviewInstruction,
  buildEditorialUserContent,
  buildManualReviewInstruction,
} from './prompt-context';

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
}: {
  provider: AiProvider;
  modelName: string;
  role: Role;
  metadata?: ArticleMetadata;
  draftText: string;
  reviewPrompt: string;
  telemetry: AiTelemetryCollector;
  sendEvent: SendEvent;
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
    let geminiUsage: Parameters<AiTelemetryCollector['recordGemini']>[0]['usage'];
    let groqUsage: Parameters<AiTelemetryCollector['recordGroq']>[0]['usage'];

    if (provider === 'gemini') {
      let lastChunk: unknown = null;
      const stream = await gemini.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction: prompt,
          ...getGeminiSamplingConfig(modelName, 0.2),
          candidateCount: 1,
          maxOutputTokens: getGeminiReviewOutputLimit(role, mode),
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseJsonSchema: getFeedbackResponseJsonSchema(role),
        },
      });

      for await (const chunk of stream) {
        lastChunk = chunk;
        rawBuffer += extractGeminiText(chunk);
        emitIncrementalReview({
          rawBuffer,
          isPolishMode,
          draftText,
          sendEvent,
          sanitizeFeedback,
          emitted,
        });
      }

      truncated = getGeminiFinishReason(
        lastChunk as Parameters<typeof getGeminiFinishReason>[0]
      ) === 'MAX_TOKENS';
      geminiUsage = (lastChunk as {
        usageMetadata?: Parameters<AiTelemetryCollector['recordGemini']>[0]['usage'];
      } | null)?.usageMetadata;
    } else {
      const stream = await groq.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: contents },
        ],
        stream: true,
        max_tokens: getGroqReviewOutputLimit(mode),
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      for await (const chunk of stream) {
        groqUsage = chunk.x_groq?.usage ?? groqUsage;
        rawBuffer += chunk.choices[0]?.delta?.content ?? '';
        if (chunk.choices[0]?.finish_reason === 'length') truncated = true;
        emitIncrementalReview({
          rawBuffer,
          isPolishMode,
          draftText,
          sendEvent,
          sanitizeFeedback,
          emitted,
        });
      }
    }

    let parsed: unknown = null;
    try {
      const jsonText = extractJsonFromText(rawBuffer.trim());
      if (jsonText) parsed = parseJsonResponse(jsonText);
    } catch {
      parsed = null;
    }

    const status = truncated || parsed === null ? 'error' : 'success';
    if (provider === 'gemini') {
      telemetry.recordGemini({
        stage: 'review',
        model: modelName,
        usage: geminiUsage,
        durationMs: Date.now() - startedAt,
        attempt: attempt + 1,
        status,
      });
    } else {
      telemetry.recordGroq({
        stage: 'review',
        model: modelName,
        usage: groqUsage,
        durationMs: Date.now() - startedAt,
        attempt: attempt + 1,
        status,
      });
    }

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

      const providerName = provider === 'gemini' ? 'Gemini' : 'Groq';
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
