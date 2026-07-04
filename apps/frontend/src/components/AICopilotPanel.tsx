'use client';

import { useState } from 'react';
import { Sparkles, MessageCircle, Notebook } from 'lucide-react';

type RightTab = 'strategist' | 'feedback' | 'notes';

interface AICopilotPanelProps {
  activeTab?: RightTab;
  onTabChange?: (tab: RightTab) => void;
  strategistContent?: React.ReactNode;
  feedbackContent?: React.ReactNode;
  notesContent?: React.ReactNode;
}

const TABS: { key: RightTab; label: string; icon: React.ReactNode }[] = [
  { key: 'strategist', label: 'Strategist', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { key: 'feedback', label: 'Feedback', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { key: 'notes', label: 'Notes', icon: <Notebook className="w-3.5 h-3.5" /> },
];

export default function AICopilotPanel({
  activeTab: controlledTab,
  onTabChange,
  strategistContent,
  feedbackContent,
  notesContent,
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

  const renderContent = () => {
    switch (activeTab) {
      case 'strategist':
        return strategistContent ?? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <Sparkles className="w-10 h-10 text-[var(--primary)]/30 mb-3" />
            <p className="text-xs text-[var(--muted-foreground)] font-medium mb-1">AI Strategist</p>
            <p className="text-xs text-[var(--muted-foreground)]/70">
              Your AI co-pilot for research, outlines, and content ideas.
            </p>
          </div>
        );
      case 'feedback':
        return feedbackContent ?? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <MessageCircle className="w-10 h-10 text-[var(--primary)]/30 mb-3" />
            <p className="text-xs text-[var(--muted-foreground)] font-medium mb-1">Editorial Feedback</p>
            <p className="text-xs text-[var(--muted-foreground)]/70">
              Run &ldquo;Refine Draft&rdquo; to see editorial feedback here.
            </p>
          </div>
        );
      case 'notes':
        return notesContent ?? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <Notebook className="w-10 h-10 text-[var(--primary)]/30 mb-3" />
            <p className="text-xs text-[var(--muted-foreground)] font-medium mb-1">Research Notes</p>
            <p className="text-xs text-[var(--muted-foreground)]/70">
              Save research notes from the AI Strategist or add your own.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)] border-l border-[var(--border)]">
      <div className="flex items-center border-b border-[var(--border)] px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'text-[var(--foreground)] border-[var(--primary)]'
                : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
            }`}
          >
            {tab.icon}
            <span className="hidden xl:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}