'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type {
  PublicationPackage,
  PublicationPackageStatus,
  RevisionValidationState,
  SeoFieldStates,
  SeoReviewState,
} from '@eai/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  EditActionIcon,
  SaveActionIcon,
} from '@/components/ui/icons/actions';
import { DocumentIcon } from '@/components/ui/icons/content';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { WarningStatusIcon } from '@/components/ui/icons/status';
import { CompleteStatusIcon } from '@/components/ui/icons/status';
import { derivePublicationUxState } from '@/workspace/publication-ux-state';
import { getProtectedSeoReviewFields } from '@/workspace/seo-field-state';

type SeoPackage = Partial<PublicationPackage>;

interface PublicationSeoPanelProps {
  metadata?: SeoPackage;
  onSave: (metadata: PublicationPackage) => Promise<boolean>;
  onConfirm?: () => Promise<void>;
  publicationPackageStatus?: PublicationPackageStatus;
  qualityGateState?: RevisionValidationState;
  seoReviewState?: SeoReviewState;
  seoFieldStates?: SeoFieldStates;
  isChecking?: boolean;
}

const toEditValue = (metadata?: SeoPackage) => ({
  title: metadata?.title || '',
  slug: metadata?.slug || '',
  excerpt: metadata?.excerpt || '',
  metaTitle: metadata?.metaTitle || '',
  metaDescription: metadata?.metaDescription || '',
  coverImageAltText: metadata?.coverImageAltText || '',
  tags: metadata?.tags?.join(', ') || '',
});

export function PublicationSeoPanel({
  metadata,
  onSave,
  onConfirm,
  publicationPackageStatus,
  qualityGateState,
  seoReviewState,
  seoFieldStates,
  isChecking = false,
}: PublicationSeoPanelProps) {
  const t = useTranslations('FinalDraftPanel');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState(() => toEditValue(metadata));
  const protectedFields = getProtectedSeoReviewFields(seoFieldStates);
  const uxState = derivePublicationUxState({
    isChecking,
    qualityGateState,
    seoReviewState,
    publicationPackageStatus,
    seoFieldStates,
  });

  const rows = metadata
    ? [
        { field: 'title', value: metadata.title },
        { field: 'slug', value: metadata.slug },
        { field: 'excerpt', value: metadata.excerpt },
        { field: 'metaTitle', value: metadata.metaTitle },
        { field: 'metaDescription', value: metadata.metaDescription },
        {
          field: 'coverImageAltText',
          value: metadata.coverImageAltText,
        },
        { field: 'tags', value: metadata.tags?.join(', ') },
      ]
    : [];

  const updateValue = (field: keyof typeof value, nextValue: string) => {
    setValue((current) => ({ ...current, [field]: nextValue }));
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface-1)]"
      aria-labelledby="publication-seo-panel-title"
    >
      <header className="border-b border-[var(--border)] px-5 py-4">
        <p className="ui-eyebrow">{t('seoPackEyebrow')}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2
            id="publication-seo-panel-title"
            className="text-sm font-semibold text-[var(--foreground)]"
          >
            {t('seoPackTitle')}
          </h2>
          {metadata && (
            <Button
              type="button"
              variant="muted"
              size="xs"
              onClick={() => {
                if (!editing) setValue(toEditValue(metadata));
                setEditing((current) => !current);
              }}
              aria-expanded={editing}
            >
              <EditActionIcon className="h-3.5 w-3.5" />
              {editing
                ? t('closePublicationMetadata')
                : t('editPublicationMetadata')}
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          {t('publicationMetadataDescription')}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {(uxState === 'metadata_decision_required' ||
          uxState === 'metadata_attention_required') && (
          <Alert variant="warning" className="mb-3 text-xs">
            <WarningStatusIcon className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong>
                {uxState === 'metadata_decision_required'
                  ? t('seoFieldsNeedReviewTitle')
                  : t('staleMetadataTitle')}
              </strong>{' '}
              {uxState === 'metadata_decision_required'
                ? protectedFields.length > 0
                  ? t('seoFieldsNeedReviewDescription', {
                      fields: protectedFields
                        .map((field) => t(`seoField.${field}`))
                        .join(', '),
                    })
                  : t('seoReviewRecommendedDescription')
                : t('staleMetadataDescription')}
              {onConfirm && metadata && (
                <Button
                  type="button"
                  variant="muted"
                  size="xs"
                  className="mt-2"
                  disabled={confirming}
                  onClick={async () => {
                    setConfirming(true);
                    try {
                      await onConfirm();
                      toast.success(t('confirmMetadataSuccess'));
                    } catch {
                      toast.error(t('confirmMetadataFailed'));
                    } finally {
                      setConfirming(false);
                    }
                  }}
                >
                  {confirming ? (
                    <EAILoaderStatusIcon className="h-3.5 w-3.5" />
                  ) : (
                    <CompleteStatusIcon className="h-3.5 w-3.5" />
                  )}
                  {t('confirmMetadataCurrent')}
                </Button>
              )}
            </div>
          </Alert>
        )}

        {!metadata && (
          <div className="ui-state-card flex flex-col items-center px-5 py-10 text-center">
            <DocumentIcon className="h-7 w-7 text-[var(--muted-foreground)]" />
            <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">
              {t('seoPackEmptyTitle')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
              {t('seoPackEmptyDescription')}
            </p>
          </div>
        )}

        {metadata && !editing && (
          <dl className="space-y-2.5">
            {rows.map((row) => (
              <div
                key={row.field}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {t(`seoField.${row.field}`)}
                </dt>
                <dd className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--foreground)]">
                  {row.value?.trim() || t('publicationMetadataEmptyValue')}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {metadata && editing && (
          <div className="space-y-3">
            {(['title', 'slug', 'metaTitle', 'coverImageAltText'] as const).map(
              (field) => (
                <label key={field} className="block space-y-1.5">
                  <span className="text-[11px] font-semibold text-[var(--foreground)]">
                    {t(`seoField.${field}`)}
                  </span>
                  <Input
                    variant="surface"
                    value={value[field]}
                    onChange={(event) => updateValue(field, event.target.value)}
                  />
                </label>
              )
            )}
            {(['excerpt', 'metaDescription'] as const).map((field) => (
              <label key={field} className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-[var(--foreground)]">
                  {t(`seoField.${field}`)}
                </span>
                <Textarea
                  variant="surface"
                  value={value[field]}
                  onChange={(event) => updateValue(field, event.target.value)}
                  rows={4}
                />
              </label>
            ))}
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-[var(--foreground)]">
                {t('seoField.tags')}
              </span>
              <Input
                variant="surface"
                value={value.tags}
                onChange={(event) => updateValue('tags', event.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="w-full justify-center"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const saved = await onSave({
                    title: value.title,
                    slug: value.slug,
                    excerpt: value.excerpt,
                    metaTitle: value.metaTitle,
                    metaDescription: value.metaDescription,
                    coverImageAltText: value.coverImageAltText,
                    tags: value.tags
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  });
                  if (saved) setEditing(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? (
                <EAILoaderStatusIcon className="h-3.5 w-3.5" />
              ) : (
                <SaveActionIcon className="h-3.5 w-3.5" />
              )}
              {t('savePublicationMetadata')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
