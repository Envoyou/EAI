'use client';

import { toast } from 'sonner';
import type {
  AnalysisResult,
  ArticleMetadata,
  Attachment,
  ResearchNote,
} from '@eai/shared';
import type { AnalysisSpeed, DirectFetchType } from '../types';
import { replaceFirstTargetMatch } from '@eai/shared';
import { readWithTimeout } from '@/lib/stream-utils';
import { getResponseErrorMessage } from '@/lib/fetch-utils';
export type TargetedFixPreviewResult = {
  targetText: string;
  replacementText: string;
  operation: 'replace';
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
  suggestionReadyMessage: string;
  setAnalysis: (updater: (prev: AnalysisResult) => AnalysisResult) => void;
  analyzeAbortControllerRef: React.MutableRefObject<AbortController | null>;
}

export async function executeTargetedFix(
  ctx: TargetedFixContext,
  index: number,
  actionType: 'remove' | 'fix'
): Promise<TargetedFixPreviewResult | null> {
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
    suggestionReadyMessage,
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

    const result = replaceFirstTargetMatch(fullDraft, effectiveTargetText, replacementText);
    if (!result.success) {
      toast.info('Target text was already modified or removed. Refresh the analysis before retrying.');
      return null;
    }

    setAnalysis(prev => ({
      ...prev,
      feedback: (prev.feedback || []).map((feedbackItem, feedbackIndex) =>
        feedbackIndex === index
          ? {
              ...feedbackItem,
              targetText: effectiveTargetText,
              replacementText,
              operation: 'replace',
              isApplied: false,
              isAccepted: false,
              isVerified: false,
            }
          : feedbackItem
      ),
    }));

    toast.success(suggestionReadyMessage);
    return {
      targetText: effectiveTargetText,
      replacementText,
      operation: 'replace',
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
