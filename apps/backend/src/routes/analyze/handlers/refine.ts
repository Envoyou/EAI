/**
 * Handler for refine mode.
 * Supports three provider branches: Gemini, OpenRouter, Groq.
 * Extracted from analyze.ts L1341–1574 (zero logic change).
 * Throws on error — controller's try/catch handles SSE error + res.end().
 */

import { randomUUID } from 'node:crypto';
import { ThinkingLevel } from '@google/genai';
import type { ResearchNote } from '@eai/shared';
import type { RefineContext } from '../types';
import {
  extractGeminiText,
  extractOpenRouterText,
  gemini,
  getNativeGeminiConfig,
  getGeminiModelForRole,
  getOpenRouterModelForRole,
  GROQ_MODEL,
  GROQ_SEO_MODEL,
  groq,
  openrouter,
} from '@/lib/ai/provider-runtime';
import { buildEditorialUserContent } from '@/lib/ai/prompt-context';
import { runFinalQualityGateSafely } from '@/lib/ai/quality-gate-stage';
import { runSeoStage } from '@/lib/ai/seo-stage';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { RefinementPromptComposer } from '@/lib/ai/prompt-engine/composer/refinement-composer';
import { createAnalysisLogAndDebitCredit } from '@/lib/services/analysis-log.service';
import type { OpenAiCompatibleChunk } from '../types';
import { sanitizeSuppressiveFeedbackItem, sanitizeFactualSummary } from '../utils/factual';
import { getProtectedVerificationClaims } from '../utils/factual';
import {
  applyVerificationLocks,
  applyVerificationAnnotations,
} from '../utils/verification';
import {
  buildStoredMetadata,
  getRewriteOutputTokens,
} from '../utils/text';
import { preparePublicationDraft } from '../utils/text';

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

  const resolveModel = (defaultModel: string): string => modelOverride || defaultModel;

  const normalizedPreviousFeedback = (previousFeedback ?? []).map((item) =>
    sanitizeSuppressiveFeedbackItem(item, text)
  );
  const protectedFeedback = getProtectedVerificationClaims(normalizedPreviousFeedback);

  sendEvent('status', 'rewriting');

  const refinePrompt = new RefinementPromptComposer(
    'iterative',
    editorialProfile.config
  ).compose('xml');

  let refinedText = '';
  const lockedRefineInput = applyVerificationLocks(text, protectedFeedback);

  if (effectiveProvider === 'groq') {
    const refineModelName = resolveModel(GROQ_MODEL);
    state.usedModels.push(`${refineModelName}(refine)`);
    const startedAt = Date.now();
    let refineUsage: Parameters<typeof telemetry.recordGroq>[0]['usage'];
    const groqRefineStream = await groq.chat.completions.create({
      model: refineModelName,
      messages: [
        { role: 'system', content: refinePrompt },
        {
          role: 'user',
          content: buildEditorialUserContent({
            metadata,
            data: {
              editorInstruction: userInstruction,
              previousFeedback: normalizedPreviousFeedback.slice(0, 5),
              article: lockedRefineInput,
            },
            task: 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
          }),
        },
      ],
      stream: true,
      max_tokens: getRewriteOutputTokens(text, true),
      temperature: 0.35,
    });

    for await (const chunk of groqRefineStream) {
      if (state.isDisconnected) break;
      refineUsage = chunk.x_groq?.usage ?? refineUsage;
      const partText = chunk.choices[0]?.delta?.content ?? '';
      refinedText += partText;
      sendEvent('draft_chunk', partText);
    }
    telemetry.recordGroq({
      stage: 'refine',
      model: refineModelName,
      usage: refineUsage,
      durationMs: Date.now() - startedAt,
    });
  } else if (effectiveProvider === 'openrouter') {
    const refineModelName = resolveModel(getOpenRouterModelForRole('editor', analysisSpeed));
    state.usedModels.push(`${refineModelName}(refine)`);
    const startedAt = Date.now();
    let refineUsage: Parameters<typeof telemetry.recordOpenRouter>[0]['usage'];
    const refineStream = await openrouter.chat.completions.create({
      model: refineModelName,
      messages: [
        { role: 'system', content: refinePrompt },
        {
          role: 'user',
          content: buildEditorialUserContent({
            metadata,
            data: {
              editorInstruction: userInstruction,
              previousFeedback: normalizedPreviousFeedback.slice(0, 5),
              article: lockedRefineInput,
            },
            task: 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
          }),
        },
      ],
      stream: true,
      max_tokens: getRewriteOutputTokens(text, true),
      temperature: 0.35,
    });

    for await (const chunk of refineStream) {
      if (state.isDisconnected) break;
      refineUsage = (chunk as OpenAiCompatibleChunk).usage ?? refineUsage;
      const partText = extractOpenRouterText(chunk);
      refinedText += partText;
      sendEvent('draft_chunk', partText);
    }
    telemetry.recordOpenRouter({
      stage: 'refine',
      model: refineModelName,
      usage: refineUsage,
      durationMs: Date.now() - startedAt,
    });
  } else {
    // Gemini
    const refineModelName = resolveModel(
      process.env.GEMINI_MODEL ||
        (analysisSpeed === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash')
    );
    state.usedModels.push(`${refineModelName}(refine)`);
    const startedAt = Date.now();
    let refineUsage: Parameters<typeof telemetry.recordGemini>[0]['usage'];
    const refineStream = await gemini.models.generateContentStream({
      model: refineModelName,
      contents: buildEditorialUserContent({
        metadata,
        data: {
          editorInstruction: userInstruction,
          previousFeedback: normalizedPreviousFeedback.slice(0, 5),
          article: lockedRefineInput,
        },
        task: 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
      }),
      config: {
        systemInstruction: refinePrompt,
        ...getNativeGeminiConfig(),
        candidateCount: 1,
        maxOutputTokens: getRewriteOutputTokens(text, true),
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });

    for await (const chunk of refineStream) {
      if (state.isDisconnected) break;
      refineUsage = chunk.usageMetadata ?? refineUsage;
      const partText = extractGeminiText(chunk);
      refinedText += partText;
      sendEvent('draft_chunk', partText);
    }
    telemetry.recordGemini({
      stage: 'refine',
      model: refineModelName,
      usage: refineUsage,
      durationMs: Date.now() - startedAt,
    });
  }

  // Import ensureTitleAndOpening inline to avoid circular
  const { ensureTitleAndOpening } = await import('../utils/text');
  const { removeDisallowedRefineTargets } = await import('../utils/verification');

  refinedText = ensureTitleAndOpening(refinedText, text);
  refinedText = removeDisallowedRefineTargets(refinedText, normalizedPreviousFeedback);
  const refineQualityGateDraft = applyVerificationAnnotations(refinedText, normalizedPreviousFeedback);
  refinedText = preparePublicationDraft(refineQualityGateDraft);
  sendEvent('draft_final', refinedText);

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
  });
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

  // Generate SEO metadata
  sendEvent('status', 'generating_seo');
  let refineSeo: Record<string, unknown> | null = null;

  if (analysisSpeed !== 'fast') {
    const seoModelName = resolveModel(
      effectiveProvider === 'groq'
        ? GROQ_SEO_MODEL
        : effectiveProvider === 'openrouter'
          ? getOpenRouterModelForRole('seo', analysisSpeed)
          : getGeminiModelForRole('seo', analysisSpeed)
    );
    state.usedModels.push(`${seoModelName}(seo)`);
    refineSeo = (await runSeoStage({
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
    })) as Record<string, unknown>;
    sendEvent('seo_metadata', refineSeo);
  }

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
              editorialAudit
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
