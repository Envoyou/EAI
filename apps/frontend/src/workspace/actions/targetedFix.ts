'use client';

import { toast } from 'sonner';
import type { AnalysisResult, FeedbackItem, EditorialReadiness } from '@eai/shared';
import type { AnalysisSpeed, DirectFetchType } from '../types';
import { replaceFirstTargetMatch } from '@eai/shared';
import { readWithTimeout } from '@/lib/stream-utils';

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
  calculateReadiness: (feedback: FeedbackItem[], originalReadiness?: EditorialReadiness) => EditorialReadiness;
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
    calculateReadiness,
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

    const getApiErrorMessage = async (res: Response, fallback: string) => {
      const result = await res.json().catch(() => null);
      return typeof result?.error === 'string' ? result.error : fallback;
    };

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(response, 'Failed to start targeted fix stream.')
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader not available');

    const decoder = new TextDecoder();
    let buffer = '';
    let replacementText = '';

    while (true) {
      const { done, value } = await readWithTimeout(reader);
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
      toast.info('Target text was already modified or removed. Marking as resolved.');
    }

    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: actionType === 'fix',
      isAccepted: actionType === 'remove',
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
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
      flags: nextFlags,
    }));

    toast.success(actionType === 'remove' ? 'Addition removed successfully!' : 'Sentence fixed successfully!');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Targeted fix failed';
    toast.error('Fix Failed', { description: msg });
  } finally {
    setIsTargetedFixing(null);
  }
}
