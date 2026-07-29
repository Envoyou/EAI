'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SideDrawer } from '@/components/ui/side-drawer';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { OpenExternalActionIcon } from '@/components/ui/icons/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDirectFetch } from '@/lib/hooks/useDirectFetch';
import { getResponseErrorMessage } from '@/lib/fetch-utils';
import { extractPolishedDraft } from '@/workspace/utils';

export type ContentPreviewArtifact = {
  id: string;
  sourceId: string | null;
  sourceHref: string | null;
  sourceType: string;
  title: string | null;
  topic: string | null;
  stage: string;
  ownerName: string | null;
  exportStatus: 'not_exported' | 'exported' | 'failed';
  updatedAt: string;
};

type HistoryPreview = {
  content?: string | null;
  polishedDraft?: string | null;
  metadata?: unknown;
};

const stageVariant = (stage: string): BadgeVariant => {
  const normalized = stage.toLocaleLowerCase('en-US');
  if (normalized === 'published' || normalized === 'ready') return 'success';
  if (normalized === 'refined') return 'primary';
  if (normalized === 'drafting') return 'warning';
  return 'muted';
};

export function ContentArtifactPreviewDrawer({
  artifact,
  onClose,
}: {
  artifact: ContentPreviewArtifact;
  onClose: () => void;
}) {
  const t = useTranslations('ContentMap');
  const locale = useLocale();
  const directFetch = useDirectFetch();
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [loading, setLoading] = useState(Boolean(artifact.sourceId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact.sourceId) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await directFetch(`/api/history/${artifact.sourceId}`);
        if (!response.ok) {
          throw new Error(
            await getResponseErrorMessage(response, t('preview.loadError'))
          );
        }
        const payload = (await response.json()) as HistoryPreview;
        if (!cancelled) setPreview(payload);
      } catch (previewError) {
        if (!cancelled) {
          setError(
            previewError instanceof Error
              ? previewError.message
              : t('preview.loadError')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artifact?.sourceId, directFetch, t]);

  const normalizedStage = artifact.stage.toLocaleLowerCase('en-US');
  const stageLabel =
    normalizedStage === 'planning' ||
    normalizedStage === 'drafting' ||
    normalizedStage === 'refined' ||
    normalizedStage === 'ready' ||
    normalizedStage === 'published'
      ? t(`stages.${normalizedStage}`)
      : artifact.stage;
  const normalizedSource = artifact.sourceType.toLocaleLowerCase('en-US');
  const sourceLabel =
    normalizedSource === 'strategist_blueprint' ||
    normalizedSource === 'quick_draft' ||
    normalizedSource === 'draft_from_notes' ||
    normalizedSource === 'manual_draft' ||
    normalizedSource === 'analysis' ||
    normalizedSource === 'cms_import'
      ? t(`sources.${normalizedSource}`)
      : artifact.sourceType;
  const polishedDraft =
    preview?.polishedDraft || extractPolishedDraft(preview?.metadata);
  const body = polishedDraft || preview?.content || '';
  const localizedHref = artifact.sourceHref
    ? locale === 'en'
      ? artifact.sourceHref
      : `/${locale}${artifact.sourceHref}`
    : null;
  const formattedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(artifact.updatedAt));

  return (
    <SideDrawer
      open
      title={artifact.title || artifact.topic || t('untitled')}
      description={t('preview.description')}
      closeLabel={t('actions.close')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="muted" size="sm" onClick={onClose}>
            {t('actions.close')}
          </Button>
          {localizedHref ? (
            <Button
              render={<Link href={localizedHref} />}
              variant="primary"
              size="sm"
            >
              <OpenExternalActionIcon className="h-4 w-4" />
              {t('actions.openWorkspace')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant={stageVariant(artifact.stage)} size="xs">
            {stageLabel}
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
            {t(`exportStatuses.${artifact.exportStatus}`)}
          </Badge>
          {polishedDraft ? (
            <Badge variant="primary" size="xs">
              {t('preview.refinedDraft')}
            </Badge>
          ) : null}
        </div>

        <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-xs">
          <dt className="text-[var(--muted-foreground)]">
            {t('columns.topic')}
          </dt>
          <dd>{artifact.topic || t('notAvailable')}</dd>
          <dt className="text-[var(--muted-foreground)]">
            {t('columns.source')}
          </dt>
          <dd>{sourceLabel}</dd>
          <dt className="text-[var(--muted-foreground)]">
            {t('columns.owner')}
          </dt>
          <dd>{artifact.ownerName || t('workspaceMember')}</dd>
          <dt className="text-[var(--muted-foreground)]">
            {t('columns.updated')}
          </dt>
          <dd>{formattedDate}</dd>
        </dl>

        <div className="border-t border-[var(--border)] pt-5">
          {loading ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3">
              <EAILoaderStatusIcon className="h-7 w-7 text-[var(--primary)]" />
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('preview.loading')}
              </p>
            </div>
          ) : error ? (
            <Alert variant="danger">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : body.trim() ? (
            <article className="prose prose-sm max-w-none dark:prose-invert prose-a:text-[var(--editor-link)]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, ...props }) => (
                    <a {...props} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {body}
              </ReactMarkdown>
            </article>
          ) : (
            <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              {t('preview.empty')}
            </p>
          )}
        </div>
      </div>
    </SideDrawer>
  );
}
