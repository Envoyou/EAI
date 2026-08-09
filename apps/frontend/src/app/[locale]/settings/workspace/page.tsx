'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { Link, useRouter } from '@/i18n/routing';
import { SlidersHorizontal, CreditCard } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { SettingSection, SettingRow } from '@/components/SettingsUI';
import { PRICING_ENABLED } from '@eai/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert } from '@/components/ui/alert';
import { fetchWithTimeout, getResponseErrorMessage } from '@/lib/fetch-utils';

export default function WorkspaceSettingsPage() {
  const t = useTranslations('WorkspaceSettings');
  const { workspace, loadingWorkspace, updateWorkspaceOrganization } = useSettings();
  const router = useRouter();
  const [pendingConsent, setPendingConsent] = useState<boolean | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  useEffect(() => {
    if (!loadingWorkspace && workspace && !workspace.isAdmin) {
      router.replace('/settings/general');
    }
  }, [workspace, loadingWorkspace, router]);

  if (loadingWorkspace || !workspace || !workspace.isAdmin) {
    return (
      <div className="flex h-40 items-center justify-center">
        <EAILoaderStatusIcon className="h-6 w-6 text-[var(--muted-foreground)]" />
      </div>
    );
  }

  const consentEnabled = workspace.organization.editorialEvaluationConsent;
  const saveConsent = async () => {
    if (pendingConsent === null) return;
    setSavingConsent(true);
    try {
      const response = await fetchWithTimeout('/api/workspace/editorial-evaluation-consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: pendingConsent }),
      });
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, t('consentSaveError')));
      }
      const payload = await response.json() as {
        organization: {
          editorialEvaluationConsent: boolean;
          editorialEvaluationConsentUpdatedAt: string;
        };
      };
      updateWorkspaceOrganization(payload.organization);
      toast.success(payload.organization.editorialEvaluationConsent
        ? t('consentEnabledNotice')
        : t('consentDisabledNotice'));
      setPendingConsent(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('consentSaveError'));
    } finally {
      setSavingConsent(false);
    }
  };

  return (
    <>
      <div className="settings-page-intro">
        <span>{t('eyebrow')}</span>
        <h2 className="text-balance">{t('title')}</h2>
        <p className="text-pretty">{t('description')}</p>
      </div>

      <SettingSection
        id="workspace"
        title={t('workspaceTitle')}
        description={t('workspaceDescription')}
      >


        <SettingRow
          title={t('publicationTitle')}
          description={t('publicationDescription')}
        >
          <Button render={<Link href="/settings/publication/identity" />} variant="surface" size="sm" className="no-underline">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t('openPublication')}
          </Button>
        </SettingRow>

        <SettingRow
          title={t('planTitle')}
          description={t('planDescription')}
        >
          {loadingWorkspace ? (
            <EAILoaderStatusIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
          ) : (
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">
                {t('credits', { count: workspace?.plan.creditsRemaining ?? 0 })}
              </div>
              <div className="text-[11px] capitalize text-[var(--muted-foreground)]">
                {(workspace?.plan.activePlan ?? 'free').replace('org:', '')} plan
              </div>
            </div>
          )}
          {PRICING_ENABLED && (
            <Button render={<Link href="/settings/billing" />} variant="muted" size="sm" className="no-underline">
              <CreditCard className="h-3.5 w-3.5" />
              {t('managePlan')}
            </Button>
          )}
        </SettingRow>
      </SettingSection>

      <SettingSection
        id="privacy"
        title={t('privacyTitle')}
        description={t('privacyDescription')}
      >
        <SettingRow
          title={t('consentTitle')}
          description={consentEnabled ? t('consentOnSummary') : t('consentOffSummary')}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[var(--muted-foreground)]">
              {consentEnabled ? t('enabled') : t('disabled')}
            </span>
            <Switch
              checked={consentEnabled}
              onCheckedChange={checked => setPendingConsent(checked)}
              aria-label={t('consentTitle')}
            />
          </div>
        </SettingRow>

        <div className="space-y-3 p-4 sm:p-5">
          <Alert variant={consentEnabled ? 'primary' : 'muted'}>
            <div className="space-y-3">
              <div className="font-semibold">
                {consentEnabled ? t('whenEnabledTitle') : t('whenDisabledTitle')}
              </div>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed">
                {(consentEnabled
                  ? ['enabledEffectCollection', 'enabledEffectAccess', 'enabledEffectPurpose']
                  : ['disabledEffectCapture', 'disabledEffectVisibility', 'disabledEffectRetention']
                ).map(key => <li key={key}>{t(key)}</li>)}
              </ul>
            </div>
          </Alert>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            {t('dataIncluded')}
          </p>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            {t('revocation')}
          </p>
        </div>
      </SettingSection>

      {pendingConsent !== null && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="evaluation-consent-dialog-title"
          onClick={() => { if (!savingConsent) setPendingConsent(null); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <h3 id="evaluation-consent-dialog-title" className="text-base font-bold">
              {pendingConsent ? t('confirmEnableTitle') : t('confirmDisableTitle')}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {pendingConsent ? t('confirmEnableDescription') : t('confirmDisableDescription')}
            </p>
            <dl className="mt-4 grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
              <dt className="font-semibold">{t('decision')}</dt>
              <dd>{pendingConsent ? t('allow') : t('doNotAllow')}</dd>
              <dt className="font-semibold">{t('scopeLabel')}</dt>
              <dd>{t('scopeValue')}</dd>
              <dt className="font-semibold">{t('accessLabel')}</dt>
              <dd>{t('accessValue')}</dd>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="surface"
                size="sm"
                disabled={savingConsent}
                onClick={() => setPendingConsent(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant={pendingConsent ? 'primary' : 'danger'}
                size="sm"
                disabled={savingConsent}
                onClick={() => void saveConsent()}
              >
                {savingConsent && <EAILoaderStatusIcon className="h-4 w-4" />}
                {savingConsent
                  ? t('saving')
                  : pendingConsent ? t('confirmAllow') : t('confirmDisable')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
