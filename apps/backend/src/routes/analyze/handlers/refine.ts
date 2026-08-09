/**
 * Handler for refine mode.
 * Refactored in Sprint 3: unified AIProvider abstraction (zero logic change).
 * Throws on error — controller's try/catch handles SSE error + res.end().
 */

import { randomUUID } from 'node:crypto';
import {
  replaceFirstTargetMatch,
  type FinalQualityGateOutput,
  type PublicationPackage,
  type ResearchNote,
} from '@eai/shared';
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
  createInitialDraftRevision,
  readDraftRevisionFromMetadata,
  type DraftRevisionIdentity,
} from '@/lib/draft-revision';
import { assignPersistentEditorialIdentities } from '@/lib/editorial-identity';
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
import { runTargetedFixStage } from '@/lib/ai/targeted-fix-stage';
import {
  applyAutomaticDeterministicRemediations,
  buildQualitySourceCorpus,
  canUseGeneratedRemediation,
} from '@/lib/automatic-remediation';

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
    await runRefineAttempt(1, false, false)
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

  let refinedText = finalizedRefine.text;
  const workingTitle = finalizedRefine.workingTitle;
  if (workingTitle) sendEvent('working_title', workingTitle);

  const qualityGateConfig = resolveAiFunctionConfig(
    aiConfig,
    'analyze_quality_gate'
  );
  const targetedFixConfig = resolveAiFunctionConfig(aiConfig, 'analyze_targeted_fix');
  const qualitySourceCorpus = buildQualitySourceCorpus(text, refineResearchNotes);
  const trustedSourceUrls = new Set<string>();

  const runQualityGate = async (
    draft: string,
    publicationMode: 'fast' | 'publish_ready',
    publicationPackage: PublicationPackage | null
  ): Promise<FinalQualityGateOutput> => {
    sendEvent('status', 'quality_gate');
    const response = await runFinalQualityGateSafely({
      signal: state.signal,
      provider: qualityGateConfig.provider,
      modelOverride: qualityGateConfig.model,
      originalDraft: text,
      finalDraft: draft,
      deterministicOriginalDraft: qualitySourceCorpus,
      metadata,
      analysisSpeed,
      trustedSourceUrls: Array.from(trustedSourceUrls),
      trustedInternalDomains: editorialProfile.config.internalLinkDomains,
      telemetry,
      editorialProfile,
      sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
      sanitizeSummary: sanitizeFactualSummary,
      researchNotes: refineResearchNotes,
      publicationMode,
      taskInstruction: [
        'Evaluate the current final draft and publication contract.',
        'Treat supplied workspace research notes as source material, but only within the claims they directly support.',
        'When a research-note URL directly supports a claim that merely lacks an inline citation, return that exact URL as verifiedSource for automatic attachment.',
        'Do not request an editor action for a correction the system can express safely as a complete target/replacement operation.',
      ].join(' '),
      workingTitle: typeof publicationPackage?.title === 'string'
        ? publicationPackage.title
        : workingTitle,
      publicationPackage,
    });
    state.usedModels.push(`${response.modelName}(quality-gate)`);
    return response.result;
  };

  const runFinalSeo = async (draft: string): Promise<PublicationPackage> => {
    sendEvent('status', 'generating_seo');
    const seoConfig = resolveAiFunctionConfig(aiConfig, 'analyze_seo');
    const seoModelName = resolveModel(
      seoConfig.provider,
      'seo',
      analysisSpeed,
      seoConfig.model
    );
    state.usedModels.push(`${seoModelName}(seo)`);
    const result = await runSeoStage({
      signal: state.signal,
      provider: seoConfig.provider,
      modelName: seoModelName,
      article: draft,
      metadata,
      editorialProfile,
      systemInstruction: new SeoPromptComposer(
        editorialProfile.config,
        { includeTextSchema: seoConfig.provider !== 'gemini' }
      ).compose('xml'),
      telemetry,
    });
    return result;
  };

  const applyAutomaticRemediationRound = async (
    gate: FinalQualityGateOutput
  ): Promise<boolean> => {
    const deterministic = applyAutomaticDeterministicRemediations({
      draft: refinedText,
      feedback: gate.feedback,
      researchNotes: refineResearchNotes,
    });
    deterministic.trustedSourceUrls.forEach((url) => trustedSourceUrls.add(url));
    if (deterministic.appliedCount > 0 && deterministic.draft !== refinedText) {
      refinedText = preparePublicationDraft(deterministic.draft);
      return true;
    }

    let generatedChange = false;
    const generatedCandidates = gate.feedback
      .filter(canUseGeneratedRemediation)
      .slice(0, 2);
    for (const item of generatedCandidates) {
      if (!item.targetText?.trim()) continue;
      try {
        const targeted = await runTargetedFixStage({
          signal: state.signal,
          provider: targetedFixConfig.provider,
          analysisSpeed,
          article: refinedText,
          originalDraft: qualitySourceCorpus,
          targetText: item.targetText,
          feedback: item.message,
          editorInstruction: item.suggestion || 'Resolve this editorial issue without changing unrelated facts.',
          metadata,
          editorialProfile,
          telemetry,
          modelOverride: targetedFixConfig.model,
        });
        const replacement = replaceFirstTargetMatch(
          refinedText,
          item.targetText,
          targeted.replacementText
        );
        if (replacement.success && replacement.nextText !== refinedText) {
          refinedText = preparePublicationDraft(replacement.nextText);
          state.usedModels.push(`${targeted.modelName}(automatic-remediation)`);
          generatedChange = true;
        }
      } catch (error) {
        console.warn('[Refine] Automatic targeted remediation stopped safely:', error);
      }
    }
    return generatedChange;
  };

  let refineQualityGate = await runQualityGate(refinedText, 'fast', null);
  let automaticRounds = 0;
  while (refineQualityGate.readiness !== 'ready' && automaticRounds < 2) {
    const changed = await applyAutomaticRemediationRound(refineQualityGate);
    if (!changed) break;
    automaticRounds += 1;
    refineQualityGate = await runQualityGate(refinedText, 'fast', null);
    if (state.isDisconnected) return;
  }

  let refineSeo = await runFinalSeo(refinedText);
  if (state.isDisconnected) return;
  refineQualityGate = await runQualityGate(
    refinedText,
    'publish_ready',
    refineSeo
  );
  if (state.isDisconnected) return;

  while (refineQualityGate.readiness !== 'ready' && automaticRounds < 2) {
    const changed = await applyAutomaticRemediationRound(refineQualityGate);
    if (!changed) break;
    automaticRounds += 1;
    refineSeo = await runFinalSeo(refinedText);
    if (state.isDisconnected) return;
    refineQualityGate = await runQualityGate(
      refinedText,
      'publish_ready',
      refineSeo
    );
    if (state.isDisconnected) return;
  }

  const publicationOnlyFinding = refineQualityGate.feedback.length > 0
    && refineQualityGate.feedback.every((item) => item.targetField?.startsWith('publication.'));
  if (publicationOnlyFinding) {
    refineSeo = await runFinalSeo(refinedText);
    if (state.isDisconnected) return;
    refineQualityGate = await runQualityGate(refinedText, 'publish_ready', refineSeo);
    if (state.isDisconnected) return;
  }

  sendEvent('draft_final', refinedText);
  sendEvent('seo_metadata', refineSeo);
  sendEvent('publication_package_status', 'current');

  const initialRevision = createInitialDraftRevision({
    body: refinedText,
    origin: 'refine',
  });
  const identified = assignPersistentEditorialIdentities({
    feedback: refineQualityGate.feedback,
    finalDraft: refinedText,
    system: initialRevision,
    researchNotes: refineResearchNotes,
  });
  refineQualityGate = { ...refineQualityGate, feedback: identified.feedback };
  const persistedIdentityState = {
    ...initialRevision,
    editorialIdentities: identified.editorialIdentities,
  };
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
              refineSeo,
              analysisSpeed,
              refineQualityGate,
              telemetry.snapshot(),
              editorialAudit,
              typeof refineSeo?.title === 'string' ? refineSeo.title : workingTitle,
              'current',
              'refine',
              persistedIdentityState
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
        inputFeedback: normalizedPreviousFeedback,
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
