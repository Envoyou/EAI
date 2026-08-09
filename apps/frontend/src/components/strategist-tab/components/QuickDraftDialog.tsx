'use client';

import { useTranslations } from 'next-intl';
import type { QuickDraftMode } from '@/lib/hooks/useContentStrategist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { CancelActionIcon } from '@/components/ui/icons/actions';

type QuickDraftDialogProps = {
  mode: QuickDraftMode | null;
  onModeChange: (mode: QuickDraftMode) => void;
  onClose: () => void;
  topic: string;
  onTopicChange: (value: string) => void;
  outline: string;
  onOutlineChange: (value: string) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  output: string;
  error: string | null;
  generating: boolean;
  onSubmit: () => Promise<void>;
};

export function QuickDraftDialog({
  mode,
  onModeChange,
  onClose,
  topic,
  onTopicChange,
  outline,
  onOutlineChange,
  reference,
  onReferenceChange,
  output,
  error,
  generating,
  onSubmit,
}: QuickDraftDialogProps) {
  const t = useTranslations('QuickDraft');
  if (!mode) return null;

  const needsReference = mode === 'reference' || mode === 'press_release';
  const canSubmit = Boolean(
    topic.trim() && (!needsReference || reference.trim()) && !generating
  );

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-draft-title"
      onClick={() => { if (!generating) onClose(); }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id="quick-draft-title" className="text-sm font-semibold text-[var(--foreground)]">
              {t('title')}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t('description')}</p>
          </div>
          <Button
            type="button"
            variant="muted"
            size="icon-xs"
            onClick={onClose}
            disabled={generating}
            aria-label={t('close')}
          >
            <CancelActionIcon className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--foreground)]">{t('modeLabel')}</span>
            <Select value={mode} onValueChange={(value) => value && onModeChange(value as QuickDraftMode)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="topic">{t('mode.topic')}</SelectItem>
                <SelectItem value="outline">{t('mode.outline')}</SelectItem>
                <SelectItem value="reference">{t('mode.reference')}</SelectItem>
                <SelectItem value="press_release">{t('mode.pressRelease')}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--foreground)]">{t('topicLabel')}</span>
            <Input
              variant="surface"
              value={topic}
              onChange={(event) => onTopicChange(event.target.value)}
              placeholder={t('topicPlaceholder')}
              disabled={generating}
            />
          </label>

          {mode === 'topic' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[var(--foreground)]">{t('outlineLabel')}</span>
              <Textarea
                variant="surface"
                value={outline}
                onChange={(event) => onOutlineChange(event.target.value)}
                placeholder={t('outlinePlaceholder')}
                rows={5}
                disabled={generating}
              />
            </label>
          )}

          {needsReference && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[var(--foreground)]">{t('referenceLabel')}</span>
              <Textarea
                variant="surface"
                value={reference}
                onChange={(event) => onReferenceChange(event.target.value)}
                placeholder={t('referencePlaceholder')}
                rows={8}
                disabled={generating}
              />
            </label>
          )}

          {output && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs whitespace-pre-wrap text-[var(--foreground)]">
              {output}
            </div>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={generating}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {generating && <EAILoaderStatusIcon className="h-3.5 w-3.5" />}
            {generating ? t('generating') : t('generate')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
