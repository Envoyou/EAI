/**
 * Handler for analyze and polish modes.
 * Refactored in Sprint 3: unified AIProvider abstraction replaces two-path
 * Gemini vs. OpenAI-compatible branching (zero logic change).
 * Throws on error — controller's try/catch handles SSE error + res.end().
 */

import { randomUUID } from 'node:crypto';
import type { FeedbackItem, PublicationPackage, ResearchNote } from '@eai/shared';
import type { FinalQualityGateOutput } from '@eai/shared';
import type { AnalyzeContext } from '../types';
import { getProvider } from '@/lib/ai/providers/registry';
import { resolveModel } from '@/lib/ai/model-router';
import { executeStream } from '@/lib/ai/runtime/execute-stream';
import { buildEditorialUserContent } from '@/lib/ai/prompt-context';
import { runEditorialReviewStage } from '@/lib/ai/review-stage';
import { runFinalQualityGateSafely } from '@/lib/ai/quality-gate-stage';
import { runSeoStage } from '@/lib/ai/seo-stage';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { RewritePromptComposer } from '@/lib/ai/prompt-engine/composer/rewrite-composer';
import { ReviewPromptComposer } from '@/lib/ai/prompt-engine/composer/review-composer';
import { CmsAdapterError, listPublishedPostsForProfile } from '@/lib/cms-adapter';
import { stripLeadingH1 } from '@/lib/text-utils';
import { createAnalysisLogAndDebitCredit } from '@/lib/services/analysis-log.service';
import type { ReviewOutput } from '../types';
import { sanitizeSuppressiveFeedbackItem, sanitizeFactualSummary } from '../utils/factual';
import { getProtectedVerificationClaims } from '../utils/factual';
import {
  applyVerificationLocks,
  applyVerificationAnnotations,
} from '../utils/verification';
import { removeDisallowedRefineTargets } from '../utils/verification';
import {
  buildStoredMetadata,
  ensureTitleAndOpening,
  getRewriteOutputTokens,
  selectRelevantPublishedPosts,
  splitDraftIntoRewriteChunks,
} from '../utils/text';
import { preparePublicationDraft } from '../utils/text';

export async function handleAnalyze(ctx: AnalyzeContext): Promise<void> {
  const {
    sendEvent,
    state,
    text,
    role,
    metadata,
    isPolishMode,
    systemPrompt,
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

  const provider = getProvider(effectiveProvider);
  const resolveModelName = (roleForModel: typeof role) =>
    resolveModel(effectiveProvider, roleForModel!, analysisSpeed, modelOverride);

  state.executedModelName = resolveModelName(role);
  const reviewModelName = state.executedModelName;
  state.usedModels.push(`${reviewModelName}(review)`);

  // Gemini review doesn't need includeTextSchema in its prompt; OpenAI-compat does.
  const reviewPrompt = isPolishMode
    ? new ReviewPromptComposer(
        'polish',
        editorialProfile.config,
        { includeTextSchema: effectiveProvider !== 'gemini' }
      ).compose('xml')
    : systemPrompt;

  const reviewResult = await runEditorialReviewStage({
    signal: state.signal,
    provider: effectiveProvider,
    modelName: reviewModelName,
    role: role!,
    metadata,
    draftText: text,
    reviewPrompt,
    telemetry,
    sendEvent,
    sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
    sanitizeSummary: sanitizeFactualSummary,
  });
  if (state.isDisconnected) return;
  state.responseMode = reviewResult.responseMode;
  const validatedData: ReviewOutput = reviewResult.data;

  let finalQualityGate: FinalQualityGateOutput | null = null;
  let publishedPosts: { title: string; slug: string }[] = [];
  let qualityGateDraft = '';
  let polishedText = '';
  let seo: PublicationPackage | null = null;
  let workingTitle = metadata?.workingTitle;

  if (role === 'polish') {
    sendEvent('status', 'rewriting');

    const strippedSource = stripLeadingH1(text);
    const sourceTextToPolish = strippedSource.body;
    workingTitle = strippedSource.title || workingTitle;
    if (workingTitle) sendEvent('working_title', workingTitle);

    if (analysisSpeed !== 'fast') {
      try {
        publishedPosts = await listPublishedPostsForProfile(editorialProfile, 20);
        publishedPosts = selectRelevantPublishedPosts(sourceTextToPolish, publishedPosts);
        if (!editorialProfile.config.internalLinkBaseUrl) {
          publishedPosts = [];
        }
        console.log(
          `[Internal Linking] Selected ${publishedPosts.length} posts for profile ${editorialProfile.profileKey}.`
        );
      } catch (fetchError) {
        const message =
          fetchError instanceof CmsAdapterError
            ? `${fetchError.code}: ${fetchError.message}`
            : fetchError instanceof Error
              ? fetchError.message
              : String(fetchError);
        console.warn(
          `[Internal Linking] Catalog unavailable for profile ${editorialProfile.profileKey}. Continuing without suggestions. ${message}`
        );
      }
    }

    const rewriteNotes = [
      `DRAFT TRANSFORMATION DIAGNOSIS:`,
      `Transformation direction: ${validatedData.summary}`,
      ``,
      `Rewrite priorities:`,
      ...(validatedData.feedback ?? []).slice(0, 3).map(
        (item: FeedbackItem, i: number) =>
          `${i + 1}. [${item.category}] ${item.message}${item.suggestion ? `\n   -> Suggested fix: ${item.suggestion}` : ''}`
      ),
      ``,
      `Ensure the final article does NOT contain the issues above.`,
    ];

    if (publishedPosts.length > 0) {
      const formattedPosts = publishedPosts
        .map(
          (post) =>
            `- [${post.title}](${editorialProfile.config.internalLinkBaseUrl}/${post.slug})`
        )
        .join('\n');
      rewriteNotes.push(
        ``,
        `TRUSTED INTERNAL LINKING (Naturally insert 1-3 relevant links):`,
        formattedPosts
      );
    }

    const chunks = splitDraftIntoRewriteChunks(sourceTextToPolish);
    const isSingleChunk = chunks.length === 1;
    const protectedClaims = getProtectedVerificationClaims(validatedData.feedback);

    const rewriteSystemInstruction = new RewritePromptComposer(editorialProfile.config, {
      isChunkMode: !isSingleChunk,
      publishedPosts,
      sourceOnly: analysisSpeed === 'fast',
    }).compose('xml');

    const rewriteModelName = resolveModelName('rewrite' as typeof role);
    state.usedModels.push(`${rewriteModelName}(rewrite)`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const draftLabel = isSingleChunk
        ? 'Raw article draft:'
        : `Article draft (Part ${i + 1}):`;
      const protectedClaimsNotes =
        protectedClaims.length > 0
          ? [
              '',
              'SENSITIVE FACTUAL CLAIMS THAT MUST BE PRESERVED VERBATIM:',
              ...protectedClaims.map((item, idx) => `${idx + 1}. ${item.targetText}`),
            ].join('\n')
          : '';

      // Single unified stream loop — provider handles Gemini vs OpenAI-compat internally
      for await (const chunkText2 of executeStream({
        provider,
        request: {
          signal: state.signal,
          systemInstruction: rewriteSystemInstruction,
          userContent: buildEditorialUserContent({
            metadata,
            data: {
              chunkLabel: draftLabel,
              article: applyVerificationLocks(chunkText, protectedClaims),
              editorNotes: rewriteNotes.join('\n'),
              protectedClaimsNotes,
              sectionContext: isSingleChunk
                ? undefined
                : `This is segment ${i + 1} of ${chunks.length}. Rewrite only this segment. Connect its flow with the previous draft.`,
            },
            task: 'Polish only the provided article. Apply editorNotes and preserve protectedClaimsNotes.',
          }),
          model: rewriteModelName,
          maxOutputTokens: getRewriteOutputTokens(chunkText, isSingleChunk),
          thinkingLevel: effectiveProvider === 'gemini' ? 'minimal' : undefined,
          temperature: 0.35,
        },
        telemetry,
        stage: `rewrite_chunk_${i}`,
      })) {
        if (state.isDisconnected) break;
        polishedText += chunkText2;
        sendEvent('draft_chunk', chunkText2);
      }
      if (state.isDisconnected) return;
    }

    polishedText = ensureTitleAndOpening(polishedText, sourceTextToPolish);
    polishedText = removeDisallowedRefineTargets(polishedText, validatedData.feedback);
    const lockedPolishedText = applyVerificationLocks(polishedText, protectedClaims);
    const normalizedPolished = stripLeadingH1(lockedPolishedText);
    workingTitle = normalizedPolished.title || workingTitle;
    const publicationBaseText = normalizedPolished.body;

    const finalBody = preparePublicationDraft(publicationBaseText);
    sendEvent('draft_final', finalBody);

    if (analysisSpeed !== 'fast') {
      sendEvent('status', 'generating_seo');
      const seoModelName = resolveModelName('seo' as typeof role);
      state.usedModels.push(`${seoModelName}(seo)`);
      seo = await runSeoStage({
        signal: state.signal,
        provider: effectiveProvider,
        modelName: seoModelName,
        article: finalBody,
        metadata,
        editorialProfile,
        systemInstruction: new SeoPromptComposer(editorialProfile.config, {
          includeTextSchema: effectiveProvider !== 'gemini',
        }).compose('xml'),
        telemetry,
      });
      if (state.isDisconnected) return;
      workingTitle = seo.title;
      sendEvent('seo_metadata', seo);
      sendEvent('publication_package_status', 'current');
    } else {
      sendEvent('publication_package_status', 'not_generated');
    }

    sendEvent('status', 'quality_gate');

    const qualityGateResponse = await runFinalQualityGateSafely({
      signal: state.signal,
      provider: effectiveProvider,
      originalDraft: sourceTextToPolish,
      finalDraft: finalBody,
      metadata,
      analysisSpeed,
      trustedInternalDomains: editorialProfile.config.internalLinkDomains,
      telemetry,
      editorialProfile,
      sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
      sanitizeSummary: sanitizeFactualSummary,
      researchNotes:
        ((metadata as Record<string, unknown>)?.researchNotes as ResearchNote[] | undefined) || [],
      publicationMode: analysisSpeed === 'fast' ? 'fast' : 'publish_ready',
      workingTitle,
      publicationPackage: seo,
    });
    if (state.isDisconnected) return;
    finalQualityGate = qualityGateResponse.result;
    state.usedModels.push(`${qualityGateResponse.modelName}(quality-gate)`);

    qualityGateDraft = applyVerificationAnnotations(publicationBaseText, finalQualityGate.feedback);
    const publicationPolishedDraft = preparePublicationDraft(qualityGateDraft);

    sendEvent('draft_final', publicationPolishedDraft);
    sendEvent('feedback_reset', null);
    sendEvent('readiness', finalQualityGate.readiness);
    sendEvent('summary', finalQualityGate.summary);
    sendEvent('changes', finalQualityGate.changes);
    finalQualityGate.feedback.forEach((item, index) => {
      sendEvent('feedback_item', { item, index });
    });
    sendEvent('flags', finalQualityGate.flags);
  }

  // Non-polish roles still use the standalone metadata stage.
  if (analysisSpeed !== 'fast' && !seo) {
    sendEvent('status', 'generating_seo');
    const seoModelName = resolveModelName('seo' as typeof role);
    state.usedModels.push(`${seoModelName}(seo)`);
    seo = await runSeoStage({
      signal: state.signal,
      provider: effectiveProvider,
      modelName: seoModelName,
      article: polishedText || text,
      metadata,
      editorialProfile,
      systemInstruction: new SeoPromptComposer(editorialProfile.config, {
        includeTextSchema: effectiveProvider !== 'gemini',
      }).compose('xml'),
      telemetry,
    });
    if (state.isDisconnected) return;
    sendEvent('seo_metadata', seo);
    sendEvent('publication_package_status', 'current');
  }

  let sourceRef = state.metadataToLog?.sourceRef;
  if (!sourceRef) {
    sourceRef = `eai_${randomUUID()}`;
  }

  let savedLogId: string | undefined;
  if (userId) {
    try {
      const finalPolishedDraftLog = polishedText
        ? preparePublicationDraft(qualityGateDraft)
        : undefined;
      const savedLog = await createAnalysisLogAndDebitCredit({
        userId,
        organizationId: workspace.organizationId,
        role: state.roleToLog,
        content: text,
        metadata: JSON.parse(
          JSON.stringify(
            buildStoredMetadata(
              state.metadataToLog,
              state.responseMode,
              finalPolishedDraftLog,
              sourceRef,
              seo ?? undefined,
              analysisSpeed,
              finalQualityGate,
              telemetry.snapshot(),
              editorialAudit,
              workingTitle,
              seo ? 'current' : 'not_generated'
            )
          )
        ),
        promptVersion: process.env.PROMPT_VERSION ?? 'unknown',
        modelName:
          state.usedModels.length > 0
            ? state.usedModels.join(' + ')
            : state.executedModelName,
        score: isPolishMode
          ? undefined
          : (validatedData as Record<string, unknown>).score as number | undefined,
        verdict: isPolishMode
          ? (finalQualityGate?.readiness ?? 'needs_review')
          : (validatedData as Record<string, unknown>).verdict as string,
        summary: isPolishMode
          ? (finalQualityGate?.summary ?? validatedData.summary)
          : validatedData.summary,
        feedback: isPolishMode
          ? (finalQualityGate?.feedback ?? validatedData.feedback)
          : validatedData.feedback,
        flags: isPolishMode
          ? (finalQualityGate?.flags ?? validatedData.flags)
          : validatedData.flags,
        status: 'success',
        editorStatus:
          state.roleToLog === 'polish' || state.roleToLog === 'refine'
            ? 'refined'
            : 'draft',
        ...editorialLogFields,
        telemetrySnapshot: telemetry.snapshot(),
      });
      savedLogId = savedLog.id;
    } catch (dbError) {
      console.error(`[${effectiveProvider}] Failed to save success log to database:`, dbError);
    }
  }

  sendEvent('complete', { analysisLogId: savedLogId, sourceRef });
}
