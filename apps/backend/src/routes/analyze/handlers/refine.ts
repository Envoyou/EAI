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
import {
  buildEditorialUserContent,
  buildAttachmentContext,
  buildResearchNotesSummary,
} from '@/lib/ai/prompt-context';
import { composeWorkspaceContext } from '@/lib/ai/workspace-context';
import { runFinalQualityGateSafely } from '@/lib/ai/quality-gate-stage';
import { runSeoStage } from '@/lib/ai/seo-stage';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { RefinementPromptComposer } from '@/lib/ai/prompt-engine/composer/refinement-composer';
import { stripLeadingH1 } from '@/lib/text-utils';
import { createAnalysisLogAndDebitCredit } from '@/lib/services/analysis-log.service';
import {
  readDraftRevisionFromMetadata,
  type DraftRevisionIdentity,
} from '@/lib/draft-revision';
import { sanitizeSuppressiveFeedbackItem, sanitizeFactualSummary } from '../utils/factual';
import { getProtectedVerificationClaims } from '../utils/factual';
import {
  applyVerificationLocks,
  applyVerificationAnnotations,
  removeDisallowedRefineTargets,
} from '../utils/verification';
import {
  buildStoredMetadata,
  ensureTitleAndOpening,
  getRewriteOutputTokens,
  preparePublicationDraft,
} from '../utils/text';
import { resolveAiFunctionConfig } from '@/lib/ai-provider-resolver';
import { getCurrentEditorialDate, PROMPT_VERSION } from '@/lib/prompts';

export async function handleRefine(ctx: RefineContext): Promise<void> {
  const {
    requestId,
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
    aiConfig,
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
  const refineResearchNotes: ResearchNote[] = metadata?.researchNotes ?? [];
  const refineTimezone = editorialProfile.config.timezone || 'Asia/Jakarta';
  const {
    xml: refineWorkspaceXml,
    agentInstruction: refineAgentInstruction,
  } = composeWorkspaceContext({
    today: getCurrentEditorialDate(refineTimezone),
    timezone: refineTimezone,
    profileConfig: editorialProfile.config,
    notesSummary: buildResearchNotesSummary(refineResearchNotes) || null,
    attachment: buildAttachmentContext(metadata?.attachments),
  });

  sendEvent('status', 'rewriting');

  const baseRefinePrompt = `${new RefinementPromptComposer(
    'iterative',
    editorialProfile.config,
    { sourceOnly: analysisSpeed === 'fast' }
  ).compose('xml')}\n\n${refineAgentInstruction}`;

  const lockedRefineInput = applyVerificationLocks(text, protectedFeedback);

  const refineModelName = resolveModelName('editor');
  state.usedModels.push(`${refineModelName}(refine)`);

  const buildRefineUserContent = (correctiveRetry: boolean) =>
    `${refineWorkspaceXml}\n\n${buildEditorialUserContent({
      metadata,
      data: {
        editorInstruction: userInstruction,
        previousFeedback: normalizedPreviousFeedback.slice(0, 5),
        article: lockedRefineInput,
      },
      task: correctiveRetry
        ? 'Correct the previous no-op response. Materially resolve editorInstruction and the listed previousFeedback, then output only the revised final article.'
        : 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
    })}`;

  const runRefineAttempt = async (
    attempt: number,
    correctiveRetry: boolean,
    streamChunks: boolean
  ) => {
    const systemInstruction = correctiveRetry
      ? `${baseRefinePrompt}

<corrective_retry>
The previous attempt returned the source article unchanged even though an unresolved editorial finding remains.
Apply the requested structural or editorial correction materially. Do not return the source unchanged, do not merely restate the instruction, and do not change unrelated facts or sections.
</corrective_retry>`
      : baseRefinePrompt;
    let output = '';

    for await (const chunk of executeStream({
      provider,
      request: {
        signal: state.signal,
        systemInstruction,
        userContent: buildRefineUserContent(correctiveRetry),
        model: refineModelName,
        maxOutputTokens: getRewriteOutputTokens(text, true),
        temperature: 0.35,
        thinkingLevel: effectiveProvider === 'gemini' ? 'medium' : undefined,
      },
      telemetry,
      stage: 'refine',
      attempt,
    })) {
      if (state.isDisconnected) break;
      output += chunk;
      if (streamChunks) sendEvent('draft_chunk', chunk);
    }

    return output;
  };

  const finalizeRefinedText = (output: string) => {
    let finalized = ensureTitleAndOpening(output, text);
    finalized = removeDisallowedRefineTargets(finalized, normalizedPreviousFeedback);
    const normalized = stripLeadingH1(finalized);
    const comparisonText = preparePublicationDraft(normalized.body);
    return {
      text: preparePublicationDraft(applyVerificationAnnotations(
        normalized.body,
        normalizedPreviousFeedback
      )),
      comparisonText,
      workingTitle: normalized.title || metadata?.workingTitle,
    };
  };

  const comparableDraft = (value: string) =>
    value.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

  let finalizedRefine = finalizeRefinedText(
    await runRefineAttempt(1, false, true)
  );
  if (state.isDisconnected) return;

  const preparedInput = preparePublicationDraft(stripLeadingH1(text).body);
  if (comparableDraft(finalizedRefine.comparisonText) === comparableDraft(preparedInput)) {
    finalizedRefine = finalizeRefinedText(
      await runRefineAttempt(2, true, false)
    );
    if (state.isDisconnected) return;
  }

  if (comparableDraft(finalizedRefine.comparisonText) === comparableDraft(preparedInput)) {
    throw new Error(
      'Refinement did not change the draft after one corrective retry. No refined result was saved; revise the instruction or apply the structural edit manually.'
    );
  }

  const refinedText = finalizedRefine.text;
  const workingTitle = finalizedRefine.workingTitle;
  if (workingTitle) sendEvent('working_title', workingTitle);
  sendEvent('draft_final', refinedText);

  let refineSeo: PublicationPackage | null = null;
  if (analysisSpeed !== 'fast') {
    sendEvent('status', 'generating_seo');
    const seoConfig = resolveAiFunctionConfig(aiConfig, 'analyze_seo');
    const seoModelName = resolveModel(
      seoConfig.provider,
      'seo',
      analysisSpeed,
      seoConfig.model
    );
    state.usedModels.push(`${seoModelName}(seo)`);
    refineSeo = await runSeoStage({
      signal: state.signal,
      provider: seoConfig.provider,
      modelName: seoModelName,
      article: refinedText,
      metadata,
      editorialProfile,
      systemInstruction: new SeoPromptComposer(
        editorialProfile.config,
        { includeTextSchema: seoConfig.provider !== 'gemini' }
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
  const qualityGateConfig = resolveAiFunctionConfig(
    aiConfig,
    'analyze_quality_gate'
  );
  const refineQualityGateResponse = await runFinalQualityGateSafely({
    signal: state.signal,
    provider: qualityGateConfig.provider,
    modelOverride: qualityGateConfig.model,
    originalDraft: text,
    finalDraft: refinedText,
    metadata,
    analysisSpeed,
    trustedInternalDomains: editorialProfile.config.internalLinkDomains,
    telemetry,
    editorialProfile,
    sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
    sanitizeSummary: sanitizeFactualSummary,
    researchNotes: refineResearchNotes,
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
  let savedDraftRevision: DraftRevisionIdentity | undefined;
  if (userId) {
    try {
      const savedLog = await createAnalysisLogAndDebitCredit({
        userId,
        requestId,
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
              refineSeo ? 'current' : 'not_generated',
              'refine'
            )
          )
        ),
        promptVersion: PROMPT_VERSION,
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
      savedDraftRevision = readDraftRevisionFromMetadata({
        metadata: savedLog.metadata,
        body: refinedText,
        fallbackCreatedAt: savedLog.createdAt,
      });
    } catch (dbErr) {
      console.error('[Refine] Failed to save to DB:', dbErr);
    }
  }

  sendEvent('complete', {
    analysisLogId: refineLogId,
    sourceRef,
    draftRevision: savedDraftRevision,
  });
}
