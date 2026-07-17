/**
 * Handler for analyze and polish modes.
 * Two provider branches: Gemini and OpenAI-compatible (Groq / OpenRouter).
 * Extracted from analyze.ts L1577–2063 (zero logic change).
 * Throws on error — controller's try/catch handles SSE error + res.end().
 */

import { randomUUID } from 'node:crypto';
import { ThinkingLevel } from '@google/genai';
import type { FeedbackItem, ResearchNote } from '@eai/shared';
import type { FinalQualityGateOutput } from '@eai/shared';
import type { AnalyzeContext, OpenAiCompatibleChunk } from '../types';
import {
  extractGeminiText,
  gemini,
  getGeminiModelForRole,
  getNativeGeminiConfig,
  getOpenRouterModelForRole,
  GROQ_MODEL,
  GROQ_SEO_MODEL,
  groq,
  openrouter,
} from '@/lib/ai/provider-runtime';
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
import { streamOpenAiCompatibleRewrite } from '../utils/markdown';

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

  const resolveModel = (defaultModel: string): string => modelOverride || defaultModel;

  // ── GEMINI PATH ───────────────────────────────────────────────────────────
  if (effectiveProvider === 'gemini') {
    state.executedModelName = resolveModel(getGeminiModelForRole(role!, analysisSpeed));
    const reviewModelName = state.executedModelName;
    state.usedModels.push(`${reviewModelName}(review)`);
    const reviewPrompt = isPolishMode
      ? new ReviewPromptComposer(
          'polish',
          editorialProfile.config,
          { includeTextSchema: false }
        ).compose('xml')
      : systemPrompt;
    const reviewResult = await runEditorialReviewStage({
      provider: 'gemini',
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
    state.responseMode = reviewResult.responseMode;
    const validatedData: ReviewOutput = reviewResult.data;

    let finalQualityGate: FinalQualityGateOutput | null = null;
    let publishedPosts: { title: string; slug: string }[] = [];
    let qualityGateDraft = '';

    let polishedText = '';
    if (role === 'polish') {
      sendEvent('status', 'rewriting');

      const { body: sourceTextToPolish } = stripLeadingH1(text);

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
      }).compose('xml');

      const rewriteModelName = resolveModel(
        getGeminiModelForRole('rewrite' as typeof role, analysisSpeed)
      );
      state.usedModels.push(`${rewriteModelName}(rewrite)`);

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const startedAt = Date.now();
        let rewriteUsage: Parameters<typeof telemetry.recordGemini>[0]['usage'];

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

        const rewriteStream = await gemini.models.generateContentStream({
          model: rewriteModelName,
          contents: buildEditorialUserContent({
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
          config: {
            systemInstruction: rewriteSystemInstruction,
            ...getNativeGeminiConfig(),
            candidateCount: 1,
            maxOutputTokens: getRewriteOutputTokens(chunkText, isSingleChunk),
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });

        for await (const chunk of rewriteStream) {
          if (state.isDisconnected) break;
          rewriteUsage = chunk.usageMetadata ?? rewriteUsage;
          const partText = extractGeminiText(chunk);
          polishedText += partText;
          sendEvent('draft_chunk', partText);
        }
        telemetry.recordGemini({
          stage: `rewrite_chunk_${i}`,
          model: rewriteModelName,
          usage: rewriteUsage,
          durationMs: Date.now() - startedAt,
        });
      }

      polishedText = ensureTitleAndOpening(polishedText, sourceTextToPolish);
      polishedText = removeDisallowedRefineTargets(polishedText, validatedData.feedback);
      const lockedPolishedText = applyVerificationLocks(polishedText, protectedClaims);

      sendEvent('draft_final', preparePublicationDraft(lockedPolishedText));
      sendEvent('status', 'quality_gate');

      const qualityGateResponse = await runFinalQualityGateSafely({
        provider: 'gemini',
        originalDraft: sourceTextToPolish,
        finalDraft: preparePublicationDraft(lockedPolishedText),
        metadata,
        analysisSpeed,
        trustedInternalDomains: editorialProfile.config.internalLinkDomains,
        telemetry,
        editorialProfile,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
        researchNotes:
          ((metadata as Record<string, unknown>)?.researchNotes as ResearchNote[] | undefined) || [],
      });
      finalQualityGate = qualityGateResponse.result;
      state.usedModels.push(`${qualityGateResponse.modelName}(quality-gate)`);

      qualityGateDraft = applyVerificationAnnotations(lockedPolishedText, finalQualityGate.feedback);
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

    // Generate SEO metadata
    let seo: unknown = null;
    if (analysisSpeed !== 'fast') {
      sendEvent('status', 'generating_seo');
      const seoModelName = resolveModel(getGeminiModelForRole('seo', analysisSpeed));
      state.usedModels.push(`${seoModelName}(seo)`);
      seo = (await runSeoStage({
        provider: 'gemini',
        modelName: seoModelName,
        article: polishedText || text,
        metadata,
        editorialProfile,
        systemInstruction: new SeoPromptComposer(editorialProfile.config, {
          includeTextSchema: false,
        }).compose('xml'),
        telemetry,
      })) as Record<string, unknown>;
      sendEvent('seo_metadata', seo);
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
                (seo as Record<string, unknown>) ?? undefined,
                analysisSpeed,
                finalQualityGate,
                telemetry.snapshot(),
                editorialAudit
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
        console.error('[Gemini] Failed to save success log to database:', dbError);
      }
    }

    sendEvent('complete', { analysisLogId: savedLogId, sourceRef });
    return;
  }

  // ── OPENAI-COMPATIBLE PATH (Groq / OpenRouter) ────────────────────────────
  const isOpenRouter = effectiveProvider === 'openrouter';
  const providerName = isOpenRouter ? 'openrouter' : 'groq';
  const client = (isOpenRouter ? openrouter : groq) as unknown as import('../types').OpenAiCompatibleClient;
  state.executedModelName = resolveModel(
    isOpenRouter ? getOpenRouterModelForRole(role!, analysisSpeed) : GROQ_MODEL
  );
  const reviewModelName = state.executedModelName;
  const rewriteModelName = resolveModel(
    isOpenRouter ? getOpenRouterModelForRole('rewrite' as typeof role, analysisSpeed) : GROQ_MODEL
  );
  const seoModelName = resolveModel(
    isOpenRouter ? getOpenRouterModelForRole('seo', analysisSpeed) : GROQ_SEO_MODEL
  );
  state.usedModels.push(`${reviewModelName}(review)`);
  const reviewPrompt = isPolishMode
    ? new ReviewPromptComposer('polish', editorialProfile.config, {
        includeTextSchema: true,
      }).compose('xml')
    : systemPrompt;

  const recordOpenAiCompatibleTelemetry = (input: {
    stage: string;
    model: string;
    usage: OpenAiCompatibleChunk['usage'];
    durationMs: number;
  }) => {
    if (isOpenRouter) {
      telemetry.recordOpenRouter(input);
    } else {
      telemetry.recordGroq(input);
    }
  };

  const reviewResult = await runEditorialReviewStage({
    provider: providerName,
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
  state.responseMode = reviewResult.responseMode;
  const validatedData: ReviewOutput = reviewResult.data;

  let finalQualityGate: FinalQualityGateOutput | null = null;
  let publishedPosts: { title: string; slug: string }[] = [];
  let qualityGateDraft = '';

  let polishedText = '';
  if (role === 'polish') {
    sendEvent('status', 'rewriting');

    const { body: sourceTextToPolish } = stripLeadingH1(text);

    if (analysisSpeed !== 'fast') {
      try {
        publishedPosts = await listPublishedPostsForProfile(editorialProfile, 20);
        publishedPosts = selectRelevantPublishedPosts(sourceTextToPolish, publishedPosts);
        if (!editorialProfile.config.internalLinkBaseUrl) {
          publishedPosts = [];
        }
      } catch (_fetchError) {
        console.warn(`[Internal Linking] Catalog unavailable on ${providerName} path.`);
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
    }).compose('xml');

    state.usedModels.push(`${rewriteModelName}(rewrite)`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const startedAt = Date.now();
      const chunkResult = await streamOpenAiCompatibleRewrite(
        client,
        rewriteModelName,
        [
          { role: 'system', content: rewriteSystemInstruction },
          {
            role: 'user',
            content: buildEditorialUserContent({
              metadata,
              data: {
                chunkLabel: isSingleChunk
                  ? 'Raw article draft:'
                  : `Article draft (Part ${i + 1}):`,
                article: applyVerificationLocks(chunkText, protectedClaims),
                editorNotes: rewriteNotes.join('\n'),
                protectedClaimsNotes:
                  protectedClaims.length > 0
                    ? [
                        '',
                        'SENSITIVE FACTUAL CLAIMS THAT MUST BE PRESERVED VERBATIM:',
                        ...protectedClaims.map((item, idx) => `${idx + 1}. ${item.targetText}`),
                      ].join('\n')
                    : '',
                sectionContext: isSingleChunk
                  ? undefined
                  : `This is segment ${i + 1} of ${chunks.length}. Rewrite only this segment. Connect its flow with the previous draft.`,
              },
              task: 'Polish only the provided article. Apply editorNotes and preserve protectedClaimsNotes.',
            }),
          },
        ],
        getRewriteOutputTokens(chunkText, isSingleChunk),
        0.35,
        sendEvent
      );
      polishedText += chunkResult.text;
      recordOpenAiCompatibleTelemetry({
        stage: `rewrite_chunk_${i}`,
        model: rewriteModelName,
        usage: chunkResult.usage,
        durationMs: Date.now() - startedAt,
      });
    }

    polishedText = ensureTitleAndOpening(polishedText, sourceTextToPolish);
    polishedText = removeDisallowedRefineTargets(polishedText, validatedData.feedback);
    const lockedPolishedText = applyVerificationLocks(polishedText, protectedClaims);

    sendEvent('draft_final', preparePublicationDraft(lockedPolishedText));
    sendEvent('status', 'quality_gate');

    const qualityGateResponse = await runFinalQualityGateSafely({
      provider: providerName,
      originalDraft: sourceTextToPolish,
      finalDraft: preparePublicationDraft(lockedPolishedText),
      metadata,
      analysisSpeed,
      trustedInternalDomains: editorialProfile.config.internalLinkDomains,
      telemetry,
      editorialProfile,
      sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
      sanitizeSummary: sanitizeFactualSummary,
      researchNotes:
        ((metadata as Record<string, unknown>)?.researchNotes as ResearchNote[] | undefined) || [],
    });
    finalQualityGate = qualityGateResponse.result;
    state.usedModels.push(`${qualityGateResponse.modelName}(quality-gate)`);

    qualityGateDraft = applyVerificationAnnotations(lockedPolishedText, finalQualityGate.feedback);
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

  // Generate SEO metadata
  let seo: unknown = null;
  if (analysisSpeed !== 'fast') {
    sendEvent('status', 'generating_seo');
    state.usedModels.push(`${seoModelName}(seo)`);
    seo = (await runSeoStage({
      provider: providerName,
      modelName: seoModelName,
      article: polishedText || text,
      metadata,
      editorialProfile,
      systemInstruction: new SeoPromptComposer(editorialProfile.config, {
        includeTextSchema: true,
      }).compose('xml'),
      telemetry,
    })) as Record<string, unknown>;
    sendEvent('seo_metadata', seo);
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
              (seo as Record<string, unknown>) ?? undefined,
              analysisSpeed,
              finalQualityGate,
              telemetry.snapshot(),
              editorialAudit
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
      console.error(
        `[${isOpenRouter ? 'OpenRouter' : 'Groq'}] Failed to save success log to database:`,
        dbError
      );
    }
  }

  sendEvent('complete', { analysisLogId: savedLogId, sourceRef });
}
