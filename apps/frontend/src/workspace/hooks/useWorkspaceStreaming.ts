'use client';

import { useState, useEffect, useRef, SetStateAction, Dispatch } from 'react';
import type { EditorialProcessStage, AnalysisResult } from '@eai/shared';

export function useWorkspaceStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [processStage, setProcessStage] = useState<EditorialProcessStage | undefined>('reviewing');
  const [processStartedAt, setProcessStartedAt] = useState<number | null>(null);

  const generateAbortControllerRef = useRef<AbortController | null>(null);
  const analyzeAbortControllerRef = useRef<AbortController | null>(null);

  // RAF batching refs for streaming draft chunks
  const draftChunkBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    const generateControllerRef = generateAbortControllerRef;
    const analysisControllerRef = analyzeAbortControllerRef;
    return () => {
      generateControllerRef.current?.abort();
      analysisControllerRef.current?.abort();
    };
  }, []);

  const cancelPendingStreams = () => {
    if (generateAbortControllerRef.current) {
      generateAbortControllerRef.current.abort();
      generateAbortControllerRef.current = null;
    }
    if (analyzeAbortControllerRef.current) {
      analyzeAbortControllerRef.current.abort();
      analyzeAbortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsRefining(false);
    setProcessStage(undefined);
    setProcessStartedAt(null);
  };

  const flushRemainingDraftChunks = (setAnalysis: Dispatch<SetStateAction<AnalysisResult>>) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (draftChunkBufferRef.current) {
      const remaining = draftChunkBufferRef.current;
      draftChunkBufferRef.current = '';
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: (prev.polishedDraft || '') + remaining,
      }));
    }
  };

  return {
    isStreaming,
    setIsStreaming,
    isRefining,
    setIsRefining,
    processStage,
    setProcessStage,
    processStartedAt,
    setProcessStartedAt,
    generateAbortControllerRef,
    analyzeAbortControllerRef,
    draftChunkBufferRef,
    rafIdRef,
    cancelPendingStreams,
    flushRemainingDraftChunks,
  };
}
