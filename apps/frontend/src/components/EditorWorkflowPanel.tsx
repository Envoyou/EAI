'use client';

import { useTranslations } from 'next-intl';
import type { EditorialProcessStage } from '@eai/shared';
import type { EditorHandoffState } from '@/workspace/types';
import EditorialProgress from '@/components/EditorialProgress';
import { Button } from '@/components/ui/button';
import { CompleteStatusIcon, SavedToCloudStatusIcon } from '@/components/ui/icons/status';
import { DocumentIcon } from '@/components/ui/icons/content';
import { ForwardNavigationIcon } from '@/components/ui/icons/navigation';

interface EditorWorkflowPanelProps {
  isProcessing: boolean;
  processStage: EditorialProcessStage;
  processStartedAt: number | null;
  includeSeoStage: boolean;
  handoff: EditorHandoffState | null;
  onOpenDestination: () => void;
  onFinishLater: () => void;
  onContinueEditing: () => void;
}

export function EditorWorkflowPanel({
  isProcessing,
  processStage,
  processStartedAt,
  includeSeoStage,
  handoff,
  onOpenDestination,
  onFinishLater,
  onContinueEditing,
}: EditorWorkflowPanelProps) {
  const t = useTranslations('EditorWorkflow');

  if (isProcessing) {
    return (
      <div className="h-full min-h-0 overflow-hidden border-l border-[var(--border)] bg-[var(--surface-1)]">
        <EditorialProgress
          compact
          stage={processStage}
          startedAt={processStartedAt}
          includeSeoStage={includeSeoStage}
        />
      </div>
    );
  }

  if (!handoff) return null;

  const opensPublication = handoff.destination === 'publication';

  return (
    <section
      className="flex h-full min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface-1)]"
      aria-labelledby="editor-workflow-handoff-title"
    >
      <div className="border-b border-[var(--border)] px-5 py-4">
        <p className="ui-eyebrow">{t('completeEyebrow')}</p>
        <h2 id="editor-workflow-handoff-title" className="mt-1 text-sm font-semibold text-[var(--foreground)]">
          {opensPublication ? t('publicationTitle') : t('reviewTitle')}
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="ui-state-card p-5">
          <CompleteStatusIcon className="h-7 w-7 text-[var(--success)]" />
          <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">
            {opensPublication
              ? t('publicationReady')
              : t('reviewReady', { count: handoff.unresolvedFindingCount })}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {opensPublication ? t('publicationDescription') : t('reviewDescription')}
          </p>

          <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
            <div className="flex items-start gap-2.5">
              <SavedToCloudStatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
              <div>
                <p className="text-xs font-semibold text-[var(--foreground)]">{t('draftSaved')}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                  {t('draftSavedDescription')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
              <div>
                <p className="text-xs font-semibold text-[var(--foreground)]">
                  {handoff.hasSeoPackage ? t('seoIncluded') : t('seoPending')}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                  {handoff.hasSeoPackage ? t('seoIncludedDescription') : t('seoPendingDescription')}
                </p>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            className="mt-5 w-full justify-center"
            onClick={onOpenDestination}
          >
            {opensPublication ? t('openPublication') : t('openReview')}
            <ForwardNavigationIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="surface"
            size="sm"
            className="mt-2 w-full justify-center"
            onClick={onFinishLater}
          >
            {t('finishLater')}
          </Button>
          <Button
            type="button"
            variant="muted"
            size="sm"
            className="mt-2 w-full justify-center"
            onClick={onContinueEditing}
          >
            {t('continueEditing')}
          </Button>
        </div>
      </div>
    </section>
  );
}
