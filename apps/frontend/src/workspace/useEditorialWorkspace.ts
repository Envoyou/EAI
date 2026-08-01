'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type {
  FeedbackItem,
  EditorialReadiness,
  ResearchNote,
  Attachment,
  AnalysisResult,
  ArticleMetadata,
  PublicationPackage,
  PublicationPackageStatus,
  RevisionValidationState,
  SeoReviewState,
  SeoField,
  SeoFieldStates,
  DraftRevisionIdentity,
} from '@eai/shared';
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
import { getBackgroundValidationDelay } from './background-validation';
import { getSafeStaleSeoFields, parseSeoFieldStates } from './seo-field-state';

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
  markFeedbackApplied,
} from './utils';

import type { PendingRefineAction } from './types';

type EditorialResolutionResult = {
  readiness: EditorialReadiness;
  publicationPackageStatus?: PublicationPackageStatus;
  qualityGateState?: RevisionValidationState;
  seoReviewState?: SeoReviewState;
  seoFieldStates?: SeoFieldStates;
  draftRevision?: DraftRevisionIdentity;
  revisionValidationLevel?: 'none' | 'light' | 'full';
};

type AutomaticValidationContext = EditorialResolutionResult & {
  polishedDraft: string;
};

type PublicationOperationOptions = {
  polishedDraft?: string;
  automatic?: boolean;
  preserveCurrentStateOnFailure?: boolean;
  draftRevision?: DraftRevisionIdentity;
  background?: boolean;
};

type PendingBackgroundValidation = {
  polishedDraft: string;
  draftRevision: DraftRevisionIdentity;
  validationLevel: 'light' | 'full';
  seoFieldStates?: SeoFieldStates;
  publicationPackageStatus?: PublicationPackageStatus;
};

type EditorialMutationOrigin =
  | 'apply_feedback'
  | 'bulk_feedback'
  | 'targeted_fix'
  | 'remove_content'
  | 'add_source'
  | 'accept_feedback';

export function useEditorialWorkspace({ mode }: { mode: 'demo' | 'workspace' }) {
  const router = useRouter();
  const tFeedbackWorkflow = useTranslations('FeedbackWorkflow');
  const tContentMemory = useTranslations('ContentMemory');
  const tFinalDraftPanel = useTranslations('FinalDraftPanel');
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
  const workspaceMutationRef = useRef(false);
  const backgroundValidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundValidationAbortControllerRef = useRef<AbortController | null>(null);
  const backgroundValidationRunnerRef = useRef<(
    context: PendingBackgroundValidation
  ) => Promise<void>>(async () => undefined);
  const [pendingBackgroundValidation, setPendingBackgroundValidation] =
    useState<PendingBackgroundValidation | null>(null);

  const cancelBackgroundValidation = () => {
    if (backgroundValidationTimerRef.current) {
      clearTimeout(backgroundValidationTimerRef.current);
      backgroundValidationTimerRef.current = null;
    }
    backgroundValidationAbortControllerRef.current?.abort();
    backgroundValidationAbortControllerRef.current = null;
    setIsCheckingQuality(false);
    setPendingBackgroundValidation(null);
  };

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
  const isAiBusy =
    isStreaming
    || isRefining
    || isGeneratingDraftFromNotes
    || isTargetedFixing !== null
    || isGeneratingSeo;
  const hasActiveAiRequest = () =>
    Boolean(
      analyzeAbortControllerRef.current
      || generateAbortControllerRef.current
    );
  const hasBlockingWorkspaceOperation = () =>
    hasActiveAiRequest() || workspaceMutationRef.current;

  // Action methods
  const handleCloudSave = async () => {
    if (isDemoMode || hasBlockingWorkspaceOperation()) return;
    workspaceMutationRef.current = true;
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
      workspaceMutationRef.current = false;
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
    if (hasBlockingWorkspaceOperation()) return;
    cancelBackgroundValidation();
    setHoveredFeedbackIndex(null);
    setActiveFeedbackIndex(null);
    const ctx = {
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
      notifyDraftReady: () => toast.success(
        tFinalDraftPanel('draftReady'),
        { description: tFinalDraftPanel('draftReadyDescription') }
      ),
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
    if (
      !logId
      || !polishedDraft.trim()
      || hasBlockingWorkspaceOperation()
    ) return false;
    cancelBackgroundValidation();
    workspaceMutationRef.current = true;
    setIsSavingFinalDraft(true);
    try {
      const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_final_draft',
          polishedDraft,
          revisionId: analysis.draftRevision?.revisionId,
          bodyHash: analysis.draftRevision?.bodyHash,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save final draft.');
      const persistedReadiness: EditorialReadiness =
        result.readiness === 'ready'
        || result.readiness === 'needs_review'
        || result.readiness === 'blocked'
          ? result.readiness
          : 'needs_review';
      const persistedPackageStatus: PublicationPackageStatus =
        result.publicationPackageStatus === 'current'
        || result.publicationPackageStatus === 'stale'
        || result.publicationPackageStatus === 'not_generated'
          ? result.publicationPackageStatus
          : 'not_generated';
      const invalidated = result.qualityCheckInvalidated === true;
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: result.polishedDraft,
        readiness: persistedReadiness,
        ...(invalidated
          ? {
              verdict: 'needs_review' as const,
              feedback: [],
              flags: [],
              summary: tFinalDraftPanel('sensitiveChangesNeedDecision'),
            }
          : {}),
        publicationPackageStatus: persistedPackageStatus,
        qualityGateState:
          result.qualityGateState === 'valid'
          || result.qualityGateState === 'validation_recommended'
          || result.qualityGateState === 'stale'
            ? result.qualityGateState
            : prev.qualityGateState,
        seoReviewState:
          result.seoReviewState === 'valid'
          || result.seoReviewState === 'possibly_stale'
          || result.seoReviewState === 'stale'
            ? result.seoReviewState
            : prev.seoReviewState,
        seoFieldStates: parseSeoFieldStates(result.seoFieldStates),
        draftRevision: result.draftRevision ?? prev.draftRevision,
      }));
      const validationLevel = result.revisionValidationLevel;
      const savedRevision = result.draftRevision as DraftRevisionIdentity | undefined;
      if (
        (validationLevel === 'light' || validationLevel === 'full')
        && savedRevision?.revisionId
        && savedRevision.bodyHash
      ) {
        setPendingBackgroundValidation({
          polishedDraft: result.polishedDraft,
          draftRevision: savedRevision,
          validationLevel,
          seoFieldStates: parseSeoFieldStates(result.seoFieldStates),
          publicationPackageStatus: persistedPackageStatus,
        });
        setIsCheckingQuality(true);
      }
      toast.success(
        result.revisionImpact === 'formatting_only'
          ? tFinalDraftPanel('formattingEditSaved')
          : result.revisionImpact === 'minor_copy_edit'
            ? tFinalDraftPanel('minorEditSaved')
            : result.revisionImpact === 'editorial_change'
              ? tFinalDraftPanel('editorialEditSaved')
              : tFinalDraftPanel('substantiveEditSaved')
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save final draft.');
      return false;
    } finally {
      workspaceMutationRef.current = false;
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

  const handleQualityCheck = async (
    options: PublicationOperationOptions = {}
  ): Promise<EditorialReadiness | null> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    const polishedDraft = options.polishedDraft ?? analysis.polishedDraft;
    const draftRevision = options.draftRevision ?? analysis.draftRevision;
    const isBackground = options.background === true;
    if (!logId || !polishedDraft || hasBlockingWorkspaceOperation()) return null;
    if (!isBackground) cancelBackgroundValidation();
    const previousAnalysis = analysis;
    const controller = new AbortController();
    if (isBackground) {
      backgroundValidationAbortControllerRef.current = controller;
    } else {
      analyzeAbortControllerRef.current = controller;
    }
    setIsCheckingQuality(true);
    if (!isBackground) {
      setIsStreaming(true);
      setProcessStage('quality_gate');
      setProcessStartedAt(Date.now());
    }
    let checkedReadiness: EditorialReadiness | null = null;
    try {
      const response = await directFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: options.automatic ? 'validate_revision' : 'quality_gate',
          text: polishedDraft,
          originalDraft: sourceDraft,
          analysisLogId: logId,
          revisionId: draftRevision?.revisionId,
          bodyHash: draftRevision?.bodyHash,
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
          analysisSpeed: 'deep',
        }),
      });
      await consumePublicationStream(response, event => {
        if (event.type === 'feedback_reset') {
          setAnalysis(prev => ({ ...prev, feedback: [], flags: [] }));
        } else if (event.type === 'readiness') {
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
        } else if (event.type === 'revision_identity') {
          setAnalysis(prev => ({
            ...prev,
            draftRevision: event.data as DraftRevisionIdentity,
          }));
        }
      }, controller);
      setAnalysis(prev => ({
        ...prev,
        qualityGateState: checkedReadiness === 'ready' ? 'valid' : 'stale',
      }));
      if (options.automatic && checkedReadiness !== 'ready') {
        toast.warning(tFinalDraftPanel('automaticQualityCheckNeedsReview'));
      } else {
        toast.success(
          tFinalDraftPanel(
            options.automatic
              ? 'automaticQualityCheckSuccess'
              : 'qualityCheckSuccess'
          )
        );
      }
      return checkedReadiness;
    } catch (error) {
      if (controller.signal.aborted) {
        if (!options.preserveCurrentStateOnFailure) {
          setAnalysis(() => previousAnalysis);
        }
        return null;
      }
      toast.error(error instanceof Error ? error.message : tFinalDraftPanel('revisionCheckFailed'));
      return null;
    } finally {
      if (
        isBackground
        && backgroundValidationAbortControllerRef.current === controller
      ) {
        backgroundValidationAbortControllerRef.current = null;
        setIsCheckingQuality(false);
      } else if (analyzeAbortControllerRef.current === controller) {
        setIsCheckingQuality(false);
        setIsStreaming(false);
        setProcessStartedAt(null);
        analyzeAbortControllerRef.current = null;
      }
    }
  };

  const handleRefreshSeoFields = async ({
    polishedDraft,
    draftRevision,
    seoFieldStates,
    background = false,
  }: {
    polishedDraft: string;
    draftRevision?: DraftRevisionIdentity;
    seoFieldStates?: SeoFieldStates;
    background?: boolean;
  }): Promise<void> => {
    const fields: SeoField[] = getSafeStaleSeoFields(seoFieldStates);
    const logId = analysis.analysisLogId || activeHistoryId;
    if (fields.length === 0 || !logId || !polishedDraft) return;
    const controller = new AbortController();
    if (background) backgroundValidationAbortControllerRef.current = controller;
    else analyzeAbortControllerRef.current = controller;
    setIsCheckingQuality(true);
    try {
      const response = await directFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'refresh_seo_fields',
          seoFields: fields,
          text: polishedDraft,
          analysisLogId: logId,
          revisionId: draftRevision?.revisionId,
          bodyHash: draftRevision?.bodyHash,
          metadata: {
            ...metadata,
            researchNotes: researchNotes.slice(0, 10),
          },
          analysisSpeed: 'deep',
        }),
      });
      await consumePublicationStream(response, event => {
        if (event.type === 'seo_metadata') {
          setAnalysis(prev => ({ ...prev, generatedMetadata: event.data as PublicationPackage }));
        } else if (event.type === 'seo_field_states') {
          setAnalysis(prev => ({ ...prev, seoFieldStates: parseSeoFieldStates(event.data) }));
        } else if (event.type === 'publication_package_status') {
          setAnalysis(prev => ({
            ...prev,
            publicationPackageStatus: event.data as PublicationPackageStatus,
            seoReviewState: event.data === 'current' ? 'valid' : 'stale',
          }));
        }
      }, controller);
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : tFinalDraftPanel('seoPartialRefreshFailed'));
      }
    } finally {
      if (backgroundValidationAbortControllerRef.current === controller) {
        backgroundValidationAbortControllerRef.current = null;
        setIsCheckingQuality(false);
      }
      if (analyzeAbortControllerRef.current === controller) {
        analyzeAbortControllerRef.current = null;
        setIsCheckingQuality(false);
      }
    }
  };

  useEffect(() => {
    backgroundValidationRunnerRef.current = async (context) => {
      const readiness = await handleQualityCheck({
        polishedDraft: context.polishedDraft,
        draftRevision: context.draftRevision,
        automatic: true,
        background: true,
        preserveCurrentStateOnFailure: true,
      });
      if (readiness === 'ready') {
        await handleRefreshSeoFields({
          polishedDraft: context.polishedDraft,
          draftRevision: context.draftRevision,
          seoFieldStates: context.seoFieldStates,
          background: true,
        });
      }
    };
  });

  useEffect(() => {
    if (!pendingBackgroundValidation) return;
    const context = pendingBackgroundValidation;
    const debounceMs = getBackgroundValidationDelay(context.validationLevel);
    if (debounceMs === null) return;
    backgroundValidationTimerRef.current = setTimeout(() => {
      backgroundValidationTimerRef.current = null;
      setPendingBackgroundValidation(null);
      void backgroundValidationRunnerRef.current(context);
    }, debounceMs);
    return () => {
      if (backgroundValidationTimerRef.current) {
        clearTimeout(backgroundValidationTimerRef.current);
        backgroundValidationTimerRef.current = null;
      }
    };
  }, [pendingBackgroundValidation]);

  useEffect(() => () => {
    if (backgroundValidationTimerRef.current) {
      clearTimeout(backgroundValidationTimerRef.current);
    }
    backgroundValidationAbortControllerRef.current?.abort();
  }, []);

  const handleRegenerateSeo = async (
    options: PublicationOperationOptions = {}
  ) => {
    const logId = analysis.analysisLogId || activeHistoryId;
    const polishedDraft = options.polishedDraft ?? analysis.polishedDraft;
    const draftRevision = options.draftRevision ?? analysis.draftRevision;
    if (!logId || !polishedDraft || hasBlockingWorkspaceOperation()) return;
    cancelBackgroundValidation();
    const previousAnalysis = analysis;
    const controller = new AbortController();
    analyzeAbortControllerRef.current = controller;
    setIsGeneratingSeo(true);
    setIsStreaming(true);
    setProcessStage('seo');
    setProcessStartedAt(Date.now());
    let packageReadiness: EditorialReadiness | null = null;
    try {
      const response = await directFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'generate_seo',
          text: polishedDraft,
          analysisLogId: logId,
          revisionId: draftRevision?.revisionId,
          bodyHash: draftRevision?.bodyHash,
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
        } else if (event.type === 'seo_field_states') {
          setAnalysis(prev => ({ ...prev, seoFieldStates: parseSeoFieldStates(event.data) }));
        } else if (event.type === 'feedback_reset') {
          setAnalysis(prev => ({ ...prev, feedback: [], flags: [] }));
        } else if (event.type === 'readiness') {
          packageReadiness = event.data as EditorialReadiness;
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
        } else if (event.type === 'revision_identity') {
          setAnalysis(prev => ({
            ...prev,
            draftRevision: event.data as DraftRevisionIdentity,
          }));
        }
      }, controller);
      if (packageReadiness === 'ready') {
        setAnalysis(prev => ({
          ...prev,
          qualityGateState: 'valid',
          seoReviewState: 'valid',
        }));
        toast.success(
          tFinalDraftPanel(
            options.automatic
              ? 'automaticSeoQualityReady'
              : 'seoQualityReady'
          )
        );
      } else {
        setAnalysis(prev => ({
          ...prev,
          qualityGateState: 'stale',
          seoReviewState: 'valid',
        }));
        toast.warning(tFinalDraftPanel('seoQualityNeedsReview'));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (!options.preserveCurrentStateOnFailure) {
          setAnalysis(() => previousAnalysis);
        }
        return;
      }
      toast.error(error instanceof Error ? error.message : tFinalDraftPanel('publicationRefreshFailed'));
    } finally {
      if (analyzeAbortControllerRef.current === controller) {
        setIsGeneratingSeo(false);
        setIsStreaming(false);
        setProcessStartedAt(null);
        analyzeAbortControllerRef.current = null;
      }
    }
  };

  const runAutomaticPublicationValidation = async (
    context: AutomaticValidationContext
  ): Promise<void> => {
    const readiness = await handleQualityCheck({
      polishedDraft: context.polishedDraft,
      automatic: true,
      preserveCurrentStateOnFailure: true,
      draftRevision: context.draftRevision,
    });
    if (readiness !== 'ready') return;

    const safeFields = getSafeStaleSeoFields(context.seoFieldStates);
    if (safeFields.length > 0) {
      await handleRefreshSeoFields({
        polishedDraft: context.polishedDraft,
        draftRevision: context.draftRevision,
        seoFieldStates: context.seoFieldStates,
      });
      return;
    }
    const legacySeoState = !context.seoFieldStates
      && (context.publicationPackageStatus === 'stale' || context.seoReviewState === 'stale');
    if (!legacySeoState) return;
    await handleRegenerateSeo({
      polishedDraft: context.polishedDraft,
      automatic: true,
      preserveCurrentStateOnFailure: true,
      draftRevision: context.draftRevision,
    });
  };

  const handleSavePublicationMetadata = async (
    publicationPackage: PublicationPackage
  ): Promise<boolean> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId || hasBlockingWorkspaceOperation()) return false;
    workspaceMutationRef.current = true;
    try {
      const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_publication_package',
          publicationPackage,
          revisionId: analysis.draftRevision?.revisionId,
          bodyHash: analysis.draftRevision?.bodyHash,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save SEO metadata.');
      setAnalysis(prev => ({
        ...prev,
        generatedMetadata: result.generatedMetadata,
        publicationPackageStatus: 'current',
        seoReviewState: 'valid',
        seoFieldStates: parseSeoFieldStates(result.seoFieldStates),
        draftRevision: result.draftRevision ?? prev.draftRevision,
      }));
      toast.success('SEO metadata saved for the current final draft.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save SEO metadata.');
      return false;
    } finally {
      workspaceMutationRef.current = false;
    }
  };

  const handleConfirmPublicationMetadata = async (): Promise<void> => {
    const logId = analysis.analysisLogId || activeHistoryId;
    if (!logId) {
      throw new Error('The publication history is not ready yet.');
    }
    if (hasBlockingWorkspaceOperation()) return;
    workspaceMutationRef.current = true;
    try {
      const response = await fetchWithTimeout(`/api/history/${logId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_publication_package',
          revisionId: analysis.draftRevision?.revisionId,
          bodyHash: analysis.draftRevision?.bodyHash,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to confirm publication metadata.');
      }
      setAnalysis(prev => ({
        ...prev,
        publicationPackageStatus: 'current',
        seoReviewState: 'valid',
        seoFieldStates: parseSeoFieldStates(result.seoFieldStates),
        draftRevision: result.draftRevision ?? prev.draftRevision,
      }));
    } finally {
      workspaceMutationRef.current = false;
    }
  };

  const handlePrepareForExport = async () => {
    if (hasBlockingWorkspaceOperation()) return;
    const readiness = analysis.readiness === 'ready'
      ? 'ready'
      : await handleQualityCheck();
    if (readiness !== 'ready') {
      toast.info(tFinalDraftPanel('resolveEditorialDecisionsFirst'));
      return;
    }
    if (
      analysis.publicationPackageStatus === 'current'
      && analysis.seoReviewState !== 'stale'
      && analysis.generatedMetadata
    ) {
      toast.success(tFinalDraftPanel('existingSeoRetained'));
      return;
    }
    await handleRegenerateSeo();
  };

  const handleRefineAgain = async (instruction: string, overrideText?: string, forceSkipCheck = false) => {
    if (hasBlockingWorkspaceOperation()) return;
    cancelBackgroundValidation();
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
    if (hasBlockingWorkspaceOperation()) return false;
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
    const nextFeedback = markFeedbackApplied(analysis.feedback || [], index);
    const nextReadiness: EditorialReadiness = 'needs_review';
    const nextFlags = analysis.flags || [];
    let automaticValidation: AutomaticValidationContext | null = null;
    workspaceMutationRef.current = true;
    try {
      const persisted = await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        result.nextText,
        nextFlags,
        'apply_feedback'
      );
      const persistedFlags = persisted.readiness === 'ready' ? [] : nextFlags;
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: result.nextText,
        feedback: nextFeedback,
        readiness: persisted.readiness,
        verdict: persisted.readiness,
        flags: persistedFlags,
        publicationPackageStatus:
          persisted.publicationPackageStatus
          ?? (prev.publicationPackageStatus === 'current'
            ? 'stale'
            : prev.publicationPackageStatus),
        qualityGateState: persisted.qualityGateState ?? 'stale',
        seoReviewState: persisted.seoReviewState ?? prev.seoReviewState,
        seoFieldStates: persisted.seoFieldStates ?? prev.seoFieldStates,
        draftRevision: persisted.draftRevision ?? prev.draftRevision,
      }));
      automaticValidation = {
        ...persisted,
        polishedDraft: result.nextText,
      };
      toast.success(tFeedbackWorkflow('appliedAutomaticQualityCheck'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the applied suggestion.');
      return false;
    } finally {
      workspaceMutationRef.current = false;
    }
    if (automaticValidation) {
      await runAutomaticPublicationValidation(automaticValidation);
    }
    return true;
  };

  const handleApplyAllFixes = async () => {
    if (hasBlockingWorkspaceOperation()) return;
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
      appliedIndexSet.has(index)
        ? {
            ...item,
            isApplied: true,
            isAccepted: false,
            isVerified: false,
          }
        : item
    );
    const nextReadiness: EditorialReadiness = 'needs_review';
    const nextFlags = analysis.flags || [];
    let automaticValidation: AutomaticValidationContext | null = null;
    workspaceMutationRef.current = true;
    try {
      const persisted = await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        result.nextText,
        nextFlags,
        'bulk_feedback'
      );
      const persistedFlags = persisted.readiness === 'ready' ? [] : nextFlags;
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: result.nextText,
        feedback: nextFeedback,
        readiness: persisted.readiness,
        verdict: persisted.readiness,
        flags: persistedFlags,
        publicationPackageStatus:
          persisted.publicationPackageStatus
          ?? (prev.publicationPackageStatus === 'current'
            ? 'stale'
            : prev.publicationPackageStatus),
        qualityGateState: persisted.qualityGateState ?? 'stale',
        seoReviewState: persisted.seoReviewState ?? prev.seoReviewState,
        seoFieldStates: persisted.seoFieldStates ?? prev.seoFieldStates,
        draftRevision: persisted.draftRevision ?? prev.draftRevision,
      }));
      automaticValidation = {
        ...persisted,
        polishedDraft: result.nextText,
      };
      if (result.failedIndexes.length > 0) {
        toast.warning(tFeedbackWorkflow('applyAllPartialAutomaticQualityCheck', {
          applied: result.appliedIndexes.length,
          remaining: result.failedIndexes.length,
        }));
      } else {
        toast.success(tFeedbackWorkflow('applyAllAutomaticQualityCheck', {
          count: result.appliedIndexes.length,
        }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save applied suggestions.');
    } finally {
      workspaceMutationRef.current = false;
    }
    if (automaticValidation) {
      await runAutomaticPublicationValidation(automaticValidation);
    }
  };

  const handleUndoLastEdit = () => {
    if (hasBlockingWorkspaceOperation()) return;
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
    if (hasBlockingWorkspaceOperation()) return;
    cancelBackgroundValidation();
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
    if (hasBlockingWorkspaceOperation()) return;
    const ctx = {
      researchNotes,
      attachments,
      metadata,
      directFetch,
      setDraft,
      setIsGeneratingDraftFromNotes,
      generateAbortControllerRef,
      duplicateGuardWarning: tContentMemory('relatedWarning'),
      suggestedAngleLabel: tContentMemory('suggestedAngle'),
      controlledBlockWarning: tContentMemory('controlledBlock'),
      continueAnywayLabel: tContentMemory('continueAnyway'),
      feedbackQuestion: tContentMemory('feedbackQuestion'),
      yesDuplicateLabel: tContentMemory('yesDuplicate'),
      notDuplicateLabel: tContentMemory('notDuplicate'),
      feedbackSaved: tContentMemory('feedbackSaved'),
      feedbackFailed: tContentMemory('feedbackFailed'),
    };
    executeGenerateDraftFromNotes(ctx);
  };

  const handleCancelGenerateDraft = () => {
    if (generateAbortControllerRef.current) {
      generateAbortControllerRef.current.abort();
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
    if (hasBlockingWorkspaceOperation()) return;
    cancelBackgroundValidation();
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
          qualityGateState: publicationState.qualityGateState,
          seoReviewState: publicationState.seoReviewState,
          seoFieldStates: publicationState.seoFieldStates,
          draftRevision: publicationState.draftRevision,
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
    flags: string[],
    origin: EditorialMutationOrigin
  ): Promise<EditorialResolutionResult> => {
    cancelBackgroundValidation();
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
        origin,
        revisionId: analysis.draftRevision?.revisionId,
        bodyHash: analysis.draftRevision?.bodyHash,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save the editorial decision.');
    }
    const persistedReadiness: EditorialReadiness =
      result.readiness === 'ready'
      || result.readiness === 'needs_review'
      || result.readiness === 'blocked'
        ? result.readiness
        : readiness;
    const persistedPublicationPackageStatus: PublicationPackageStatus | undefined =
      result.publicationPackageStatus === 'current'
      || result.publicationPackageStatus === 'stale'
      || result.publicationPackageStatus === 'not_generated'
        ? result.publicationPackageStatus
        : undefined;
    const persistedQualityGateState: RevisionValidationState | undefined =
      result.qualityGateState === 'valid'
      || result.qualityGateState === 'validation_recommended'
      || result.qualityGateState === 'stale'
        ? result.qualityGateState
        : undefined;
    const persistedSeoReviewState: SeoReviewState | undefined =
      result.seoReviewState === 'valid'
      || result.seoReviewState === 'possibly_stale'
      || result.seoReviewState === 'stale'
        ? result.seoReviewState
        : undefined;
    const persistedSeoFieldStates = parseSeoFieldStates(result.seoFieldStates);
    const persistedDraftRevision: DraftRevisionIdentity | undefined =
      result.draftRevision
      && typeof result.draftRevision.revisionId === 'string'
      && typeof result.draftRevision.bodyHash === 'string'
      && typeof result.draftRevision.createdAt === 'string'
        ? result.draftRevision as DraftRevisionIdentity
        : undefined;
    return {
      readiness: persistedReadiness,
      publicationPackageStatus: persistedPublicationPackageStatus,
      qualityGateState: persistedQualityGateState,
      seoReviewState: persistedSeoReviewState,
      seoFieldStates: persistedSeoFieldStates,
      draftRevision: persistedDraftRevision,
    };
  };

  const handleAcceptFeedback = async (index: number) => {
    if (
      !analysis.feedback
      || hasBlockingWorkspaceOperation()
    ) return;
    const nextFeedback = [...analysis.feedback];
    nextFeedback[index] = {
      ...nextFeedback[index],
      isAccepted: true,
    };
    const nextReadiness = calculateReadiness(nextFeedback, analysis.readiness);
    const nextFlags = nextReadiness === 'ready' ? [] : (analysis.flags || []);
    workspaceMutationRef.current = true;
    try {
      const persisted = await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        analysis.polishedDraft || '',
        nextFlags,
        'accept_feedback'
      );
      const persistedFlags = persisted.readiness === 'ready' ? [] : nextFlags;
      setAnalysis(prev => ({
        ...prev,
        feedback: nextFeedback,
        readiness: persisted.readiness,
        verdict: persisted.readiness,
        flags: persistedFlags,
        publicationPackageStatus:
          persisted.publicationPackageStatus ?? prev.publicationPackageStatus,
        draftRevision: persisted.draftRevision ?? prev.draftRevision,
      }));
      toast.success('Editorial decision saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the editorial decision.');
    } finally {
      workspaceMutationRef.current = false;
    }
  };

  const handleAddFeedbackSource = async (index: number, url: string): Promise<boolean> => {
    if (hasBlockingWorkspaceOperation()) return false;
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
    let automaticValidation: AutomaticValidationContext | null = null;
    workspaceMutationRef.current = true;
    try {
      const persisted = await persistEditorialResolution(
        nextFeedback,
        nextReadiness,
        nextDraft,
        nextFlags,
        'add_source'
      );
      const persistedFlags = persisted.readiness === 'ready' ? [] : nextFlags;
      setAnalysis(prev => ({
        ...prev,
        polishedDraft: nextDraft,
        feedback: nextFeedback,
        readiness: persisted.readiness,
        verdict: persisted.readiness,
        flags: persistedFlags,
        publicationPackageStatus:
          persisted.publicationPackageStatus
          ?? (nextDraft !== currentDraft && prev.publicationPackageStatus === 'current'
            ? 'stale'
            : prev.publicationPackageStatus),
        qualityGateState: persisted.qualityGateState ?? prev.qualityGateState,
        seoReviewState: persisted.seoReviewState ?? prev.seoReviewState,
        seoFieldStates: persisted.seoFieldStates ?? prev.seoFieldStates,
        draftRevision: persisted.draftRevision ?? prev.draftRevision,
      }));
      if (linked) {
        automaticValidation = {
          ...persisted,
          polishedDraft: nextDraft,
        };
      }
      toast.success(
        linked
          ? tFeedbackWorkflow('sourceAddedAutomaticQualityCheck')
          : tFeedbackWorkflow('sourceSavedWithoutDraftChange')
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the source.');
      return false;
    } finally {
      workspaceMutationRef.current = false;
    }
    if (automaticValidation) {
      await runAutomaticPublicationValidation(automaticValidation);
    }
    return true;
  };

  const handleTargetedFix = async (index: number, actionType: 'remove' | 'fix') => {
    if (hasBlockingWorkspaceOperation()) return;
    const item = analysis.feedback?.[index];
    if (
      actionType === 'fix'
      && item
      && !item.targetText?.trim()
      && isTargetedFixing === null
    ) {
      const instruction = [
        'Resolve only this remaining editorial finding in the current final draft.',
        `Finding: ${item.message}`,
        item.suggestion ? `Required next action: ${item.suggestion}` : '',
        item.reason ? `Editorial reason: ${item.reason}` : '',
        'Preserve unrelated wording, facts, sources, structure, and publication intent.',
      ].filter(Boolean).join('\n');

      setIsTargetedFixing(index);
      try {
        await handleRefineAgain(instruction, analysis.polishedDraft, true);
      } finally {
        setIsTargetedFixing(null);
      }
      return;
    }

    const ctx = {
      analysis,
      isTargetedFixing,
      setIsTargetedFixing,
      directFetch,
      analysisSpeed,
      metadata,
      originalDraft: sourceDraft,
      researchNotes,
      attachments,
      persistEditorialResolution,
      bodyChangeSuccessMessage: actionType === 'remove'
        ? tFeedbackWorkflow('removedAutomaticQualityCheck')
        : tFeedbackWorkflow('fixedAutomaticQualityCheck'),
      setAnalysis,
      analyzeAbortControllerRef,
    };
    const result = await executeTargetedFix(ctx, index, actionType);
    if (result) {
      await runAutomaticPublicationValidation(result);
    }
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
    isAiBusy,

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
