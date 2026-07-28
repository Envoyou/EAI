'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Loader2,
  Save,
  Search,
  Settings2,
} from 'lucide-react';
import type {
  AiFunctionDefinition,
  AiFunctionKey,
  AiProviderModel,
  AiProviderName,
  AiRuntimeConfig,
} from '@eai/shared';
import { fetchWithTimeout } from '@/lib/fetch-utils';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type OrgSearchResult = {
  id: string;
  name: string;
  slug: string;
  clerkOrganizationId: string | null;
};

type OrgAiConfigResponse = {
  organizationId: string;
  name: string;
  config: AiRuntimeConfig;
  functions: AiFunctionDefinition[];
};

const PROVIDERS: readonly AiProviderName[] = [
  'gemini',
  'groq',
  'openrouter',
];

const MODEL_PRESETS: Record<AiProviderName, readonly string[]> = {
  gemini: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
  groq: [
    'qwen/qwen3-32b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  openrouter: [
    'google/gemini-3.6-flash',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
  ],
};

const providerLabel = (provider: AiProviderName) =>
  provider === 'gemini'
    ? 'Gemini API'
    : provider === 'openrouter'
      ? 'OpenRouter'
      : 'Groq';

function ProviderModelFields({
  value,
  allowedProviders,
  onChange,
}: {
  value: AiProviderModel;
  allowedProviders: readonly AiProviderName[];
  onChange: (value: AiProviderModel) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)]">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Provider
        </label>
        <Select
          value={value.provider}
          onValueChange={(provider) => {
            if (provider !== null) {
              onChange({
                provider: provider as AiProviderName,
                model: null,
              });
            }
          }}
        >
          <SelectTrigger variant="surface" aria-label="AI provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowedProviders.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {providerLabel(provider)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Model override
          </label>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            Blank uses the backend default
          </span>
        </div>
        <Input
          variant="surface"
          value={value.model ?? ''}
          onChange={(event) =>
            onChange({ ...value, model: event.target.value || null })
          }
          placeholder={MODEL_PRESETS[value.provider][0]}
          aria-label="Model override"
        />
        <div className="flex flex-wrap gap-1.5">
          {MODEL_PRESETS[value.provider].map((model) => (
            <Button
              key={model}
              type="button"
              variant="muted"
              size="xs"
              onClick={() => onChange({ ...value, model })}
            >
              {model}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AiConfigAdminPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrgSearchResult[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [organization, setOrganization] =
    useState<OrgAiConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return;

    setSearching(true);
    setErrorMsg('');
    try {
      const response = await fetchWithTimeout(
        `/api/admin/billing?q=${encodeURIComponent(cleanQuery)}`
      );
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setResults(data.organizations || []);
    } catch (error) {
      console.error(error);
      setErrorMsg('Failed to search organizations');
    } finally {
      setSearching(false);
    }
  };

  const loadOrgConfig = async (orgId: string) => {
    setSelectedOrgId(orgId);
    setLoadingConfig(true);
    setErrorMsg('');
    setSaveSuccess(false);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/organizations/${orgId}/ai-config`
      );
      if (!response.ok) throw new Error('Failed to load configuration');
      setOrganization((await response.json()) as OrgAiConfigResponse);
    } catch (error) {
      console.error(error);
      setErrorMsg('Failed to load organization configuration');
      setOrganization(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const updateDefault = (value: AiProviderModel) => {
    if (!organization) return;
    setOrganization({
      ...organization,
      config: { ...organization.config, default: value },
    });
  };

  const updateFunction = (
    key: AiFunctionKey,
    value: AiProviderModel | null
  ) => {
    if (!organization) return;
    const functions = { ...organization.config.functions };
    if (value) functions[key] = value;
    else delete functions[key];
    setOrganization({
      ...organization,
      config: { ...organization.config, functions },
    });
  };

  const saveConfig = async () => {
    if (!organization || !selectedOrgId) return;

    setSaving(true);
    setErrorMsg('');
    setSaveSuccess(false);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/organizations/${selectedOrgId}/ai-config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(organization.config),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }
      const updated = (await response.json()) as OrgAiConfigResponse;
      setOrganization(updated);
      setSaveSuccess(true);
      setShowConfirmation(false);
    } catch (error) {
      console.error(error);
      setErrorMsg(
        error instanceof Error ? error.message : 'Failed to save configuration'
      );
    } finally {
      setSaving(false);
    }
  };

  const renderCategory = (category: 'Strategist' | 'Analyze') => {
    if (!organization) return null;
    const definitions = organization.functions.filter(
      (definition) => definition.category === category
    );

    return (
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">
            {category}
          </h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Configure only the functions that need a different runtime.
          </p>
        </div>
        {definitions.map((definition) => {
          const override = organization.config.functions[definition.key];
          const inherited = organization.config.default;
          const effective =
            override ??
            (definition.allowedProviders.includes(inherited.provider)
              ? inherited
              : { provider: definition.allowedProviders[0], model: null });
          return (
            <div key={definition.key} className="ui-card p-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-bold text-[var(--foreground)]">
                      {definition.label}
                    </h4>
                    {definition.allowedProviders.length === 1 && (
                      <Badge variant="warning" size="xs">
                        Gemini native
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {definition.description}
                  </p>
                </div>
                <Select
                  value={override ? 'override' : 'default'}
                  onValueChange={(mode) => {
                    if (mode === 'override') {
                      const provider = definition.allowedProviders.includes(
                        effective.provider
                      )
                        ? effective.provider
                        : definition.allowedProviders[0];
                      updateFunction(definition.key, {
                        provider,
                        model:
                          provider === effective.provider
                            ? effective.model
                            : null,
                      });
                    } else if (mode === 'default') {
                      updateFunction(definition.key, null);
                    }
                  }}
                >
                  <SelectTrigger
                    variant="surface"
                    size="sm"
                    className="w-full sm:w-40"
                    aria-label={`${definition.label} configuration mode`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default</SelectItem>
                    <SelectItem value="override">Custom override</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {override ? (
                <ProviderModelFields
                  value={override}
                  allowedProviders={definition.allowedProviders}
                  onChange={(value) =>
                    updateFunction(definition.key, value)
                  }
                />
              ) : (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  Effective runtime: {providerLabel(effective.provider)}
                  {effective.model ? ` / ${effective.model}` : ' / provider default'}
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  };

  return (
    <>
      <div className="settings-page-intro">
        <Badge variant="warning" size="xs" className="mb-2 uppercase tracking-wider">
          Internal Use Only
        </Badge>
        <h2 className="text-balance">AI Runtime Configuration</h2>
        <p className="text-pretty">
          Change provider and model defaults or override individual Chat and
          Analyze functions without redeploying the backend.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <form onSubmit={runSearch} className="ui-card p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Find workspace
            </label>
            <div className="mt-2.5 flex gap-2">
              <Input
                variant="surface"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Organization, slug..."
                aria-label="Search organization"
              />
              <Button
                type="submit"
                disabled={searching}
                variant="primary"
                size="sm"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </form>

          {results.length > 0 && (
            <div className="ui-card max-h-[350px] space-y-1 overflow-y-auto p-3">
              <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Search Results ({results.length})
              </div>
              {results.map((org) => (
                <Button
                  key={org.id}
                  type="button"
                  onClick={() => loadOrgConfig(org.id)}
                  variant={selectedOrgId === org.id ? 'surface' : 'muted'}
                  className="h-auto w-full justify-start"
                >
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-xs font-semibold">
                      {org.name}
                    </span>
                    <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                      slug: {org.slug}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {errorMsg && (
            <Alert variant="danger" className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-xs">{errorMsg}</div>
            </Alert>
          )}
          {saveSuccess && (
            <Alert variant="success" className="text-xs font-semibold">
              AI runtime configuration updated and cache invalidated.
            </Alert>
          )}

          {loadingConfig ? (
            <div className="ui-card flex flex-col items-center justify-center p-12 text-center">
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-[var(--primary)]" />
              <span className="text-xs text-[var(--muted-foreground)]">
                Loading AI configuration...
              </span>
            </div>
          ) : organization ? (
            <>
              <section className="ui-card space-y-5 p-5">
                <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-4">
                  <Cpu className="h-5 w-5 text-[var(--primary)]" />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-[var(--foreground)]">
                      {organization.name}
                    </h3>
                    <p className="truncate text-[10px] text-[var(--muted-foreground)]">
                      ID: {organization.organizationId}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-[var(--primary)]" />
                    <h3 className="text-sm font-bold">Workspace default</h3>
                  </div>
                  <ProviderModelFields
                    value={organization.config.default}
                    allowedProviders={PROVIDERS}
                    onChange={updateDefault}
                  />
                </div>
              </section>

              {renderCategory('Strategist')}
              {renderCategory('Analyze')}

              <div className="sticky bottom-3 flex justify-end rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/95 p-3 shadow-lg backdrop-blur">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setShowConfirmation(true)}
                >
                  <Save className="h-4 w-4" />
                  Save runtime configuration
                </Button>
              </div>
            </>
          ) : (
            <div className="ui-card flex flex-col items-center justify-center p-12 text-center">
              <Cpu className="mb-3 h-10 w-10 text-[var(--muted-foreground)]" />
              <h3 className="text-sm font-bold text-[var(--foreground)]">
                No workspace selected
              </h3>
              <p className="mt-1.5 max-w-sm text-xs text-[var(--muted-foreground)]">
                Select a tenant workspace to configure its AI runtime.
              </p>
            </div>
          )}
        </div>
      </div>

      {showConfirmation && organization && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowConfirmation(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-ai-config-title"
            className="ui-card w-full max-w-md space-y-4 p-5 shadow-2xl"
          >
            <div>
              <h3
                id="confirm-ai-config-title"
                className="text-base font-bold text-[var(--foreground)]"
              >
                Apply runtime configuration?
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                New requests for {organization.name} will use these provider
                and model settings immediately after the cache is invalidated.
              </p>
            </div>
            <Alert variant="warning" className="text-xs">
              An unavailable provider or invalid model name can make the
              affected function fail until this setting is corrected.
            </Alert>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="muted"
                disabled={saving}
                onClick={() => setShowConfirmation(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={saving}
                onClick={saveConfig}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm and apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
