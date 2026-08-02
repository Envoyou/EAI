'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import type { ResearchNote } from '@eai/shared';
import { Button } from '@/components/ui/button';
import { CompleteStatusIcon, QualityPassedStatusIcon } from '@/components/ui/icons/status';
import { ForwardNavigationIcon, HistoryNavigationIcon, AuditLogsNavigationIcon } from '@/components/ui/icons/navigation';
import { RevisionComparisonIcon, DocumentIcon } from '@/components/ui/icons/content';

type ReviewTab = 'comparison' | 'final' | 'source' | 'blueprint' | 'timeline';

type ReviewArticlePanelProps = {
  title: string;
  body: string;
  sourceDraft?: string;
  researchNotes?: (ResearchNote | string)[];
  findingCount: number;
  readinessScore?: number;
  analysisLogId?: string;
  onOpenPublication: () => void;
};

export function ReviewArticlePanel({
  title,
  body,
  sourceDraft,
  researchNotes = [],
  findingCount,
  readinessScore = 100,
  analysisLogId,
  onOpenPublication,
}: ReviewArticlePanelProps) {
  const t = useTranslations('ReviewWorkspace');
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTab>('comparison');

  const initialText = sourceDraft?.trim() || body;
  const finalPolishedText = body;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      {/* Article Family Audit Header */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between bg-[var(--surface-1)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--success)]">
            <CompleteStatusIcon className="h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wider">{t('historyAuditTitle')}</p>
            {analysisLogId && (
              <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--muted-foreground)]">
                {analysisLogId.slice(-8)}
              </span>
            )}
          </div>
          <h1 className="mt-1 truncate text-base font-bold text-[var(--foreground)]">{title || 'Untitled Article'}</h1>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {t('completeDescription', { count: findingCount })} • {t('readinessScoreLabel')}: <span className="font-semibold text-[var(--success)]">{readinessScore}%</span>
          </p>
        </div>
        <Button type="button" variant="primary" size="sm" onClick={onOpenPublication}>
          {t('openPublication')}
          <ForwardNavigationIcon className="h-3.5 w-3.5 ml-1" />
        </Button>
      </header>

      {/* Navigation Segment Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-2 overflow-x-auto">
        <Button
          type="button"
          variant={activeReviewTab === 'comparison' ? 'primary' : 'ghost'}
          size="xs"
          onClick={() => setActiveReviewTab('comparison')}
          className="text-xs"
        >
          <RevisionComparisonIcon className="h-3.5 w-3.5 mr-1" />
          {t('tabComparison')}
        </Button>
        <Button
          type="button"
          variant={activeReviewTab === 'final' ? 'primary' : 'ghost'}
          size="xs"
          onClick={() => setActiveReviewTab('final')}
          className="text-xs"
        >
          <QualityPassedStatusIcon className="h-3.5 w-3.5 mr-1" />
          {t('tabFinal')}
        </Button>
        <Button
          type="button"
          variant={activeReviewTab === 'source' ? 'primary' : 'ghost'}
          size="xs"
          onClick={() => setActiveReviewTab('source')}
          className="text-xs"
        >
          <DocumentIcon className="h-3.5 w-3.5 mr-1" />
          {t('tabSource')}
        </Button>
        <Button
          type="button"
          variant={activeReviewTab === 'blueprint' ? 'primary' : 'ghost'}
          size="xs"
          onClick={() => setActiveReviewTab('blueprint')}
          className="text-xs"
        >
          <AuditLogsNavigationIcon className="h-3.5 w-3.5 mr-1" />
          {t('tabBlueprint')}
        </Button>
        <Button
          type="button"
          variant={activeReviewTab === 'timeline' ? 'primary' : 'ghost'}
          size="xs"
          onClick={() => setActiveReviewTab('timeline')}
          className="text-xs"
        >
          <HistoryNavigationIcon className="h-3.5 w-3.5 mr-1" />
          {t('tabTimeline')}
        </Button>
      </div>

      {/* Tab Contents */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {activeReviewTab === 'comparison' && (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] px-2">
              <span className="font-semibold text-[var(--foreground)]">{t('initialDraftLabel')}</span>
              <span className="font-semibold text-[var(--primary)]">{t('finalDraftLabel')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Source Draft */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between border-b border-[var(--border)]/60 pb-2">
                  <span className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">{t('initialDraftLabel')}</span>
                  <span className="text-[11px] font-mono text-[var(--muted-foreground)]">{initialText.split(/\s+/).filter(Boolean).length} words</span>
                </div>
                <div className="prose prose-neutral dark:prose-invert max-w-none text-xs leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{initialText}</ReactMarkdown>
                </div>
              </div>

              {/* Right: Polished Final Draft */}
              <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--surface-1)] p-5 shadow-sm ring-1 ring-[var(--primary)]/20">
                <div className="mb-3 flex items-center justify-between border-b border-[var(--border)]/60 pb-2">
                  <span className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">{t('finalDraftLabel')}</span>
                  <span className="text-[11px] font-mono text-[var(--primary)]">{finalPolishedText.split(/\s+/).filter(Boolean).length} words</span>
                </div>
                <div className="prose prose-neutral dark:prose-invert max-w-none text-xs leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalPolishedText}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeReviewTab === 'final' && (
          <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-4 py-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalPolishedText}</ReactMarkdown>
          </article>
        )}

        {activeReviewTab === 'source' && (
          <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-4 py-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{initialText}</ReactMarkdown>
          </article>
        )}

        {activeReviewTab === 'blueprint' && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-sm">
              <h2 className="text-sm font-bold text-[var(--foreground)] mb-2">{t('blueprintTitle')}</h2>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                {t('blueprintDesc')}
              </p>
            </div>
            {researchNotes.length > 0 ? (
              <div className="space-y-2">
                {researchNotes.map((note, idx) => {
                  const noteText = typeof note === 'string' ? note : note.content;
                  return (
                    <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs text-[var(--foreground)]">
                      {noteText}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-6 text-center text-xs text-[var(--muted-foreground)]">
                {t('noNotes')}
              </div>
            )}
          </div>
        )}

        {activeReviewTab === 'timeline' && (
          <div className="mx-auto max-w-2xl space-y-4 py-4">
            <h2 className="text-sm font-bold text-[var(--foreground)] mb-4">{t('auditTrailTitle')}</h2>
            <div className="relative border-l-2 border-[var(--border)] pl-6 space-y-6">
              <div className="relative">
                <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-[var(--primary)]" />
                <h3 className="text-xs font-bold text-[var(--foreground)]">{t('step1Title')}</h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t('step1Desc')}</p>
              </div>
              <div className="relative">
                <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-[var(--primary)]" />
                <h3 className="text-xs font-bold text-[var(--foreground)]">{t('step2Title')}</h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t('step2Desc')}</p>
              </div>
              <div className="relative">
                <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-[var(--primary)]" />
                <h3 className="text-xs font-bold text-[var(--foreground)]">{t('step3Title')}</h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t('step3Desc')}</p>
              </div>
              <div className="relative">
                <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-[var(--success)]" />
                <h3 className="text-xs font-bold text-[var(--success)]">{t('step4Title')}</h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t('step4Desc')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
