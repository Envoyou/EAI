'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type {
  CannibalizationRisk,
  ContentIntelligenceAction,
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
import { ActionButton } from '@/components/ui/action-button';
import {
  ArchiveActionIcon,
  DownloadActionIcon,
} from '@/components/ui/icons/actions';
import { PreviewViewIcon } from '@/components/ui/icons/content';
import {
  buildContentIntelligenceCsv,
  contentIntelligenceFilename,
  downloadCsv,
} from './content-map-csv';
import {
  ContentArchiveDialog,
  ContentComparisonDialog,
} from './ContentIntelligenceDialogs';
import {
  ContentArtifactPreviewDrawer,
  type ContentPreviewArtifact,
} from './ContentArtifactPreviewDrawer';

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
  const router = useRouter();
  const directFetch = useDirectFetch();
  const [snapshot, setSnapshot] =
    useState<ContentIntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] =
    useState<CannibalizationRisk | null>(null);
  const [archiveArtifact, setArchiveArtifact] =
    useState<ContentIntelligenceArtifact | null>(null);
  const [previewArtifact, setPreviewArtifact] =
    useState<ContentPreviewArtifact | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

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
  const sourceLabel = (artifact: ContentIntelligenceArtifact) =>
    t(`sources.${artifact.sourceType}`);
  const localizeHref = (href: string) =>
    locale === 'en' ? href : `/${locale}${href}`;
  const previewSource = (artifact: ContentIntelligenceArtifact) => {
    if (artifact.sourceHref) {
      setComparison(null);
      setPreviewArtifact(artifact);
    }
  };
  const createFromGap = (title: string, brief: string) => {
    const params = new URLSearchParams({ title, brief });
    router.push(
      localizeHref(`/workspace?${params.toString()}`)
    );
  };
  const applyAction = async (
    action: ContentIntelligenceAction
  ): Promise<boolean> => {
    setSubmittingAction(true);
    try {
      const response = await directFetch(
        '/api/content-memory/intelligence/actions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        }
      );
      if (!response.ok) {
        throw new Error(
          await getResponseErrorMessage(
            response,
            t('actions.applyError')
          )
        );
      }
      toast.success(t('actions.applied'));
      await loadSnapshot();
      return true;
    } catch (actionError) {
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : t('actions.applyError')
      );
      return false;
    } finally {
      setSubmittingAction(false);
    }
  };

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
        <div className="flex flex-wrap gap-2">
          <ActionButton
            icon={DownloadActionIcon}
            label={t('export.intelligence')}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                contentIntelligenceFilename(),
                buildContentIntelligenceCsv(snapshot)
              )
            }
          />
          <Button
            variant="surface"
            size="sm"
            onClick={() => void loadSnapshot()}
          >
            {t('intelligence.refresh')}
          </Button>
        </div>
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
                    className="rounded-lg border border-[var(--border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium">
                          {titleOf(artifact)}
                        </p>
                        <p className="mt-1 line-clamp-1 text-[var(--muted-foreground)]">
                          {artifact.topic || t('notAvailable')}
                        </p>
                        <p className="mt-1 line-clamp-1 text-[var(--muted-foreground)]">
                          {sourceLabel(artifact)} ·{' '}
                          {artifact.ownerName || t('workspaceMember')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[var(--muted-foreground)]">
                        {formatDate(artifact.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="surface" size="xs">
                        {t(`stages.${artifact.stage}`)}
                      </Badge>
                      <Badge
                        variant={
                          artifact.exportStatus === 'exported'
                            ? 'success'
                            : artifact.exportStatus === 'failed'
                              ? 'danger'
                              : 'muted'
                        }
                        size="xs"
                      >
                        {t(
                          `exportStatuses.${artifact.exportStatus}`
                        )}
                      </Badge>
                      {artifact.sourceHref ? (
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={() => previewSource(artifact)}
                        >
                          {t('actions.preview')}
                        </Button>
                      ) : null}
                    </div>
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
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {risk.left.topic || t('notAvailable')} ·{' '}
                  {t(`stages.${risk.left.stage}`)}
                </p>
                <p className="mt-3 text-sm font-medium">
                  {titleOf(risk.right)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {risk.right.topic || t('notAvailable')} ·{' '}
                  {t(`stages.${risk.right.stage}`)}
                </p>
                <p className="mt-3 text-xs">
                  {t(
                    `intelligence.recommendations.${risk.recommendation}`
                  )}
                </p>
                <Button
                  type="button"
                  variant="surface"
                  size="xs"
                  className="mt-3"
                  onClick={() => setComparison(risk)}
                >
                  {t('actions.compare')}
                </Button>
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
                {gap.relatedArtifacts.length > 0 ? (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    {t('details.relatedWork', {
                      count: gap.relatedArtifacts.length,
                    })}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {gap.relatedArtifacts.find(
                    (artifact) => artifact.sourceHref
                  ) ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      onClick={() =>
                        previewSource(
                          gap.relatedArtifacts.find(
                            (artifact) => artifact.sourceHref
                          )!
                        )
                      }
                    >
                      {t('actions.continueExisting')}
                    </Button>
                  ) : null}
                  {gap.source === 'classifier_feedback' ? (
                    <Button
                      type="button"
                      variant="surface"
                      size="xs"
                      onClick={() =>
                        createFromGap(gap.suggestedAngle, gap.topic)
                      }
                    >
                      {t('actions.createFromGap')}
                    </Button>
                  ) : null}
                </div>
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
            snapshot.updateRecommendations.map((recommendation) => {
              const matchingRisk =
                recommendation.relatedArtifactId
                  ? snapshot.cannibalizationRisks.find(
                      (risk) =>
                        (risk.left.id === recommendation.artifact.id &&
                          risk.right.id ===
                            recommendation.relatedArtifactId) ||
                        (risk.right.id === recommendation.artifact.id &&
                          risk.left.id ===
                            recommendation.relatedArtifactId)
                    )
                  : undefined;
              return (
                <article key={recommendation.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {titleOf(recommendation.artifact)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {recommendation.artifact.topic ||
                          t('notAvailable')}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {sourceLabel(recommendation.artifact)} ·{' '}
                        {recommendation.artifact.ownerName ||
                          t('workspaceMember')}
                      </p>
                    </div>
                    <Badge
                      variant={priorityVariant(recommendation.priority)}
                      size="xs"
                    >
                      {t(
                        `intelligence.priority.${recommendation.priority}`
                      )}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="surface" size="xs">
                      {t(
                        `stages.${recommendation.artifact.stage}`
                      )}
                    </Badge>
                    <Badge
                      variant={
                        recommendation.artifact.exportStatus === 'exported'
                          ? 'success'
                          : recommendation.artifact.exportStatus ===
                              'failed'
                            ? 'danger'
                            : 'muted'
                      }
                      size="xs"
                    >
                      {t(
                        `exportStatuses.${recommendation.artifact.exportStatus}`
                      )}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    {t(
                      `intelligence.updateReasons.${recommendation.reason}`,
                      { days: recommendation.ageDays }
                    )}
                  </p>
                  {recommendation.relatedArtifact ? (
                    <p className="mt-2 text-xs">
                      {t('details.relatedArticle')}:{' '}
                      {titleOf(recommendation.relatedArtifact)}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recommendation.artifact.sourceHref ? (
                      <ActionButton
                        icon={PreviewViewIcon}
                        label={t('actions.preview')}
                        type="button"
                        variant="surface"
                        size="xs"
                        onClick={() =>
                          previewSource(recommendation.artifact)
                        }
                      />
                    ) : null}
                    {matchingRisk ? (
                      <Button
                        type="button"
                        variant="surface"
                        size="xs"
                        onClick={() => setComparison(matchingRisk)}
                      >
                        {t('actions.compare')}
                      </Button>
                    ) : null}
                    {recommendation.artifact.canManage &&
                    recommendation.artifact.status === 'active' ? (
                      <ActionButton
                        icon={ArchiveActionIcon}
                        label={t('actions.archive')}
                        type="button"
                        variant="danger"
                        size="xs"
                        onClick={() =>
                          setArchiveArtifact(recommendation.artifact)
                        }
                      />
                    ) : null}
                  </div>
                </article>
              );
            })
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
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {opportunity.from.topic || t('notAvailable')}
                </p>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {t('intelligence.linkTo')}
                </p>
                <p className="mt-1 font-medium">
                  {titleOf(opportunity.to)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {opportunity.to.topic || t('notAvailable')}
                </p>
                <p className="mt-3 text-xs">
                  {t(`intelligence.linkReasons.${opportunity.reason}`)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {opportunity.from.sourceHref ? (
                    <Button
                      type="button"
                      variant="surface"
                      size="xs"
                      onClick={() => previewSource(opportunity.from)}
                    >
                      {t('actions.previewSource')}
                    </Button>
                  ) : null}
                  {opportunity.to.sourceHref ? (
                    <Button
                      type="button"
                      variant="surface"
                      size="xs"
                      onClick={() => previewSource(opportunity.to)}
                    >
                      {t('actions.previewTarget')}
                    </Button>
                  ) : null}
                </div>
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
      <ContentComparisonDialog
        key={comparison?.id ?? 'closed-comparison'}
        risk={comparison}
        submitting={submittingAction}
        onClose={() => setComparison(null)}
        onOpenArtifact={previewSource}
        onApply={applyAction}
      />
      <ContentArchiveDialog
        artifact={archiveArtifact}
        submitting={submittingAction}
        onClose={() => setArchiveArtifact(null)}
        onApply={applyAction}
      />
      {previewArtifact ? (
        <ContentArtifactPreviewDrawer
          key={previewArtifact.sourceId ?? previewArtifact.id}
          artifact={previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      ) : null}
    </div>
  );
}
