'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CannibalizationRisk,
  ContentIntelligenceArtifact,
  ContentIntelligenceSnapshot,
  ContentUpdateRecommendation,
} from '@eai/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { getResponseErrorMessage } from '@/lib/fetch-utils';
import { useDirectFetch } from '@/lib/hooks/useDirectFetch';

const coverageVariant = (
  coverage: 'established' | 'growing' | 'emerging'
): BadgeVariant => {
  if (coverage === 'established') return 'success';
  if (coverage === 'growing') return 'primary';
  return 'muted';
};

const severityVariant = (
  severity: CannibalizationRisk['severity']
): BadgeVariant => {
  if (severity === 'critical') return 'danger';
  if (severity === 'high') return 'warning';
  return 'muted';
};

const priorityVariant = (
  priority: ContentUpdateRecommendation['priority']
): BadgeVariant => {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'muted';
};

export function ContentIntelligencePanel() {
  const t = useTranslations('ContentMap');
  const locale = useLocale();
  const directFetch = useDirectFetch();
  const [snapshot, setSnapshot] =
    useState<ContentIntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    const response = await directFetch(
      '/api/content-memory/intelligence'
    );
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(
          response,
          t('intelligence.loadError')
        )
      );
    }
    return (await response.json()) as ContentIntelligenceSnapshot;
  }, [directFetch, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchSnapshot();
        if (!cancelled) setSnapshot(data);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t('intelligence.loadError')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshot, t]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchSnapshot());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('intelligence.loadError')
      );
    } finally {
      setLoading(false);
    }
  }, [fetchSnapshot, t]);

  const titleOf = (artifact: ContentIntelligenceArtifact) =>
    artifact.title || artifact.topic || t('untitled');
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
    }).format(new Date(value));
  const percentage = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(value);

  if (loading) {
    return (
      <div className="flex min-h-56 items-center justify-center">
        <EAILoaderStatusIcon className="h-7 w-7 text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="danger">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="surface" size="sm" onClick={() => void loadSnapshot()}>
          {t('intelligence.retry')}
        </Button>
      </div>
    );
  }

  if (!snapshot || snapshot.analyzedArtifactCount === 0) {
    return (
      <div className="surface-card p-8 text-center text-sm text-[var(--muted-foreground)]">
        {t('intelligence.empty')}
      </div>
    );
  }

  const summaryItems = [
    ['clusters', snapshot.summary.clusterCount],
    ['risks', snapshot.summary.cannibalizationRiskCount],
    ['gaps', snapshot.summary.gapCount],
    ['updates', snapshot.summary.updateRecommendationCount],
    ['links', snapshot.summary.internalLinkOpportunityCount],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">
            {t('intelligence.title')}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t('intelligence.description')}
          </p>
        </div>
        <Button
          variant="surface"
          size="sm"
          onClick={() => void loadSnapshot()}
        >
          {t('intelligence.refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {summaryItems.map(([key, value]) => (
          <div key={key} className="surface-card p-4">
            <div className="text-xs text-[var(--muted-foreground)]">
              {t(`intelligence.summary.${key}`)}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
            </div>
          </div>
        ))}
      </div>

      <Alert variant={snapshot.semanticCoverage > 0 ? 'primary' : 'muted'}>
        <AlertDescription>
          {t('intelligence.semanticCoverage', {
            coverage: percentage(snapshot.semanticCoverage),
            count: snapshot.analyzedArtifactCount,
          })}
          {snapshot.truncated
            ? ` ${t('intelligence.truncated')}`
            : ''}
          {snapshot.resultsTruncated
            ? ` ${t('intelligence.resultsTruncated', {
                count: snapshot.resultLimit,
              })}`
            : ''}
        </AlertDescription>
      </Alert>

      <section
        aria-labelledby="topic-clusters-heading"
        className="space-y-3"
      >
        <h3 id="topic-clusters-heading" className="text-sm font-semibold">
          {t('intelligence.sections.clusters')}
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {snapshot.clusters.map((cluster) => (
            <article key={cluster.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-medium">{cluster.label}</h4>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {t('intelligence.clusterCounts', {
                      artifacts: cluster.artifactCount,
                      published: cluster.publishedCount,
                    })}
                  </p>
                </div>
                <Badge
                  variant={coverageVariant(cluster.coverage)}
                  size="xs"
                >
                  {t(`intelligence.coverage.${cluster.coverage}`)}
                </Badge>
              </div>
              {cluster.keywords.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cluster.keywords.map((keyword) => (
                    <Badge key={keyword} variant="surface" size="xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <ul className="mt-3 space-y-2 text-xs">
                {cluster.artifacts.slice(0, 4).map((artifact) => (
                  <li
                    key={artifact.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <span className="line-clamp-2">
                      {titleOf(artifact)}
                    </span>
                    <span className="shrink-0 text-[var(--muted-foreground)]">
                      {formatDate(artifact.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="cannibalization-heading"
        className="space-y-3"
      >
        <h3 id="cannibalization-heading" className="text-sm font-semibold">
          {t('intelligence.sections.cannibalization')}
        </h3>
        {snapshot.cannibalizationRisks.length === 0 ? (
          <p className="surface-card p-4 text-sm text-[var(--muted-foreground)]">
            {t('intelligence.none.risks')}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.cannibalizationRisks.map((risk) => (
              <article key={risk.id} className="surface-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge
                    variant={severityVariant(risk.severity)}
                    size="xs"
                  >
                    {t(`intelligence.severity.${risk.severity}`)}
                  </Badge>
                  <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
                    {percentage(risk.score)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium">
                  {titleOf(risk.left)}
                </p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {titleOf(risk.right)}
                </p>
                <p className="mt-3 text-xs">
                  {t(
                    `intelligence.recommendations.${risk.recommendation}`
                  )}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="content-gaps-heading" className="space-y-3">
          <h3 id="content-gaps-heading" className="text-sm font-semibold">
            {t('intelligence.sections.gaps')}
          </h3>
          {snapshot.gaps.length === 0 ? (
            <p className="surface-card p-4 text-sm text-[var(--muted-foreground)]">
              {t('intelligence.none.gaps')}
            </p>
          ) : (
            snapshot.gaps.map((gap) => (
              <article key={gap.id} className="surface-card p-4">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {gap.topic}
                </p>
                <p className="mt-1 font-medium">{gap.suggestedAngle}</p>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {t(`intelligence.gapRationales.${gap.rationale}`)}
                </p>
              </article>
            ))
          )}
        </section>

        <section aria-labelledby="updates-heading" className="space-y-3">
          <h3 id="updates-heading" className="text-sm font-semibold">
            {t('intelligence.sections.updates')}
          </h3>
          {snapshot.updateRecommendations.length === 0 ? (
            <p className="surface-card p-4 text-sm text-[var(--muted-foreground)]">
              {t('intelligence.none.updates')}
            </p>
          ) : (
            snapshot.updateRecommendations.map((recommendation) => (
              <article key={recommendation.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {titleOf(recommendation.artifact)}
                  </p>
                  <Badge
                    variant={priorityVariant(recommendation.priority)}
                    size="xs"
                  >
                    {t(
                      `intelligence.priority.${recommendation.priority}`
                    )}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {t(
                    `intelligence.updateReasons.${recommendation.reason}`,
                    { days: recommendation.ageDays }
                  )}
                </p>
              </article>
            ))
          )}
        </section>
      </div>

      <section
        aria-labelledby="internal-links-heading"
        className="space-y-3"
      >
        <h3 id="internal-links-heading" className="text-sm font-semibold">
          {t('intelligence.sections.links')}
        </h3>
        {snapshot.internalLinkOpportunities.length === 0 ? (
          <p className="surface-card p-4 text-sm text-[var(--muted-foreground)]">
            {t('intelligence.none.links')}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.internalLinkOpportunities.map((opportunity) => (
              <article key={opportunity.id} className="surface-card p-4">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t('intelligence.linkFrom')}
                </p>
                <p className="mt-1 font-medium">
                  {titleOf(opportunity.from)}
                </p>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {t('intelligence.linkTo')}
                </p>
                <p className="mt-1 font-medium">
                  {titleOf(opportunity.to)}
                </p>
                <p className="mt-3 text-xs">
                  {t(`intelligence.linkReasons.${opportunity.reason}`)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--muted-foreground)]">
        {t('intelligence.generatedAt', {
          date: formatDate(snapshot.generatedAt),
        })}
      </p>
    </div>
  );
}
