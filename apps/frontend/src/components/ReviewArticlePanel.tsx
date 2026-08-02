'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CompleteStatusIcon } from '@/components/ui/icons/status';
import { ForwardNavigationIcon } from '@/components/ui/icons/navigation';

type ReviewArticlePanelProps = {
  title: string;
  body: string;
  findingCount: number;
  onOpenPublication: () => void;
};

export function ReviewArticlePanel({ title, body, findingCount, onOpenPublication }: ReviewArticlePanelProps) {
  const t = useTranslations('ReviewWorkspace');
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <header className="flex shrink-0 flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--success)]">
            <CompleteStatusIcon className="h-4 w-4" />
            <p className="text-xs font-semibold">{t('complete')}</p>
          </div>
          <h1 className="mt-1 truncate text-base font-semibold text-[var(--foreground)]">{title}</h1>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t('completeDescription', { count: findingCount })}</p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={onOpenPublication}>
          {t('openPublication')}
          <ForwardNavigationIcon className="h-3.5 w-3.5" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-6 py-10 prose-headings:font-sans prose-p:font-sans prose-li:font-sans">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
