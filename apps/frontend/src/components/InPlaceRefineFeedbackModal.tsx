'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CompleteStatusIcon } from '@/components/ui/icons/status';
import { Rocket, FileEdit } from 'lucide-react';

interface InPlaceRefineFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewResults: () => void;
  onStayInEditor: () => void;
  destination?: 'review' | 'publication';
}

export function InPlaceRefineFeedbackModal({
  open,
  onOpenChange,
  onViewResults,
  onStayInEditor,
  destination = 'review',
}: InPlaceRefineFeedbackModalProps) {
  const t = useTranslations('EditorWorkflow');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-[var(--surface-1)] border border-[var(--border)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--success)]/10 text-[var(--success)]">
            <CompleteStatusIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="ui-eyebrow">{t('completeEyebrow')}</p>
            <h3 className="text-base font-semibold text-[var(--foreground)] mt-0.5">
              {t('inPlaceRefineCompleteTitle')}
            </h3>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {t('inPlaceRefineCompleteDescription')}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onStayInEditor();
            }}
            className="w-full sm:w-auto justify-center gap-1.5"
          >
            <FileEdit className="h-3.5 w-3.5" />
            {t('stayInEditor')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onViewResults();
            }}
            className="w-full sm:w-auto justify-center gap-1.5"
          >
            <Rocket className="h-3.5 w-3.5" />
            {destination === 'publication' ? t('openPublication') : t('openReview')}
          </Button>
        </div>
      </div>
    </div>
  );
}
