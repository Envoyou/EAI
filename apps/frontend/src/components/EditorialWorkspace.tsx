'use client';

import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import {
  Loader2,
  RotateCcw,
  Sparkles,
  Megaphone,
  Lock,
  Menu,
  Zap,
  Rocket,
  Cloud,
  CloudUpload,
  History,
  FileEdit,
} from 'lucide-react';

import DocumentHistoryPanel from '@/components/DocumentHistoryPanel';
import ThreeColumnLayout from '@/components/ThreeColumnLayout';
import EditorCanvas from '@/components/EditorCanvas';
import AICopilotPanel from '@/components/AICopilotPanel';
import ShortcutsModal from '@/components/ShortcutsModal';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useEditorialWorkspace } from '@/workspace/useEditorialWorkspace';
import { editorStatusBadgeClass } from '@/workspace/utils';

export default function EditorialWorkspace({ mode }: { mode: 'demo' | 'workspace' }) {
  const router = useRouter();
  const workspace = useEditorialWorkspace({ mode });

  const {
    workspaceChecking,
    editorialOptions,
    draft,
    setDraft,
    metadata,
    setMetadata,
    analysis,
    activeHistoryId,
    refreshTrigger,
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
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    layoutReversed,
    setLayoutReversed,
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
    handleAddFeedbackSource,
    handleTargetedFix,
    handleProceedRefinement,
  } = workspace;

  const showDemoSignupModal = demoRefineCount >= 3;
  const setShowDemoSignupModal = (show: boolean) => {
    setDemoRefineCount(show ? 3 : 0);
  };

  if (workspaceChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="flex flex-col h-screen overflow-hidden relative"
        style={{ background: 'var(--background)' }}
      >
        {/* ── Title Bar ── */}
        <header
          className="ide-titlebar max-sm:h-14 max-sm:px-3 max-sm:gap-2 border-b border-[var(--border)]"
          role="banner"
          style={{ background: 'var(--surface-1)' }}
        >
          {/* Left Side: Active Document Path */}
          <div className="titlebar-path flex min-w-0 shrink-0 items-center gap-2 select-none">
            {!rightPanelOpen && !isDemoMode && (
              <button
                onClick={() => setRightPanelOpen(true)}
                className="mr-2 p-1.5 -ml-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] md:hidden"
                aria-label="Open Sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            {isDemoMode ? (
              <>
                <span className="titlebar-workspace text-sm font-bold text-[var(--foreground)] tracking-tight">EAI</span>
                <span className="ui-badge ui-badge-surface ui-badge-xs ml-1 font-semibold tracking-wide uppercase">
                  Try Demo
                </span>
              </>
            ) : (
              <>
                <span className="titlebar-workspace text-sm font-semibold text-[var(--foreground)]">Workspace</span>
                <span className="text-[11px] text-[var(--muted-foreground)]">/</span>
                <span className="titlebar-current truncate text-[13px] font-medium text-[var(--muted-foreground)]">
                  {activeTab === 'draft' ? 'Draft Article' : 'Refined Draft'}
                </span>
              </>
            )}
            {analysis.editorStatus && (
              <span className={`ui-badge ui-badge-xs ml-1 capitalize ${editorStatusBadgeClass(analysis.editorStatus)}`}>
                {analysis.editorStatus}
              </span>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Global Actions */}
          <div className="titlebar-actions flex items-center gap-1.5">
            {/* What's New */}
            {!isDemoMode && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <a
                      id="titlebar-whats-new"
                      href="https://envoyou.com/changelog"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-btn ui-btn-muted ui-btn-sm no-underline"
                    >
                      <Megaphone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">What&apos;s New</span>
                    </a>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  View latest platform updates
                </TooltipContent>
              </Tooltip>
            )}

            {/* Undo */}
            {!isDemoMode && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      id="titlebar-undo"
                      onClick={handleUndoLastEdit}
                      disabled={draftHistory.length === 0 || analysis.status === 'loading'}
                      className="ui-btn ui-btn-muted ui-btn-sm"
                      aria-label="Undo last edit"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden sm:inline">Undo</span>
                    </button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  Undo last edit
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
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="hidden sm:inline">Saved to Cloud</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={handleCloudSave}
                        disabled={isSavingToCloud}
                        className="ui-btn ui-btn-muted ui-btn-sm text-[var(--primary)] border-[var(--primary)]/20 hover:bg-[var(--primary)]/10"
                      >
                        {isSavingToCloud ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CloudUpload className="w-3.5 h-3.5" />
                        )}
                        <span>Save to Cloud</span>
                      </button>
                    )
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {activeHistoryId
                    ? 'Autosave is active. Edits sync to database automatically.'
                    : 'Save this draft and notes to the cloud database to work on other devices.'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Mode Selector */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAnalysisSpeed('fast')}
                      className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[13px] font-[550] transition-colors border-none bg-transparent cursor-pointer rounded-md ${
                        analysisSpeed === 'fast'
                          ? 'text-[var(--foreground)]'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Fast</span>
                      {analysisSpeed === 'fast' && (
                        <div className="absolute -bottom-[5px] left-2 right-2 h-[2px] bg-[var(--primary)] rounded-t-sm" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (isDemoMode) {
                          setShowDemoSignupModal(true);
                          return;
                        }
                        setAnalysisSpeed('publish');
                      }}
                      className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[13px] font-[550] transition-colors border-none bg-transparent cursor-pointer rounded-md ${
                        analysisSpeed === 'publish'
                          ? 'text-[var(--foreground)]'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      {isDemoMode ? (
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Rocket className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden md:inline">Publish</span>
                      {analysisSpeed === 'publish' && (
                        <div className="absolute -bottom-[5px] left-2 right-2 h-[2px] bg-[var(--primary)] rounded-t-sm" />
                      )}
                    </button>
                  </div>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {analysisSpeed === 'fast'
                  ? 'Fast Review: Quick and cost-efficient. Skips SEO generation and internal link lookup.'
                  : 'Publish Ready: Full editorial workflow with SEO metadata and internal links.'}
              </TooltipContent>
            </Tooltip>

            {/* Refine Draft CTA */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    id="titlebar-refine"
                    onClick={() => handleAnalyze()}
                    disabled={!draft.trim() || analysis.status === 'loading'}
                    className={`ui-btn ui-btn-primary ui-btn-sm ${activeTab !== 'draft' ? 'max-sm:hidden' : ''}`}
                  >
                    {analysis.status === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {analysis.status === 'loading' ? 'Refining…' : 'Refine Draft'}
                    </span>
                  </button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {analysis.status === 'loading' ? 'Refining draft…' : 'Refine Draft (Ctrl+Enter)'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Demo CTAs */}
          {isDemoMode && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-[var(--border)]">
              <button
                onClick={() => router.push('/login')}
                className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2"
              >
                Login
              </button>
              <button onClick={() => router.push('/signup')} className="ui-btn ui-btn-primary ui-btn-sm text-xs px-3">
                Start Free
              </button>
            </div>
          )}
        </header>

        {/* ── Body: Three Column Layout or Mobile Tab View ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {isMobile ? (
            <div className="flex flex-col flex-1 min-h-0 pb-16 relative bg-[var(--background)] mobile-workspace-container">
              <div className="flex-1 min-h-0 overflow-hidden w-full max-w-full overflow-x-hidden">
                {mobileViewTab === 'history' && !isDemoMode && (
                  <DocumentHistoryPanel
                    onSelect={loadHistory}
                    onNew={handleNewDraft}
                    activeId={activeHistoryId}
                    refreshTrigger={refreshTrigger}
                    onToggle={() => {}}
                    isDemoMode={isDemoMode}
                  />
                )}
                {mobileViewTab === 'editor' && (
                  <EditorCanvas
                    draft={draft}
                    onDraftChange={setDraft}
                    metadata={metadata}
                    onMetadataChange={setMetadata}
                    analysis={analysis}
                    sourceDraft={sourceDraft}
                    editorialOptions={editorialOptions}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    isGeneratingDraft={isGeneratingDraftFromNotes}
                    hasResult={hasResult}
                    sidebarOpen={rightPanelOpen}
                    onToggleSidebar={() => setRightPanelOpen(p => !p)}
                    showFeedbackSidebar={showFeedbackSidebar}
                    onToggleFeedbackSidebar={() => {
                      if (rightPanelOpen) {
                        setRightPanelOpen(false);
                      } else {
                        setRightPanelOpen(true);
                        setRightPanelTab('feedback');
                      }
                    }}
                    showNotesSidebar={showNotesSidebar}
                    onToggleNotesSidebar={() => {
                      if (rightPanelOpen) {
                        setRightPanelOpen(false);
                      } else {
                        setRightPanelOpen(true);
                        setRightPanelTab('notes');
                      }
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
                    onAnalyze={handleAnalyze}
                    onRefineAgain={handleRefineAgain}
                    onReanalyze={handleReanalyze}
                    onAddNewMetadataOption={handleAddNewCategoryOrType}
                    onOpenShortcuts={() => setIsShortcutModalOpen(true)}
                    layoutReversed={layoutReversed}
                    onToggleLayoutReversed={() => setLayoutReversed(p => !p)}
                  />
                )}
                {mobileViewTab === 'copilot' && (
                  <AICopilotPanel
                    key={activeHistoryId || 'new'}
                    activeTab={rightPanelTab}
                    onTabChange={setRightPanelTab}
                    activeHistoryId={activeHistoryId}
                    onStrategistComplete={(topic, outline, draftVal, notes, wizardAttachments) => {
                      setDraft(draftVal || outline || topic);
                      if (notes && notes.length > 0) handleNotesChange(notes);
                      if (wizardAttachments && wizardAttachments.length > 0) setAttachments(wizardAttachments);
                    }}
                    feedbackResult={hasResult || analysis.status === 'loading' ? analysis : null}
                    feedbackTitle={analysis.generatedMetadata?.title as string | undefined}
                    onApplyFix={handleApplyFix}
                    onApplyAll={handleApplyAllFixes}
                    hoveredFeedbackIndex={hoveredFeedbackIndex}
                    onHoveredFeedbackChange={setHoveredFeedbackIndex}
                    activeFeedbackIndex={activeFeedbackIndex}
                    onActiveFeedbackChange={setActiveFeedbackIndex}
                    isProcessing={isStreaming || isRefining}
                    processStage={processStage}
                    processStartedAt={processStartedAt}
                    isRefining={isRefining}
                    onAcceptFeedback={handleAcceptFeedback}
                    onRemoveFeedbackAddition={idx => handleTargetedFix(idx, 'remove')}
                    onAddFeedbackSource={handleAddFeedbackSource}
                    onFixFeedbackWithEAI={idx => handleTargetedFix(idx, 'fix')}
                    isTargetedFixing={isTargetedFixing}
                    researchNotes={researchNotes}
                    onNotesChange={handleNotesChange}
                    onGenerateDraftFromNotes={handleGenerateDraftFromNotes}
                    isGeneratingDraft={isGeneratingDraftFromNotes}
                    onCancelGenerateDraft={handleCancelGenerateDraft}
                    onInsertToDraft={text => {
                      setDraft(prev => prev + text);
                    }}
                  />
                )}
              </div>

              {/* Bottom Tab Bar Navigation for Mobile */}
              <div className="fixed bottom-0 left-0 right-0 h-16 border-t border-[var(--border)] bg-[var(--surface-1)] flex items-center justify-around z-[100] px-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                {!isDemoMode && (
                  <button
                    onClick={() => setMobileViewTab('history')}
                    className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      mobileViewTab === 'history'
                        ? 'text-[var(--primary)] font-semibold'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <History className="w-5 h-5" />
                    <span>History</span>
                  </button>
                )}
                <button
                  onClick={() => setMobileViewTab('editor')}
                  className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${
                    mobileViewTab === 'editor'
                      ? 'text-[var(--primary)] font-semibold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <FileEdit className="w-5 h-5" />
                  <span>Editor</span>
                </button>
                <button
                  onClick={() => setMobileViewTab('copilot')}
                  className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${
                    mobileViewTab === 'copilot'
                      ? 'text-[var(--primary)] font-semibold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span>EAI Chat</span>
                </button>
              </div>
            </div>
          ) : (
            <ThreeColumnLayout
              leftPanelOpen={rightPanelOpen && !isDemoMode}
              rightPanelOpen={rightPanelOpen}
              reversed={layoutReversed}
              leftPanel={
                !isDemoMode ? (
                  <DocumentHistoryPanel
                    onSelect={loadHistory}
                    onNew={handleNewDraft}
                    activeId={activeHistoryId}
                    refreshTrigger={refreshTrigger}
                    onToggle={() => setRightPanelOpen(p => !p)}
                    isDemoMode={isDemoMode}
                  />
                ) : null
              }
              rightPanel={
                <AICopilotPanel
                  key={activeHistoryId || 'new'}
                  activeTab={rightPanelTab}
                  onTabChange={setRightPanelTab}
                  activeHistoryId={activeHistoryId}
                  onStrategistComplete={(topic, outline, draftVal, notes, wizardAttachments) => {
                    setDraft(draftVal || outline || topic);
                    if (notes && notes.length > 0) handleNotesChange(notes);
                    if (wizardAttachments && wizardAttachments.length > 0) setAttachments(wizardAttachments);
                  }}
                  feedbackResult={hasResult || analysis.status === 'loading' ? analysis : null}
                  feedbackTitle={analysis.generatedMetadata?.title as string | undefined}
                  onApplyFix={handleApplyFix}
                  onApplyAll={handleApplyAllFixes}
                  hoveredFeedbackIndex={hoveredFeedbackIndex}
                  onHoveredFeedbackChange={setHoveredFeedbackIndex}
                  activeFeedbackIndex={activeFeedbackIndex}
                  onActiveFeedbackChange={setActiveFeedbackIndex}
                  isProcessing={isStreaming || isRefining}
                  processStage={processStage}
                  processStartedAt={processStartedAt}
                  isRefining={isRefining}
                  onAcceptFeedback={handleAcceptFeedback}
                  onRemoveFeedbackAddition={idx => handleTargetedFix(idx, 'remove')}
                  onAddFeedbackSource={handleAddFeedbackSource}
                  onFixFeedbackWithEAI={idx => handleTargetedFix(idx, 'fix')}
                  isTargetedFixing={isTargetedFixing}
                  researchNotes={researchNotes}
                  onNotesChange={handleNotesChange}
                  onGenerateDraftFromNotes={handleGenerateDraftFromNotes}
                  isGeneratingDraft={isGeneratingDraftFromNotes}
                  onCancelGenerateDraft={handleCancelGenerateDraft}
                  onInsertToDraft={text => {
                    setDraft(prev => prev + text);
                  }}
                />
              }
              centerPanel={
                <EditorCanvas
                  draft={draft}
                  onDraftChange={setDraft}
                  metadata={metadata}
                  onMetadataChange={setMetadata}
                  analysis={analysis}
                  sourceDraft={sourceDraft}
                  editorialOptions={editorialOptions}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  isGeneratingDraft={isGeneratingDraftFromNotes}
                  hasResult={hasResult}
                  sidebarOpen={rightPanelOpen}
                  onToggleSidebar={() => setRightPanelOpen(p => !p)}
                  showFeedbackSidebar={showFeedbackSidebar}
                  onToggleFeedbackSidebar={() => {
                    if (rightPanelOpen) {
                      setRightPanelOpen(false);
                    } else {
                      setRightPanelOpen(true);
                      setRightPanelTab('feedback');
                    }
                  }}
                  showNotesSidebar={showNotesSidebar}
                  onToggleNotesSidebar={() => {
                    if (rightPanelOpen) {
                      setRightPanelOpen(false);
                    } else {
                      setRightPanelOpen(true);
                      setRightPanelTab('notes');
                    }
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
                  onAnalyze={handleAnalyze}
                  onRefineAgain={handleRefineAgain}
                  onReanalyze={handleReanalyze}
                  onAddNewMetadataOption={handleAddNewCategoryOrType}
                  onOpenShortcuts={() => setIsShortcutModalOpen(true)}
                  layoutReversed={layoutReversed}
                  onToggleLayoutReversed={() => setLayoutReversed(p => !p)}
                />
              }
            />
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
              <button
                onClick={() => setShowDemoSignupModal(false)}
                className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-colors"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>

              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-[var(--primary)]" />
              </div>

              {/* Copy */}
              <h2 className="text-base font-bold text-[var(--foreground)] mb-1.5">Save this result?</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-1 leading-relaxed">
                Create your free workspace and continue editing with your own content.
              </p>
              <p className="text-xs text-[var(--muted-foreground)]/70 mb-6">
                Your demo won&apos;t be saved. Create an account to keep your work.
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => router.push('/signup')}
                  className="ui-btn ui-btn-primary w-full justify-center py-2.5 text-sm font-semibold"
                >
                  Start Free
                </button>
                <button
                  onClick={() => setShowDemoSignupModal(false)}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-center py-1 transition-colors"
                >
                  Maybe Later
                </button>
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
              <button
                onClick={() => setShowMissingSourcesModal(false)}
                className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-colors"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>

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
              <h2 className="text-base font-bold text-[var(--foreground)] mb-1.5">Source Missing Detected</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-3 leading-relaxed">
                We detected that some reference links from your research notes have been deleted from the draft:
              </p>

              {/* List of missing domains */}
              <div className="max-h-28 overflow-y-auto bg-[var(--surface-2)] rounded-lg p-3 mb-6 flex flex-col gap-1 border border-[var(--border)]">
                {missingSources.map((src, idx) => (
                  <div key={idx} className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 truncate">
                    <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-semibold text-[var(--foreground)] shrink-0">{src.domain || 'Source'}:</span>
                    <span className="truncate">{src.url}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => handleProceedRefinement({ restore: true })}
                  className="ui-btn ui-btn-primary w-full justify-center py-2.5 text-sm font-semibold"
                >
                  Restore Sources & Refine
                </button>
                <button
                  onClick={() => handleProceedRefinement({ restore: false })}
                  className="ui-btn w-full justify-center py-2.5 text-sm font-semibold border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors text-[var(--foreground)] font-medium"
                >
                  Refine Anyway
                </button>
                <button
                  onClick={() => setShowMissingSourcesModal(false)}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-center py-1 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
