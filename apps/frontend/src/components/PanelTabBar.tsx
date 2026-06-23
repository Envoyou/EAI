'use client';

import { FileEdit, FileDiff, PanelRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    icon: <FileDiff className="w-4 h-4" />,
    description: 'Polished publication draft',
  },
];

export default function PanelTabBar({
  activeTab,
  onTabChange,
  hasResult,
  isLoading,
  showFeedbackSidebar = true,
  onToggleFeedbackSidebar,
}: PanelTabBarProps) {
  return (
    <div className="ide-tabbar" role="tablist" aria-label="Editor Panels">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const isDisabled = tab.key !== 'draft' && !hasResult && !isLoading;
        const isLoadingTab = isLoading && tab.key === 'refined';

        const button = (
          <button
            type="button"
            key={tab.key}
            id={`panel-tab-${tab.key}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.key}`}
            onClick={() => !isDisabled && !isLoading && onTabChange(tab.key)}
            disabled={isDisabled}
            className={`ide-tab${isActive ? ' active' : ''}`}
          >
            {isLoadingTab ? (
              <span
                className="w-4 h-4 rounded-full border-t border-current animate-spin"
                style={{ borderColor: 'var(--primary)' }}
              />
            ) : (
              tab.icon
            )}
            {tab.label}
            {isLoadingTab && (
              <span
                className="ml-1 text-sm font-mono"
                style={{ color: 'var(--primary)' }}
              >
                …
              </span>
            )}
          </button>
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

      {/* Right spacer / breadcrumb area */}
      <div className="flex-1" />

      {/* Sidebar Toggle Button */}
      {activeTab === 'refined' && hasResult && onToggleFeedbackSidebar && (
        <div className="pr-3 flex items-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={onToggleFeedbackSidebar}
                  className={`
                    w-7.5 h-7.5 flex items-center justify-center rounded-md transition-colors text-xs border border-transparent cursor-pointer
                    ${showFeedbackSidebar 
                      ? 'bg-primary-100/70 dark:bg-primary-950/45 text-[var(--primary)]' 
                      : 'bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}
                  `}
                  aria-label={showFeedbackSidebar ? 'Hide Feedback Panel' : 'Show Feedback Panel'}
                >
                  <PanelRight className="w-4 h-4" />
                </button>
              }
            />
            <TooltipContent side="bottom" className="text-xs">
              {showFeedbackSidebar ? 'Hide Feedback' : 'Show Feedback'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
