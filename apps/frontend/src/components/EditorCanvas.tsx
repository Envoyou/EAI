'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@/components/Editor';
import FinalDraftPanel from '@/components/FinalDraftPanel';
import PanelTabBar from '@/components/PanelTabBar';
import StatusBar from '@/components/StatusBar';
import { Button } from '@/components/ui/button';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { WarningStatusIcon } from '@/components/ui/icons/status';
import { EditActionIcon } from '@/components/ui/icons/actions';
import { DocumentIcon } from '@/components/ui/icons/content';
import { ReviewArticlePanel } from '@/components/ReviewArticlePanel';
import { useTranslations } from 'next-intl';
import type { PanelTab } from '@/components/PanelTabBar';
import type { AnalysisResult, ArticleMetadata, EditorialProcessStage, PublicationPackage } from '@eai/shared';

export interface EditorialOptions {
  brandName: string;
  categories: string[];
  articleTypes: string[];
  isPersonal: boolean;
  maxTextLength: number;
  cmsExportEnabled: boolean;
  activePlan: string;
}

interface EditorCanvasProps {
  draft: string;
  onDraftChange: (value: string) => void;
  metadata: ArticleMetadata;
  onMetadataChange: (metadata: ArticleMetadata) => void;
  analysis: AnalysisResult;
  sourceDraft: string;
  editorialOptions: EditorialOptions;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  hasResult: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  showFeedbackSidebar: boolean;
  onToggleFeedbackSidebar: () => void;
  onOpenFeedbackSidebar: () => void;
  showNotesSidebar: boolean;
  onToggleNotesSidebar: () => void;
  hasNotes: boolean;
  isDemoMode: boolean;
  wordCount: number;
  charCount: number;
  charLimit: number;
  hoveredFeedbackIndex: number | null;
  activeFeedbackIndex: number | null;
  onActiveFeedbackChange: (index: number | null) => void;
  isStreaming: boolean;
  isRefining: boolean;
  processStage: EditorialProcessStage;
  processStartedAt: number | null;
  includeSeoStage: boolean;
  onAnalyze: (overrideDraft?: string) => Promise<void>;
  onRefineAgain: (instruction: string) => Promise<void>;
  onReanalyze: () => void;
  onSaveFinalDraft: (draft: string) => Promise<boolean>;
  onQualityCheck: () => Promise<unknown>;
  onRegenerateSeo: () => Promise<void>;
  onSavePublicationMetadata: (metadata: PublicationPackage) => Promise<boolean>;
  onConfirmPublicationMetadata: () => Promise<void>;
  onPrepareForExport: () => Promise<void>;
  isSavingFinalDraft: boolean;
  isCheckingQuality: boolean;
  isGeneratingSeo: boolean;
  isAiBusy: boolean;
  onAddNewMetadataOption: (type: 'category' | 'articleType', value: string) => void;
  onOpenShortcuts: () => void;
  layoutReversed?: boolean;
  onToggleLayoutReversed?: () => void;
  isGeneratingDraft?: boolean;
  workspaceStage?: 'editor' | 'review' | 'publication';
}

export default function EditorCanvas({
  draft,
  onDraftChange,
  metadata,
  onMetadataChange,
  analysis,
  sourceDraft,
  editorialOptions,
  activeTab,
  onTabChange,
  hasResult,
  sidebarOpen,
  onToggleSidebar,
  showFeedbackSidebar,
  onToggleFeedbackSidebar,
  onOpenFeedbackSidebar,
  showNotesSidebar,
  onToggleNotesSidebar,
  hasNotes,
  isDemoMode,
  wordCount,
  charCount,
  charLimit,
  hoveredFeedbackIndex,
  activeFeedbackIndex,
  onActiveFeedbackChange,
  isStreaming,
  isRefining,
  processStage,
  processStartedAt,
  includeSeoStage,
  onAnalyze,
  onRefineAgain,
  onReanalyze,
  onSaveFinalDraft,
  onQualityCheck,
  onRegenerateSeo,
  onSavePublicationMetadata,
  onConfirmPublicationMetadata,
  onPrepareForExport,
  isSavingFinalDraft,
  isCheckingQuality,
  isGeneratingSeo,
  isAiBusy,
  onAddNewMetadataOption,
  onOpenShortcuts,
  layoutReversed,
  onToggleLayoutReversed,
  isGeneratingDraft = false,
  workspaceStage = 'editor',
}: EditorCanvasProps) {
  const router = useRouter();
  const t = useTranslations('DraftReview');
  const [candidateEditorKey, setCandidateEditorKey] = useState<string | null>(null);
  const decisionFeedback = (analysis.feedback ?? []).filter(
    (item) => item.status !== 'pass'
  );
  const unresolvedFeedback = decisionFeedback.filter(
    (item) => item.status !== 'pass' && !item.isApplied && !item.isAccepted && !item.isVerified
  );
  const isCandidatePendingReview = Boolean(
    analysis.polishedDraft?.trim()
    && analysis.status === 'success'
    && analysis.readiness !== 'ready'
    && !isStreaming
    && !isRefining
  );

  const candidateReviewKey = analysis.draftRevision?.bodyHash
    ?? analysis.draftRevision?.revisionId
    ?? `${analysis.analysisLogId ?? 'candidate'}:${analysis.polishedDraft?.length ?? 0}`;
  const showCandidateEditor = isCandidatePendingReview
    && candidateEditorKey === candidateReviewKey;

  const openFeedbackDecision = (index?: number) => {
    if (typeof index === 'number') onActiveFeedbackChange(index);
    onOpenFeedbackSidebar();
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Demo Progress Stepper */}
      {isDemoMode && (
        <div className="flex items-center justify-center gap-0 border-b border-[var(--border)] px-4 py-2.5" style={{ background: 'var(--background)' }}>
          <span className="text-[11px] font-semibold text-[var(--muted-foreground)] mr-4 hidden sm:block">Try EAI in 30 sec</span>
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
            analysis.status === 'idle' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
          }`}>
            <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-[var(--primary)] text-white">
              {analysis.status !== 'idle' ? '\u2713' : '1'}
            </span>
            <span className="hidden sm:block">Refine Draft</span>
          </div>
          <div className="w-6 sm:w-10 h-px bg-[var(--border)] mx-2" />
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
            analysis.status === 'loading' ? 'text-[var(--primary)]' :
            hasResult ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
          }`}>
            <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
              analysis.status === 'loading' ? 'bg-[var(--primary)] text-white' :
              hasResult ? 'bg-[var(--primary)] text-white' : 'border border-[var(--border)] text-[var(--muted-foreground)]'
            }`}>{hasResult ? '\u2713' : analysis.status === 'loading' ? '\u2026' : '2'}</span>
            <span className="hidden sm:block">See Improvements</span>
          </div>
          <div className="w-6 sm:w-10 h-px bg-[var(--border)] mx-2" />
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
            hasResult ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
          }`}>
            <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
              hasResult ? 'border border-[var(--primary)] text-[var(--primary)]' : 'border border-[var(--border)] text-[var(--muted-foreground)]'
            }`}>3</span>
            <span className="hidden sm:block">Save Workspace</span>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      {isDemoMode && <PanelTabBar
        activeTab={activeTab}
        onTabChange={onTabChange}
        hasResult={hasResult}
        isLoading={analysis.status === 'loading'}
        showFeedbackSidebar={showFeedbackSidebar}
        onToggleFeedbackSidebar={onToggleFeedbackSidebar}
        showHistorySidebar={sidebarOpen}
        onToggleHistorySidebar={onToggleSidebar}
        showNotesSidebar={showNotesSidebar}
        onToggleNotesSidebar={onToggleNotesSidebar}
        hasNotes={hasNotes}
        layoutReversed={layoutReversed}
        reviewPending={isCandidatePendingReview}
      />}

      {/* Workspace */}
      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`panel-tab-${activeTab}`}
        className="flex-1 min-h-0 overflow-hidden relative"
      >
        <AnimatePresence mode="wait">
          {/* Draft Tab */}
          {(workspaceStage === 'editor' || (isDemoMode && activeTab === 'draft')) && (
            <motion.div
              key="draft-tab"
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full min-w-0 max-w-full p-2 sm:p-3 md:px-6 md:py-5 absolute inset-0 overflow-x-hidden"
            >
              <Editor
                value={draft}
                onChange={onDraftChange}
                metadata={metadata}
                onMetadataChange={onMetadataChange}
                isLoading={analysis.status === 'loading' || isGeneratingDraft || isAiBusy}
                onAnalyze={onAnalyze}
                categoryOptions={editorialOptions.categories}
                articleTypeOptions={editorialOptions.articleTypes}
                editorialBrandName={editorialOptions.brandName}
                isPersonal={editorialOptions.isPersonal}
                onAddNewMetadataOption={onAddNewMetadataOption}
                charLimit={editorialOptions.maxTextLength}
              />
            </motion.div>
          )}

          {/* Refined Draft Tab */}
          {(workspaceStage !== 'editor' || (isDemoMode && activeTab === 'refined')) && (
            <motion.div
              key="refined-tab"
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full flex min-h-0 overflow-hidden absolute inset-0"
            >
              {(hasResult || analysis.status === 'loading') ? (
                <div className="flex-1 min-w-0 h-full overflow-hidden p-3 md:px-5 md:py-5">
                  <div
                    className="min-w-0 h-full flex flex-col overflow-hidden"
                    style={{
                      maxWidth: '56rem',
                      marginLeft: 'auto',
                      marginRight: 'auto',
                    }}
                  >
                    {workspaceStage === 'review' && !isCandidatePendingReview ? (
                      <ReviewArticlePanel
                        title={(analysis.generatedMetadata?.title || analysis.workingTitle || t('articleFallbackTitle')) as string}
                        body={analysis.polishedDraft || ''}
                        findingCount={decisionFeedback.length}
                        onOpenPublication={() => router.push(`/publication${analysis.analysisLogId ? `?history=${encodeURIComponent(analysis.analysisLogId)}` : ''}`)}
                      />
                    ) : workspaceStage === 'publication' && isCandidatePendingReview ? (
                      <div className="ui-state-card mx-auto flex max-w-xl flex-col items-center justify-center p-8 text-center">
                        <WarningStatusIcon className="mb-3 h-6 w-6 text-[var(--warning)]" />
                        <h2 className="text-sm font-semibold text-[var(--foreground)]">{t('publicationBlockedTitle')}</h2>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{t('publicationBlockedDescription')}</p>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="mt-4"
                          onClick={() => router.push(`/review${analysis.analysisLogId ? `?history=${encodeURIComponent(analysis.analysisLogId)}` : ''}`)}
                        >
                          {t('returnToReview')}
                        </Button>
                      </div>
                    ) : isCandidatePendingReview && !showCandidateEditor ? (
                      <div className="ui-panel flex h-full min-h-0 flex-col overflow-hidden">
                        <div className="ui-panel-header px-5 py-4">
                          <p className="text-[11px] font-medium text-[var(--muted-foreground)]">
                            {t('eyebrow')}
                          </p>
                          <h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">
                            {t('title')}
                          </h2>
                          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[var(--muted-foreground)]">
                            {unresolvedFeedback.length > 0
                              ? t('description', { count: unresolvedFeedback.length })
                              : t('validatingDescription')}
                          </p>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                          {unresolvedFeedback.length > 0 ? (
                            <div className="mx-auto max-w-2xl space-y-3">
                              {unresolvedFeedback.map((item) => {
                                const index = (analysis.feedback ?? []).indexOf(item);
                                return (
                                  <Button
                                    key={item.feedbackId ?? `${item.category}-${index}`}
                                    type="button"
                                    variant="surface"
                                    onClick={() => openFeedbackDecision(index)}
                                    className="h-auto w-full items-start justify-start gap-3 whitespace-normal p-4 text-left"
                                  >
                                    <WarningStatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-xs font-semibold text-[var(--foreground)]">
                                        {item.category}
                                      </span>
                                      <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--muted-foreground)]">
                                        {item.message}
                                      </span>
                                      <span className="mt-2 block text-[11px] font-semibold text-[var(--primary)]">
                                        {t('reviewDecision')}
                                      </span>
                                    </span>
                                  </Button>
                                );
                              })}
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                <p className="text-xs text-[var(--muted-foreground)]">
                                  {t('progress', {
                                    completed: decisionFeedback.length - unresolvedFeedback.length,
                                    total: decisionFeedback.length,
                                  })}
                                </p>
                                <Button
                                  type="button"
                                  variant="muted"
                                  size="sm"
                                  onClick={() => setCandidateEditorKey(candidateReviewKey)}
                                >
                                  <EditActionIcon className="h-3.5 w-3.5" />
                                  {t('editCandidate')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="ui-state-card mx-auto flex max-w-xl flex-col items-center justify-center p-8 text-center">
                              {isCheckingQuality ? (
                                <EAILoaderStatusIcon className="mb-3 h-6 w-6" />
                              ) : (
                                <DocumentIcon className="mb-3 h-6 w-6 text-[var(--primary)]" />
                              )}
                              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                                {t('validatingTitle')}
                              </h3>
                              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
                                {t('validatingDescription')}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                    <div className="flex h-full min-h-0 flex-col">
                      {isCandidatePendingReview && (
                        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {t('candidateNotice')}
                          </p>
                          <Button
                            type="button"
                            variant="muted"
                            size="xs"
                            onClick={() => setCandidateEditorKey(null)}
                          >
                            {t('backToQueue')}
                          </Button>
                        </div>
                      )}
                      <div className="min-h-0 flex-1">
                    <FinalDraftPanel
                      originalDraft={sourceDraft}
                      polishedDraft={analysis.polishedDraft ?? ''}
                      ready={analysis.status === 'success' && analysis.readiness === 'ready'}
                      qualityReady={analysis.readiness === 'ready'}
                      exportBlocked={isDemoMode || analysis.readiness !== 'ready'}
                      cmsConnected={editorialOptions.cmsExportEnabled}
                      analysisLogId={analysis.analysisLogId || undefined}
                      sourceRef={analysis.sourceRef || metadata.sourceRef}
                      articleMetadata={metadata}
                      exportStatus={analysis.exportStatus}
                      generatedMetadata={analysis.generatedMetadata}
                      workingTitle={analysis.workingTitle}
                      publicationPackageStatus={analysis.publicationPackageStatus}
                      qualityGateState={analysis.qualityGateState}
                      seoReviewState={analysis.seoReviewState}
                      seoFieldStates={analysis.seoFieldStates}
                      isStreaming={isStreaming}
                      isRefining={isRefining}
                      processStage={processStage}
                      processStartedAt={processStartedAt}
                      includeSeoStage={includeSeoStage}
                      onRefineAgain={isCandidatePendingReview || workspaceStage === 'publication' ? undefined : onRefineAgain}
                      onReanalyze={workspaceStage === 'publication' ? undefined : onReanalyze}
                      onSaveFinalDraft={onSaveFinalDraft}
                      onQualityCheck={onQualityCheck}
                      onRegenerateSeo={onRegenerateSeo}
                      onSavePublicationMetadata={onSavePublicationMetadata}
                      onConfirmPublicationMetadata={onConfirmPublicationMetadata}
                      onPrepareForExport={isCandidatePendingReview ? undefined : onPrepareForExport}
                      onFinishLater={
                        !isCandidatePendingReview && !isDemoMode && analysis.analysisLogId
                          ? () => router.push('/workspace')
                          : undefined
                      }
                      onOpenCmsSettings={
                        !isCandidatePendingReview && !isDemoMode
                          ? () => router.push('/settings/publication/identity')
                          : undefined
                      }
                      isSavingFinalDraft={isSavingFinalDraft}
                      isCheckingQuality={isCheckingQuality}
                      isGeneratingSeo={isGeneratingSeo}
                      isAiBusy={isAiBusy}
                      hoveredFeedbackIndex={hoveredFeedbackIndex}
                      activeFeedbackIndex={activeFeedbackIndex}
                      onActiveFeedbackChange={onActiveFeedbackChange}
                      feedback={analysis.feedback || []}
                      isDemoMode={isDemoMode}
                      reviewMode={isCandidatePendingReview}
                    />
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full max-w-4xl mx-auto w-full p-6 md:p-10">
                  <div className="ui-state-card flex h-full items-center justify-center p-8">
                    <p className="text-xs ui-muted">
                      Run &ldquo;Refine Draft&rdquo; to generate the Refined Draft.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Bar */}
      <StatusBar
        wordCount={wordCount}
        charCount={charCount}
        charLimit={charLimit}
        readiness={analysis.readiness}
        isLoading={analysis.status === 'loading'}
        isStreaming={isStreaming}
        isRefining={isRefining}
        activeTab={activeTab}
        onOpenShortcuts={onOpenShortcuts}
        layoutReversed={layoutReversed}
        onToggleLayoutReversed={onToggleLayoutReversed}
      />

      {/* Demo CTA */}
      {isDemoMode && hasResult && (
        <div
          className="flex items-center justify-between gap-4 px-5 py-2.5 border-t border-[var(--border)]"
          style={{ background: 'var(--surface-1)' }}
        >
          <p className="text-xs text-[var(--muted-foreground)] leading-tight">
            Your demo won&apos;t be saved. Create an account to keep your work.
          </p>
          <Button
            type="button"
            onClick={() => router.push('/signup')}
            variant="primary"
            size="xs"
            className="whitespace-nowrap shrink-0"
          >
            Continue Editing &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
