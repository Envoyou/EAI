'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@/components/Editor';
import FinalDraftPanel from '@/components/FinalDraftPanel';
import PanelTabBar from '@/components/PanelTabBar';
import StatusBar from '@/components/StatusBar';
import { Button } from '@/components/ui/button';
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
  onPrepareForExport: () => Promise<void>;
  isSavingFinalDraft: boolean;
  isCheckingQuality: boolean;
  isGeneratingSeo: boolean;
  onAddNewMetadataOption: (type: 'category' | 'articleType', value: string) => void;
  onOpenShortcuts: () => void;
  layoutReversed?: boolean;
  onToggleLayoutReversed?: () => void;
  isGeneratingDraft?: boolean;
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
  onPrepareForExport,
  isSavingFinalDraft,
  isCheckingQuality,
  isGeneratingSeo,
  onAddNewMetadataOption,
  onOpenShortcuts,
  layoutReversed,
  onToggleLayoutReversed,
  isGeneratingDraft = false,
}: EditorCanvasProps) {
  const router = useRouter();

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
      <PanelTabBar
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
      />

      {/* Workspace */}
      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`panel-tab-${activeTab}`}
        className="flex-1 min-h-0 overflow-hidden relative"
      >
        <AnimatePresence mode="wait">
          {/* Draft Tab */}
          {activeTab === 'draft' && (
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
                isLoading={analysis.status === 'loading' || isGeneratingDraft}
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
          {activeTab === 'refined' && (
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
                    <FinalDraftPanel
                      originalDraft={sourceDraft}
                      polishedDraft={analysis.polishedDraft ?? ''}
                      ready={analysis.status === 'success'}
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
                      isStreaming={isStreaming}
                      isRefining={isRefining}
                      processStage={processStage}
                      processStartedAt={processStartedAt}
                      includeSeoStage={includeSeoStage}
                      isStale={analysis.summary?.startsWith('Iterative refinement')}
                      onRefineAgain={onRefineAgain}
                      onReanalyze={onReanalyze}
                      onSaveFinalDraft={onSaveFinalDraft}
                      onQualityCheck={onQualityCheck}
                      onRegenerateSeo={onRegenerateSeo}
                      onSavePublicationMetadata={onSavePublicationMetadata}
                      onPrepareForExport={onPrepareForExport}
                      isSavingFinalDraft={isSavingFinalDraft}
                      isCheckingQuality={isCheckingQuality}
                      isGeneratingSeo={isGeneratingSeo}
                      hoveredFeedbackIndex={hoveredFeedbackIndex}
                      activeFeedbackIndex={activeFeedbackIndex}
                      onActiveFeedbackChange={onActiveFeedbackChange}
                      feedback={analysis.feedback || []}
                      isDemoMode={isDemoMode}
                    />
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
