'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileSearch,
  MessageSquareText,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DeepResearchReport } from '@/lib/hooks/useContentStrategist';
import {
  extractDynamicSuggestions,
  normalizeStrategistMarkdown,
} from '@/lib/strategist-utils';

interface DeepResearchReportTabProps {
  reports: DeepResearchReport[];
  maxReports: number;
  onDeleteReport: (reportId: string) => void;
  onDiscussReport: (reportId: string, prompt?: string) => void;
}

export function DeepResearchReportTab({
  reports,
  maxReports,
  onDeleteReport,
  onDiscussReport,
}: DeepResearchReportTabProps) {
  const t = useTranslations('DeepResearchReport');
  const locale = useLocale();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const selectedReport = reports.find(report => report.id === selectedReportId) ?? null;
  const parsedReport = useMemo(
    () => extractDynamicSuggestions(selectedReport?.content ?? ''),
    [selectedReport?.content]
  );
  const displayReport = useMemo(
    () => normalizeStrategistMarkdown(parsedReport.displayContent),
    [parsedReport.displayContent]
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    [locale]
  );

  const copyReport = async () => {
    if (!selectedReport) return;
    await navigator.clipboard.writeText(selectedReport.content);
    toast.success(t('copied'));
  };

  const downloadReport = () => {
    if (!selectedReport) return;
    const blob = new Blob([selectedReport.content], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eai-deep-research-${new Date(selectedReport.createdAt).toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(t('downloaded'));
  };

  const deleteReport = (report: DeepResearchReport) => {
    if (!window.confirm(t('confirmDelete', { title: report.title }))) return;
    onDeleteReport(report.id);
    if (selectedReportId === report.id) setSelectedReportId(null);
  };

  if (reports.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <FileSearch className="mb-3 size-11 text-[var(--primary)] opacity-30" />
        <p className="mb-1 text-xs font-semibold text-[var(--foreground)]">
          {t('emptyTitle')}
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">
          {t('emptyDescription')}
        </p>
      </div>
    );
  }

  if (!selectedReport) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileSearch className="size-4 text-[var(--primary)]" />
                <h2 className="text-xs font-semibold text-[var(--foreground)]">
                  {t('libraryTitle')}
                </h2>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
                {t('libraryDescription')}
              </p>
            </div>
            <Badge
              variant={reports.length >= maxReports ? 'warning' : 'primary'}
              size="xs"
              className="shrink-0"
            >
              {reports.length}/{maxReports}
            </Badge>
          </div>

          {reports.length >= maxReports && (
            <Alert variant="warning" className="mt-2.5 text-xs">
              <AlertTriangle className="size-3.5" />
              <AlertDescription className="text-xs">
                {t('limitAlert', { max: maxReports })}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2.5">
          <div className="space-y-2">
            {reports.map((report, index) => (
              <div
                key={report.id}
                className="group flex items-stretch overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-sm transition-colors hover:bg-[var(--surface-2)]"
              >
                <Button
                  type="button"
                  onClick={() => setSelectedReportId(report.id)}
                  variant="muted"
                  className="strategist-report-card-action h-auto min-w-0 flex-1 justify-start px-3 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-[var(--foreground)]">
                        {report.title}
                      </span>
                      {index === 0 && (
                        <Badge variant="success" size="xs" className="shrink-0">
                          {t('latest')}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">
                      {dateFormatter.format(new Date(report.createdAt))}
                    </span>
                  </span>
                </Button>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        onClick={() => deleteReport(report)}
                        variant="muted"
                        size="icon-sm"
                        className="strategist-report-card-action strategist-report-card-delete h-auto shrink-0 border-l border-[var(--border)]"
                        aria-label={t('delete')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent side="left" className="text-xs">
                    {t('delete')}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              type="button"
              onClick={() => setSelectedReportId(null)}
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={t('backToReports')}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xs font-semibold text-[var(--foreground)]">
                  {selectedReport.title}
                </h2>
                <Badge variant="success" size="xs" className="shrink-0 gap-1">
                  <CheckCircle2 className="size-2.5" />
                  {t('saved')}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                {dateFormatter.format(new Date(selectedReport.createdAt))}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={copyReport}
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('copy')}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {t('copy')}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={downloadReport}
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('download')}
                  >
                    <Download className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {t('download')}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={() => deleteReport(selectedReport)}
                    variant="muted"
                    size="icon-xs"
                    className="strategist-report-toolbar-delete"
                    aria-label={t('delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                {t('delete')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => onDiscussReport(selectedReport.id)}
          variant="primary"
          size="sm"
          className="mt-2.5 w-full justify-center gap-1.5 text-xs"
        >
          <MessageSquareText className="size-3.5" />
          {t('discuss')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <article className="deep-report-prose strategist-prose mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-7">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, ...props }) => (
                <a {...props} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ),
              table: ({ children, ...props }) => (
                <div className="my-4 min-w-0">
                  <div className="px-1 pb-1.5 text-[9px] text-[var(--muted-foreground)] sm:hidden select-none">
                    {t('swipeTable')}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table {...props}>{children}</table>
                  </div>
                </div>
              ),
            }}
          >
            {displayReport}
          </ReactMarkdown>

          {parsedReport.suggestions && parsedReport.suggestions.length > 0 && (
            <section className="not-prose mt-7 border-t border-[var(--border)] pt-5">
              <h3 className="mb-2 text-xs font-semibold text-[var(--foreground)]">
                {t('nextSteps')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {parsedReport.suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    onClick={() => onDiscussReport(selectedReport.id, suggestion)}
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 whitespace-normal text-left text-xs"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
