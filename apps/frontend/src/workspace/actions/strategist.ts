'use client';

import { toast } from 'sonner';
import type {
  ArticleMetadata,
  DuplicateGuardResult,
  ResearchNote,
} from '@eai/shared';
import type { DirectFetchType } from '../types';
import { readWithTimeout, StreamIdleTimeoutError } from '@/lib/stream-utils';
import { getResponseErrorMessage } from '@/lib/fetch-utils';
import { promptContentMemoryFeedback } from '@/lib/content-memory-feedback';

interface StrategistContext {
  researchNotes: ResearchNote[];
  metadata: ArticleMetadata;
  directFetch: DirectFetchType;
  setDraft: (d: string) => void;
  setIsGeneratingDraftFromNotes: (g: boolean) => void;
  generateAbortControllerRef: React.MutableRefObject<AbortController | null>;
  duplicateGuardWarning: string;
  suggestedAngleLabel: string;
  controlledBlockWarning: string;
  continueAnywayLabel: string;
  feedbackQuestion: string;
  yesDuplicateLabel: string;
  notDuplicateLabel: string;
  feedbackSaved: string;
  feedbackFailed: string;
}

type DuplicateGuardRetry = {
  requestId: string;
  override: true;
};

export async function executeGenerateDraftFromNotes(
  ctx: StrategistContext,
  retry?: DuplicateGuardRetry
) {
  const {
    researchNotes,
    metadata,
    directFetch,
    setDraft,
    setIsGeneratingDraftFromNotes,
    generateAbortControllerRef,
    duplicateGuardWarning,
    suggestedAngleLabel,
    controlledBlockWarning,
    continueAnywayLabel,
    feedbackQuestion,
    yesDuplicateLabel,
    notDuplicateLabel,
    feedbackSaved,
    feedbackFailed,
  } = ctx;

  const notesToGenerate = researchNotes.filter(n => n.content.length > 0);
  if (notesToGenerate.length === 0) {
    toast.error('Select at least one note to generate');
    return;
  }
  if (generateAbortControllerRef.current) return;

  setIsGeneratingDraftFromNotes(true);
  setDraft('');
  let currentDraft = '';
  let receivedDone = false;
  let duplicateGuardFeedbackCandidate: DuplicateGuardResult | null = null;

  const controller = new AbortController();
  generateAbortControllerRef.current = controller;

  try {
    const requestId = retry?.requestId ?? crypto.randomUUID();
    const response = await directFetch('/api/strategist/generate-draft-from-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        requestId,
        duplicateGuardOverride: retry?.override,
        notes: notesToGenerate,
        metadata,
      }),
    });

    if (!response.ok) {
      const conflict = await response.clone().json().catch(() => null) as {
        duplicateGuard?: {
          enforcement?: { overrideAllowed?: boolean };
          alternativeAngles?: string[];
        };
        duplicateGuardRequestId?: string;
      } | null;
      if (
        response.status === 409 &&
        !retry &&
        conflict?.duplicateGuard?.enforcement?.overrideAllowed
      ) {
        const suggestedAngle =
          conflict.duplicateGuard.alternativeAngles?.[0];
        toast.warning(controlledBlockWarning, {
          description: suggestedAngle
            ? `${suggestedAngleLabel}: ${suggestedAngle}`
            : undefined,
          duration: 15_000,
          action: {
            label: continueAnywayLabel,
            onClick: () => {
              void executeGenerateDraftFromNotes(ctx, {
                requestId:
                  conflict.duplicateGuardRequestId ?? requestId,
                override: true,
              });
            },
          },
        });
        return;
      }
      throw new Error(
        await getResponseErrorMessage(
          response,
          `Failed to generate draft (${response.status})`
        )
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value: chunk } = await readWithTimeout(
        reader,
        45_000,
        (reason) => controller.abort(reason)
      );
      if (done) break;

      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text') {
            currentDraft += data.chunk;
            setDraft(currentDraft);
          } else if (data.type === 'blueprint_detected') {
            toast.info(data.message || 'Multiple topics detected — generating draft from the first topic.');
          } else if (data.type === 'duplicate_guard') {
            duplicateGuardFeedbackCandidate =
              data.result as DuplicateGuardResult;
            const suggestedAngle = data.result?.alternativeAngles?.[0];
            toast.warning(duplicateGuardWarning, {
              description: suggestedAngle
                ? `${suggestedAngleLabel}: ${suggestedAngle}`
                : undefined,
            });
          } else if (data.type === 'error') {
            throw new Error(data.message || data.error || 'Draft generation failed.');
          } else if (data.type === 'done') {
            receivedDone = true;
          }
        }
      }
    }

    if (controller.signal.aborted) {
      return;
    }

    if (!receivedDone) {
      throw new Error('Connection lost. Please retry.');
    }

    toast.success('Draft generated successfully!');
    if (
      retry?.override ||
      duplicateGuardFeedbackCandidate?.enforcement?.mode === 'shadow'
    ) {
      promptContentMemoryFeedback({
        directFetch,
        requestId:
          duplicateGuardFeedbackCandidate?.requestId ??
          retry?.requestId ??
          requestId,
        question: feedbackQuestion,
        duplicateLabel: yesDuplicateLabel,
        distinctLabel: notDuplicateLabel,
        savedMessage: feedbackSaved,
        failedMessage: feedbackFailed,
        userAction: retry?.override ? 'overrode_block' : 'continued',
      });
    }
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof StreamIdleTimeoutError)) {
      console.log('Draft generation aborted by user.');
      return;
    }
    console.error(error);
    toast.error(error instanceof Error ? error.message : 'Failed to generate draft.');
  } finally {
    if (generateAbortControllerRef.current === controller) {
      setIsGeneratingDraftFromNotes(false);
      generateAbortControllerRef.current = null;
    }
  }
}
