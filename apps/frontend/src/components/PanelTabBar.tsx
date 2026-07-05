'use client';

import { FileEdit, FileCheck, PanelRight, PanelLeft } from 'lucide-react';
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
  showFeedbackSidebar = true,
  onToggleFeedbackSidebar,
  showHistorySidebar = true,
  onToggleHistorySidebar,
  showNotesSidebar = true,
  onToggleNotesSidebar,
  layoutReversed = false,
}: PanelTabBarProps) {
  // When layout is reversed, swap the left ↔ right toggle icons and their handlers
  const leftToggleActive   = layoutReversed ? (showFeedbackSidebar || showNotesSidebar) : showHistorySidebar;
  const leftToggleHandler  = layoutReversed
    ? (activeTab === 'refined' ? onToggleFeedbackSidebar : onToggleNotesSidebar)
    : onToggleHistorySidebar;
  const leftToggleLabel    = layoutReversed ? 'AI Copilot' : 'History';
  const leftIcon           = layoutReversed ? <PanelRight className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />;

  const rightToggleActiveFeedback = layoutReversed ? showHistorySidebar : showFeedbackSidebar;
  const rightToggleActiveNotes    = layoutReversed ? showHistorySidebar : showNotesSidebar;
  const rightFeedbackHandler      = layoutReversed ? onToggleHistorySidebar : onToggleFeedbackSidebar;
  const rightNotesHandler         = layoutReversed ? onToggleHistorySidebar : onToggleNotesSidebar;
  const rightIcon                 = layoutReversed ? <PanelLeft className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />;
  return (
    <div className="ide-tabbar" role="tablist" aria-label="Editor Panels">
      {/* Left Sidebar Toggle Button */}
      {(onToggleHistorySidebar || layoutReversed) && (
        <div className="flex items-center px-2 mr-1 border-r border-[var(--border)] max-sm:hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={leftToggleHandler}
                  className={`
                    w-7.5 h-7.5 flex items-center justify-center rounded-md transition-colors text-xs border border-transparent cursor-pointer
                    ${leftToggleActive
                      ? 'bg-[var(--surface-2)] text-[var(--foreground)]'
                      : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'}
                  `}
                  aria-label={leftToggleActive ? `Hide ${leftToggleLabel} Panel` : `Show ${leftToggleLabel} Panel`}
                >
                  {leftIcon}
                </button>
              }
            />
            <TooltipContent side="bottom" className="text-xs">
              {leftToggleActive ? `Hide ${leftToggleLabel}` : `Show ${leftToggleLabel}`}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

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

      {/* Right Sidebar Toggle Button for Feedback */}
      {activeTab === 'refined' && hasResult && (onToggleFeedbackSidebar || layoutReversed) && (
        <div className="pr-3 flex items-center max-sm:hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={rightFeedbackHandler}
                  className={`
                    w-7.5 h-7.5 flex items-center justify-center rounded-md transition-colors text-xs border border-transparent cursor-pointer
                    ${rightToggleActiveFeedback
                      ? 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                      : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'}
                  `}
                  aria-label={rightToggleActiveFeedback ? 'Hide Assistant Panel' : 'Show Assistant Panel'}
                >
                  {rightIcon}
                </button>
              }
            />
            <TooltipContent side="bottom" className="text-xs">
              {rightToggleActiveFeedback ? 'Hide Assistant' : 'Show Assistant'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Right Sidebar Toggle Button for Notes Studio */}
      {activeTab === 'draft' && (onToggleNotesSidebar || layoutReversed) && (
        <div className="pr-3 flex items-center max-sm:hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={rightNotesHandler}
                  className={`
                    w-7.5 h-7.5 flex items-center justify-center rounded-md transition-colors text-xs border border-transparent cursor-pointer
                    ${rightToggleActiveNotes
                      ? 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                      : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'}
                  `}
                  aria-label={rightToggleActiveNotes ? 'Hide Assistant Panel' : 'Show Assistant Panel'}
                >
                  {rightIcon}
                </button>
              }
            />
            <TooltipContent side="bottom" className="text-xs">
              {rightToggleActiveNotes ? 'Hide Assistant' : 'Show Assistant'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
