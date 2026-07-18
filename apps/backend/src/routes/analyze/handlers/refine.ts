/**
 * Handler for refine mode.
 * Refactored in Sprint 3: unified AIProvider abstraction (zero logic change).
 * Throws on error — controller's try/catch handles SSE error + res.end().
 */

import { randomUUID } from 'node:crypto';
import type { PublicationPackage, ResearchNote } from '@eai/shared';
import type { RefineContext } from '../types';
import { getProvider } from '@/lib/ai/providers/registry';
import { resolveModel } from '@/lib/ai/model-router';
import { executeStream } from '@/lib/ai/runtime/execute-stream';
import { buildEditorialUserContent } from '@/lib/ai/prompt-context';
import { runFinalQualityGateSafely } from '@/lib/ai/quality-gate-stage';
import { runSeoStage } from '@/lib/ai/seo-stage';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { RefinementPromptComposer } from '@/lib/ai/prompt-engine/composer/refinement-composer';
import { stripLeadingH1 } from '@/lib/text-utils';
import { createAnalysisLogAndDebitCredit } from '@/lib/services/analysis-log.service';
import { sanitizeSuppressiveFeedbackItem, sanitizeFactualSummary } from '../utils/factual';
import { getProtectedVerificationClaims } from '../utils/factual';
import {
  applyVerificationLocks,
  applyVerificationAnnotations,
} from '../utils/verification';
import {
  buildStoredMetadata,
  getRewriteOutputTokens,
  preparePublicationDraft,
} from '../utils/text';

export async function handleRefine(ctx: RefineContext): Promise<void> {
  const {
    sendEvent,
    state,
    text,
    metadata,
    userInstruction,
    previousFeedback,
    analysisSpeed,
    effectiveProvider,
    userId,
    workspace,
    editorialProfile,
    editorialAudit,
    editorialLogFields,
    telemetry,
    modelOverride,
  } = ctx;

  if (!userInstruction?.trim()) {
    sendEvent('error', 'userInstruction is required for refine mode');
    return;
  }

  const provider = getProvider(effectiveProvider);
  const resolveModelName = (roleForModel: 'polish' | 'editor' | 'seo' | 'author' | 'fact-checker') =>
    resolveModel(effectiveProvider, roleForModel, analysisSpeed, modelOverride);

  const normalizedPreviousFeedback = (previousFeedback ?? []).map((item) =>
    sanitizeSuppressiveFeedbackItem(item, text)
  );
  const protectedFeedback = getProtectedVerificationClaims(normalizedPreviousFeedback);

  sendEvent('status', 'rewriting');

  const refinePrompt = new RefinementPromptComposer(
    'iterative',
    editorialProfile.config,
    { sourceOnly: analysisSpeed === 'fast' }
  ).compose('xml');

  let refinedText = '';
  const lockedRefineInput = applyVerificationLocks(text, protectedFeedback);

  const refineModelName = resolveModelName('editor');
  state.usedModels.push(`${refineModelName}(refine)`);

  for await (const chunk of executeStream({
    provider,
    request: {
      systemInstruction: refinePrompt,
      userContent: buildEditorialUserContent({
        metadata,
        data: {
          editorInstruction: userInstruction,
          previousFeedback: normalizedPreviousFeedback.slice(0, 5),
          article: lockedRefineInput,
        },
        task: 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
      }),
      model: refineModelName,
      maxOutputTokens: getRewriteOutputTokens(text, true),
      temperature: 0.35,
      thinkingLevel: effectiveProvider === 'gemini' ? 'medium' : undefined,
    },
    telemetry,
    stage: 'refine',
  })) {
    if (state.isDisconnected) break;
    refinedText += chunk;
    sendEvent('draft_chunk', chunk);
  }
  if (state.isDisconnected) return;

  // Import ensureTitleAndOpening and removeDisallowedRefineTargets inline/locally to match existing behavior
  const { ensureTitleAndOpening } = await import('../utils/text');
  const { removeDisallowedRefineTargets } = await import('../utils/verification');

  refinedText = ensureTitleAndOpening(refinedText, text);
  refinedText = removeDisallowedRefineTargets(refinedText, normalizedPreviousFeedback);
  const normalizedRefine = stripLeadingH1(refinedText);
  const workingTitle = normalizedRefine.title || metadata?.workingTitle;
  refinedText = normalizedRefine.body;
  if (workingTitle) sendEvent('working_title', workingTitle);
  const refineQualityGateDraft = applyVerificationAnnotations(refinedText, normalizedPreviousFeedback);
  refinedText = preparePublicationDraft(refineQualityGateDraft);
  sendEvent('draft_final', refinedText);

  let refineSeo: PublicationPackage | null = null;
  if (analysisSpeed !== 'fast') {
    sendEvent('status', 'generating_seo');
    const seoModelName = resolveModelName('seo');
    state.usedModels.push(`${seoModelName}(seo)`);
    refineSeo = await runSeoStage({
      provider: effectiveProvider,
      modelName: seoModelName,
      article: refinedText,
      metadata,
      editorialProfile,
      systemInstruction: new SeoPromptComposer(
        editorialProfile.config,
        { includeTextSchema: effectiveProvider !== 'gemini' }
      ).compose('xml'),
      telemetry,
    });
    if (state.isDisconnected) return;
    sendEvent('seo_metadata', refineSeo);
    sendEvent('publication_package_status', 'current');
  } else {
    sendEvent('publication_package_status', 'not_generated');
  }

  sendEvent('status', 'quality_gate');
  const refineQualityGateResponse = await runFinalQualityGateSafely({
    provider: effectiveProvider,
    originalDraft: text,
    finalDraft: refinedText,
    metadata,
    analysisSpeed,
    trustedInternalDomains: editorialProfile.config.internalLinkDomains,
    telemetry,
    editorialProfile,
    sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
    sanitizeSummary: sanitizeFactualSummary,
    researchNotes: ((metadata as Record<string, unknown>)?.researchNotes as ResearchNote[] | undefined) || [],
    publicationMode: analysisSpeed === 'fast' ? 'fast' : 'publish_ready',
    workingTitle: typeof refineSeo?.title === 'string' ? refineSeo.title : workingTitle,
    publicationPackage: refineSeo,
  });
  if (state.isDisconnected) return;
  const refineQualityGate = refineQualityGateResponse.result;
  state.usedModels.push(`${refineQualityGateResponse.modelName}(quality-gate)`);
  sendEvent('feedback_reset', null);
  sendEvent('readiness', refineQualityGate.readiness);
  sendEvent('summary', refineQualityGate.summary);
  sendEvent('changes', refineQualityGate.changes);
  refineQualityGate.feedback.forEach((item, index) => {
    sendEvent('feedback_item', { item, index });
  });
  sendEvent('flags', refineQualityGate.flags);

  let sourceRef = state.metadataToLog?.sourceRef;
  if (!sourceRef) {
    sourceRef = `eai_${randomUUID()}`;
  }

  let refineLogId: string | undefined;
  if (userId) {
    try {
      const savedLog = await createAnalysisLogAndDebitCredit({
        userId,
        organizationId: workspace.organizationId,
        role: 'refine',
        content: text,
        metadata: JSON.parse(
          JSON.stringify(
            buildStoredMetadata(
              state.metadataToLog,
              'standard',
              refinedText,
              sourceRef,
              refineSeo ?? undefined,
              analysisSpeed,
              refineQualityGate,
              telemetry.snapshot(),
              editorialAudit,
              typeof refineSeo?.title === 'string' ? refineSeo.title : workingTitle,
              refineSeo ? 'current' : 'not_generated'
            )
          )
        ),
        promptVersion: process.env.PROMPT_VERSION ?? 'unknown',
        modelName:
          state.usedModels.length > 0
            ? state.usedModels.join(' + ')
            : state.executedModelName,
        score: undefined,
        verdict: refineQualityGate.readiness,
        summary: refineQualityGate.summary,
        feedback: refineQualityGate.feedback,
        flags: refineQualityGate.flags,
        status: 'success',
        editorStatus: 'refined',
        ...editorialLogFields,
        telemetrySnapshot: telemetry.snapshot(),
      });
      refineLogId = savedLog.id;
    } catch (dbErr) {
      console.error('[Refine] Failed to save to DB:', dbErr);
    }
  }

  sendEvent('complete', { analysisLogId: refineLogId, sourceRef });
}
