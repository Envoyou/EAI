'use client';

import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2, Keyboard } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EditorialReadiness } from '@eai/shared';
import packageJson from '../../package.json';

interface StatusBarProps {
  wordCount: number;
  charCount: number;
  charLimit: number;
  readiness?: EditorialReadiness;
  isLoading: boolean;
  isStreaming: boolean;
  isRefining: boolean;
  activeTab: string;
  appVersion?: string;
  onOpenShortcuts?: () => void;
}

function ReadinessIcon({ readiness }: { readiness?: EditorialReadiness }) {
  if (readiness === 'ready') return <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} />;
  if (readiness === 'needs_review') return <AlertTriangle className="w-3 h-3" style={{ color: 'var(--warning)' }} />;
  if (readiness === 'blocked') return <ShieldAlert className="w-3 h-3" style={{ color: 'var(--error)' }} />;
  return null;
}

function readinessBadgeClass(readiness?: EditorialReadiness) {
  if (readiness === 'ready') return 'ui-badge-success';
  if (readiness === 'needs_review') return 'ui-badge-warning';
  if (readiness === 'blocked') return 'ui-badge-danger';
  return 'ui-badge-muted';
}

export default function StatusBar({
  wordCount,
  charCount,
  charLimit,
  readiness,
  isLoading,
  isStreaming,
  isRefining,
  activeTab,
  appVersion = packageJson.version,
  onOpenShortcuts,
}: StatusBarProps) {
  const isOverLimit = charCount > charLimit;

  return (
    <div className="ide-statusbar" aria-label="Workspace status">
      {/* Left: App info */}
      <Tooltip>
        <TooltipTrigger className="status-app-version ide-statusbar-item cursor-help select-none bg-[var(--surface-2)] text-muted-foreground font-semibold">
          EAI {appVersion}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          EAI Editorial Intelligence
        </TooltipContent>
      </Tooltip>

      <span className="status-active-tab ide-statusbar-item bg-[var(--surface-2)] text-muted-foreground font-semibold" style={{ textTransform: 'capitalize' }}>
        {activeTab === 'draft' ? 'Article Draft' : activeTab === 'analysis' ? 'Analysis' : 'Refined Draft'}
      </span>

      {/* Divider */}
      <div className="flex-1" />

      {/* Center / Right: contextual info */}

      {/* Loading indicator */}
      {(isLoading || isStreaming || isRefining) && (
        <span
          className="status-loading ui-badge ui-badge-primary max-sm:hidden"
          aria-live="polite"
          aria-label={isRefining ? "Refining draft" : "Analyzing draft"}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {isRefining ? 'Refining…' : (isStreaming ? 'Streaming…' : 'Analyzing…')}
        </span>
      )}

      {/* Final-draft readiness */}
      {readiness && !isLoading && (
        <span
          className={`status-verdict ui-badge max-sm:hidden ${readinessBadgeClass(readiness)}`}
          aria-label={`Editorial readiness: ${readiness.replace('_', ' ')}`}
        >
          <ReadinessIcon readiness={readiness} />
          {readiness === 'ready' ? 'Ready for review' : readiness === 'needs_review' ? 'Needs review' : 'Blocked'}
        </span>
      )}

      {/* Word count */}
      {wordCount > 0 && (
        <span
          className="status-wordcount text-[11px] font-medium text-[var(--muted-foreground)] max-sm:hidden"
          aria-label={`${wordCount} words`}
        >
          {wordCount.toLocaleString()} words
        </span>
      )}

      {/* Char count */}
      <span
        className={`status-charcount text-[11px] font-medium max-sm:hidden ${isOverLimit ? 'text-[var(--error)]' : 'text-[var(--muted-foreground)]'}`}
        aria-label={`${charCount} of ${charLimit} characters`}
        aria-live={isOverLimit ? 'assertive' : 'off'}
      >
        {charCount.toLocaleString()} / {charLimit.toLocaleString()} chars
      </span>

      {/* Shortcut hint */}
      {!isLoading && !isStreaming && !isRefining && activeTab === 'draft' && (
        <span className="status-shortcut ui-badge ui-badge-muted max-sm:hidden" aria-label="Press Ctrl+Enter to refine">
          <kbd
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-mono border-none"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--muted-foreground)',
              lineHeight: '1.4',
            }}
          >
            Ctrl+↵
          </kbd>
          <span className="ml-1">to Refine</span>
        </span>
      )}

      {/* Shortcuts Trigger */}
      {onOpenShortcuts && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={onOpenShortcuts}
                className="status-shortcuts-button ide-statusbar-item hover:bg-[var(--surface-2)] transition-colors rounded-sm px-1.5 ml-1 max-sm:hidden"
                aria-label="View Keyboard Shortcuts"
              >
                <Keyboard className="w-3.5 h-3.5" />
              </button>
            }
          />
          <TooltipContent side="top" className="text-xs">
            Keyboard Shortcuts (?)
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
