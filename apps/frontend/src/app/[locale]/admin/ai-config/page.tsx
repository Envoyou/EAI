'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import React, { useState } from 'react';
import { Search, Loader2, Cpu, Save, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

type OrgSearchResult = {
  id: string;
  name: string;
  slug: string;
  clerkOrganizationId: string | null;
};

type OrgAiConfig = {
  organizationId: string;
  name: string;
  provider: 'gemini' | 'groq' | 'openrouter';
  model: string;
};

export default function AiConfigAdminPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrgSearchResult[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [config, setConfig] = useState<OrgAiConfig | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return;

    setSearching(true);
    setErrorMsg('');
    try {
      const response = await fetchWithTimeout(`/api/admin/billing?q=${encodeURIComponent(cleanQuery)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setResults(data.organizations || []);
    } catch (err) {
      console.error(err);
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
      const response = await fetchWithTimeout(`/api/admin/organizations/${orgId}/ai-config`);
      if (!response.ok) throw new Error('Failed to load configuration');
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load organization configuration');
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const saveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!config || !selectedOrgId) return;

    setSaving(true);
    setErrorMsg('');
    setSaveSuccess(false);
    try {
      const response = await fetchWithTimeout(`/api/admin/organizations/${selectedOrgId}/ai-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          model: config.model || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }
      
      setSaveSuccess(true);
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const setProviderAndClearModel = (provider: 'gemini' | 'groq' | 'openrouter') => {
    if (!config) return;
    setConfig({
      ...config,
      provider,
      model: '', // clear override model name initially when switching providers
    });
  };

  const applyModelPreset = (modelName: string) => {
    if (!config) return;
    setConfig({
      ...config,
      model: modelName,
    });
  };

  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">Refine AI Engine Settings</h2>
        <p className="text-pretty">Configure AI provider and specific model overrides for refinement and review stages.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
        {/* Left Search Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <form onSubmit={runSearch} className="ui-card p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Find workspace
            </label>
            <div className="mt-2.5 flex gap-2">
              <Input
                variant="surface"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="text-xs"
                placeholder="Organization, slug..."
                aria-label="Search organization"
              />
              <button
                type="submit"
                disabled={searching}
                className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </button>
            </div>
          </form>

          {/* Results List */}
          {results.length > 0 && (
            <div className="ui-card p-3 space-y-1 max-h-[350px] overflow-y-auto">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] px-2.5 py-1.5">
                Search Results ({results.length})
              </div>
              {results.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => loadOrgConfig(org.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors border-none bg-transparent cursor-pointer ${
                    selectedOrgId === org.id
                      ? 'bg-[var(--surface-3)] text-[var(--foreground)] font-semibold'
                      : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <div className="font-semibold truncate">{org.name}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] truncate mt-0.5">
                    slug: {org.slug}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        <div className="lg:col-span-2">
          {errorMsg && (
            <div className="ui-alert ui-alert-danger mb-4 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-xs">{errorMsg}</div>
            </div>
          )}

          {saveSuccess && (
            <div className="ui-alert ui-alert-success mb-4 text-xs font-semibold">
              AI Engine configuration updated successfully. Cache invalidated.
            </div>
          )}

          {loadingConfig ? (
            <div className="ui-card p-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mb-2" />
              <span className="text-xs text-[var(--muted-foreground)]">Loading AI configuration...</span>
            </div>
          ) : config ? (
            <form onSubmit={saveConfig} className="ui-card p-6 space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--border)]">
                <Cpu className="h-5 w-5 text-[var(--primary)]" />
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">{config.name}</h3>
                  <p className="text-[10px] text-[var(--muted-foreground)]">ID: {config.organizationId}</p>
                </div>
              </div>

              {/* Dynamic Warning Alert */}
              <div className="ui-alert ui-alert-warning flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--warning)]" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">B2B Override Scope Alert:</p>
                  <p className="text-[var(--muted-foreground)] leading-relaxed">
                    Pengaturan provider dan model ini <strong>hanya memengaruhi tahap pemolesan draf (Refine/Review)</strong>.
                    Tahap chat strategist dan draf awal di editor akan tetap dikunci menggunakan Google Gemini untuk efisiensi performa.
                  </p>
                </div>
              </div>

              {/* Provider Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Refinement AI Provider
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gemini', 'groq', 'openrouter'] as const).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setProviderAndClearModel(prov)}
                      className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        config.provider === prov
                          ? 'bg-[var(--primary-bg)] border-[var(--primary)] text-[var(--primary)] shadow-sm'
                          : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                      }`}
                    >
                      <span className="capitalize">{prov === 'gemini' ? 'Gemini API' : prov}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Name Input */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Model Override Name
                  </label>
                  <span className="text-[10px] text-[var(--muted-foreground)] italic">
                    Leave blank to use provider default models
                  </span>
                </div>
                <Input
                  variant="surface"
                  value={config.model}
                  onChange={(event) => setConfig({ ...config, model: event.target.value })}
                  className="text-xs"
                  placeholder={
                    config.provider === 'gemini'
                      ? 'e.g. gemini-2.5-pro'
                      : config.provider === 'groq'
                        ? 'e.g. qwen/qwen3-32b'
                        : 'e.g. google/gemini-2.5-pro'
                  }
                  aria-label="Model Override Name"
                />

                {/* Preset Suggestions based on provider */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-[var(--muted-foreground)] block">Suggested Presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {config.provider === 'gemini' && (
                      <>
                        <button type="button" onClick={() => applyModelPreset('gemini-2.5-pro')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">gemini-2.5-pro</button>
                        <button type="button" onClick={() => applyModelPreset('gemini-2.5-flash')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">gemini-2.5-flash</button>
                        <button type="button" onClick={() => applyModelPreset('gemini-1.5-pro')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">gemini-1.5-pro</button>
                      </>
                    )}
                    {config.provider === 'groq' && (
                      <>
                        <button type="button" onClick={() => applyModelPreset('qwen/qwen3-32b')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">qwen/qwen3-32b</button>
                        <button type="button" onClick={() => applyModelPreset('llama-3.3-70b-versatile')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">llama-3.3-70b</button>
                        <button type="button" onClick={() => applyModelPreset('llama-3.1-8b-instant')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">llama-3.1-8b</button>
                      </>
                    )}
                    {config.provider === 'openrouter' && (
                      <>
                        <button type="button" onClick={() => applyModelPreset('google/gemini-2.5-pro')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">gemini-2.5-pro</button>
                        <button type="button" onClick={() => applyModelPreset('openai/gpt-4o-mini')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">gpt-4o-mini</button>
                        <button type="button" onClick={() => applyModelPreset('anthropic/claude-3.5-sonnet')} className="ui-badge ui-badge-muted hover:bg-[var(--surface-3)] cursor-pointer py-1">claude-3.5-sonnet</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                <button
                  type="submit"
                  disabled={saving}
                  className="ui-btn ui-btn-primary ui-btn-md gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Configuration
                </button>
              </div>
            </form>
          ) : (
            <div className="ui-card p-12 text-center flex flex-col items-center justify-center">
              <Cpu className="h-10 w-10 text-[var(--muted-foreground)]/40 mb-3" />
              <h3 className="text-sm font-bold text-[var(--foreground)]">No workspace selected</h3>
              <p className="text-xs text-[var(--muted-foreground)] mt-1.5 max-w-sm">
                Use the search tool on the left to select a tenant workspace and configure its Refine AI engine settings.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
