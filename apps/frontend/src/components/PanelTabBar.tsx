'use client';

import { FileEdit, FileCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

export type PanelTab = 'draft' | 'refined';

interface PanelTabBarProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  /** If false, final tab is disabled (greyed out) */
  hasResult: boolean;
  /** True while analysis is streaming */
  isLoading: boolean;
  showFeedbackSidebar?: boolean;
  onToggleFeedbackSidebar?: () => void;
  showHistorySidebar?: boolean;
  onToggleHistorySidebar?: () => void;
  showNotesSidebar?: boolean;
  onToggleNotesSidebar?: () => void;
  hasNotes?: boolean;
  /** When true, left/right panel icons and handlers are swapped */
  layoutReversed?: boolean;
}

const TABS: { key: PanelTab; label: string; icon: React.ReactNode; description: string }[] = [
  {
    key: 'draft',
    label: 'Draft',
    icon: <FileEdit className="w-4 h-4" />,
    description: 'Write and edit your article',
  },
  {
    key: 'refined',
    label: 'Refined Draft',
    icon: <FileCheck className="w-4 h-4" />,
    description: 'Polished publication draft',
  },
];

export default function PanelTabBar({
  activeTab,
  onTabChange,
  hasResult,
  isLoading,
}: PanelTabBarProps) {
  return (
    <div className="ide-tabbar [container-type:inline-size] flex items-center min-w-0" role="tablist" aria-label="Editor Panels">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const isDisabled = tab.key !== 'draft' && !hasResult && !isLoading;
        const isLoadingTab = isLoading && tab.key === 'refined';

        const button = (
          <Button
            type="button"
            key={tab.key}
            id={`panel-tab-${tab.key}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.key}`}
            onClick={() => !isDisabled && !isLoading && onTabChange(tab.key)}
            disabled={isDisabled}
            variant="ghost"
            className={`ide-tab flex items-center gap-1.5 shrink-0 ${isActive ? ' active' : ''}`}
          >
            {isLoadingTab ? (
              <span
                className="w-4 h-4 rounded-full border-t border-current animate-spin shrink-0"
                style={{ borderColor: 'var(--primary)' }}
              />
            ) : (
              tab.icon
            )}
            <span className="hidden @[340px]:inline truncate max-w-[120px]">
              {tab.label}
            </span>
            {isLoadingTab && (
              <span
                className="ml-1 text-sm font-mono shrink-0"
                style={{ color: 'var(--primary)' }}
              >
                …
              </span>
            )}
          </Button>
        );

        if (isDisabled) {
          return (
            <Tooltip key={tab.key}>
              <TooltipTrigger
                render={
                  <span className="inline-flex" style={{ cursor: 'not-allowed' }}>
                    {button}
                  </span>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                Run &quot;Refine Draft&quot; first to unlock {tab.label}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Tooltip key={tab.key}>
            <TooltipTrigger render={button} />
            <TooltipContent side="bottom" className="text-xs">
              {tab.description}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
