'use client';

import { toast } from 'sonner';
import type { ArticleMetadata, ResearchNote, Attachment, EditorialProcessStage, AnalysisResult, EditorialReadiness } from '@eai/shared';
import type { EditorialOptions, AnalysisSpeed, PendingRefineAction, DirectFetchType } from '../types';
import type { AppSettings } from '@/lib/preferences';
import type { PanelTab } from '@/components/PanelTabBar';
import { readWithTimeout, StreamIdleTimeoutError } from '@/lib/stream-utils';
import { getResponseErrorMessage } from '@/lib/fetch-utils';

interface AnalyzeContext {
  analysis: AnalysisResult;
  draft: string;
  sourceDraft: string;
  metadata: ArticleMetadata;
  researchNotes: ResearchNote[];
  attachments: Attachment[];
  editorialOptions: EditorialOptions;
  appSettings: AppSettings;
  analysisSpeed: AnalysisSpeed;
  isDemoMode: boolean;
  demoRefineCount: number;
  isMobile: boolean;
  directFetch: DirectFetchType;
  setDraft: (d: string) => void;
  setDraftHistory: (updater: (prev: string[]) => string[]) => void;
  setSourceDraft: (d: string) => void;
  setAnalysis: (updater: (prev: AnalysisResult) => AnalysisResult) => void;
  setIsStreaming: (s: boolean) => void;
  setProcessStage: (s: EditorialProcessStage) => void;
  setProcessStartedAt: (t: number | null) => void;
  setActiveTab: (t: PanelTab) => void;
  setRightPanelOpen: (o: boolean) => void;
  setRightPanelTab: (t: 'strategist' | 'feedback' | 'notes' | 'deep_report') => void;
  setMobileViewTab: (t: 'history' | 'editor' | 'copilot') => void;
  setDemoRefineCount: (c: number) => void;
  setShowDemoSignupModal: (o: boolean) => void;
  setRefreshTrigger: (updater: (prev: number) => number) => void;
  analyzeAbortControllerRef: React.MutableRefObject<AbortController | null>;
  draftChunkBufferRef: React.MutableRefObject<string>;
  rafIdRef: React.MutableRefObject<number | null>;
  checkMissingSources: (text: string, notes: ResearchNote[]) => { url: string; domain: string }[];
  setMissingSources: (s: { url: string; domain: string }[]) => void;
  setPendingRefineAction: (a: PendingRefineAction | null) => void;
  setShowMissingSourcesModal: (o: boolean) => void;
  notifyDraftReady: () => void;
}

export async function executeAnalyze(
  ctx: AnalyzeContext,
  overrideDraft?: string,
  forceSkipCheck = false
) {
  const {
    analysis,
    draft,
    sourceDraft,
    metadata,
    researchNotes,
    attachments,
    editorialOptions,
    appSettings,
    analysisSpeed,
    isDemoMode,
    demoRefineCount,
    isMobile,
    directFetch,
    setDraft,
    setDraftHistory,
    setSourceDraft,
    setAnalysis,
    setIsStreaming,
    setProcessStage,
    setProcessStartedAt,
    setActiveTab,
    setRightPanelOpen,
    setRightPanelTab,
    setMobileViewTab,
    setDemoRefineCount,
    setShowDemoSignupModal,
    setRefreshTrigger,
    analyzeAbortControllerRef,
    draftChunkBufferRef,
    rafIdRef,
    checkMissingSources,
    setMissingSources,
    setPendingRefineAction,
    setShowMissingSourcesModal,
  } = ctx;

  const textToAnalyze = overrideDraft ?? draft;
  if (!textToAnalyze.trim()) return;
  if (analyzeAbortControllerRef.current) return;

  if (!forceSkipCheck && !overrideDraft) {
    const missing = checkMissingSources(textToAnalyze, researchNotes);
    if (missing.length > 0) {
      setMissingSources(missing);
      setPendingRefineAction({ type: 'analyze', overrideDraft });
      setShowMissingSourcesModal(true);
      return;
    }
  }

  if (isDemoMode && demoRefineCount >= 2) {
    setShowDemoSignupModal(true);
    return;
  }

  setSourceDraft(textToAnalyze);
  setAnalysis(() => ({
    status: 'loading',
    readiness: undefined,
    changes: [],
    summary: '',
    polishedDraft: '',
    feedback: [],
    flags: [],
    publicationPackageStatus: 'not_generated',
  }));
  setIsStreaming(true);
  setProcessStage('reviewing');
  setProcessStartedAt(Date.now());
  setActiveTab('refined');
  setRightPanelOpen(true);
  setRightPanelTab('feedback');
  if (isMobile) {
    setMobileViewTab('copilot');
  }

  const controller = new AbortController();
  analyzeAbortControllerRef.current = controller;
  const previousAnalysis = analysis;

  try {
    const requestMetadata: ArticleMetadata = {
      ...metadata,
      strictness: editorialOptions.sourcePolicy === 'strict' ? 'strict' : 'balanced',
      outputLanguage: appSettings.outputLanguage,
    };
    const response = await directFetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        text: textToAnalyze,
        role: 'polish',
        metadata: {
          ...requestMetadata,
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

    const normalizeProcessStage = (status: unknown): EditorialProcessStage | null => {
      if (status === 'evaluating') return 'reviewing';
      if (status === 'rewriting') return 'rewriting';
      if (status === 'quality_gate') return 'quality_gate';
      if (status === 'generating_seo') return 'seo';
      return null;
    };

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, 'Failed to start analysis stream.')
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader not available');

    const decoder = new TextDecoder();
    let buffer = '';
    let receivedComplete = false;

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
        try { event = JSON.parse(line); } catch (e) { console.error('Failed to parse NDJSON:', line, e); continue; }

        switch (event.type) {
          case 'status': {
            const nextStage = normalizeProcessStage(event.data);
            if (nextStage) setProcessStage(nextStage);
            break;
          }
          case 'score': setAnalysis(prev => ({ ...prev, status: 'success', score: event.data as number })); break;
          case 'verdict': setAnalysis(prev => ({ ...prev, status: 'success', verdict: event.data as 'approve' | 'revise' | 'reject' })); break;
          case 'readiness': setAnalysis(prev => ({ ...prev, status: 'success', readiness: event.data as EditorialReadiness, verdict: event.data as EditorialReadiness, score: undefined })); break;
          case 'changes': setAnalysis(prev => ({ ...prev, status: 'success', changes: event.data as string[] })); break;
          case 'feedback_reset': setAnalysis(prev => ({ ...prev, status: 'success', feedback: [], flags: [] })); break;
          case 'summary': setAnalysis(prev => ({ ...prev, status: 'success', summary: event.data as string })); break;
          case 'feedback_item': setAnalysis(prev => {
            const currentFeedback = prev.feedback ? [...prev.feedback] : [];
            const { item, index } = event.data as { item: import('@eai/shared').FeedbackItem; index: number };
            currentFeedback[index] = item;
            return { ...prev, status: 'success', feedback: currentFeedback };
          }); break;
          case 'flags': setAnalysis(prev => ({ ...prev, status: 'success', flags: event.data as string[] })); break;
          case 'draft_chunk': {
            draftChunkBufferRef.current += event.data as string;
            if (rafIdRef.current === null) {
              rafIdRef.current = requestAnimationFrame(() => {
                const buffered = draftChunkBufferRef.current;
                draftChunkBufferRef.current = '';
                rafIdRef.current = null;
                setAnalysis(prev => ({
                  ...prev,
                  status: 'success',
                  polishedDraft: (prev.polishedDraft || '') + buffered,
                }));
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
            setAnalysis(prev => ({ ...prev, status: 'success', polishedDraft: event.data as string }));
            break;
          case 'seo_metadata': setAnalysis(prev => ({ ...prev, status: 'success', generatedMetadata: event.data as Record<string, unknown> })); break;
          case 'working_title': setAnalysis(prev => ({ ...prev, workingTitle: event.data as string })); break;
          case 'publication_package_status': setAnalysis(prev => ({
            ...prev,
            publicationPackageStatus: event.data as import('@eai/shared').PublicationPackageStatus,
          })); break;
          case 'reset':
            setProcessStage('reviewing');
            setAnalysis(() => ({ status: 'loading', readiness: undefined, changes: [], summary: '', polishedDraft: '', feedback: [], flags: [], publicationPackageStatus: 'not_generated' }));
            break;
          case 'complete': {
            receivedComplete = true;
            setProcessStage('finalizing');
            const { analysisLogId, sourceRef, draftRevision } = event.data as {
              analysisLogId: string;
              sourceRef: string;
              draftRevision?: import('@eai/shared').DraftRevisionIdentity;
            };
            setAnalysis(prev => ({
              ...prev,
              status: 'success',
              analysisLogId,
              sourceRef,
              draftRevision,
            }));
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

    ctx.notifyDraftReady();
    if (overrideDraft) {
      setDraftHistory(prev => [...prev, draft]);
      setDraft(overrideDraft);
    }
    setRefreshTrigger(prev => prev + 1);

    if (isDemoMode) {
      const nextCount = demoRefineCount + 1;
      setDemoRefineCount(nextCount);
      localStorage.setItem('eai-demo-refine-count', nextCount.toString());
    }
  } catch (error) {
    draftChunkBufferRef.current = '';
    if (controller.signal.aborted && !(error instanceof StreamIdleTimeoutError)) {
      console.log('Analysis aborted.');
      setAnalysis(() => previousAnalysis);
      setSourceDraft(sourceDraft);
      return;
    }
    const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
    setAnalysis(prev =>
      previousAnalysis.status === 'success'
        ? previousAnalysis
        : { ...prev, status: 'error', errorMessage: errorMsg }
    );
    if (previousAnalysis.status === 'success') {
      setSourceDraft(sourceDraft);
    }
    toast.error('Analysis Failed', { description: errorMsg });
  } finally {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (!controller.signal.aborted && draftChunkBufferRef.current) {
      const remaining = draftChunkBufferRef.current;
      draftChunkBufferRef.current = '';
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: (prev.polishedDraft || '') + remaining,
      }));
    }
    if (analyzeAbortControllerRef.current === controller) {
      setIsStreaming(false);
      setProcessStartedAt(null);
      analyzeAbortControllerRef.current = null;
    }
  }
}
