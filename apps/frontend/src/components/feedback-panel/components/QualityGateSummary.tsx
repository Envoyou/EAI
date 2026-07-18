'use client';

import { AnalysisResult } from '@eai/shared';
import { ShieldAlert, Wand2, Maximize2, Minimize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface QualityGateSummaryProps {
  result: AnalysisResult;
  title?: string;
  isFocused?: boolean;
  onFocusToggle?: () => void;
  onApplyAll?: () => void;
  autoApplicableCount: number;
  isManualFallback: boolean;
  isCompactFallback: boolean;
}

export function QualityGateSummary({
  result,
  title,
  isFocused,
  onFocusToggle,
  onApplyAll,
  autoApplicableCount,
  isManualFallback,
  isCompactFallback,
}: QualityGateSummaryProps) {
  const readiness = result.readiness;
  const readinessClass =
    readiness === 'ready'
      ? 'ui-badge-success'
      : readiness === 'needs_review'
        ? 'ui-badge-warning'
        : readiness === 'blocked'
          ? 'ui-badge-danger'
          : 'ui-badge-muted';

  const readinessLabel =
    readiness === 'ready'
      ? 'Ready for Editorial Review'
      : readiness === 'needs_review'
        ? 'Needs Review'
        : readiness === 'blocked'
          ? 'Blocked'
          : 'Legacy Review';

  return (
    <div className="ui-panel-header px-4 py-3">
      {/* Row 1: title + verdict + focus toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
            Editorial Review
          </p>
          <h2
            className="text-[13px] font-semibold text-[var(--foreground)] break-words whitespace-normal"
            title={title}
          >
            {title || 'Untitled Draft'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {(readiness || result.verdict) && (
            <span className={`ui-badge ui-badge-xs tracking-wide ${readinessClass}`}>
              {readinessLabel}
            </span>
          )}
          {result.responseMode && (
            <span className="ui-badge ui-badge-xs ui-badge-muted uppercase tracking-wide">
              {result.responseMode.replace('_', ' ')}
            </span>
          )}
          {onFocusToggle && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={onFocusToggle}
                    className="ui-btn ui-btn-muted ui-btn-icon !h-[30px] !w-[30px]"
                    aria-label={isFocused ? 'Restore split view' : 'Focus editorial review'}
                  >
                    {isFocused ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {isFocused ? 'Restore Split View' : 'Focus Panel'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Row 2: Final-draft quality gate summary */}
      <div className="feedback-score-summary flex items-start gap-4 mt-3">
        {result.summary && (
          <p className="text-xs leading-relaxed flex-1 text-[var(--foreground)] opacity-80 break-words whitespace-pre-wrap">
            {result.summary}
          </p>
        )}
      </div>

      {/* Alerts (Borderless) */}
      {isManualFallback && (
        <div className="ui-alert ui-alert-warning mt-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-xs font-semibold ui-text">Manual Fallback Mode</p>
            <p className="mt-0.5 text-[11px] leading-relaxed ui-muted">
              AI review completed, auto-apply disabled to prevent truncation issues.
            </p>
          </div>
        </div>
      )}
      {isCompactFallback && (
        <div className="ui-alert ui-alert-muted mt-3 !p-2.5">
          <p className="text-[11px] ui-muted">
            Compact mode active — optimized for heavier drafts.
          </p>
        </div>
      )}

      {onApplyAll && autoApplicableCount > 0 && !isManualFallback && (
        <div className="feedback-apply-all mt-3 flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <p className="text-xs flex-1 ui-text">
            <span className="font-semibold">{autoApplicableCount}</span> suggested
            edits can be applied.
          </p>
          <button onClick={onApplyAll} className="ui-btn ui-btn-primary ui-btn-xs">
            <Wand2 className="w-3.5 h-3.5" />
            Apply All
          </button>
        </div>
      )}
    </div>
  );
}
