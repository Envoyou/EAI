'use client';

import { useState, useEffect, useRef } from 'react';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MotionConfig } from 'framer-motion';
import {
  RotateCcw,
  Sparkles,
  Lock,
  Menu,
  Zap,
  Rocket,
  Cloud,
  CloudUpload,
  History,
  FileEdit,
} from 'lucide-react';

import ThreeColumnLayout from '@/components/ThreeColumnLayout';
import EditorCanvas from '@/components/EditorCanvas';
import AICopilotPanel from '@/components/AICopilotPanel';
import { EditorWorkflowPanel } from '@/components/EditorWorkflowPanel';
import { PublicationSeoPanel } from '@/components/PublicationSeoPanel';
import { AppSidebarShell, type WorkspacePage } from '@/components/AppSidebarShell';
import ShortcutsModal from '@/components/ShortcutsModal';
import { InPlaceRefineFeedbackModal } from '@/components/InPlaceRefineFeedbackModal';
import { EAILogo } from '@/components/EAILogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssistantChatIcon, RefineDraftIcon } from '@/components/ui/icons/ai';
import { CancelActionIcon } from '@/components/ui/icons/actions';
import { DocumentIcon } from '@/components/ui/icons/content';

import { useEditorialWorkspace } from '@/workspace/useEditorialWorkspace';
import { editorStatusBadgeVariant, isCandidatePendingReview, deriveHandoffDestination } from '@/workspace/utils';
import type { EditorHandoffState } from '@/workspace/types';

export default function EditorialWorkspace({
  mode,
  stage = 'editor',
  startNewDraft = false,
  initialHistoryId,
  initialTitle,
  initialBrief,
}: {
  mode: 'demo' | 'workspace';
  stage?: 'editor' | 'review' | 'publication';
  startNewDraft?: boolean;
  initialHistoryId?: string;
  initialTitle?: string;
  initialBrief?: string;
}) {
  const router = useRouter();
  const tWorkspace = useTranslations('WorkspaceShell');
  const tEditor = useTranslations('EditorWorkflow');
  const workspace = useEditorialWorkspace({ mode, startNewDraft });

  const {
    workspaceChecking,
    editorialOptions,
    draft,
    setDraft,
    metadata,
    setMetadata,
    analysis,
    activeHistoryId,
    draftHistory,
    sourceDraft,
    isStreaming,
    isRefining,
    processStage,
    processStartedAt,
    isDemoMode,
    demoRefineCount,
    setDemoRefineCount,
    activeTab,
    setActiveTab,
    isMobile,
    mobileViewTab,
    setMobileViewTab,
    isShortcutModalOpen,
    setIsShortcutModalOpen,
    hoveredFeedbackIndex,
    setHoveredFeedbackIndex,
    activeFeedbackIndex,
    setActiveFeedbackIndex,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    editorHandoff,
    setEditorHandoff,
    showMissingSourcesModal,
    setShowMissingSourcesModal,
    missingSources,
    researchNotes,
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
    wordCount,
    charCount,
    MAX_TEXT_LENGTH,
    hasResult,
    showFeedbackSidebar,
    showNotesSidebar,
    hasNotes,
    handleCloudSave,
    handleNotesChange,
    handleAnalyze,
    handleReanalyze,
    handleSaveFinalDraft,
    handleQualityCheck,
    handleRegenerateSeo,
    handleSavePublicationMetadata,
    handleApplyPublicationFix,
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
  } = workspace;

  const showDemoSignupModal = demoRefineCount >= 3;
  const initialContentMapNavigationHandled = useRef(false);
  const currentPage = stage as WorkspacePage;
  const effectiveActiveTab = (stage === 'review' || stage === 'publication') ? 'refined' : activeTab;
  const [dismissedHandoffId, setDismissedHandoffId] = useState<string | null>(null);

  const isCandidatePending = isCandidatePendingReview(analysis, {
    isStreaming,
    isRefining,
  });

  const completedAnalysisLogId = editorHandoff?.analysisLogId ?? analysis.analysisLogId;
  const previousIsRefining = useRef(isRefining);
  const [lastCompletedRefineRunId, setLastCompletedRefineRunId] = useState<string | null>(null);

  useEffect(() => {
    if (previousIsRefining.current && !isRefining) {
      if (analysis.status === 'success' && analysis.analysisLogId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLastCompletedRefineRunId(analysis.analysisLogId);
      }
    }
    previousIsRefining.current = isRefining;
  }, [isRefining, analysis.status, analysis.analysisLogId]);

  const hasCompletedReadyCandidate = Boolean(
    analysis.polishedDraft?.trim() &&
    analysis.status === 'success' &&
    analysis.readiness === 'ready' &&
    completedAnalysisLogId &&
    !isStreaming &&
    !isRefining
  );

  const isRecentlyCompleted = lastCompletedRefineRunId === completedAnalysisLogId;

  const resolvedEditorHandoff = editorHandoff ?? (
    hasCompletedReadyCandidate && isRecentlyCompleted
      ? {
          analysisLogId: completedAnalysisLogId,
          destination: deriveHandoffDestination({
            readiness: analysis.readiness || 'needs_review',
            hasPublicationPackage: analysis.publicationPackageStatus === 'current'
          }),
          unresolvedFindingCount: 0,
          blockingFindingCount: 0,
          hasSeoPackage: analysis.publicationPackageStatus === 'current',
          readiness: analysis.readiness,
          status: analysis.status,
          generatedMetadata: analysis.generatedMetadata,
          publicationPackageStatus: analysis.publicationPackageStatus,
          feedback: analysis.feedback || [],
          recovered: true
        } as unknown as EditorHandoffState
      : null
  );

  const showInPlaceModal = Boolean(
    stage === 'editor' &&
    resolvedEditorHandoff &&
    !isCandidatePending &&
    dismissedHandoffId !== resolvedEditorHandoff.analysisLogId
  );

  useEffect(() => {
    if (workspaceChecking || isDemoMode) return;
    setActiveTab(effectiveActiveTab);
    if (stage === 'review') {
      setRightPanelTab('feedback');
      setRightPanelOpen(true);
    }
    if (stage === 'editor') setRightPanelOpen(false);
    if (stage === 'publication') setRightPanelOpen(true);
  }, [effectiveActiveTab, isDemoMode, setActiveTab, setRightPanelOpen, setRightPanelTab, stage, workspaceChecking]);

  useEffect(() => {
    if (
      workspaceChecking ||
      initialContentMapNavigationHandled.current
    ) {
      return;
    }
    initialContentMapNavigationHandled.current = true;
    if (startNewDraft) {
      handleNewDraft();
      router.replace('/editor', { scroll: false });
      return;
    }
    if (initialHistoryId) {
      void loadHistory(initialHistoryId);
      return;
    }
    if (initialTitle || initialBrief) {
      setMetadata((current) => ({
        ...current,
        ...(initialTitle ? { workingTitle: initialTitle } : {}),
        ...(initialBrief ? { brief: initialBrief } : {}),
      }));
    }
  }, [
    initialBrief,
    initialHistoryId,
    initialTitle,
    handleNewDraft,
    loadHistory,
    router,
    setMetadata,
    startNewDraft,
    workspaceChecking,
  ]);

  const setShowDemoSignupModal = (show: boolean) => {
    setDemoRefineCount(show ? 3 : 0);
  };

  if (workspaceChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <EAILoaderStatusIcon className="h-6 w-6 text-primary" />
      </div>
    );
  }

  const renderHeader = () => (
    <header
      className="ide-titlebar max-w-full min-w-0 max-sm:h-14 max-sm:px-3 max-sm:gap-2 [container-type:inline-size]"
      role="banner"
    >
          {/* Left Side: Active Document Path */}
          <div className="titlebar-path flex min-w-0 shrink-0 items-center gap-2 select-none">
            {!leftPanelOpen && !isDemoMode && (
              <Button
                type="button"
                onClick={() => setLeftPanelOpen(true)}
                variant="ghost"
                size="icon-xs"
                className="mr-2 -ml-1.5 hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] md:hidden"
                aria-label="Open Sidebar"
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            {isDemoMode ? (
              <>
                <span className="titlebar-workspace text-sm font-bold text-[var(--foreground)] tracking-tight">EAI</span>
                <Badge variant="surface" size="xs" className="ml-1 font-semibold tracking-wide uppercase">
                  Try Demo
                </Badge>
              </>
            ) : (
              <>
                <span className="titlebar-workspace text-sm font-semibold text-[var(--foreground)]">{tWorkspace('workspace')}</span>
                <span className="text-[11px] text-[var(--muted-foreground)]">/</span>
                <span className="titlebar-current truncate text-[13px] font-medium text-[var(--muted-foreground)]">
                  {stage === 'editor'
                    ? tWorkspace('draftArticle')
                    : stage === 'review'
                      ? tWorkspace('draftReview')
                      : tWorkspace('finalDraft')}
                </span>
              </>
            )}
            {analysis.editorStatus && (() => {
              const statusKeyMap: Record<string, 'statusDraft' | 'statusReview' | 'statusReady' | 'statusFinal' | 'statusError'> = {
                draft: 'statusDraft',
                review: 'statusReview',
                ready: 'statusReady',
                final: 'statusFinal',
                error: 'statusError',
              };
              const key = statusKeyMap[analysis.editorStatus];
              return (
                <Badge variant={editorStatusBadgeVariant(analysis.editorStatus)} size="xs" className="ml-1 capitalize">
                  {key ? tWorkspace(key) : analysis.editorStatus}
                </Badge>
              );
            })()}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Global Actions */}
          <div className="titlebar-actions flex shrink-0 items-center gap-1.5 min-w-0">
            {/* Undo */}
            {!isDemoMode && stage === 'editor' && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      id="titlebar-undo"
                      onClick={handleUndoLastEdit}
                      disabled={draftHistory.length === 0 || analysis.status === 'loading'}
                      variant="muted"
                      size="sm"
                      aria-label="Undo last edit"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden @[560px]:inline">{tWorkspace('undoAction')}</span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {tWorkspace('undoTooltip')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Cloud Save */}
            {!isDemoMode && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    activeHistoryId ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--muted-foreground)] bg-[var(--surface-2)]/45 border border-[var(--border)]/75 rounded-full select-none">
                        {isSavingToCloud ? (
                          <>
                            <EAILoaderStatusIcon className="w-3.5 h-3.5 text-[var(--primary)]" />
                            <span className="hidden @[640px]:inline">{tWorkspace('savingToCloud')}</span>
                          </>
                        ) : (
                          <>
                            <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="hidden @[640px]:inline">{tWorkspace('savedToCloud')}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleCloudSave}
                        disabled={isSavingToCloud}
                        variant="muted"
                        size="sm"
                        className="text-[var(--primary)] border-[var(--primary)]/20"
                      >
                        {isSavingToCloud ? (
                          <EAILoaderStatusIcon className="w-3.5 h-3.5" />
                        ) : (
                          <CloudUpload className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden @[640px]:inline">{tWorkspace('saveToCloudAction')}</span>
                      </Button>
                    )
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {activeHistoryId
                    ? tWorkspace('autosaveActiveTooltip')
                    : tWorkspace('manualSaveTooltip')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Adaptive Mode Selector (desktop popover, mobile bottom sheet) */}
            {stage === 'editor' && <div>
              <Select
                value={analysisSpeed}
                onValueChange={(val) => {
                  if (val === 'publish' && isDemoMode) {
                    setShowDemoSignupModal(true);
                    return;
                  }
                  setAnalysisSpeed(val as 'fast' | 'publish');
                }}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <SelectTrigger
                        aria-label="Select analysis mode"
                        className="h-8 w-auto gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] shadow-xs cursor-pointer hover:bg-[var(--surface-2)] md:px-3"
                      >
                        <SelectValue>
                          {analysisSpeed === 'fast' ? (
                            <span className="flex items-center gap-1.5 font-bold">
                              <Zap className="w-3.5 h-3.5 text-[var(--foreground)] md:text-[var(--warning)] shrink-0" />
                              <span className="hidden md:inline">{tWorkspace('fastReviewMode')}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 font-bold">
                              {isDemoMode ? (
                                <Lock className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
                              ) : (
                                <Rocket className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                              )}
                              <span className="hidden md:inline">{tWorkspace('publishReadyMode')}</span>
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    {tWorkspace('changeModeTooltip')}
                  </TooltipContent>
                </Tooltip>
                <SelectContent className="z-50 bg-[var(--popover)] border border-[var(--border)] shadow-xl rounded-xl p-1 min-w-[220px]">
                  <SelectItem value="fast" className="flex items-start gap-2.5 px-3 py-2 text-xs rounded-lg cursor-pointer hover:bg-[var(--surface-2)]">
                    <Zap className="w-4 h-4 text-[var(--foreground)] shrink-0 mt-0.5" />
                    <div className="flex flex-col">
                      <span className="font-bold text-[var(--foreground)]">{tWorkspace('fastReviewMode')}</span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">{tWorkspace('fastReviewDesc')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="publish" className="flex items-start gap-2.5 px-3 py-2 text-xs rounded-lg cursor-pointer hover:bg-[var(--surface-2)]">
                    {isDemoMode ? (
                      <Lock className="w-4 h-4 text-[var(--muted-foreground)] shrink-0 mt-0.5" />
                    ) : (
                      <Rocket className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-[var(--foreground)] flex items-center gap-1.5">
                        {tWorkspace('publishReadyMode')}
                        {isDemoMode && <Badge variant="surface" size="xs">{tWorkspace('demoProBadge')}</Badge>}
                      </span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">{tWorkspace('publishReadyDesc')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>}

            {/* Refine Draft CTA */}
            {stage === 'editor' && !editorHandoff && <Tooltip>
              <TooltipTrigger
                render={
                  <ActionButton
                    type="button"
                    id="titlebar-refine"
                    onClick={() => {
                      if (isAiBusy) {
                        handleCancelAnalysis();
                      } else {
                        handleAnalyze();
                      }
                    }}
                    disabled={!draft.trim() && !isAiBusy}
                    variant="primary"
                    size="sm"
                    className={activeTab !== 'draft' && !isAiBusy ? 'max-sm:hidden' : ''}
                    icon={
                      isAiBusy
                        ? CancelActionIcon
                        : RefineDraftIcon
                    }
                    label={
                      isAiBusy
                        ? tWorkspace('cancelAiAction')
                        : tWorkspace('refineDraftAction')
                    }
                    labelClassName="hidden @[560px]:inline"
                  />
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {isAiBusy ? tWorkspace('cancelAiTooltip') : tWorkspace('refineDraftTooltip', { shortcut: 'Ctrl+Enter' })}
              </TooltipContent>
            </Tooltip>}
          </div>

          {/* Demo CTAs */}
          {isDemoMode && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-[var(--border)]">
              <Button
                type="button"
                onClick={() => router.push('/login')}
                variant="ghost"
                size="sm"
                className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2"
              >
                Login
              </Button>
              <Button type="button" onClick={() => router.push('/signup')} variant="primary" size="sm" className="text-xs px-3">
                Start Free
              </Button>
            </div>
          )}
        </header>
  );

  const renderEditorSurface = () => (
    <EditorCanvas
      draft={draft}
      onDraftChange={setDraft}
      metadata={metadata}
      onMetadataChange={setMetadata}
      analysis={analysis}
      sourceDraft={sourceDraft}
      editorialOptions={editorialOptions}
      activeTab={isDemoMode ? activeTab : effectiveActiveTab}
      onTabChange={setActiveTab}
      workspaceStage={stage}
      isGeneratingDraft={isGeneratingDraftFromNotes}
      isCandidatePendingReview={isCandidatePending}
      isAiBusy={isAiBusy || (stage === 'editor' && Boolean(editorHandoff))}
      hasResult={hasResult}
      sidebarOpen={leftPanelOpen}
      onToggleSidebar={() => setLeftPanelOpen(current => !current)}
      showFeedbackSidebar={showFeedbackSidebar}
      onToggleFeedbackSidebar={() => setRightPanelOpen(current => !current)}
      onOpenFeedbackSidebar={() => {
        setRightPanelOpen(true);
        setRightPanelTab('feedback');
        if (isMobile) setMobileViewTab('copilot');
      }}
      showNotesSidebar={showNotesSidebar}
      onToggleNotesSidebar={() => {
        setRightPanelOpen(current => !current);
        setRightPanelTab('notes');
      }}
      hasNotes={hasNotes}
      isDemoMode={isDemoMode}
      wordCount={wordCount}
      charCount={charCount}
      charLimit={MAX_TEXT_LENGTH}
      hoveredFeedbackIndex={hoveredFeedbackIndex}
      activeFeedbackIndex={activeFeedbackIndex}
      onActiveFeedbackChange={setActiveFeedbackIndex}
      isStreaming={isStreaming}
      isRefining={isRefining}
      processStage={processStage}
      processStartedAt={processStartedAt}
      includeSeoStage={analysisSpeed !== 'fast'}
      onAnalyze={handleAnalyze}
      onRefineAgain={handleRefineAgain}
      onReanalyze={handleReanalyze}
      onSaveFinalDraft={handleSaveFinalDraft}
      onQualityCheck={handleQualityCheck}
      onRegenerateSeo={handleRegenerateSeo}
      onPrepareForExport={handlePrepareForExport}
      isSavingFinalDraft={isSavingFinalDraft}
      isCheckingQuality={isCheckingQuality}
      isGeneratingSeo={isGeneratingSeo}
      onAddNewMetadataOption={handleAddNewCategoryOrType}
      onOpenShortcuts={() => setIsShortcutModalOpen(true)}
      layoutReversed={false}
      onAcceptFeedback={handleAcceptFeedback}
      onApplyFix={handleApplyFix}
      onApplyPublicationFix={handleApplyPublicationFix}
      onRemoveFeedbackAddition={index => handleTargetedFix(index, 'remove')}
      onAddFeedbackSource={handleAddFeedbackSource}
      onFixFeedbackWithEAI={index => handleTargetedFix(index, 'fix')}
      onApplyAllFixes={handleApplyAllFixes}
    />
  );

  const renderContextPanel = () => {
    if (stage === 'publication') {
      return (
        <PublicationSeoPanel
          metadata={analysis.generatedMetadata}
          onSave={handleSavePublicationMetadata}
          onConfirm={handleConfirmPublicationMetadata}
          publicationPackageStatus={analysis.publicationPackageStatus}
          qualityGateState={analysis.qualityGateState}
          seoReviewState={analysis.seoReviewState}
          seoFieldStates={analysis.seoFieldStates}
          isChecking={isCheckingQuality && !isAiBusy}
        />
      );
    }

    if (stage === 'editor' && (isStreaming || editorHandoff)) {
      return (
        <EditorWorkflowPanel
          isProcessing={isStreaming}
          processStage={processStage}
          processStartedAt={processStartedAt}
          includeSeoStage={analysisSpeed !== 'fast'}
          handoff={editorHandoff}
          onOpenDestination={() => {
            if (!editorHandoff) return;
            router.push(`/${editorHandoff.destination}?history=${encodeURIComponent(editorHandoff.analysisLogId)}`);
          }}
          onFinishLater={() => router.push('/workspace')}
          onContinueEditing={() => {
            setEditorHandoff(null);
            setRightPanelOpen(false);
            if (isMobile) setMobileViewTab('editor');
          }}
        />
      );
    }

    return <AICopilotPanel
      key={activeHistoryId || 'new'}
      activeTab={stage === 'review' ? 'feedback' : rightPanelTab}
      onTabChange={setRightPanelTab}
      allowedTabs={stage === 'review' ? ['feedback'] : ['strategist', 'notes', 'deep_report']}
      panelTitle={stage === 'review' ? tWorkspace('evaluationPanel') : undefined}
      activeHistoryId={activeHistoryId}
      onStrategistComplete={(topic, outline, draftVal, notes, wizardAttachments, sourceRef) => {
        setDraft(draftVal || outline || topic);
        if (sourceRef) {
          setMetadata(current => ({
            ...current,
            sourceRef: current.sourceRef ?? sourceRef,
          }));
        }
        if (notes && notes.length > 0) handleNotesChange(notes);
        if (wizardAttachments && wizardAttachments.length > 0) setAttachments(wizardAttachments);
      }}
      feedbackResult={hasResult || analysis.status === 'loading' ? analysis : null}
      feedbackTitle={(analysis.generatedMetadata?.title || analysis.workingTitle) as string | undefined}
      onApplyFix={handleApplyFix}
      onApplyPublicationFix={handleApplyPublicationFix}
      onApplyAll={handleApplyAllFixes}
      hoveredFeedbackIndex={hoveredFeedbackIndex}
      onHoveredFeedbackChange={setHoveredFeedbackIndex}
      activeFeedbackIndex={activeFeedbackIndex}
      onActiveFeedbackChange={setActiveFeedbackIndex}
      isProcessing={isStreaming || isRefining}
      processStage={processStage}
      processStartedAt={processStartedAt}
      includeSeoStage={analysisSpeed !== 'fast'}
      isRefining={isRefining}
      onAcceptFeedback={handleAcceptFeedback}
      onRemoveFeedbackAddition={index => handleTargetedFix(index, 'remove')}
      onAddFeedbackSource={handleAddFeedbackSource}
      onFixFeedbackWithEAI={index => handleTargetedFix(index, 'fix')}
      isTargetedFixing={isTargetedFixing}
      researchNotes={researchNotes}
      onNotesChange={handleNotesChange}
      onGenerateDraftFromNotes={handleGenerateDraftFromNotes}
      isGeneratingDraft={isGeneratingDraftFromNotes}
      isWorkspaceAiBusy={isAiBusy}
      onCancelGenerateDraft={handleCancelGenerateDraft}
      onInsertToDraft={text => setDraft(previous => previous + text)}
      onToggleSidebar={() => setRightPanelOpen(false)}
    />;
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="workspace-page-shell">
        <div className="workspace-page-body">
          {/* ── Body: Three Column Layout or Mobile Tab View ── */}
          <div className="flex flex-1 min-w-0 h-full overflow-hidden relative workspace-multi-island">
            {isMobile ? (
              <div className="flex flex-col flex-1 min-h-0 pb-16 relative bg-[var(--background)] mobile-workspace-container">
                {renderHeader()}
                {leftPanelOpen && !isDemoMode && (
                  <div className="fixed inset-0 z-[120] bg-[var(--background)]">
                    <AppSidebarShell
                      sidebarOpen
                      onToggleSidebar={() => setLeftPanelOpen(false)}
                      currentPage={currentPage}
                    />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden w-full max-w-full overflow-x-hidden">
                  {mobileViewTab === 'copilot'
                    ? renderContextPanel()
                    : renderEditorSurface()}
                </div>

              {/* Bottom Tab Bar Navigation for Mobile */}
              <div className="fixed bottom-0 left-0 right-0 h-16 border-t border-[var(--border)] bg-[var(--surface-1)] flex items-center justify-around z-[100] px-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                {!isDemoMode && stage === 'editor' && (
                  <Button
                    type="button"
                    onClick={() => router.push('/workspace')}
                    variant="muted"
                    className="workspace-mobile-nav-action flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    <History className="w-5 h-5" />
                    <span>{tWorkspace('savedArticles')}</span>
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => setMobileViewTab('editor')}
                  variant="muted"
                  className="workspace-mobile-nav-action flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer"
                  aria-pressed={mobileViewTab === 'editor'}
                >
                  <FileEdit className="w-5 h-5" />
                  <span>{stage === 'review' ? tWorkspace('draftReview') : tWorkspace('draftArticle')}</span>
                </Button>
                <ActionButton
                  type="button"
                  onClick={() => setMobileViewTab('copilot')}
                  variant="muted"
                  className="workspace-mobile-nav-action flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer"
                  aria-pressed={mobileViewTab === 'copilot'}
                  icon={stage === 'publication' ? DocumentIcon : AssistantChatIcon}
                  iconClassName="w-5 h-5"
                  label={stage === 'publication'
                    ? tWorkspace('seoPack')
                    : stage === 'review'
                      ? tWorkspace('findings')
                      : tWorkspace('tools')}
                />
              </div>
            </div>
          ) : (
            <ThreeColumnLayout
              leftPanelOpen={leftPanelOpen && !isDemoMode}
              rightPanelOpen={rightPanelOpen}
              reversed={false}
              rightDefaultSize={stage === 'review' ? 32 : stage === 'publication' ? 30 : 28}
              leftResizable={stage === 'editor' || Boolean(initialHistoryId || activeHistoryId)}
              leftPanel={
                !isDemoMode ? (
                  <AppSidebarShell
                    sidebarOpen={leftPanelOpen}
                    onToggleSidebar={() => setLeftPanelOpen(current => !current)}
                    currentPage={currentPage}
                    style={{ width: '100%', minWidth: 0 }}
                  />
                ) : null
              }
              centerPanel={
                <div className="flex flex-col h-full overflow-hidden">
                  {renderHeader()}
                  {renderEditorSurface()}
                </div>
              }
              rightPanel={renderContextPanel()}
            />
          )}

          {/* Bottom-Right Floating Trigger Button (when AI Copilot Panel is hidden) */}
          {stage !== 'publication' && !rightPanelOpen && (
            <div className="fixed right-5 top-1/2 z-40 -translate-y-1/2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ActionButton
                      type="button"
                      onClick={() => setRightPanelOpen(true)}
                      variant="primary"
                      size="icon"
                      className="rounded-full border border-[var(--border)] shadow-sm"
                      aria-label={tWorkspace('openTools')}
                      icon={EAILogo}
                      iconClassName="size-[18px] shrink-0"
                      label={tWorkspace('tools')}
                      labelClassName="sr-only"
                    />
                  }
                />
                <TooltipContent side="top" className="text-xs font-medium">
                  {tWorkspace('openTools')}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        <ShortcutsModal isOpen={isShortcutModalOpen} onClose={() => setIsShortcutModalOpen(false)} />

        {/* Demo Signup Modal */}
        {showDemoSignupModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowDemoSignupModal(false)}
          >
            <div
              className="relative bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-7"
              onClick={e => e.stopPropagation()}
              style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}
            >
              {/* Close */}
              <Button
                type="button"
                onClick={() => setShowDemoSignupModal(false)}
                variant="ghost"
                size="icon-xs"
                className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-colors border-none p-0"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </Button>

              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-[var(--primary)]" />
              </div>

              {/* Copy */}
              <h2 className="text-base font-bold text-[var(--foreground)] mb-1.5">{tEditor('demoSignupTitle')}</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-1 leading-relaxed">
                {tEditor('demoSignupSubtitle')}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]/70 mb-6">
                {tEditor('demoSignupNotice')}
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                <Button
                  type="button"
                  onClick={() => router.push('/signup')}
                  variant="primary"
                  className="w-full justify-center py-2.5 text-sm font-semibold"
                >
                  {tEditor('demoSignupStartFree')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowDemoSignupModal(false)}
                  variant="ghost"
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-center py-1 transition-colors border-none w-full"
                >
                  {tEditor('demoSignupMaybeLater')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Missing Sources Warning Modal */}
        {showMissingSourcesModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => handleProceedRefinement({ restore: false })}
          >
            <div
              className="relative bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-md w-full mx-4 p-7"
              onClick={e => e.stopPropagation()}
              style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}
            >
              {/* Close */}
              <Button
                type="button"
                onClick={() => setShowMissingSourcesModal(false)}
                variant="ghost"
                size="icon-xs"
                className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-colors border-none p-0"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </Button>

              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <svg
                  className="w-5 h-5 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>

              {/* Copy */}
              <h2 className="text-base font-bold text-[var(--foreground)] mb-1.5">{tEditor('missingSourcesTitle')}</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-3 leading-relaxed">
                {tEditor('missingSourcesDescription')}
              </p>

              {/* List of missing domains */}
              <div className="max-h-28 overflow-y-auto bg-[var(--surface-2)] rounded-lg p-3 mb-6 flex flex-col gap-1 border border-[var(--border)]">
                {missingSources.map((src, idx) => (
                  <div key={idx} className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 truncate">
                    <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-semibold text-[var(--foreground)] shrink-0">{src.domain || tEditor('sourceLabel')}:</span>
                    <span className="truncate">{src.url}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <Button
                  type="button"
                  onClick={() => handleProceedRefinement({ restore: true })}
                  variant="primary"
                  className="flex-1 justify-center py-2.5 text-sm font-semibold"
                >
                  {tEditor('missingSourcesRestore')}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleProceedRefinement({ restore: false })}
                  variant="outline"
                  className="flex-1 justify-center py-2.5 text-sm font-semibold text-amber-500 hover:text-amber-600 hover:bg-amber-50 border-amber-200"
                >
                  {tEditor('missingSourcesRefineAnyway')}
                </Button>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-[var(--border)]">
                <Button
                  type="button"
                  onClick={() => setShowMissingSourcesModal(false)}
                  variant="ghost"
                  className="w-full text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] justify-center py-2 border-none"
                >
                  {tEditor('missingSourcesCancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <InPlaceRefineFeedbackModal
          open={showInPlaceModal}
          onOpenChange={(open) => {
            if (!open && resolvedEditorHandoff) {
              setDismissedHandoffId(resolvedEditorHandoff.analysisLogId);
            }
          }}
          destination={resolvedEditorHandoff?.destination}
          onViewResults={() => {
            if (resolvedEditorHandoff) {
              router.push(`/${resolvedEditorHandoff.destination}?history=${encodeURIComponent(resolvedEditorHandoff.analysisLogId)}`);
            } else if (analysis.analysisLogId) {
              router.push(`/review?history=${encodeURIComponent(analysis.analysisLogId)}`);
            }
          }}
          onStayInEditor={() => {
            setActiveTab('refined');
          }}
        />
      </div>
    </div>
  </MotionConfig>
  );
}
