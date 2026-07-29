'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  CannibalizationRisk,
  ContentIntelligenceAction,
  ContentIntelligenceArtifact,
} from '@eai/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';

type ApplyAction = (action: ContentIntelligenceAction) => Promise<boolean>;

const titleOf = (
  artifact: ContentIntelligenceArtifact,
  untitled: string
) => artifact.title || artifact.topic || untitled;

function ArtifactComparisonCard({
  artifact,
  untitled,
  onOpen,
  onReposition,
  onSetPrimary,
  onConsolidate,
  primaryDisabled,
  consolidationDisabled,
}: {
  artifact: ContentIntelligenceArtifact;
  untitled: string;
  onOpen: () => void;
  onReposition: () => void;
  onSetPrimary: () => void;
  onConsolidate: () => void;
  primaryDisabled: boolean;
  consolidationDisabled: boolean;
}) {
  const t = useTranslations('ContentMap');
  return (
    <article className="surface-card space-y-3 p-4">
      <div>
        <h4 className="font-medium">{titleOf(artifact, untitled)}</h4>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {artifact.topic || t('notAvailable')}
        </p>
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
        <dt className="text-[var(--muted-foreground)]">
          {t('columns.stage')}
        </dt>
        <dd>{t(`stages.${artifact.stage}`)}</dd>
        <dt className="text-[var(--muted-foreground)]">
          {t('columns.keyword')}
        </dt>
        <dd>{artifact.primaryKeyword || t('notAvailable')}</dd>
        <dt className="text-[var(--muted-foreground)]">
          {t('details.searchIntent')}
        </dt>
        <dd>{artifact.searchIntent || t('notAvailable')}</dd>
        <dt className="text-[var(--muted-foreground)]">
          {t('columns.owner')}
        </dt>
        <dd>{artifact.ownerName || t('workspaceMember')}</dd>
        <dt className="text-[var(--muted-foreground)]">
          {t('columns.source')}
        </dt>
        <dd>{t(`sources.${artifact.sourceType}`)}</dd>
        <dt className="text-[var(--muted-foreground)]">
          {t('details.export')}
        </dt>
        <dd>{t(`exportStatuses.${artifact.exportStatus}`)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="surface"
          size="xs"
          disabled={!artifact.sourceHref}
          onClick={onOpen}
        >
          {t('actions.openDraft')}
        </Button>
        <Button
          type="button"
          variant="surface"
          size="xs"
          disabled={!artifact.canManage}
          onClick={onReposition}
        >
          {t('actions.reposition')}
        </Button>
        <Button
          type="button"
          variant="surface"
          size="xs"
          disabled={primaryDisabled}
          onClick={onSetPrimary}
        >
          {t('actions.setPrimary')}
        </Button>
        <Button
          type="button"
          variant="surface"
          size="xs"
          disabled={consolidationDisabled}
          onClick={onConsolidate}
        >
          {t('actions.markConsolidated')}
        </Button>
      </div>
    </article>
  );
}

type ComparisonMode =
  | { type: 'compare' }
  | {
      type: 'confirm';
      action: ContentIntelligenceAction;
      titleKey: 'setCanonical' | 'consolidate' | 'notCannibalization';
    }
  | {
      type: 'reposition';
      artifact: ContentIntelligenceArtifact;
    };

export function ContentComparisonDialog({
  risk,
  submitting,
  onClose,
  onOpenArtifact,
  onApply,
}: {
  risk: CannibalizationRisk | null;
  submitting: boolean;
  onClose: () => void;
  onOpenArtifact: (artifact: ContentIntelligenceArtifact) => void;
  onApply: ApplyAction;
}) {
  const t = useTranslations('ContentMap');
  const [mode, setMode] = useState<ComparisonMode>({ type: 'compare' });
  const [angle, setAngle] = useState('');
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [searchIntent, setSearchIntent] = useState('');

  if (!risk) return null;

  const requestPrimary = (
    primary: ContentIntelligenceArtifact,
    variant: ContentIntelligenceArtifact
  ) => {
    if (!variant.canManage) return;
    setMode({
      type: 'confirm',
      titleKey: 'setCanonical',
      action: {
        action: 'set_canonical',
        artifactId: primary.id,
        relatedArtifactId: variant.id,
      },
    });
  };
  const requestConsolidation = (
    primary: ContentIntelligenceArtifact,
    secondary: ContentIntelligenceArtifact
  ) => {
    if (!secondary.canManage) return;
    setMode({
      type: 'confirm',
      titleKey: 'consolidate',
      action: {
        action: 'consolidate',
        artifactId: primary.id,
        relatedArtifactId: secondary.id,
      },
    });
  };
  const startReposition = (artifact: ContentIntelligenceArtifact) => {
    setAngle(artifact.angle ?? '');
    setPrimaryKeyword(artifact.primaryKeyword ?? '');
    setSearchIntent(artifact.searchIntent ?? '');
    setMode({ type: 'reposition', artifact });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-comparison-title"
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-2xl">
        {mode.type === 'compare' ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="content-comparison-title" className="font-semibold">
                  {t('dialogs.compareTitle')}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {t('dialogs.compareDescription', {
                    score: Math.round(risk.score * 100),
                  })}
                </p>
              </div>
              <Badge
                variant={
                  risk.severity === 'critical'
                    ? 'danger'
                    : risk.severity === 'high'
                      ? 'warning'
                      : 'muted'
                }
                size="xs"
              >
                {t(`intelligence.severity.${risk.severity}`)}
              </Badge>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ArtifactComparisonCard
                artifact={risk.left}
                untitled={t('untitled')}
                onOpen={() => onOpenArtifact(risk.left)}
                onReposition={() => startReposition(risk.left)}
                onSetPrimary={() => requestPrimary(risk.left, risk.right)}
                onConsolidate={() =>
                  requestConsolidation(risk.left, risk.right)
                }
                primaryDisabled={!risk.right.canManage}
                consolidationDisabled={!risk.right.canManage}
              />
              <ArtifactComparisonCard
                artifact={risk.right}
                untitled={t('untitled')}
                onOpen={() => onOpenArtifact(risk.right)}
                onReposition={() => startReposition(risk.right)}
                onSetPrimary={() => requestPrimary(risk.right, risk.left)}
                onConsolidate={() =>
                  requestConsolidation(risk.right, risk.left)
                }
                primaryDisabled={!risk.left.canManage}
                consolidationDisabled={!risk.left.canManage}
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="surface"
                onClick={() =>
                  setMode({
                    type: 'confirm',
                    titleKey: 'notCannibalization',
                    action: {
                      action: 'not_cannibalization',
                      artifactId: risk.left.id,
                      relatedArtifactId: risk.right.id,
                    },
                  })
                }
              >
                {t('actions.notCannibalization')}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('actions.close')}
              </Button>
            </div>
          </>
        ) : mode.type === 'reposition' ? (
          <>
            <h3 id="content-comparison-title" className="font-semibold">
              {t('dialogs.repositionTitle')}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {titleOf(mode.artifact, t('untitled'))}
            </p>
            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span>{t('details.angle')}</span>
                <Input
                  variant="surface"
                  value={angle}
                  onChange={(event) => setAngle(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span>{t('columns.keyword')}</span>
                <Input
                  variant="surface"
                  value={primaryKeyword}
                  onChange={(event) =>
                    setPrimaryKeyword(event.target.value)
                  }
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span>{t('details.searchIntent')}</span>
                <Input
                  variant="surface"
                  value={searchIntent}
                  onChange={(event) => setSearchIntent(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="surface"
                disabled={submitting}
                onClick={() => setMode({ type: 'compare' })}
              >
                {t('actions.back')}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!angle.trim() || submitting}
                onClick={async () => {
                  const success = await onApply({
                    action: 'reposition',
                    artifactId: mode.artifact.id,
                    angle: angle.trim(),
                    primaryKeyword: primaryKeyword.trim() || null,
                    searchIntent: searchIntent.trim() || null,
                  });
                  if (success) onClose();
                }}
              >
                {submitting ? (
                  <EAILoaderStatusIcon className="h-4 w-4" />
                ) : null}
                {t('actions.saveReposition')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 id="content-comparison-title" className="font-semibold">
              {t(`dialogs.confirm.${mode.titleKey}.title`)}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {t(`dialogs.confirm.${mode.titleKey}.description`)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="surface"
                disabled={submitting}
                onClick={() => setMode({ type: 'compare' })}
              >
                {t('actions.back')}
              </Button>
              <Button
                type="button"
                variant={
                  mode.titleKey === 'consolidate' ? 'danger' : 'primary'
                }
                disabled={submitting}
                onClick={async () => {
                  const success = await onApply(mode.action);
                  if (success) onClose();
                }}
              >
                {submitting ? (
                  <EAILoaderStatusIcon className="h-4 w-4" />
                ) : null}
                {t('actions.confirm')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ContentArchiveDialog({
  artifact,
  submitting,
  onClose,
  onApply,
}: {
  artifact: ContentIntelligenceArtifact | null;
  submitting: boolean;
  onClose: () => void;
  onApply: ApplyAction;
}) {
  const t = useTranslations('ContentMap');
  if (!artifact) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-archive-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-2xl">
        <h3 id="content-archive-title" className="font-semibold">
          {t('dialogs.archiveTitle')}
        </h3>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {t('dialogs.archiveDescription', {
            title: titleOf(artifact, t('untitled')),
          })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="surface"
            disabled={submitting}
            onClick={onClose}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={submitting}
            onClick={async () => {
              const success = await onApply({
                action: 'archive',
                artifactId: artifact.id,
              });
              if (success) onClose();
            }}
          >
            {submitting ? (
              <EAILoaderStatusIcon className="h-4 w-4" />
            ) : null}
            {t('actions.archive')}
          </Button>
        </div>
      </div>
    </div>
  );
}
