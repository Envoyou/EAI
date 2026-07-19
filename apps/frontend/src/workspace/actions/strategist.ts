'use client';

import { toast } from 'sonner';
import type { ArticleMetadata, ResearchNote } from '@eai/shared';
import type { DirectFetchType } from '../types';
import { readWithTimeout, StreamIdleTimeoutError } from '@/lib/stream-utils';

interface StrategistContext {
  researchNotes: ResearchNote[];
  metadata: ArticleMetadata;
  directFetch: DirectFetchType;
  setDraft: (d: string) => void;
  setIsGeneratingDraftFromNotes: (g: boolean) => void;
  generateAbortControllerRef: React.MutableRefObject<AbortController | null>;
}

export async function executeGenerateDraftFromNotes(ctx: StrategistContext) {
  const {
    researchNotes,
    metadata,
    directFetch,
    setDraft,
    setIsGeneratingDraftFromNotes,
    generateAbortControllerRef,
  } = ctx;

  const notesToGenerate = researchNotes.filter(n => n.content.length > 0);
  if (notesToGenerate.length === 0) {
    toast.error('Select at least one note to generate');
    return;
  }

  setIsGeneratingDraftFromNotes(true);
  setDraft('');
  let currentDraft = '';
  let receivedDone = false;

  const controller = new AbortController();
  generateAbortControllerRef.current = controller;

  try {
    const response = await directFetch('/api/strategist/generate-draft-from-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ notes: notesToGenerate, metadata }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate draft: ${response.status} - ${errorText}`);
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
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof StreamIdleTimeoutError)) {
      console.log('Draft generation aborted by user.');
      return;
    }
    console.error(error);
    toast.error(error instanceof Error ? error.message : 'Failed to generate draft.');
  } finally {
    setIsGeneratingDraftFromNotes(false);
    generateAbortControllerRef.current = null;
  }
}
