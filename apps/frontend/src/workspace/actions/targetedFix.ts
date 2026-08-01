'use client';

import { toast } from 'sonner';
import type {
  AnalysisResult,
  ArticleMetadata,
  Attachment,
  FeedbackItem,
  EditorialReadiness,
  PublicationPackageStatus,
  ResearchNote,
  RevisionValidationState,
  SeoReviewState,
  DraftRevisionIdentity,
} from '@eai/shared';
import type { AnalysisSpeed, DirectFetchType } from '../types';
import { replaceFirstTargetMatch } from '@eai/shared';
import { readWithTimeout } from '@/lib/stream-utils';
import { getResponseErrorMessage } from '@/lib/fetch-utils';
import { markFeedbackApplied } from '../utils';

type EditorialResolutionResult = {
  readiness: EditorialReadiness;
  publicationPackageStatus?: PublicationPackageStatus;
  qualityGateState?: RevisionValidationState;
  seoReviewState?: SeoReviewState;
  draftRevision?: DraftRevisionIdentity;
};

export type TargetedFixResult = EditorialResolutionResult & {
  polishedDraft: string;
};

interface TargetedFixContext {
  analysis: AnalysisResult;
  isTargetedFixing: number | null;
  setIsTargetedFixing: (idx: number | null) => void;
  directFetch: DirectFetchType;
  analysisSpeed: AnalysisSpeed;
  metadata: ArticleMetadata;
  originalDraft: string;
  researchNotes: ResearchNote[];
  attachments: Attachment[];
  persistEditorialResolution: (
    feedback: FeedbackItem[],
    readiness: EditorialReadiness,
    polishedDraft: string,
    flags: string[],
    origin: 'targeted_fix' | 'remove_content'
  ) => Promise<EditorialResolutionResult>;
  bodyChangeSuccessMessage: string;
  setAnalysis: (updater: (prev: AnalysisResult) => AnalysisResult) => void;
  analyzeAbortControllerRef: React.MutableRefObject<AbortController | null>;
}

export async function executeTargetedFix(
  ctx: TargetedFixContext,
  index: number,
  actionType: 'remove' | 'fix'
): Promise<TargetedFixResult | null> {
  const {
    analysis,
    isTargetedFixing,
    setIsTargetedFixing,
    directFetch,
    analysisSpeed,
    metadata,
    originalDraft,
    researchNotes,
    attachments,
    persistEditorialResolution,
    bodyChangeSuccessMessage,
    setAnalysis,
    analyzeAbortControllerRef,
  } = ctx;

  const item = analysis.feedback?.[index];
  const fullDraft = analysis.polishedDraft || '';
  const effectiveTargetText = item?.targetText?.trim() || fullDraft;
  if (
    !item
    || !effectiveTargetText
    || isTargetedFixing !== null
    || analyzeAbortControllerRef.current
  ) return null;
  setIsTargetedFixing(index);

  const controller = new AbortController();
  analyzeAbortControllerRef.current = controller;

  try {
    const instruction = actionType === 'remove'
      ? 'Write a revised version of the text to completely remove or neutralize the editorial addition/novel framework or claim. Do NOT add new unverified claims, numbers, or frameworks.'
      : item.targetText?.trim()
        ? `Revise this passage to fix the following editorial issue: ${item.message}.`
        : [
            'Revise the complete draft only as much as needed to resolve this approved editorial issue.',
            `Finding: ${item.message}.`,
            item.suggestion ? `Required correction: ${item.suggestion}` : '',
            'Preserve unrelated wording, facts, sources, structure, and publication intent.',
          ].filter(Boolean).join('\n');

    const response = await directFetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        text: fullDraft || effectiveTargetText,
        mode: 'fix_targeted',
        targetText: effectiveTargetText,
        feedbackMessage: item.message || 'Address this editorial issue',
        instruction: instruction,
        originalDraft,
        metadata: {
          ...metadata,
          researchNotes: researchNotes.slice(0, 10).map(note => ({
            ...note,
            content: note.content.slice(0, 5_000),
          })),
          attachments: attachments.slice(0, 5).map(attachment => ({
            ...attachment,
            extractedText: attachment.extractedText.slice(0, 2_000),
          })),
        },
        analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
      }),
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, 'Failed to start targeted fix stream.')
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader not available');

    const decoder = new TextDecoder();
    let buffer = '';
    let replacementText = '';

    while (true) {
      const { done, value } = await readWithTimeout(
        reader,
        45_000,
        (reason) => controller.abort(reason)
      );
      if (done) break;
      buffer += decoder.decode(value as Uint8Array, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let event: { type: string; data: unknown };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === 'replacement') {
          replacementText = event.data as string;
        } else if (event.type === 'error') {
          throw new Error(event.data as string);
        }
      }
    }

    if (!replacementText) {
      throw new Error('No replacement text returned by the AI.');
    }

    const finalDraft = fullDraft;
    const result = replaceFirstTargetMatch(finalDraft, effectiveTargetText, replacementText);
    
    let nextDraft = finalDraft;
    if (result.success) {
      nextDraft = result.nextText;
    } else {
      toast.info('Target text was already modified or removed. Refresh the analysis before retrying.');
      return null;
    }

    const nextFeedback = markFeedbackApplied(analysis.feedback || [], index);
    const nextReadiness: EditorialReadiness = 'needs_review';
    const nextFlags = analysis.flags || [];
    const persisted = await persistEditorialResolution(
      nextFeedback,
      nextReadiness,
      nextDraft,
      nextFlags,
      actionType === 'remove' ? 'remove_content' : 'targeted_fix'
    );
    const persistedFlags = persisted.readiness === 'ready' ? [] : nextFlags;
    setAnalysis(prev => ({
      ...prev,
      polishedDraft: nextDraft,
      feedback: nextFeedback,
      readiness: persisted.readiness,
      verdict: persisted.readiness,
      flags: persistedFlags,
      publicationPackageStatus:
        persisted.publicationPackageStatus
        ?? (prev.publicationPackageStatus === 'current'
          ? 'stale'
          : prev.publicationPackageStatus),
      qualityGateState: persisted.qualityGateState ?? 'stale',
      seoReviewState: persisted.seoReviewState ?? prev.seoReviewState,
      draftRevision: persisted.draftRevision ?? prev.draftRevision,
    }));

    toast.success(bodyChangeSuccessMessage);
    return {
      ...persisted,
      polishedDraft: nextDraft,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return null;
    }
    const msg = error instanceof Error ? error.message : 'Targeted fix failed';
    toast.error('Fix Failed', { description: msg });
    return null;
  } finally {
    if (analyzeAbortControllerRef.current === controller) {
      analyzeAbortControllerRef.current = null;
    }
    setIsTargetedFixing(null);
  }
}
