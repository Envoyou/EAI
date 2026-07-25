// ThinkingLevel is handled inside GeminiProvider — not needed here.
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import { FinalQualityGateResponseJsonSchema, FinalQualityGateResponseSchema, FinalQualityGateSchema, type FinalQualityGateOutput, normalizeFinalQualityGateResponseCandidate } from '@eai/shared';
import {
  applyDeterministicQualityChecks,
} from '@/lib/final-quality';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import { QualityGatePromptComposer } from './prompt-engine/composer/quality-gate-composer';
import { parseJsonResponse } from '@eai/shared';
import type { ArticleMetadata, FeedbackItem, PublicationPackage, ResearchNote } from '@eai/shared';
import type { AiProvider, AnalysisSpeed } from './provider-runtime';
import { getProvider } from './providers/registry';
import { resolveModel } from './model-router';
import { executeGenerate } from './runtime/execute-generate';
import { composeWorkspaceContext } from './workspace-context';
import {
  reconcileQualityResolutions,
  type QualityResolution,
} from '@/lib/quality-resolution-ledger';

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
  trustedSourceUrls = [],
  trustedInternalDomains = [],
  resolvedQualityFindings = [],
  telemetry,
  editorialProfile,
  sanitizeFeedback,
  sanitizeSummary,
  researchNotes = [],
  publicationMode,
  workingTitle,
  publicationPackage,
  signal,
  attempt = 1,
}: {
  provider: AiProvider;
  originalDraft: string;
  finalDraft: string;
  metadata?: ArticleMetadata;
  analysisSpeed?: AnalysisSpeed;
  trustedInternalUrls?: string[];
  trustedSourceUrls?: string[];
  trustedInternalDomains?: string[];
  resolvedQualityFindings?: QualityResolution[];
  telemetry: AiTelemetryCollector;
  editorialProfile: EditorialProfileSnapshot;
  sanitizeFeedback: FeedbackSanitizer;
  sanitizeSummary: (
    summary: string,
    feedback: FinalQualityGateOutput['feedback'],
    draftText: string
  ) => string;
  researchNotes?: ResearchNote[];
  publicationMode: 'fast' | 'publish_ready';
  workingTitle?: string;
  publicationPackage?: PublicationPackage | null;
  signal?: AbortSignal;
  attempt?: number;
}): Promise<{ result: FinalQualityGateOutput; modelName: string }> => {
  const timezone = editorialProfile.config.timezone || 'Asia/Jakarta';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const currentYear = parts.find((part) => part.type === 'year')?.value || new Date().getFullYear().toString();
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  const currentDate = `${currentYear}-${month}-${day}`;

  let notesSummary = '';
  if (researchNotes && Array.isArray(researchNotes) && researchNotes.length > 0) {
    notesSummary = researchNotes.map((n, i) => {
      const sourcesText = n.sources && n.sources.length > 0
        ? `Sources: ${n.sources.map((s) => s.url).join(', ')}`
        : '';
      return `Note ${i + 1}:\n${n.content}\n${sourcesText}`;
    }).join('\n\n');
  }

  const { xml: workspaceXml, agentInstruction } = composeWorkspaceContext({
    today: currentDate,
    timezone,
    profileConfig: editorialProfile.config,
    notesSummary: notesSummary || null,
  });

  const contents = [
    workspaceXml,
    '<article_draft>',
    finalDraft,
    '</article_draft>',
    '',
    '<original_draft>',
    originalDraft,
    '</original_draft>',
    '',
    '<publishing_contract>',
    `mode: ${publicationMode}`,
    `workingTitle: ${workingTitle || ''}`,
    `publicationPackage: ${publicationPackage ? JSON.stringify(publicationPackage) : 'not_generated'}`,
    publicationMode === 'publish_ready'
      ? 'The CMS renders publicationPackage.title as the page H1. The article body must not contain an H1. Audit both the body and publication package.'
      : 'This is a content-only Fast result. Publication fields are intentionally absent. Do not audit H1, title, slug, excerpt, meta title, meta description, tags, or cover-image alt.',
    '</publishing_contract>',
    '',
    trustedInternalUrls.length > 0 ? `<trusted_internal_urls>\n${trustedInternalUrls.join('\n')}\n</trusted_internal_urls>\n` : '',
    trustedSourceUrls.length > 0 ? `<trusted_source_urls>\n${trustedSourceUrls.join('\n')}\n</trusted_source_urls>\n` : '',
    trustedInternalDomains.length > 0 ? `<trusted_internal_domains>\n${trustedInternalDomains.join('\n')}\n</trusted_internal_domains>\n` : '',
    '<task>',
    'Evaluate finalDraft as the primary quality gate object. Use sourceDraft only to compare changes and source fidelity.',
    '</task>'
  ].filter(Boolean).join('\n');

  const aiProvider = getProvider(provider);
  const modelName = resolveModel(provider, 'editor', analysisSpeed ?? 'balanced');

  const systemInstruction = `${new QualityGatePromptComposer(
    editorialProfile.config,
    provider === 'gemini' ? { includeTextSchema: false } : {}
  ).compose('xml')}\n\n${agentInstruction}${attempt > 1 ? `

<retry_correction>
The previous response failed structural validation. Return one JSON object only. "feedback" must be an array of objects matching the configured feedback schema, and "flags" must be an array of short strings. Do not swap these fields or return prose items in place of objects.
</retry_correction>` : ''}`;

  const text = await executeGenerate({
    provider: aiProvider,
    request: {
      signal,
      systemInstruction,
      userContent: contents,
      model: modelName,
      maxOutputTokens: 4000,
      temperature: 0.15,
      thinkingLevel: provider === 'gemini' ? 'medium' : undefined,
      responseFormat: 'json',
      responseJsonSchema: provider === 'gemini' ? FinalQualityGateResponseJsonSchema : undefined,
    },
    telemetry,
    stage: 'quality_gate',
    attempt,
  });
  const parsed = parseJsonResponse(text.text);

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
    trustedSourceUrls,
    trustedInternalDomains,
    trustedEntities: [editorialProfile.config.brandName],
    allowedEditorialTerms: editorialProfile.config.allowedEditorialTerms,
    language,
    publicationMode,
    documentTitle: publicationPackage?.title || workingTitle,
    publicationPackage,
  });
  result = reconcileQualityResolutions(
    result,
    finalDraft,
    resolvedQualityFindings,
    language
  );

  return { result, modelName };
};

export const runFinalQualityGateSafely = async (
  input: Omit<Parameters<typeof runFinalQualityGate>[0], 'attempt'>
): ReturnType<typeof runFinalQualityGate> => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    input.signal?.throwIfAborted();
    try {
      return await runFinalQualityGate({ ...input, attempt });
    } catch (error) {
      if (input.signal?.aborted) throw error;
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
