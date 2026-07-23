'use client';

import { toast } from 'sonner';
import type { AnalysisResult, FeedbackItem, EditorialReadiness } from '@eai/shared';
import type { AnalysisSpeed, DirectFetchType } from '../types';
import { replaceFirstTargetMatch } from '@eai/shared';
import { readWithTimeout } from '@/lib/stream-utils';
import { getResponseErrorMessage } from '@/lib/fetch-utils';

interface TargetedFixContext {
  analysis: AnalysisResult;
  isTargetedFixing: number | null;
  setIsTargetedFixing: (idx: number | null) => void;
  directFetch: DirectFetchType;
  analysisSpeed: AnalysisSpeed;
  persistEditorialResolution: (
    feedback: FeedbackItem[],
    readiness: EditorialReadiness,
    polishedDraft: string,
    flags: string[]
  ) => Promise<void>;
  setAnalysis: (updater: (prev: AnalysisResult) => AnalysisResult) => void;
  analyzeAbortControllerRef: React.MutableRefObject<AbortController | null>;
}

export async function executeTargetedFix(
  ctx: TargetedFixContext,
  index: number,
  actionType: 'remove' | 'fix'
) {
  const {
    analysis,
    isTargetedFixing,
    setIsTargetedFixing,
    directFetch,
    analysisSpeed,
    persistEditorialResolution,
    setAnalysis,
    analyzeAbortControllerRef,
  } = ctx;

  const item = analysis.feedback?.[index];
  if (!item || !item.targetText || isTargetedFixing !== null) return;
  setIsTargetedFixing(index);

  const controller = new AbortController();
  analyzeAbortControllerRef.current = controller;

  try {
    const instruction = actionType === 'remove'
      ? 'Write a revised version of the text to completely remove or neutralize the editorial addition/novel framework or claim. Do NOT add new unverified claims, numbers, or frameworks.'
      : `Revise this sentence to fix the following editorial issue: ${item.message}.`;

    const response = await directFetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        text: analysis.polishedDraft || item.targetText,
        mode: 'fix_targeted',
        targetText: item.targetText,
        feedbackMessage: item.message || 'Address this editorial issue',
        instruction: instruction,
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

    const finalDraft = analysis.polishedDraft || '';
    const result = replaceFirstTargetMatch(finalDraft, item.targetText, replacementText);
    
    let nextDraft = finalDraft;
    if (result.success) {
      nextDraft = result.nextText;
    } else {
      toast.info('Target text was already modified or removed. Refresh the analysis before retrying.');
      return;
    }

    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: actionType === 'fix',
      isAccepted: actionType === 'remove',
    };
    const nextReadiness: EditorialReadiness = 'needs_review';
    const nextFlags = analysis.flags || [];
    await persistEditorialResolution(
      nextFeedback,
      nextReadiness,
      nextDraft,
      nextFlags
    );
    setAnalysis(prev => ({
      ...prev,
      polishedDraft: nextDraft,
      feedback: nextFeedback,
      readiness: nextReadiness,
      verdict: nextReadiness,
      flags: nextFlags,
      publicationPackageStatus: prev.publicationPackageStatus === 'current' ? 'stale' : prev.publicationPackageStatus,
    }));

    toast.success(actionType === 'remove' ? 'Addition removed successfully!' : 'Sentence fixed successfully!');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Targeted fix failed';
    toast.error('Fix Failed', { description: msg });
  } finally {
    if (analyzeAbortControllerRef.current === controller) {
      analyzeAbortControllerRef.current = null;
    }
    setIsTargetedFixing(null);
  }
}
