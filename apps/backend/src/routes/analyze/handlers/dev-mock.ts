/**
 * Dev mock handler — executed when an AI provider API key is missing.
 * Streams mock editorial data so the dev environment works without credentials.
 * Extracted from analyze.ts L1224–1338 (zero logic change).
 */

import type { DevMockContext } from '../types';
import { buildStoredMetadata, delay } from '../utils/text';
import { createAnalysisLogAndDebitCredit } from '@/lib/services/analysis-log.service';

/**
 * Returns true if the effective provider is missing its API key.
 * Called by controller before dispatching to a real handler.
 */
export const isMockMode = (
  effectiveProvider: 'gemini' | 'groq' | 'openrouter'
): boolean => {
  if (
    effectiveProvider === 'gemini' &&
    (!process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY === 'empty' ||
      process.env.GEMINI_API_KEY === 'your-api-key-here')
  ) return true;

  if (
    effectiveProvider === 'groq' &&
    (!process.env.GROQ_API_KEY ||
      process.env.GROQ_API_KEY === 'empty' ||
      process.env.GROQ_API_KEY === 'your-groq-api-key')
  ) return true;

  if (
    effectiveProvider === 'openrouter' &&
    (!process.env.OPENROUTER_API_KEY ||
      process.env.OPENROUTER_API_KEY === 'empty' ||
      process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key')
  ) return true;

  return false;
};

export async function handleDevMock(ctx: DevMockContext): Promise<void> {
  const {
    sendEvent,
    state,
    mode,
    text,
    role,
    isPolishMode,
    analysisSpeed,
    userId,
    workspace,
    editorialProfile,
    editorialAudit,
    editorialLogFields,
    telemetry,
  } = ctx;

  console.warn(
    `No API Key found for provider ${ctx.effectiveProvider}, using mock data stream.`
  );

  const producesDraft = isPolishMode || mode === 'refine';

  if (mode !== 'refine') {
    sendEvent('status', 'evaluating');
    await delay(800);
  }

  const mockScore = role === 'editor' ? 55 : 78;
  const mockVerdict = role === 'editor' ? 'reject' : 'revise';
  const mockSummary =
    '[DEV MODE] This article appears to use generic AI patterns and offers limited insight.';

  if (!producesDraft) {
    sendEvent('score', mockScore);
    sendEvent('verdict', mockVerdict);
    sendEvent('summary', mockSummary);
  }

  const mockFeedback = [
    {
      category: 'Tone & Language',
      status: 'fail',
      message: "Too many generic phrases, such as 'In today's digital era'.",
      suggestion:
        'Open with a specific fact or surprising statistic instead of a broad statement.',
      operation: 'manual',
    },
    {
      category: 'Structure & Hook',
      status: 'warning',
      message: 'The hook does not create enough pull.',
      suggestion:
        'Turn the first sentence into a more provocative question or sharper claim.',
      operation: 'manual',
    },
  ];

  if (!producesDraft) {
    for (let i = 0; i < mockFeedback.length; i++) {
      await delay(600);
      sendEvent('feedback_item', { item: mockFeedback[i], index: i });
    }
  }

  if (role === 'editor') {
    await delay(400);
    sendEvent('flags', ['AI Spam Pattern Detected', 'Lack of Core Insight']);
  }

  let mockPolishedDraft = '';
  if (producesDraft) {
    await delay(600);
    sendEvent('status', 'rewriting');

    const fullMockDraft = `# Sample ${editorialProfile.config.brandName} Title\n\nA short excerpt that gets straight to the point.\n\n${text}`;
    const words = fullMockDraft.split(' ');
    const chunkSize = 8;
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
      mockPolishedDraft += chunk;
      sendEvent('draft_chunk', chunk);
      await delay(70);
    }
    sendEvent('draft_final', mockPolishedDraft);
  }

  const mockSeo = {
    title: 'Mock Title',
    metaDescription: 'Mock Description',
    slug: 'mock-slug',
    tags: ['mock', 'test', 'seo'],
  };

  if (analysisSpeed !== 'fast') {
    sendEvent('status', 'generating_seo');
    await delay(400);
    sendEvent('seo_metadata', mockSeo);
    sendEvent('publication_package_status', 'current');
  } else if (producesDraft) {
    sendEvent('publication_package_status', 'not_generated');
  }

  if (producesDraft) {
    sendEvent('status', 'quality_gate');
    await delay(500);
    sendEvent('readiness', 'needs_review');
    sendEvent(
      'summary',
      '[DEV MODE] The final draft has been polished and still needs editorial review in a few areas.'
    );
    sendEvent('changes', [
      'The hook was made more direct.',
      'The article structure was tightened for mobile reading.',
    ]);
    for (let i = 0; i < mockFeedback.length; i++) {
      sendEvent('feedback_item', { item: mockFeedback[i], index: i });
    }
  }

  let savedLogId: string | undefined;
  if (userId) {
    try {
      const savedLog = await createAnalysisLogAndDebitCredit({
        userId,
        organizationId: workspace.organizationId,
        role: state.roleToLog,
        content: state.textToLog,
        metadata: JSON.parse(
          JSON.stringify(
            buildStoredMetadata(
              state.metadataToLog,
              'standard',
              mockPolishedDraft || undefined,
              undefined,
              analysisSpeed === 'fast' ? undefined : mockSeo,
              analysisSpeed,
              undefined,
              telemetry.snapshot(),
              editorialAudit
            )
          )
        ),
        promptVersion: process.env.PROMPT_VERSION ?? 'unknown',
        modelName: 'dev-mock-model',
        score: producesDraft ? undefined : mockScore,
        verdict: producesDraft ? 'needs_review' : mockVerdict,
        summary: mockSummary,
        feedback: mockFeedback,
        flags:
          role === 'editor'
            ? ['AI Spam Pattern Detected', 'Lack of Core Insight']
            : [],
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
      console.error('Failed to log success to database:', dbError);
    }
  }

  sendEvent('complete', { analysisLogId: savedLogId, sourceRef: 'mock-ref' });
}
