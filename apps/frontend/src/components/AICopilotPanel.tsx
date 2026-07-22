'use client';

import { useState } from 'react';
import { MessageCircle, Notebook, MessagesSquare, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import StrategistTab from '@/components/StrategistTab';
import FeedbackTab from '@/components/FeedbackTab';
import NotesTab from '@/components/NotesTab';
import { useContentStrategist, type Attachment } from '@/lib/hooks/useContentStrategist';
import type { ResearchNote } from '@/lib/hooks/useContentStrategist';
import type { AnalysisResult, EditorialProcessStage } from '@eai/shared';

type RightTab = 'strategist' | 'feedback' | 'notes';

interface AICopilotPanelProps {
  activeTab?: RightTab;
  onTabChange?: (tab: RightTab) => void;
  onStrategistComplete?: (topic: string, outline: string, draft: string, notes: ResearchNote[], attachments: Attachment[]) => void;
  feedbackResult?: AnalysisResult | null;
  feedbackTitle?: string;
  onApplyFix?: (targetText: string, replacementText: string, operation: 'replace' | 'insert_before' | 'insert_after' | 'manual', index: number) => Promise<boolean>;
  onApplyAll?: () => Promise<void>;
  hoveredFeedbackIndex?: number | null;
  onHoveredFeedbackChange?: (index: number | null) => void;
  activeFeedbackIndex?: number | null;
  onActiveFeedbackChange?: (index: number | null) => void;
  isProcessing?: boolean;
  processStage?: EditorialProcessStage;
  processStartedAt?: number | null;
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
  onCancelGenerateDraft?: () => void;
  onInsertToDraft?: (text: string) => void;
  activeHistoryId?: string | null;
  onToggleSidebar?: () => void;
}

const TABS: { key: RightTab; label: string; icon: React.ReactNode }[] = [
  { key: 'strategist', label: 'Chat with EAI', icon: <MessagesSquare className="w-3.5 h-3.5" /> },
  { key: 'feedback', label: 'Feedback', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { key: 'notes', label: 'Notes', icon: <Notebook className="w-3.5 h-3.5" /> },
];

export default function AICopilotPanel({
  activeTab: controlledTab,
  onTabChange,
  onStrategistComplete,
  feedbackResult,
  feedbackTitle,
  onApplyFix,
  onApplyAll,
  hoveredFeedbackIndex = null,
  onHoveredFeedbackChange,
  activeFeedbackIndex = null,
  onActiveFeedbackChange,
  isProcessing,
  processStage,
  processStartedAt,
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
  onCancelGenerateDraft,
  onInsertToDraft,
  activeHistoryId,
  onToggleSidebar,
}: AICopilotPanelProps) {
  const [internalTab, setInternalTab] = useState<RightTab>('strategist');
  const activeTab = controlledTab ?? internalTab;

  const handleTabChange = (tab: RightTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const strategist = useContentStrategist({
    onComplete: (topic, outline, draft, notes, attachments) => {
      onStrategistComplete?.(topic, outline, draft, notes, attachments);
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
            deepResearchReport={strategist.deepResearchReport}
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
              onApplyAll={onApplyAll}
              hoveredFeedbackIndex={hoveredFeedbackIndex ?? null}
              onHoveredFeedbackChange={onHoveredFeedbackChange ?? (() => {})}
              activeFeedbackIndex={activeFeedbackIndex ?? null}
              onActiveFeedbackChange={onActiveFeedbackChange ?? (() => {})}
              isProcessing={isProcessing}
              processStage={processStage}
              processStartedAt={processStartedAt}
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
            onCancelGenerateDraft={onCancelGenerateDraft}
            onInsertToDraft={onInsertToDraft}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0 w-full overflow-hidden [container-type:inline-size]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-1">
        <div className="flex items-center min-w-0">
          {TABS.map((tab) => (
            <Tooltip key={tab.key}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    variant="ghost"
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 text-xs font-medium transition-colors border-b-2 rounded-none h-auto -mb-px shrink-0 ${
                      activeTab === tab.key
                        ? 'text-[var(--foreground)] border-[var(--primary)]'
                        : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
                    }`}
                    aria-label={tab.label}
                  >
                    {tab.icon}
                    <span className="hidden @[340px]:inline truncate max-w-[120px]">
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
        </div>

        {onToggleSidebar && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  onClick={onToggleSidebar}
                  variant="ghost"
                  size="icon-xs"
                  className="mr-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] shrink-0"
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
