'use client';

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnalysisResult } from '@eai/shared';
import { ShieldAlert, Wand2, Maximize2, Minimize2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface QualityGateSummaryProps {
  result: AnalysisResult;
  title?: string;
  isFocused?: boolean;
  onFocusToggle?: () => void;
  onApplyAll?: () => Promise<void>;
  autoApplicableCount: number;
  isManualFallback: boolean;
}

export function QualityGateSummary({
  result,
  title,
  isFocused,
  onFocusToggle,
  onApplyAll,
  autoApplicableCount,
  isManualFallback,
}: QualityGateSummaryProps) {
  const t = useTranslations('FeedbackPanel');
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const readiness = result.readiness;
  const readinessVariant: BadgeVariant =
    readiness === 'ready'
      ? 'success'
      : readiness === 'needs_review'
        ? 'warning'
        : readiness === 'blocked'
          ? 'danger'
          : 'muted';

  const readinessLabel =
    readiness === 'ready'
      ? t('allChecksCompleted')
      : readiness === 'needs_review'
        ? t('editorDecisionNeeded')
        : readiness === 'blocked'
          ? t('publishingBlocked')
          : t('reviewInProgress');

  return (
    <div className="ui-panel-header px-4 py-3">
      {/* Row 1: title + verdict + focus toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
            {t('editorialReview')}
          </p>
          <h2
            className="text-[13px] font-semibold text-[var(--foreground)] break-words whitespace-normal"
            title={title}
          >
            {title || t('untitledDraft')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {(readiness || result.verdict) && (
            <Badge variant={readinessVariant} size="xs" className="tracking-wide">
              {readinessLabel}
            </Badge>
          )}
          {onFocusToggle && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={onFocusToggle}
                    variant="muted"
                    size="icon-sm"
                    aria-label={isFocused ? t('restoreSplitView') : t('focusEditorialReview')}
                  >
                    {isFocused ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {isFocused ? t('restoreSplitView') : t('focusPanel')}
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
        <Alert variant="warning" className="mt-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-xs font-semibold ui-text">{t('manualReviewRequired')}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed ui-muted">
              {t('manualReviewRequiredDescription')}
            </p>
          </div>
        </Alert>
      )}
      {onApplyAll && autoApplicableCount > 0 && !isManualFallback && (
        <div className="feedback-apply-all mt-3 flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          <p className="text-xs flex-1 ui-text">
            {t('autoApplicableEdits', { count: autoApplicableCount })}
          </p>
          <Button
            type="button"
            onClick={async () => {
              if (isApplyingAll) return;
              setIsApplyingAll(true);
              try {
                await onApplyAll();
              } finally {
                setIsApplyingAll(false);
              }
            }}
            disabled={isApplyingAll}
            variant="primary"
            size="xs"
          >
            {isApplyingAll ? (
              <EAILoaderStatusIcon className="w-3.5 h-3.5" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            {isApplyingAll ? t('applyingAndVerifying') : t('applyAndVerify')}
          </Button>
        </div>
      )}
    </div>
  );
}
