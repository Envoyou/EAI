'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { FeedbackItem, EditorialReadiness, ResearchNote, Attachment, AnalysisResult, ArticleMetadata } from '@eai/shared';
import {
  applyAllFeedbackOperations,
  applyFeedbackOperation,
  canAutoApplyFeedback,
  findTargetMatch,
} from '@eai/shared';
import { useDirectFetch } from '@/lib/hooks/useDirectFetch';
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
  extractQualityGate,
  calculateReadiness,
  checkMissingSources,
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
  const [rightPanelTab, setRightPanelTab] = useState<'strategist' | 'feedback' | 'notes'>('strategist');

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
    setSidebarOpen: (open: boolean | ((p: boolean) => boolean)) => {
      // Standard behavior updates right panel or sidebar
      if (typeof open === 'function') {
        setRightPanelOpen(open);
      } else {
        setRightPanelOpen(open);
      }
    },
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
      const response = await fetch('/api/history', {
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

  const handleRefineAgain = async (instruction: string, overrideText?: string, forceSkipCheck = false) => {
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

  const handleApplyFix = (
    target: string,
    replacement: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number
  ) => {
    const item = analysis.feedback?.[index];
    if (!item || operation === 'manual') return false;
    const finalDraft = analysis.polishedDraft || '';
    if (!target && replacement) {
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: `${finalDraft}\n\n${replacement}`,
        readiness: 'needs_review',
        verdict: 'needs_review',
      }));
      toast.success('Suggestion applied!');
      return true;
    }
    const result = applyFeedbackOperation(finalDraft, {
      ...item,
      targetText: target,
      replacementText: replacement,
      operation,
    });
    if (!result.success) {
      toast.error('Failed to apply fix', { description: 'Target text not found. Please edit manually.' });
      return false;
    }
    setAnalysis(prev => ({
      ...prev,
      polishedDraft: result.nextText,
      readiness: 'needs_review',
      verdict: 'needs_review',
    }));
    toast.success('Suggestion applied!');
    return true;
  };

  const handleApplyAllFixes = () => {
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
    setAnalysis(prev => ({
      ...prev,
      polishedDraft: result.nextText,
      readiness: 'needs_review',
      verdict: 'needs_review',
    }));
    if (result.failedIndexes.length > 0) {
      toast.warning(`${result.appliedIndexes.length} applied, ${result.failedIndexes.length} need manual review.`);
    } else {
      toast.success(`${result.appliedIndexes.length} changes applied.`);
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
      const response = await fetch('/api/workspace/config', {
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
      const res = await fetch(`/api/history/${id}`);
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

    const response = await fetch(`/api/history/${logId}/resolve`, {
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
        flags: nextFlags,
      }));
      toast.success('Editorial decision saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the editorial decision.');
    }
  };

  const handleMarkFeedbackVerified = async (index: number) => {
    if (!analysis.feedback) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: true,
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
        flags: nextFlags,
      }));
      toast.success('Verification saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save verification.');
    }
  };

  const handleAddFeedbackSource = async (index: number, url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error('URL is required.');
      return;
    }
    const item = analysis.feedback?.[index];
    if (!item) return;
    const sourceTarget = item.targetText?.trim() || item.message;
    const currentDraft = analysis.polishedDraft || '';
    const match = findTargetMatch(currentDraft, sourceTarget);

    const verificationNote = [
      '## Verification Notes',
      `- ${sourceTarget} — ${trimmedUrl}`,
    ].join('\n');
    const nextDraft = match
      ? `${currentDraft.slice(0, match.start)}[${match.text}](${trimmedUrl})${currentDraft.slice(match.end)}`
      : currentDraft.includes('## Verification Notes')
        ? `${currentDraft.trim()}\n- ${sourceTarget} — ${trimmedUrl}`
        : `${currentDraft.trim()}\n\n${verificationNote}`;

    const nextFeedback = [...(analysis.feedback || [])];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isVerified: true,
      verifiedSource: trimmedUrl,
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    try {
      await persistEditorialResolution(nextFeedback, nextReadiness, nextDraft, nextFlags);
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: nextDraft,
        feedback: nextFeedback,
        readiness: nextReadiness,
        flags: nextFlags,
      }));
      toast.success(match ? 'Source added and verified.' : 'Source note added and verified.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the source.');
    }
  };

  const handleTargetedFix = async (index: number, actionType: 'remove' | 'fix') => {
    const ctx = {
      analysis,
      isTargetedFixing,
      setIsTargetedFixing,
      directFetch,
      analysisSpeed,
      persistEditorialResolution,
      setAnalysis,
      analyzeAbortControllerRef,
      calculateReadiness,
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
    handleRefineAgain,
    handleApplyFix,
    handleApplyAllFixes,
    handleUndoLastEdit,
    handleNewDraft,
    handleGenerateDraftFromNotes,
    handleCancelGenerateDraft,
    handleAddNewCategoryOrType,
    loadHistory,
    handleAcceptFeedback,
    handleMarkFeedbackVerified,
    handleAddFeedbackSource,
    handleTargetedFix,
    handleProceedRefinement,
  };
}
