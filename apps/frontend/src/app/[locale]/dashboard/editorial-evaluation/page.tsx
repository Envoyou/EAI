'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { SideDrawer } from '@/components/ui/side-drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EAILoaderStatusIcon, QualityPassedStatusIcon } from '@/components/ui/icons/status';
import { EvaluationDatasetNavigationIcon } from '@/components/ui/icons/navigation';
import { fetchWithTimeout } from '@/lib/fetch-utils';

type EvaluationRun = {
  id: string;
  analysisLogId: string;
  environment: string;
  provenance: string;
  workflow: string;
  stage: string;
  sourceRef: string | null;
  organization: { id: string; name: string; slug: string } | null;
  inputPreview: string;
  outputPreview: string | null;
  promptVersion: string;
  promptConfigurationHash: string | null;
  hasRenderedPrompt: boolean;
  provider: string | null;
  modelName: string;
  score: number | null;
  verdict: string | null;
  summary: string | null;
  revisionCount: number;
  latestRevision: {
    revisionType: string;
    similarityPercentage: number;
    reviewStateBefore: string | null;
    reviewStateAfter: string | null;
    createdAt: string;
  } | null;
  createdAt: string;
};

type DatasetResponse = {
  scope: 'platform';
  access: 'owner_only';
  capture: { enabled: boolean; environment: string };
  summary: {
    total: number;
    readyRate: number;
    humanRevisionRate: number;
    averageScore: number;
  };
  environments: Array<{ environment: string; count: number }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  runs: EvaluationRun[];
};

type RevisionDetail = {
  id: string;
  revisionType: string;
  beforeText: string;
  afterText: string;
  changeSet: unknown;
  reviewStateBefore: string | null;
  reviewStateAfter: string | null;
  similarityPercentage: number;
  createdAt: string;
};

type EvaluationDetail = {
  id: string;
  input: string;
  output: string | null;
  renderedPrompt: string | null;
  modelParameters: unknown;
  automatedReview: unknown;
  promptVersion: string;
  promptConfigurationHash: string | null;
  provider: string | null;
  modelName: string;
  revisions: RevisionDetail[];
};

const FILTER_ALL = '__all__';

export default function EditorialEvaluationPage() {
  const t = useTranslations('EditorialEvaluation');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState(FILTER_ALL);
  const [workflow, setWorkflow] = useState(FILTER_ALL);
  const [provenance, setProvenance] = useState(FILTER_ALL);
  const [page, setPage] = useState(1);
  const [backfilling, setBackfilling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchDataset = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (environment !== FILTER_ALL) params.set('environment', environment);
    if (workflow !== FILTER_ALL) params.set('workflow', workflow);
    if (provenance !== FILTER_ALL) params.set('provenance', provenance);
    return fetchWithTimeout(`/api/analytics/editorial-evaluations?${params}`);
  }, [environment, page, provenance, workflow]);

  useEffect(() => {
    let cancelled = false;
    void fetchDataset()
      .then(async response => {
        if (response.status === 401) {
          router.replace('/login');
          return null;
        }
        if (response.status === 403) {
          router.replace('/dashboard');
          return null;
        }
        if (!response.ok) throw new Error(t('loadError'));
        return response.json() as Promise<DatasetResponse>;
      })
      .then(payload => {
        if (!cancelled && payload) setData(payload);
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchDataset, router, t]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void fetchWithTimeout(`/api/analytics/editorial-evaluations/${selectedId}`)
      .then(response => {
        if (!response.ok) throw new Error(t('loadError'));
        return response.json() as Promise<EvaluationDetail>;
      })
      .then(payload => {
        if (!cancelled) setDetail(payload);
      })
      .catch(detailError => {
        if (!cancelled) setError(detailError instanceof Error ? detailError.message : t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId, t]);

  const backfill = async () => {
    setBackfilling(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetchWithTimeout('/api/analytics/editorial-evaluations/backfill', {
        method: 'POST',
      });
      if (!response.ok) throw new Error(t('backfillError'));
      setNotice(t('backfillComplete'));
      const refreshed = await fetchDataset();
      if (!refreshed.ok) throw new Error(t('loadError'));
      setData(await refreshed.json() as DatasetResponse);
    } catch (backfillError) {
      setError(backfillError instanceof Error ? backfillError.message : t('backfillError'));
    } finally {
      setBackfilling(false);
    }
  };

  const changeFilter = (setter: (value: string) => void, value: string | null) => {
    if (!value) return;
    setLoading(true);
    setError(null);
    setter(value);
    setPage(1);
  };

  const openDetail = (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    setSelectedId(id);
  };

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <WorkspacePageShell
      title={t('title')}
      description={t('scope')}
      currentPage="dashboard"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void backfill()}
          disabled={backfilling || !data?.capture.enabled}
        >
          {backfilling ? t('backfilling') : t('backfill')}
        </Button>
      }
      sidebar={
        <>
          <div className="settings-page-account">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface-2)]">
              <EvaluationDatasetNavigationIcon className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{t('title')}</div>
              <div className="truncate text-[11px] text-[var(--muted-foreground)]">{t('scope')}</div>
            </div>
          </div>
          <nav aria-label={t('title')} className="settings-page-nav">
            <Link href="/dashboard/validation">{t('validationOverview')}</Link>
            <Link href="/dashboard/editorial-evaluation" data-active aria-current="page">
              {t('title')}
            </Link>
          </nav>
        </>
      }
    >
      <div className="settings-page-content scroll-y-auto">
        <div className="settings-page-intro">
          <span>{t('scope')}</span>
          <h2>{t('title')}</h2>
          <p>{t('description')}</p>
        </div>

        {data && (
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs">
            <QualityPassedStatusIcon className="h-4 w-4 text-[var(--primary)]" />
            <span className="font-semibold">{t('currentCapture')}:</span>
            <Badge variant={data.capture.enabled ? 'success' : 'warning'} size="xs">
              {data.capture.enabled ? t('captureEnabled') : t('captureDisabled')}
            </Badge>
            <code>{data.capture.environment}</code>
          </div>
        )}

        {notice && <Alert variant="success" className="mb-4">{notice}</Alert>}
        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

        {data && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [t('totalRuns'), data.summary.total],
                [t('readyRate'), `${data.summary.readyRate}%`],
                [t('humanRevisionRate'), `${data.summary.humanRevisionRate}%`],
                [t('averageScore'), data.summary.averageScore],
              ].map(([label, value]) => (
                <div key={String(label)} className="surface-card p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</div>
                  <div className="mt-1 text-2xl font-bold">{value}</div>
                </div>
              ))}
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <Select value={environment} onValueChange={value => changeFilter(setEnvironment, value)}>
                <SelectTrigger variant="surface"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>{t('allEnvironments')}</SelectItem>
                  {data.environments.map(item => (
                    <SelectItem key={item.environment} value={item.environment}>
                      {item.environment} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={workflow} onValueChange={value => changeFilter(setWorkflow, value)}>
                <SelectTrigger variant="surface"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>{t('allWorkflows')}</SelectItem>
                  {['analyze', 'refine', 'manual_draft'].map(value => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={provenance} onValueChange={value => changeFilter(setProvenance, value)}>
                <SelectTrigger variant="surface"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>{t('allProvenance')}</SelectItem>
                  <SelectItem value="captured">{t('captured')}</SelectItem>
                  <SelectItem value="backfilled_partial">{t('partial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex min-h-48 items-center justify-center"><EAILoaderStatusIcon className="h-8 w-8" /></div>
            ) : data.runs.length === 0 ? (
              <div className="surface-card p-8 text-center text-sm text-[var(--muted-foreground)]">{t('empty')}</div>
            ) : (
              <div className="surface-card overflow-hidden">
                <div className="px-4 pt-2 text-[9px] text-[var(--muted-foreground)] sm:hidden select-none">{t('swipe')}</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      <tr>
                        <th className="px-4 py-3">{t('workflow')}</th>
                        <th className="px-4 py-3">{t('prompt')}</th>
                        <th className="px-4 py-3">{t('model')}</th>
                        <th className="px-4 py-3">{t('tenant')}</th>
                        <th className="px-4 py-3">{t('result')}</th>
                        <th className="px-4 py-3">{t('revision')}</th>
                        <th className="px-4 py-3">{t('created')}</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.runs.map(run => (
                        <tr key={run.id} className="align-top">
                          <td className="px-4 py-3"><div className="font-semibold">{run.workflow}</div><div className="text-[var(--muted-foreground)]">{run.stage} · {run.environment}</div></td>
                          <td className="px-4 py-3"><div>{run.promptVersion}</div><Badge variant={run.provenance === 'captured' ? 'primary' : 'muted'} size="xs">{run.provenance === 'captured' ? t('captured') : t('partial')}</Badge></td>
                          <td className="px-4 py-3"><div>{run.provider || '—'}</div><div className="max-w-48 truncate text-[var(--muted-foreground)]">{run.modelName}</div></td>
                          <td className="px-4 py-3"><div>{run.organization?.name || '—'}</div><div className="text-[var(--muted-foreground)]">{run.organization?.slug || '—'}</div></td>
                          <td className="px-4 py-3"><Badge variant={run.verdict === 'ready' ? 'success' : run.verdict === 'blocked' ? 'danger' : 'warning'} size="xs">{run.verdict || '—'}</Badge><div className="mt-1">{run.score ?? '—'}</div></td>
                          <td className="px-4 py-3">{run.latestRevision ? <><div>{run.revisionCount} · {run.latestRevision.revisionType}</div><div className="text-[var(--muted-foreground)]">{t('similarity')}: {run.latestRevision.similarityPercentage}%</div></> : <span className="text-[var(--muted-foreground)]">{t('noRevision')}</span>}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{dateFormatter.format(new Date(run.createdAt))}</td>
                          <td className="px-4 py-3"><Button type="button" variant="outline" size="sm" onClick={() => openDetail(run.id)}>{t('inspect')}</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-3">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => { setLoading(true); setPage(current => current - 1); }}>{t('previous')}</Button>
              <span className="text-xs text-[var(--muted-foreground)]">{t('page', { page: data.pagination.page, totalPages: data.pagination.totalPages })}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => { setLoading(true); setPage(current => current + 1); }}>{t('next')}</Button>
            </div>
          </>
        )}
      </div>

      {selectedId && (
        <SideDrawer
          open
          title={t('title')}
          description={detail ? `${detail.promptVersion} · ${detail.provider || '—'} / ${detail.modelName}` : undefined}
          closeLabel={t('close')}
          onClose={() => { setSelectedId(null); setDetail(null); }}
        >
          {detailLoading || !detail ? (
            <div className="flex min-h-48 items-center justify-center"><EAILoaderStatusIcon className="h-8 w-8" /></div>
          ) : (
            <div className="space-y-6 p-5">
              <section><h3 className="mb-2 text-sm font-semibold">{t('input')}</h3><pre className="whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] p-4 text-xs">{detail.input}</pre></section>
              <section><h3 className="mb-2 text-sm font-semibold">{t('output')}</h3><pre className="whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] p-4 text-xs">{detail.output || '—'}</pre></section>
              <section><h3 className="mb-2 text-sm font-semibold">{t('prompt')}</h3>{detail.renderedPrompt ? <pre className="whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] p-4 text-xs">{detail.renderedPrompt}</pre> : <p className="text-xs text-[var(--muted-foreground)]">{t('promptUnavailable')}</p>}</section>
              <section><h3 className="mb-2 text-sm font-semibold">{t('requestConfiguration')}</h3><pre className="whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] p-4 text-xs">{JSON.stringify(detail.modelParameters, null, 2)}</pre></section>
              <section><h3 className="mb-2 text-sm font-semibold">{t('review')}</h3><pre className="whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] p-4 text-xs">{JSON.stringify(detail.automatedReview, null, 2)}</pre></section>
              <section><h3 className="mb-2 text-sm font-semibold">{t('revisions')}</h3>{detail.revisions.length === 0 ? <p className="text-xs text-[var(--muted-foreground)]">{t('noRevision')}</p> : detail.revisions.map(revision => <div key={revision.id} className="mb-3 rounded-xl border border-[var(--border)] p-4"><div className="mb-2 text-xs font-semibold">{revision.revisionType} · {t('similarity')}: {revision.similarityPercentage}%</div><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-[var(--surface-2)] p-3 text-xs">{revision.afterText}</pre></div>)}</section>
            </div>
          )}
        </SideDrawer>
      )}
    </WorkspacePageShell>
  );
}
