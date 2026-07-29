import { z } from 'zod';
import type { DuplicateGuardResult } from '@eai/shared';
import { resolveActiveAiFunctionConfig } from '@/lib/ai-provider-resolver';
import { getProvider } from '@/lib/ai/providers/registry';
import { getWorkspaceAgentInstruction } from '@/lib/ai/workspace-context';
import { ContentMemoryClassifierComposer } from '@/lib/ai/prompt-engine/composer/content-memory-classifier-composer';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import type { ContentMemoryInput } from '@/lib/content-memory';

const ClassifierOutputSchema = z.object({
  verdict: z.enum([
    'probable_duplicate',
    'high_overlap',
    'same_topic_new_angle',
    'related',
    'distinct',
  ]),
  confidence: z.number().min(0).max(1),
  sameElements: z.array(z.string().trim().min(1).max(300)).max(6),
  differentElements: z.array(z.string().trim().min(1).max(300)).max(6),
  alternativeAngles: z.array(z.string().trim().min(1).max(500)).max(3),
  explanation: z.string().trim().min(1).max(1_500),
  recommendedAction: z.enum([
    'require_confirmation',
    'suggest_repositioning',
    'continue_with_context',
    'continue',
  ]),
});

const ClassifierResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'verdict',
    'confidence',
    'sameElements',
    'differentElements',
    'alternativeAngles',
    'explanation',
    'recommendedAction',
  ],
  properties: {
    verdict: {
      type: 'string',
      enum: [
        'probable_duplicate',
        'high_overlap',
        'same_topic_new_angle',
        'related',
        'distinct',
      ],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    sameElements: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
    },
    differentElements: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
    },
    alternativeAngles: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string' },
    },
    explanation: { type: 'string' },
    recommendedAction: {
      type: 'string',
      enum: [
        'require_confirmation',
        'suggest_repositioning',
        'continue_with_context',
        'continue',
      ],
    },
  },
} as const;

const isClassifierEnabled = () =>
  process.env.CONTENT_MEMORY_CLASSIFIER_ENABLED !== 'false';

const shouldClassify = (result: DuplicateGuardResult): boolean => {
  if (
    result.verdict === 'exact_duplicate' ||
    result.verdict === 'distinct' ||
    result.matchedArtifacts.length === 0
  ) {
    return false;
  }
  const top = result.matchedArtifacts[0];
  return (
    result.verdict === 'probable_duplicate' ||
    result.verdict === 'high_overlap' ||
    (top?.semanticScore ?? 0) >= 0.72
  );
};

const parseJsonObject = (text: string): unknown => {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Classifier returned no JSON');
  return JSON.parse(withoutFence.slice(start, end + 1));
};

const safeContextJson = (value: unknown): string =>
  JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

const fallbackModel = (provider: 'gemini' | 'groq' | 'openrouter') => {
  if (provider === 'gemini') {
    return (
      process.env.GEMINI_CONTENT_MEMORY_CLASSIFIER_MODEL ||
      'gemini-3.5-flash-lite'
    );
  }
  if (provider === 'groq') return 'llama-3.1-8b-instant';
  return process.env.OPENROUTER_SEO_MODEL || 'openai/gpt-4o-mini';
};

export const classifyAmbiguousContentOverlap = async (params: {
  organizationId: string;
  userId: string;
  input: ContentMemoryInput;
  result: DuplicateGuardResult;
}): Promise<DuplicateGuardResult> => {
  if (!isClassifierEnabled() || !shouldClassify(params.result)) {
    return params.result;
  }

  const startedAt = Date.now();
  const functionConfig = await resolveActiveAiFunctionConfig(
    params.userId,
    params.organizationId,
    'content_memory_classifier'
  );
  const model =
    functionConfig.model || fallbackModel(functionConfig.provider);
  const retrieval = {
    mode: params.result.retrieval?.mode ?? 'deterministic',
    semanticAvailable:
      params.result.retrieval?.semanticAvailable ?? false,
    semanticCandidateCount:
      params.result.retrieval?.semanticCandidateCount ?? 0,
    lexicalCandidateCount:
      params.result.retrieval?.lexicalCandidateCount ?? 0,
    classifierInvoked: true,
    classifierModel: model,
    classifierLatencyMs: null,
  } satisfies NonNullable<DuplicateGuardResult['retrieval']>;

  try {
    const profile = await resolveEditorialProfileForUser(
      params.userId,
      params.organizationId
    ).catch(() => null);
    const systemInstruction = [
      new ContentMemoryClassifierComposer(profile?.config).compose('xml'),
      getWorkspaceAgentInstruction(
        profile?.config ? 'Loaded' : 'Not Configured'
      ),
    ].join('\n\n');
    const userContent = `
<workspace_context>
<proposed_content>
${safeContextJson(params.input)}
</proposed_content>
<retrieved_candidates>
${safeContextJson(
  params.result.matchedArtifacts.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    topic: candidate.topic,
    angle: candidate.angle,
    status: candidate.status,
    stage: candidate.stage,
    score: candidate.score,
    semanticScore: candidate.semanticScore,
    lexicalScore: candidate.lexicalScore,
    reasons: candidate.reasons,
  }))
)}
</retrieved_candidates>
</workspace_context>
`.trim();

    const response = await getProvider(functionConfig.provider).generate({
      systemInstruction,
      userContent,
      model,
      maxOutputTokens: 900,
      thinkingLevel: 'low',
      temperature: 0.1,
      responseFormat: 'json',
      responseJsonSchema: ClassifierResponseJsonSchema,
    });
    const classification = ClassifierOutputSchema.parse(
      parseJsonObject(response.text)
    );
    return {
      ...params.result,
      ...classification,
      reasons: params.result.reasons,
      matchedArtifacts: params.result.matchedArtifacts,
      retrieval: {
        ...retrieval,
        classifierLatencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    console.warn(
      '[CONTENT_MEMORY_CLASSIFIER] Falling back to hybrid score:',
      error instanceof Error ? error.message : error
    );
    return {
      ...params.result,
      retrieval: {
        ...retrieval,
        classifierLatencyMs: Date.now() - startedAt,
      },
    };
  }
};
