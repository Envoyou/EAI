import { ThinkingLevel } from '@google/genai';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import { FinalQualityGateResponseJsonSchema, FinalQualityGateResponseSchema, FinalQualityGateSchema, type FinalQualityGateOutput, normalizeFinalQualityGateResponseCandidate } from '@eai/shared';
import {
  applyDeterministicQualityChecks,
} from '@/lib/final-quality';
import { composeEditorialPrompt, type EditorialProfileSnapshot } from '@eai/shared/server';
import { getFinalQualityGatePrompt } from '@/lib/prompts';
import { parseJsonResponse } from '@eai/shared';
import type { ArticleMetadata, FeedbackItem } from '@eai/shared';
import {
  type AiProvider,
  type AnalysisSpeed,
  extractGeminiText,
  extractOpenRouterText,
  extractOpenRouterUsage,
  gemini,
  getGeminiSamplingConfig,
  getOpenRouterModelForRole,
  GROQ_MODEL,
  groq,
  openrouter,
} from './provider-runtime';
import {
  buildEditorialUserContent,
  withInputBoundaryPolicy,
} from './prompt-context';

const detectLanguage = (text: string): 'id' | 'en' => {
  const clean = text.toLowerCase();
  const idScore = (clean.match(/\byang\b/g) || []).length * 2 +
                  (clean.match(/\bdan\b/g) || []).length +
                  (clean.match(/\bdi\b/g) || []).length +
                  (clean.match(/\bdengan\b/g) || []).length +
                  (clean.match(/\buntuk\b/g) || []).length;
  const enScore = (clean.match(/\bthe\b/g) || []).length * 2 +
                  (clean.match(/\band\b/g) || []).length +
                  (clean.match(/\bof\b/g) || []).length +
                  (clean.match(/\bto\b/g) || []).length +
                  (clean.match(/\bis\b/g) || []).length;
  return enScore > idScore ? 'en' : 'id';
};

type FeedbackSanitizer = (
  item: FeedbackItem,
  draftText: string
) => FinalQualityGateOutput['feedback'][number];

const runFinalQualityGate = async ({
  provider,
  originalDraft,
  finalDraft,
  metadata,
  analysisSpeed,
  trustedInternalUrls = [],
  trustedInternalDomains = [],
  telemetry,
  editorialProfile,
  sanitizeFeedback,
  sanitizeSummary,
  attempt = 1,
}: {
  provider: AiProvider;
  originalDraft: string;
  finalDraft: string;
  metadata?: ArticleMetadata;
  analysisSpeed?: AnalysisSpeed;
  trustedInternalUrls?: string[];
  trustedInternalDomains?: string[];
  telemetry: AiTelemetryCollector;
  editorialProfile: EditorialProfileSnapshot;
  sanitizeFeedback: FeedbackSanitizer;
  sanitizeSummary: (
    summary: string,
    feedback: FinalQualityGateOutput['feedback'],
    draftText: string
  ) => string;
  attempt?: number;
}): Promise<{ result: FinalQualityGateOutput; modelName: string }> => {
  const contents = buildEditorialUserContent({
    metadata,
    data: {
      sourceDraft: originalDraft,
      trustedInternalUrls,
      trustedInternalDomains,
      finalDraft,
    },
    task: 'Evaluate finalDraft as the primary quality gate object. Use sourceDraft only to compare changes and source fidelity.',
  });

  let parsed: unknown;
  let modelName: string;

  if (provider === 'gemini') {
    modelName = analysisSpeed === 'fast'
      ? 'gemini-3.1-flash-lite'
      : 'gemini-3.5-flash';
    const startedAt = Date.now();
    const response = await gemini.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: withInputBoundaryPolicy(composeEditorialPrompt(
          getFinalQualityGatePrompt(metadata, editorialProfile.config, {
            includeTextSchema: false,
          }),
          editorialProfile
        )),
        ...getGeminiSamplingConfig(modelName, 0.15),
        candidateCount: 1,
        maxOutputTokens: 1800,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseJsonSchema: FinalQualityGateResponseJsonSchema,
      },
    });
    telemetry.recordGemini({
      stage: 'quality_gate',
      model: modelName,
      usage: response.usageMetadata,
      durationMs: Date.now() - startedAt,
      attempt,
    });
    parsed = parseJsonResponse(extractGeminiText(response));
  } else if (provider === 'openrouter') {
    modelName = getOpenRouterModelForRole('editor', analysisSpeed);
    const startedAt = Date.now();
    const response = await openrouter.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: withInputBoundaryPolicy(composeEditorialPrompt(
            getFinalQualityGatePrompt(metadata, editorialProfile.config),
            editorialProfile
          )),
        },
        { role: 'user', content: contents },
      ],
      stream: false,
      max_tokens: 1800,
      temperature: 0.15,
      response_format: { type: 'json_object' },
    });
    telemetry.recordOpenRouter({
      stage: 'quality_gate',
      model: modelName,
      usage: extractOpenRouterUsage(response),
      durationMs: Date.now() - startedAt,
      attempt,
    });
    parsed = parseJsonResponse(extractOpenRouterText(response));
  } else {
    modelName = GROQ_MODEL;
    const startedAt = Date.now();
    const response = await groq.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: withInputBoundaryPolicy(composeEditorialPrompt(
            getFinalQualityGatePrompt(metadata, editorialProfile.config),
            editorialProfile
          )),
        },
        { role: 'user', content: contents },
      ],
      stream: false,
      max_tokens: 1800,
      temperature: 0.15,
      response_format: { type: 'json_object' },
    });
    telemetry.recordGroq({
      stage: 'quality_gate',
      model: modelName,
      usage: response.usage,
      durationMs: Date.now() - startedAt,
      attempt,
    });
    parsed = parseJsonResponse(response.choices[0]?.message?.content ?? '');
  }

  let result: FinalQualityGateOutput = FinalQualityGateResponseSchema.parse(
    normalizeFinalQualityGateResponseCandidate(parsed)
  );
  result.feedback = result.feedback.map((item) =>
    sanitizeFeedback(item, finalDraft)
  );
  result.summary = sanitizeSummary(result.summary, result.feedback, finalDraft);
  const language = metadata?.outputLanguage === 'follow_draft'
    ? detectLanguage(finalDraft)
    : (metadata?.outputLanguage ?? 'en');

  result = applyDeterministicQualityChecks(result, finalDraft, originalDraft, {
    trustedInternalUrls,
    trustedInternalDomains,
    trustedEntities: [editorialProfile.config.brandName],
    allowedEditorialTerms: editorialProfile.config.allowedEditorialTerms,
    language,
  });

  return { result, modelName };
};

export const runFinalQualityGateSafely = async (
  input: Omit<Parameters<typeof runFinalQualityGate>[0], 'attempt'>
): ReturnType<typeof runFinalQualityGate> => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await runFinalQualityGate({ ...input, attempt });
    } catch (error) {
      if (attempt === 1) {
        input.telemetry.markFallback();
        console.warn('[Quality Gate] First attempt failed, retrying once:', error);
      } else {
        console.error('[Quality Gate] Automated review unavailable after retry:', error);
      }
    }
  }

  input.telemetry.markFallback();
  return {
    modelName: `${input.provider}-quality-gate-fallback`,
    result: FinalQualityGateSchema.parse({
      readiness: 'needs_review',
      summary: 'The final draft was generated, but the automatic quality gate did not complete. Run a manual editorial review before export.',
      changes: [
        'The source draft was processed into a final version according to the editorial brief.',
        'The draft structure and readability were prepared for human editorial review.',
      ],
      feedback: [{
        category: 'Editorial Review',
        status: 'warning',
        message: 'The automated quality gate could not complete after two attempts.',
        suggestion: 'Review POV, factual integrity, structure, and closing before exporting to the CMS.',
        operation: 'manual',
      }],
      flags: [],
    }),
  };
};
