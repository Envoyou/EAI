'use client';

import { useState } from 'react';
import { FileSearch, MessageCircle, Notebook, MessagesSquare, PanelRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import StrategistTab from '@/components/StrategistTab';
import FeedbackTab from '@/components/FeedbackTab';
import NotesTab from '@/components/NotesTab';
import { DeepResearchReportTab } from '@/components/strategist-tab/components/DeepResearchReportTab';
import { useContentStrategist, type Attachment } from '@/lib/hooks/useContentStrategist';
import type { ResearchNote } from '@/lib/hooks/useContentStrategist';
import type { AnalysisResult, EditorialProcessStage, FindingTarget } from '@eai/shared';

export type RightTab = 'strategist' | 'feedback' | 'notes' | 'deep_report';

interface AICopilotPanelProps {
  activeTab?: RightTab;
  onTabChange?: (tab: RightTab) => void;
  onStrategistComplete?: (
    topic: string,
    outline: string,
    draft: string,
    notes: ResearchNote[],
    attachments: Attachment[],
    sourceRef?: string
  ) => void;
  feedbackResult?: AnalysisResult | null;
  feedbackTitle?: string;
  onApplyFix?: (targetText: string, replacementText: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => Promise<boolean>;
  onApplyPublicationFix?: (targetField: FindingTarget, targetText: string, replacementText: string, index: number) => Promise<boolean>;
  onApplyAll?: () => Promise<void>;
  hoveredFeedbackIndex?: number | null;
  onHoveredFeedbackChange?: (index: number | null) => void;
  activeFeedbackIndex?: number | null;
  onActiveFeedbackChange?: (index: number | null) => void;
  isProcessing?: boolean;
  processStage?: EditorialProcessStage;
  processStartedAt?: number | null;
  includeSeoStage?: boolean;
  isRefining?: boolean;
  onAcceptFeedback?: (index: number) => Promise<void>;
  onRemoveFeedbackAddition?: (index: number) => Promise<void>;
  onAddFeedbackSource?: (index: number, url: string) => Promise<boolean>;
  onFixFeedbackWithEAI?: (index: number) => Promise<void>;
  isTargetedFixing?: number | null;
  researchNotes?: ResearchNote[];
  onNotesChange?: (notes: ResearchNote[]) => void;
  onGenerateDraftFromNotes?: () => void;
  isGeneratingDraft?: boolean;
  isWorkspaceAiBusy?: boolean;
  onCancelGenerateDraft?: () => void;
  onInsertToDraft?: (text: string) => void;
  activeHistoryId?: string | null;
  onToggleSidebar?: () => void;
  allowedTabs?: RightTab[];
  panelTitle?: string;
}

export default function AICopilotPanel({
  activeTab: controlledTab,
  onTabChange,
  onStrategistComplete,
  feedbackResult,
  feedbackTitle,
  onApplyFix,
  onApplyPublicationFix,
  onApplyAll,
  hoveredFeedbackIndex = null,
  onHoveredFeedbackChange,
  activeFeedbackIndex = null,
  onActiveFeedbackChange,
  isProcessing,
  processStage,
  processStartedAt,
  includeSeoStage = true,
  isRefining,
  onAcceptFeedback,
  onRemoveFeedbackAddition,
  onAddFeedbackSource,
  onFixFeedbackWithEAI,
  isTargetedFixing,
  researchNotes = [],
  onNotesChange,
  onGenerateDraftFromNotes,
  isGeneratingDraft,
  isWorkspaceAiBusy,
  onCancelGenerateDraft,
  onInsertToDraft,
  activeHistoryId,
  onToggleSidebar,
  allowedTabs,
  panelTitle,
}: AICopilotPanelProps) {
  const t = useTranslations('AICopilotPanel');
  const reportT = useTranslations('DeepResearchReport');
  const [internalTab, setInternalTab] = useState<RightTab>('strategist');
  const activeTab = controlledTab ?? internalTab;
  const allTabs: { key: RightTab; label: string; icon: React.ReactNode }[] = [
    { key: 'strategist', label: t('chat'), icon: <MessagesSquare className="w-3.5 h-3.5" /> },
    { key: 'feedback', label: t('feedback'), icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { key: 'notes', label: t('notes'), icon: <Notebook className="w-3.5 h-3.5" /> },
    { key: 'deep_report', label: t('deepReport'), icon: <FileSearch className="w-3.5 h-3.5" /> },
  ];
  const tabs = allowedTabs
    ? allTabs.filter(tab => allowedTabs.includes(tab.key))
    : allTabs;

  const handleTabChange = (tab: RightTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const strategist = useContentStrategist({
    onComplete: (topic, outline, draft, notes, attachments, sourceRef) => {
      onStrategistComplete?.(topic, outline, draft, notes, attachments, sourceRef);
    },
    notes: researchNotes,
    onNotesChange,
    documentId: activeHistoryId || 'new',
  });

  const renderContent = () => {
    switch (activeTab) {
      case 'strategist':
        return (
          <StrategistTab
            messages={strategist.messages}
            chatInput={strategist.chatInput}
            setChatInput={strategist.setChatInput}
            isTyping={strategist.isTyping}
            handleSend={strategist.handleSend}
            handleRewrite={strategist.handleRewrite}
            handleCopy={strategist.handleCopy}
            saveNote={strategist.saveNote}
            copiedMessageId={strategist.copiedMessageId}
            uploadedAttachment={strategist.uploadedAttachment}
            setUploadedAttachment={strategist.setUploadedAttachment}
            handleFileUpload={strategist.handleFileUpload}
            enableSearch={strategist.enableSearch}
            setEnableSearch={strategist.setEnableSearch}
            researchMode={strategist.researchMode}
            setResearchMode={strategist.setResearchMode}
            currentSessionId={strategist.currentSessionId}
            setCurrentSessionId={strategist.setCurrentSessionId}
            sessions={strategist.sessions}
            isSessionsLoading={strategist.isSessionsLoading}
            selectSession={strategist.selectSession}
            renameSession={strategist.renameSession}
            togglePinSession={strategist.togglePinSession}
            deleteSession={strategist.deleteSession}
            startNewChat={strategist.startNewChat}
            onCancelChat={strategist.cancelChat}
          />
        );
      case 'feedback':
        if (feedbackResult && feedbackResult.status !== 'idle') {
          return (
            <FeedbackTab
              result={feedbackResult}
              title={feedbackTitle}
              onApplyFix={onApplyFix}
              onApplyPublicationFix={onApplyPublicationFix}
              onApplyAll={onApplyAll}
              hoveredFeedbackIndex={hoveredFeedbackIndex ?? null}
              onHoveredFeedbackChange={onHoveredFeedbackChange ?? (() => {})}
              activeFeedbackIndex={activeFeedbackIndex ?? null}
              onActiveFeedbackChange={onActiveFeedbackChange ?? (() => {})}
              isProcessing={isProcessing}
              processStage={processStage}
              processStartedAt={processStartedAt}
              includeSeoStage={includeSeoStage}
              isRefining={isRefining}
              onAcceptFeedback={onAcceptFeedback}
              onRemoveFeedbackAddition={onRemoveFeedbackAddition}
              onAddFeedbackSource={onAddFeedbackSource}
              onFixFeedbackWithEAI={onFixFeedbackWithEAI}
              isTargetedFixing={isTargetedFixing}
            />
          );
        }
        return (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <MessageCircle className="w-10 h-10 text-[var(--primary)]/30 mb-3" />
            <p className="text-xs text-[var(--muted-foreground)] font-medium mb-1">Feedback</p>
            <p className="text-xs text-[var(--muted-foreground)]/70">
              Run &quot;Refine Draft&quot; to view editorial analysis feedback.
            </p>
          </div>
        );
      case 'notes':
        return (
          <NotesTab
            researchNotes={researchNotes}
            onNotesChange={onNotesChange ?? (() => {})}
            onGenerateDraft={onGenerateDraftFromNotes}
            isGeneratingDraft={isGeneratingDraft}
            isWorkspaceAiBusy={isWorkspaceAiBusy}
            onCancelGenerateDraft={onCancelGenerateDraft}
            onInsertToDraft={onInsertToDraft}
          />
        );
      case 'deep_report':
        return (
          <DeepResearchReportTab
            reports={strategist.deepResearchReports}
            maxReports={strategist.maxDeepResearchReports}
            onDeleteReport={strategist.deleteDeepResearchReport}
            onDiscussReport={(reportId, suggestion) => {
              strategist.prepareDeepResearchFollowUp(
                reportId,
                suggestion
                  ? reportT('followUpActionPrompt', { action: suggestion })
                  : reportT('followUpPrompt')
              );
              handleTabChange('strategist');
            }}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0 w-full overflow-hidden [container-type:inline-size]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-1">
        {panelTitle && tabs.length === 1 ? (
          <p className="px-3 py-2.5 text-xs font-semibold text-[var(--foreground)]">{panelTitle}</p>
        ) : <div className="flex items-center min-w-0" role="tablist">
          {tabs.map((tab) => (
            <Tooltip key={tab.key}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    variant="muted"
                    className="strategist-copilot-tab h-auto shrink-0 gap-1.5 px-2.5 py-2.5 text-xs font-medium transition-colors sm:px-3"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    aria-label={tab.label}
                  >
                    {tab.icon}
                    <span className="strategist-copilot-tab-label truncate max-w-[120px]">
                      {tab.label}
                    </span>
                  </Button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {tab.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>}

        {onToggleSidebar && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  onClick={onToggleSidebar}
                  variant="muted"
                  size="icon-xs"
                  className="strategist-panel-icon-action mr-2 shrink-0"
                  aria-label="Hide Assistant Panel"
                >
                  <PanelRight className="w-4 h-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom" className="text-xs">
              Hide Assistant
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}
