'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { FeedbackItem, EditorialReadiness, ResearchNote, Attachment, AnalysisResult, ArticleMetadata, PublicationPackage } from '@eai/shared';
import {
  applyAllFeedbackOperations,
  applyFeedbackOperation,
  canAutoApplyFeedback,
} from '@eai/shared';
import { useDirectFetch } from '@/lib/hooks/useDirectFetch';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { readWithTimeout } from '@/lib/stream-utils';
import { applyDefaultMetadata } from '@/lib/preferences';

// Hooks
import { useWorkspaceStorage } from './hooks/useWorkspaceStorage';
import { useWorkspaceConfig } from './hooks/useWorkspaceConfig';
import { useWorkspaceKeyboard } from './hooks/useWorkspaceKeyboard';
import { useWorkspaceStreaming } from './hooks/useWorkspaceStreaming';
import { useWorkspaceAutosave } from './hooks/useWorkspaceAutosave';

// Actions
import { executeAnalyze } from './actions/analyze';
import { executeRefine } from './actions/refine';
import { executeTargetedFix } from './actions/targetedFix';
import { executeGenerateDraftFromNotes } from './actions/strategist';

// Utilities
import {
  extractArticleMetadata,
  extractResponseMode,
  extractPolishedDraft,
  extractGeneratedMetadata,
  extractPublicationState,
  extractQualityGate,
  calculateReadiness,
  checkMissingSources,
  normalizeHttpSourceUrl,
  addSourceLinkToDraft,
} from './utils';

import type { PendingRefineAction } from './types';

export function useEditorialWorkspace({ mode }: { mode: 'demo' | 'workspace' }) {
  const router = useRouter();
  const directFetch = useDirectFetch();

  // 1. Storage State Management
  const storage = useWorkspaceStorage({ mode });
  const {
    workspaceChecking,
    setWorkspaceChecking,
    editorialOptions,
    setEditorialOptions,
    draft,
    setDraft,
    metadata,
    setMetadata,
    analysis,
    setAnalysis,
    activeHistoryId,
    setActiveHistoryId,
    draftHistory,
    setDraftHistory,
    sourceDraft,
    setSourceDraft,
    appSettings,
    setAppSettings,
    isDemoMode,
    setIsDemoMode,
    demoRefineCount,
    setDemoRefineCount,
    activeTab,
    setActiveTab,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    layoutReversed,
    setLayoutReversed,
    researchNotes,
    setResearchNotes,
    attachments,
    setAttachments,
    analysisSpeed,
    setAnalysisSpeed,
    isLoaded,
  } = storage;

  // 2. UI Layout States (Not in storage hook to keep storage focused)
  const [isMobile, setIsMobile] = useState(false);
  const [mobileViewTab, setMobileViewTab] = useState<'history' | 'editor' | 'copilot'>('editor');
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [hoveredFeedbackIndex, setHoveredFeedbackIndex] = useState<number | null>(null);
  const [activeFeedbackIndex, setActiveFeedbackIndex] = useState<number | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'strategist' | 'feedback' | 'notes' | 'deep_report'>('strategist');

  // Refresh trigger for DocumentHistoryPanel
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Link safeguards state
  const [showMissingSourcesModal, setShowMissingSourcesModal] = useState(false);
  const [missingSources, setMissingSources] = useState<{ url: string; domain: string }[]>([]);
  const [pendingRefineAction, setPendingRefineAction] = useState<PendingRefineAction | null>(null);

  // Additional action states
  const [isTargetedFixing, setIsTargetedFixing] = useState<number | null>(null);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [isGeneratingDraftFromNotes, setIsGeneratingDraftFromNotes] = useState(false);
  const [isSavingFinalDraft, setIsSavingFinalDraft] = useState(false);
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);

  // 3. Config Hook
  useWorkspaceConfig({
    mode,
    isDemoMode,
    setIsDemoMode,
    editorialOptions,
    setEditorialOptions,
    setMetadata,
    setAppSettings,
    setWorkspaceChecking,
    setAnalysisSpeed,
  });

  // 4. Keyboard Shortcuts & Window Hook
  useWorkspaceKeyboard({
    setIsMobile,
    setIsShortcutModalOpen,
    setSidebarOpen: (open: boolean | ((p: boolean) => boolean)) => setLeftPanelOpen(open),
    setRightPanelOpen,
  });

  // 5. Streaming Subsystem Hook
  const streaming = useWorkspaceStreaming();
  const {
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
  } = streaming;

  // 6. Autosave Hook
  useWorkspaceAutosave({
    draft,
    researchNotes,
    metadata,
    activeHistoryId,
    isLoaded,
    isDemoMode,
    setIsSavingToCloud,
    setActiveHistoryId,
  });

  // Derived states
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;
  const MAX_TEXT_LENGTH = editorialOptions.maxTextLength;
  const hasResult = analysis.status === 'success';
  const showFeedbackSidebar = rightPanelOpen;
  const showNotesSidebar = rightPanelOpen;
  const hasNotes = researchNotes.length > 0;

  // Action methods
  const handleCloudSave = async () => {
    if (isDemoMode) return;
    setIsSavingToCloud(true);
    try {
      const response = await fetchWithTimeout('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: draft,
          metadata: {
            ...metadata,
            researchNotes,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create manual draft');
      }

      const result = await response.json();
      if (result.id) {
        setActiveHistoryId(result.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('eai-active-history-id', result.id);
        }
        setRefreshTrigger(prev => prev + 1);
        toast.success('Draft synced to cloud');
      }
    } catch (error) {
      console.error('Error saving to cloud:', error);
      toast.error('Failed to sync draft to cloud');
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const handleNotesChange = (notes: ResearchNote[]) => {
    setResearchNotes(notes);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('eai_research_notes', JSON.stringify(notes));
    }
  };

  const handleAnalyze = async (overrideDraft?: string, forceSkipCheck = false) => {
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);
    const ctx = {
      draft,
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
      setShowDemoSignupModal: () => {
        // Handled in facade via storage hook trigger or set state
        storage.setDemoRefineCount(3); // Trigger signup drawer
      },
      setRefreshTrigger,
      analyzeAbortControllerRef,
      draftChunkBufferRef,
      rafIdRef,
      checkMissingSources,
      setMissingSources,
      setPendingRefineAction,
      setShowMissingSourcesModal,
    };
    await executeAnalyze(ctx, overrideDraft, forceSkipCheck);
  };

  const handleReanalyze = async () => {
    if (analysis.polishedDraft) {
      await handleAnalyze(analysis.polishedDraft, true);
    }
  };

  const handleSaveFinalDraft = async (polishedDraft: string): Promise<boolean> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId || !polishedDraft.trim()) return false;
    setIsSavingFinalDraft(true);
    try {
      const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_final_draft',
          polishedDraft,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save final draft.');
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: result.polishedDraft,
        readiness: 'needs_review',
        verdict: 'needs_review',
        feedback: [],
        flags: [],
        summary: 'The final draft was edited and needs a content quality check.',
        publicationPackageStatus: result.publicationPackageStatus,
      }));
      toast.success('Final draft saved. Run Quality Check before export.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save final draft.');
      return false;
    } finally {
      setIsSavingFinalDraft(false);
    }
  };

  const consumePublicationStream = async (
    response: Response,
    onEvent: (event: { type: string; data: unknown }) => void,
    controller: AbortController
  ) => {
    if (!response.ok) {
      throw new Error((await response.json().catch(() => null))?.error || 'Publication operation failed.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader not available.');
    const decoder = new TextDecoder();
    let buffer = '';
    let complete = false;
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
        const event = JSON.parse(line) as { type: string; data: unknown };
        if (event.type === 'error') throw new Error(String(event.data));
        if (event.type === 'complete') complete = true;
        onEvent(event);
      }
    }
    if (!complete) throw new Error('Publication operation ended before completion.');
  };

  const handleQualityCheck = async (): Promise<EditorialReadiness | null> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId || !analysis.polishedDraft) return null;
    const controller = new AbortController();
    analyzeAbortControllerRef.current = controller;
    setIsCheckingQuality(true);
    setIsStreaming(true);
    setProcessStage('quality_gate');
    setProcessStartedAt(Date.now());
    setAnalysis(prev => ({ ...prev, feedback: [], flags: [] }));
    let checkedReadiness: EditorialReadiness | null = null;
    try {
      const response = await directFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'quality_gate',
          text: analysis.polishedDraft,
          originalDraft: sourceDraft,
          analysisLogId: logId,
          metadata,
          analysisSpeed: 'deep',
        }),
      });
      await consumePublicationStream(response, event => {
        if (event.type === 'readiness') {
          checkedReadiness = event.data as EditorialReadiness;
          setAnalysis(prev => ({
            ...prev,
            readiness: event.data as EditorialReadiness,
            verdict: event.data as EditorialReadiness,
          }));
        } else if (event.type === 'summary') {
          setAnalysis(prev => ({ ...prev, summary: event.data as string }));
        } else if (event.type === 'changes') {
          setAnalysis(prev => ({ ...prev, changes: event.data as string[] }));
        } else if (event.type === 'feedback_item') {
          const { item, index } = event.data as { item: FeedbackItem; index: number };
          setAnalysis(prev => {
            const feedback = [...(prev.feedback || [])];
            feedback[index] = item;
            return { ...prev, feedback };
          });
        } else if (event.type === 'flags') {
          setAnalysis(prev => ({ ...prev, flags: event.data as string[] }));
        }
      }, controller);
      toast.success('Quality check completed without rewriting the draft.');
      return checkedReadiness;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Quality check failed.');
      return null;
    } finally {
      setIsCheckingQuality(false);
      setIsStreaming(false);
      setProcessStartedAt(null);
      analyzeAbortControllerRef.current = null;
    }
  };

  const handleRegenerateSeo = async () => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId || !analysis.polishedDraft) return;
    const controller = new AbortController();
    analyzeAbortControllerRef.current = controller;
    setIsGeneratingSeo(true);
    setIsStreaming(true);
    setProcessStage('seo');
    setProcessStartedAt(Date.now());
    try {
      const response = await directFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'generate_seo',
          text: analysis.polishedDraft,
          analysisLogId: logId,
          metadata,
          analysisSpeed: 'deep',
        }),
      });
      await consumePublicationStream(response, event => {
        if (event.type === 'seo_metadata') {
          setAnalysis(prev => ({
            ...prev,
            generatedMetadata: event.data as PublicationPackage,
          }));
        } else if (event.type === 'publication_package_status') {
          setAnalysis(prev => ({
            ...prev,
            publicationPackageStatus: event.data as AnalysisResult['publicationPackageStatus'],
          }));
        }
      }, controller);
      toast.success('SEO metadata regenerated for the current final draft.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'SEO generation failed.');
    } finally {
      setIsGeneratingSeo(false);
      setIsStreaming(false);
      setProcessStartedAt(null);
      analyzeAbortControllerRef.current = null;
    }
  };

  const handleSavePublicationMetadata = async (
    publicationPackage: PublicationPackage
  ): Promise<boolean> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId) return false;
    try {
      const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_publication_package',
          publicationPackage,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save SEO metadata.');
      setAnalysis(prev => ({
        ...prev,
        generatedMetadata: result.generatedMetadata,
        publicationPackageStatus: 'current',
      }));
      toast.success('SEO metadata saved for the current final draft.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save SEO metadata.');
      return false;
    }
  };

  const handleConfirmPublicationMetadata = async (): Promise<void> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId) {
      throw new Error('The publication history is not ready yet.');
    }
    const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm_publication_package',
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to confirm publication metadata.');
    }
    setAnalysis(prev => ({
      ...prev,
      publicationPackageStatus: 'current',
    }));
  };

  const handlePrepareForExport = async () => {
    const readiness = analysis.readiness === 'ready'
      ? 'ready'
      : await handleQualityCheck();
    if (readiness !== 'ready') {
      toast.info('Resolve or approve the current quality findings before generating SEO.');
      return;
    }
    await handleRegenerateSeo();
  };

  const handleRefineAgain = async (instruction: string, overrideText?: string, forceSkipCheck = false) => {
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);
    const ctx = {
      draft,
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
    };
    await executeRefine(ctx, instruction, overrideText, forceSkipCheck);
  };

  const handleApplyFix = async (
    target: string,
    replacement: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number
  ) => {
    const item = analysis.feedback?.[index];
    // Require a real targetText — suggestion-only items cannot be auto-applied
    if (
      !item ||
      !canAutoApplyFeedback(item) ||
      target !== item.targetText ||
      replacement !== item.replacementText ||
      operation !== item.operation
    ) {
      toast.error('Cannot auto-apply', { description: 'This feedback requires manual editorial review.' });
      return false;
    }
    const finalDraft = analysis.polishedDraft || '';
    const result = applyFeedbackOperation(finalDraft, item);
    if (!result.success) {
      toast.error('Failed to apply fix', { description: 'Target text not found in draft. Please apply manually.' });
      return false;
    }
    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = { ...item, isApplied: true };
    const nextReadiness: EditorialReadiness = 'needs_review';
    const nextFlags = analysis.flags || [];
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, result.nextText, nextFlags);
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: result.nextText,
        feedback: nextFeedback,
        readiness: nextReadiness,
        verdict: nextReadiness,
        flags: nextFlags,
        publicationPackageStatus: prev.publicationPackageStatus === 'current' ? 'stale' : prev.publicationPackageStatus,
      }));
      toast.success('Suggestion applied and saved.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the applied suggestion.');
      return false;
    }
  };

  const handleApplyAllFixes = async () => {
    const feedback = analysis.feedback || [];
    const autoApplicable = feedback.filter(canAutoApplyFeedback);
    if (autoApplicable.length === 0) {
      toast.error('No suggestions can be auto-applied');
      return;
    }
    const result = applyAllFeedbackOperations(analysis.polishedDraft || '', feedback);
    if (result.appliedIndexes.length === 0) {
      toast.error('Auto-apply failed', { description: 'No matching target text found.' });
      return;
    }
    const appliedIndexSet = new Set(result.appliedIndexes);
    const nextFeedback = feedback.map((item, index) =>
      appliedIndexSet.has(index) ? { ...item, isApplied: true } : item
    );
    const nextReadiness: EditorialReadiness = 'needs_review';
    const nextFlags = analysis.flags || [];
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, result.nextText, nextFlags);
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: result.nextText,
        feedback: nextFeedback,
        readiness: nextReadiness,
        verdict: nextReadiness,
        flags: nextFlags,
        publicationPackageStatus: prev.publicationPackageStatus === 'current' ? 'stale' : prev.publicationPackageStatus,
      }));
      if (result.failedIndexes.length > 0) {
        toast.warning(`${result.appliedIndexes.length} applied, ${result.failedIndexes.length} need manual review.`);
      } else {
        toast.success(`${result.appliedIndexes.length} changes applied and saved.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save applied suggestions.');
    }
  };

  const handleUndoLastEdit = () => {
    const previousDraft = draftHistory[draftHistory.length - 1];
    if (previousDraft === undefined) {
      toast.error('No revisions to undo');
      return;
    }
    setDraft(previousDraft);
    setDraftHistory(prev => prev.slice(0, -1));
    toast.success('Last revision undone');
  };

  const handleNewDraft = () => {
    setActiveHistoryId(null);
    setDraft('');
    setSourceDraft('');
    setMetadata(applyDefaultMetadata(appSettings.defaultMetadata));
    setAnalysis({ status: 'idle' });
    setDraftHistory([]);
    setActiveTab('draft');
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);

    setResearchNotes([]);
    setAttachments([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('eai_research_notes');
    }

    if (isMobile) {
      // Safe sidebar close handled inside EditorialWorkspace
    }
  };

  const handleGenerateDraftFromNotes = () => {
    const ctx = {
      researchNotes,
      metadata,
      directFetch,
      setDraft,
      setIsGeneratingDraftFromNotes,
      generateAbortControllerRef,
    };
    executeGenerateDraftFromNotes(ctx);
  };

  const handleCancelGenerateDraft = () => {
    if (generateAbortControllerRef.current) {
      generateAbortControllerRef.current.abort();
      generateAbortControllerRef.current = null;
      setIsGeneratingDraftFromNotes(false);
      toast.info('Draft generation cancelled');
    }
  };

  const handleCancelAnalysis = () => {
    cancelPendingStreams();
    draftChunkBufferRef.current = '';
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsStreaming(false);
    setIsRefining(false);
    setProcessStartedAt(null);
    setIsTargetedFixing(null);
    setAnalysis((current) => ({
      ...current,
      status: current.feedback?.length || current.polishedDraft ? 'success' : 'idle',
      errorMessage: undefined,
    }));
    toast.info('AI request cancelled');
  };

  const handleAddNewCategoryOrType = async (type: 'category' | 'articleType', value: string) => {
    if (!value || !value.trim()) return;
    const trimmed = value.trim();
    if (type === 'category' && editorialOptions.categories.includes(trimmed)) return;
    if (type === 'articleType' && editorialOptions.articleTypes.includes(trimmed)) return;

    if (isDemoMode) {
      setEditorialOptions(prev => ({
        ...prev,
        categories: type === 'category' ? [...prev.categories, trimmed] : prev.categories,
        articleTypes: type === 'articleType' ? [...prev.articleTypes, trimmed] : prev.articleTypes,
      }));
      return;
    }

    try {
      const response = await fetchWithTimeout('/api/workspace/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save preference.');
      setEditorialOptions(prev => ({
        ...prev,
        categories: result.categories || prev.categories,
        articleTypes: result.articleTypes || prev.articleTypes,
      }));
    } catch (error) {
      console.error('Failed to save metadata preference:', error);
    }
  };

  const loadHistory = async (id: string) => {
    try {
      const res = await fetchWithTimeout(`/api/history/${id}`);
      if (res.ok) {
        const log = await res.json();
        setActiveHistoryId(log.id);
        setDraft(log.content || '');
        setSourceDraft(log.content || '');
        setMetadata(extractArticleMetadata(log.metadata));

        const logMetadata = log.metadata as Record<string, unknown> | null;
        const loadedNotes = (logMetadata?.researchNotes || []) as ResearchNote[];
        setResearchNotes(loadedNotes);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('eai_research_notes', JSON.stringify(loadedNotes));
        }

        const loadedAttachments = (logMetadata?.attachments || []) as Attachment[];
        setAttachments(loadedAttachments);

        setDraftHistory([]);
        setHoveredFeedbackIndex(null);
        setActiveFeedbackIndex(null);
        const qualityGate = extractQualityGate(log.metadata);
        const publicationState = extractPublicationState(log.metadata);
        const legacyOrReadiness = log.verdict as AnalysisResult['verdict'];
        setAnalysis({
          status: log.status,
          score: log.score,
          verdict: legacyOrReadiness,
          readiness: qualityGate.readiness,
          changes: qualityGate.changes,
          summary: log.summary,
          polishedDraft: log.polishedDraft || extractPolishedDraft(log.metadata),
          feedback: log.feedback,
          flags: log.flags,
          errorMessage: log.errorMessage,
          responseMode: log.responseMode || extractResponseMode(log.metadata),
          analysisLogId: log.id,
          sourceRef: (log.metadata as Record<string, unknown>)?.sourceRef as string | undefined,
          exportStatus: (log.metadata as Record<string, unknown>)?.exportStatus as ArticleMetadata['exportStatus'],
          generatedMetadata: extractGeneratedMetadata(log.metadata) as Record<string, unknown>,
          workingTitle: publicationState.workingTitle,
          publicationPackageStatus: publicationState.publicationPackageStatus,
          editorStatus: log.editorStatus,
        });
        if (log.status === 'success') setActiveTab('refined');
      } else {
        toast.error('Failed to load history');
      }
    } catch {
      toast.error('A network error occurred');
    }
  };

  const persistEditorialResolution = async (
    feedback: FeedbackItem[],
    readiness: EditorialReadiness,
    polishedDraft: string,
    flags: string[]
  ) => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId) {
      throw new Error('The refinement history is not ready yet. Please try again.');
    }

    const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_editorial_feedback',
        feedback,
        polishedDraft,
        flags: readiness === 'ready' ? [] : flags,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save the editorial decision.');
    }
  };

  const handleAcceptFeedback = async (index: number) => {
    if (!analysis.feedback) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isAccepted: true,
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        analysis.polishedDraft || '',
        nextFlags
      );
      setAnalysis(prev => ({
        ...prev,
        feedback: nextFeedback,
        readiness: nextReadiness,
        verdict: nextReadiness,
        flags: nextFlags,
      }));
      toast.success('Editorial decision saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the editorial decision.');
    }
  };

  const handleAddFeedbackSource = async (index: number, url: string): Promise<boolean> => {
    const normalizedUrl = normalizeHttpSourceUrl(url);
    if (!normalizedUrl) {
      toast.error('Enter a valid HTTP or HTTPS source URL.');
      return false;
    }
    const item = analysis.feedback?.[index];
    if (!item || !item.verificationStatus) return false;
    const sourceTarget = item.targetText?.trim() || item.message;
    const currentDraft = analysis.polishedDraft || '';
    const { nextDraft, linked } = addSourceLinkToDraft(
      currentDraft,
      sourceTarget,
      normalizedUrl
    );

    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: true,
      verifiedSource: normalizedUrl,
    };
    const nextReadiness = linked
      ? 'needs_review'
      : calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, nextDraft, nextFlags);
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: nextDraft,
        feedback: nextFeedback,
        readiness: nextReadiness,
        verdict: nextReadiness,
        flags: nextFlags,
        publicationPackageStatus: nextDraft !== currentDraft && prev.publicationPackageStatus === 'current'
          ? 'stale'
          : prev.publicationPackageStatus,
      }));
      toast.success(linked ? 'Source added and verified.' : 'Source saved; target text was not changed.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the source.');
      return false;
    }
  };

  const handleTargetedFix = async (index: number, actionType: 'remove' | 'fix') => {
    const ctx = {
      analysis,
      isTargetedFixing,
      setIsTargetedFixing,
      directFetch,
      analysisSpeed,
      metadata,
      originalDraft: sourceDraft,
      researchNotes,
      persistEditorialResolution,
      setAnalysis,
      analyzeAbortControllerRef,
    };
    await executeTargetedFix(ctx, index, actionType);
  };

  const handleProceedRefinement = (resolution: { restore: boolean }) => {
    setShowMissingSourcesModal(false);
    if (!pendingRefineAction) return;

    let finalDraft =
      pendingRefineAction.overrideDraft ??
      (pendingRefineAction.type === 'analyze' ? draft : analysis.polishedDraft);

    if (resolution.restore && missingSources.length > 0 && finalDraft) {
      const restoreSection = [
        '\n\n## References',
        ...missingSources.map(src => `- [${src.domain}](${src.url})`),
      ].join('\n');
      finalDraft = finalDraft.trim() + restoreSection;

      if (pendingRefineAction.type === 'analyze') {
        setDraft(finalDraft);
      } else {
        setAnalysis(prev => ({ ...prev, polishedDraft: finalDraft }));
      }
    }

    if (pendingRefineAction.type === 'analyze') {
      handleAnalyze(finalDraft, true);
    } else if (pendingRefineAction.type === 'refine_again' && pendingRefineAction.instruction) {
      handleRefineAgain(pendingRefineAction.instruction, finalDraft, true);
    }
    setPendingRefineAction(null);
  };

  return {
    // State values
    workspaceChecking,
    editorialOptions,
    setEditorialOptions,
    draft,
    setDraft,
    metadata,
    setMetadata,
    analysis,
    setAnalysis,
    activeHistoryId,
    setActiveHistoryId,
    refreshTrigger,
    setRefreshTrigger,
    draftHistory,
    setDraftHistory,
    sourceDraft,
    setSourceDraft,
    isStreaming,
    isRefining,
    processStage,
    processStartedAt,
    appSettings,
    setAppSettings,
    isDemoMode,
    demoRefineCount,
    setDemoRefineCount,
    isMobile,
    mobileViewTab,
    setMobileViewTab,
    isShortcutModalOpen,
    setIsShortcutModalOpen,
    hoveredFeedbackIndex,
    setHoveredFeedbackIndex,
    activeFeedbackIndex,
    setActiveFeedbackIndex,
    activeTab,
    setActiveTab,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    layoutReversed,
    setLayoutReversed,
    showMissingSourcesModal,
    setShowMissingSourcesModal,
    missingSources,
    pendingRefineAction,
    researchNotes,
    setResearchNotes,
    attachments,
    setAttachments,
    analysisSpeed,
    setAnalysisSpeed,
    isTargetedFixing,
    isSavingToCloud,
    isGeneratingDraftFromNotes,
    isSavingFinalDraft,
    isCheckingQuality,
    isGeneratingSeo,

    // Derived states
    wordCount,
    charCount,
    MAX_TEXT_LENGTH,
    hasResult,
    showFeedbackSidebar,
    showNotesSidebar,
    hasNotes,

    // Handlers
    handleCloudSave,
    handleNotesChange,
    handleAnalyze,
    handleReanalyze,
    handleSaveFinalDraft,
    handleQualityCheck,
    handleRegenerateSeo,
    handleSavePublicationMetadata,
    handleConfirmPublicationMetadata,
    handlePrepareForExport,
    handleRefineAgain,
    handleApplyFix,
    handleApplyAllFixes,
    handleUndoLastEdit,
    handleNewDraft,
    handleGenerateDraftFromNotes,
    handleCancelGenerateDraft,
    handleCancelAnalysis,
    handleAddNewCategoryOrType,
    loadHistory,
    handleAcceptFeedback,
    handleAddFeedbackSource,
    handleTargetedFix,
    handleProceedRefinement,
  };
}
