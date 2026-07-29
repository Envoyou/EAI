'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Search, RefreshCw } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { useDirectFetch } from '@/lib/hooks/useDirectFetch';
import { getResponseErrorMessage } from '@/lib/fetch-utils';

type ContentArtifactListItem = {
  id: string;
  artifactType: string;
  sourceType: string;
  title: string | null;
  topic: string | null;
  angle: string | null;
  primaryKeyword: string | null;
  currentStage: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string | null } | null;
};

const stageVariant = (stage: string): BadgeVariant => {
  if (stage === 'PUBLISHED' || stage === 'READY') return 'success';
  if (stage === 'REFINED') return 'primary';
  if (stage === 'DRAFTING') return 'warning';
  return 'muted';
};

export default function ContentMapPage() {
  const t = useTranslations('ContentMap');
  const locale = useLocale();
  const directFetch = useDirectFetch();
  const [artifacts, setArtifacts] = useState<ContentArtifactListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArtifacts = useCallback(
    async (query = '') => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (query.trim()) params.set('search', query.trim());
        const response = await directFetch(`/api/content-memory?${params}`);
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, t('loadError'))
          );
        }
        const payload = (await response.json()) as {
          data?: ContentArtifactListItem[];
        };
        setArtifacts(payload.data ?? []);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : t('loadError')
        );
      } finally {
        setLoading(false);
      }
    },
    [directFetch, t]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await directFetch('/api/content-memory?limit=100');
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, t('loadError'))
          );
        }
        const payload = (await response.json()) as {
          data?: ContentArtifactListItem[];
        };
        if (!cancelled) setArtifacts(payload.data ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : t('loadError')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directFetch, t]);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const artifact of artifacts) {
      counts.set(
        artifact.currentStage,
        (counts.get(artifact.currentStage) ?? 0) + 1
      );
    }
    return counts;
  }, [artifacts]);

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
    }).format(new Date(value));

  const labelForStage = (stage: string) => {
    const key = stage.toLocaleLowerCase('en-US');
    if (
      key === 'planning' ||
      key === 'drafting' ||
      key === 'refined' ||
      key === 'ready' ||
      key === 'published'
    ) {
      return t(`stages.${key}`);
    }
    return stage;
  };

  const labelForSource = (source: string) => {
    const key = source.toLocaleLowerCase('en-US');
    if (
      key === 'strategist_blueprint' ||
      key === 'quick_draft' ||
      key === 'draft_from_notes' ||
      key === 'manual_draft' ||
      key === 'analysis' ||
      key === 'cms_import'
    ) {
      return t(`sources.${key}`);
    }
    return source;
  };

  return (
    <section id="content-map" className="settings-page-section">
      <div className="settings-page-section-heading">
        <h2>{t('title')}</h2>
        <p>{t('description')}</p>
      </div>

      <div className="settings-page-section-body space-y-6 py-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {['PLANNING', 'DRAFTING', 'REFINED', 'READY', 'PUBLISHED'].map(
            (stage) => (
              <div key={stage} className="surface-card p-4">
                <div className="text-xs text-[var(--muted-foreground)]">
                  {labelForStage(stage)}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {stageCounts.get(stage) ?? 0}
                </div>
              </div>
            )
          )}
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void loadArtifacts(search);
          }}
        >
          <Input
            variant="surface"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
          />
          <Button type="submit" variant="primary" size="sm">
            <Search className="h-4 w-4" />
            {t('search')}
          </Button>
          <Button
            type="button"
            variant="surface"
            size="sm"
            onClick={() => {
              setSearch('');
              void loadArtifacts();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            {t('reset')}
          </Button>
        </form>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <EAILoaderStatusIcon className="h-6 w-6 text-[var(--muted-foreground)]" />
          </div>
        ) : error ? (
          <Alert variant="danger">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : artifacts.length === 0 ? (
          <div className="surface-card p-8 text-center text-sm text-[var(--muted-foreground)]">
            {t('empty')}
          </div>
        ) : (
          <div>
            <div className="px-4 pt-2 text-[9px] text-[var(--muted-foreground)] sm:hidden select-none">
              {t('swipeHint')}
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--surface-2)] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('columns.content')}</th>
                    <th className="px-4 py-3 font-medium">{t('columns.stage')}</th>
                    <th className="px-4 py-3 font-medium">{t('columns.source')}</th>
                    <th className="px-4 py-3 font-medium">{t('columns.owner')}</th>
                    <th className="px-4 py-3 font-medium">{t('columns.updated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((artifact) => (
                    <tr
                      key={artifact.id}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="max-w-md px-4 py-3">
                        <div className="font-medium">
                          {artifact.title || artifact.topic || t('untitled')}
                        </div>
                        {artifact.angle && artifact.angle !== artifact.title ? (
                          <div className="mt-1 line-clamp-2 text-xs text-[var(--muted-foreground)]">
                            {artifact.angle}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={stageVariant(artifact.currentStage)}
                          size="xs"
                        >
                          {labelForStage(artifact.currentStage)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {labelForSource(artifact.sourceType)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {artifact.createdBy?.name || t('workspaceMember')}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">
                        {formatDate(artifact.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
