'use client';

import { toast } from 'sonner';
import type { ArticleMetadata, ResearchNote, EditorialProcessStage, AnalysisResult, EditorialReadiness } from '@eai/shared';
import type { EditorialOptions, AnalysisSpeed, PendingRefineAction, DirectFetchType } from '../types';
import type { AppSettings } from '@/lib/preferences';
import { readWithTimeout } from '@/lib/stream-utils';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

interface RefineContext {
  draft: string;
  metadata: ArticleMetadata;
  researchNotes: ResearchNote[];
  editorialOptions: EditorialOptions;
  appSettings: AppSettings;
  analysisSpeed: AnalysisSpeed;
  isDemoMode: boolean;
  demoRefineCount: number;
  isMobile: boolean;
  directFetch: DirectFetchType;
  setAnalysis: (updater: (prev: AnalysisResult) => AnalysisResult) => void;
  setIsRefining: (s: boolean) => void;
  setProcessStage: (s: EditorialProcessStage) => void;
  setProcessStartedAt: (t: number | null) => void;
  setRightPanelOpen: (o: boolean) => void;
  setRightPanelTab: (t: 'strategist' | 'feedback' | 'notes') => void;
  setMobileViewTab: (t: 'history' | 'editor' | 'copilot') => void;
  setDemoRefineCount: (c: number) => void;
  setRefreshTrigger: (updater: (prev: number) => number) => void;
  analyzeAbortControllerRef: React.MutableRefObject<AbortController | null>;
  draftChunkBufferRef: React.MutableRefObject<string>;
  rafIdRef: React.MutableRefObject<number | null>;
  checkMissingSources: (text: string, notes: ResearchNote[]) => { url: string; domain: string }[];
  setMissingSources: (s: { url: string; domain: string }[]) => void;
  setPendingRefineAction: (a: PendingRefineAction | null) => void;
  setShowMissingSourcesModal: (o: boolean) => void;
  analysis: AnalysisResult;
  router: AppRouterInstance;
}

export async function executeRefine(
  ctx: RefineContext,
  instruction: string,
  overrideText?: string,
  forceSkipCheck = false
) {
  const {
    metadata,
    researchNotes,
    editorialOptions,
    appSettings,
    analysisSpeed,
    isDemoMode,
    demoRefineCount,
    isMobile,
    directFetch,
    setAnalysis,
    setIsRefining,
    setProcessStage,
    setProcessStartedAt,
    setRightPanelOpen,
    setRightPanelTab,
    setMobileViewTab,
    setDemoRefineCount,
    setRefreshTrigger,
    analyzeAbortControllerRef,
    draftChunkBufferRef,
    rafIdRef,
    checkMissingSources,
    setMissingSources,
    setPendingRefineAction,
    setShowMissingSourcesModal,
    analysis,
    router,
  } = ctx;

  const currentDraft = overrideText ?? analysis.polishedDraft;
  if (!currentDraft?.trim()) return;

  if (!forceSkipCheck && !overrideText) {
    const missing = checkMissingSources(currentDraft, researchNotes);
    if (missing.length > 0) {
      setMissingSources(missing);
      setPendingRefineAction({ type: 'refine_again', instruction, overrideDraft: overrideText });
      setShowMissingSourcesModal(true);
      return;
    }
  }

  if (isDemoMode && demoRefineCount >= 2) {
    toast.error('Create a free account to continue.', {
      description: 'Get 10 free Editorial Credits.',
      action: {
        label: 'Sign Up',
        onClick: () => router.push('/signup'),
      },
      duration: 8000,
    });
    return;
  }

  setIsRefining(true);
  setProcessStage('rewriting');
  setProcessStartedAt(Date.now());
  draftChunkBufferRef.current = '';
  setAnalysis(prev => ({
    ...prev,
    polishedDraft: '',
    readiness: undefined,
    changes: [],
    feedback: [],
    flags: [],
    score: undefined,
    verdict: undefined,
    generatedMetadata: analysisSpeed === 'fast' ? undefined : prev.generatedMetadata,
    publicationPackageStatus: analysisSpeed === 'fast'
      ? 'not_generated'
      : prev.generatedMetadata
        ? 'stale'
        : 'not_generated',
  }));
  setRightPanelOpen(true);
  setRightPanelTab('feedback');
  if (isMobile) {
    setMobileViewTab('copilot');
  }

  const controller = new AbortController();
  analyzeAbortControllerRef.current = controller;

  try {
    const requestMetadata: ArticleMetadata = {
      ...metadata,
      strictness: editorialOptions.sourcePolicy === 'strict' ? 'strict' : 'balanced',
      outputLanguage: appSettings.outputLanguage,
      workingTitle: analysis.workingTitle || analysis.generatedMetadata?.title,
      publicationPackageStatus: analysis.publicationPackageStatus,
    };
    const response = await directFetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        text: currentDraft,
        mode: 'refine',
        userInstruction: instruction,
        previousFeedback: analysis.feedback,
        metadata: requestMetadata,
        analysisSpeed: analysisSpeed === 'publish' ? 'deep' : 'fast',
      }),
    });

    const getApiErrorMessage = async (res: Response, fallback: string) => {
      const result = await res.json().catch(() => null);
      return typeof result?.error === 'string' ? result.error : fallback;
    };

    const normalizeProcessStage = (status: unknown): EditorialProcessStage | null => {
      if (status === 'evaluating') return 'reviewing';
      if (status === 'rewriting') return 'rewriting';
      if (status === 'quality_gate') return 'quality_gate';
      if (status === 'generating_seo') return 'seo';
      return null;
    };

    if (!response.ok) {
      throw new Error(
        await getApiErrorMessage(response, 'Failed to start refine stream.')
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader not available');

    const decoder = new TextDecoder();
    let buffer = '';
    let receivedComplete = false;

    while (true) {
      const { done, value } = await readWithTimeout(reader);
      if (done) break;
      buffer += decoder.decode(value as Uint8Array, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let event: { type: string; data: unknown };
        try { event = JSON.parse(line); } catch { continue; }
        switch (event.type) {
          case 'status': {
            const nextStage = normalizeProcessStage(event.data);
            if (nextStage) setProcessStage(nextStage);
            break;
          }
          case 'draft_chunk': {
            draftChunkBufferRef.current += event.data as string;
            if (rafIdRef.current === null) {
              rafIdRef.current = requestAnimationFrame(() => {
                const buffered = draftChunkBufferRef.current;
                draftChunkBufferRef.current = '';
                rafIdRef.current = null;
                setAnalysis(prev => ({ ...prev, polishedDraft: (prev.polishedDraft || '') + buffered }));
              });
            }
            break;
          }
          case 'draft_final':
            draftChunkBufferRef.current = '';
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            setAnalysis(prev => ({ ...prev, polishedDraft: event.data as string }));
            break;
          case 'seo_metadata': setAnalysis(prev => ({ ...prev, generatedMetadata: event.data as Record<string, unknown> })); break;
          case 'working_title': setAnalysis(prev => ({ ...prev, workingTitle: event.data as string })); break;
          case 'publication_package_status': setAnalysis(prev => ({
            ...prev,
            generatedMetadata: event.data === 'not_generated' ? undefined : prev.generatedMetadata,
            publicationPackageStatus: event.data as import('@eai/shared').PublicationPackageStatus,
          })); break;
          case 'feedback_reset': setAnalysis(prev => ({ ...prev, feedback: [], flags: [] })); break;
          case 'readiness': setAnalysis(prev => ({ ...prev, readiness: event.data as EditorialReadiness, verdict: event.data as EditorialReadiness })); break;
          case 'summary': setAnalysis(prev => ({ ...prev, summary: event.data as string })); break;
          case 'changes': setAnalysis(prev => ({ ...prev, changes: event.data as string[] })); break;
          case 'feedback_item': setAnalysis(prev => {
            const currentFeedback = prev.feedback ? [...prev.feedback] : [];
            const { item, index } = event.data as { item: import('@eai/shared').FeedbackItem; index: number };
            currentFeedback[index] = item;
            return { ...prev, feedback: currentFeedback };
          }); break;
          case 'flags': setAnalysis(prev => ({ ...prev, flags: event.data as string[] })); break;
          case 'complete': {
            receivedComplete = true;
            setProcessStage('finalizing');
            break;
          }
          case 'error': throw new Error(event.data as string);
        }
      }
    }

    if (controller.signal.aborted) {
      return;
    }

    if (!receivedComplete) {
      throw new Error('Connection lost. Please retry.');
    }

    toast.success('Draft refined!', { description: 'Your instruction has been applied.' });
    setRefreshTrigger(prev => prev + 1);

    if (isDemoMode) {
      const nextCount = demoRefineCount + 1;
      setDemoRefineCount(nextCount);
      localStorage.setItem('eai-demo-refine-count', nextCount.toString());
    }
  } catch (error) {
    draftChunkBufferRef.current = '';
    if (controller.signal.aborted) {
      console.log('Refinement aborted.');
      setAnalysis(() => analysis);
      return;
    }
    const msg = error instanceof Error ? error.message : 'Refinement failed';
    toast.error('Refine Failed', { description: msg });
    setAnalysis(() => analysis);
  } finally {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (draftChunkBufferRef.current) {
      const remaining = draftChunkBufferRef.current;
      draftChunkBufferRef.current = '';
      setAnalysis(prev => ({ ...prev, polishedDraft: (prev.polishedDraft || '') + remaining }));
    }
    setIsRefining(false);
    setProcessStartedAt(null);
    analyzeAbortControllerRef.current = null;
  }
}
