'use client';

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { CheckCircle2, AlertTriangle, ShieldAlert, Keyboard, ArrowLeftRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EditorialReadiness } from '@eai/shared';
import packageJson from '../../package.json';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

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
  layoutReversed?: boolean;
  onToggleLayoutReversed?: () => void;
}

function ReadinessIcon({ readiness }: { readiness?: EditorialReadiness }) {
  if (readiness === 'ready') return <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} />;
  if (readiness === 'needs_review') return <AlertTriangle className="w-3 h-3" style={{ color: 'var(--warning)' }} />;
  if (readiness === 'blocked') return <ShieldAlert className="w-3 h-3" style={{ color: 'var(--error)' }} />;
  return null;
}

function readinessBadgeVariant(readiness?: EditorialReadiness): BadgeVariant {
  if (readiness === 'ready') return 'success';
  if (readiness === 'needs_review') return 'warning';
  if (readiness === 'blocked') return 'danger';
  return 'muted';
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
  layoutReversed = false,
  onToggleLayoutReversed,
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
        <Badge
          variant="primary"
          className="status-loading hidden sm:inline-flex"
          aria-live="polite"
          aria-label={isRefining ? "Refining draft" : "Analyzing draft"}
        >
          <EAILoaderStatusIcon className="w-3.5 h-3.5" />
          {isRefining ? 'Refining…' : (isStreaming ? 'Streaming…' : 'Analyzing…')}
        </Badge>
      )}

      {/* Final-draft readiness */}
      {readiness && !isLoading && (
        <Badge
          variant={readinessBadgeVariant(readiness)}
          className="status-verdict hidden sm:inline-flex"
          aria-label={`Editorial readiness: ${readiness.replace('_', ' ')}`}
        >
          <ReadinessIcon readiness={readiness} />
          {readiness === 'ready' ? 'Ready for review' : readiness === 'needs_review' ? 'Needs review' : 'Blocked'}
        </Badge>
      )}

      {/* Word count */}
      {wordCount > 0 && (
        <span
          className="status-wordcount text-[11px] font-medium text-[var(--muted-foreground)] hidden sm:inline"
          aria-label={`${wordCount} words`}
        >
          {wordCount.toLocaleString()} words
        </span>
      )}

      {/* Char count */}
      <span
        className={`status-charcount text-[11px] font-medium hidden sm:inline ${isOverLimit ? 'text-[var(--error)]' : 'text-[var(--muted-foreground)]'}`}
        aria-label={`${charCount} of ${charLimit} characters`}
        aria-live={isOverLimit ? 'assertive' : 'off'}
      >
        {charCount.toLocaleString()} / {charLimit.toLocaleString()} chars
      </span>

      {/* Shortcut hint */}
      {!isLoading && !isStreaming && !isRefining && activeTab === 'draft' && (
        <div className="status-shortcut hidden sm:inline-flex items-center text-[11px] font-medium text-[var(--muted-foreground)]" aria-label="Press Ctrl+Enter to refine">
          <kbd
            className="inline-flex items-center px-1 py-0.5 rounded-md text-[11px] font-mono border-none bg-transparent"
            style={{
              color: 'var(--muted-foreground)',
              lineHeight: '1.4',
            }}
          >
            Ctrl+↵
          </kbd>
          <span className="ml-0.5">to Refine</span>
        </div>
      )}

      {/* Layout Swap Trigger */}
      {onToggleLayoutReversed && (
        <div className="hidden sm:inline-flex">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  onClick={onToggleLayoutReversed}
                  variant="muted"
                  size="icon-xs"
                  className={`ide-statusbar-item hover:bg-[var(--surface-2)] transition-colors rounded-sm ml-1 ${layoutReversed ? 'text-[var(--primary)]' : ''}`}
                  aria-label="Swap panel positions"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top" className="text-xs">
              {layoutReversed ? 'Layout: AI left · Document right (click to reset)' : 'Layout: Document left · AI right (click to swap)'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Shortcuts Trigger */}
      {onOpenShortcuts && (
        <div className="hidden sm:inline-flex">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  onClick={onOpenShortcuts}
                  variant="muted"
                  size="icon-xs"
                  className="status-shortcuts-button ide-statusbar-item hover:bg-[var(--surface-2)] transition-colors rounded-sm ml-1"
                  aria-label="View Keyboard Shortcuts"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top" className="text-xs">
              Keyboard Shortcuts (?)
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
