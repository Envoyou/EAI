'use client';

import React from 'react';
import { ChevronRight, Database, FileClock, ShieldCheck, Tags, Users } from 'lucide-react';
import { usePublication } from '@/components/PublicationProvider';
import { SettingSection } from '@/components/SettingsUI';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));

export default function HistorySettingsPage() {
  const { data, form, hasChanges } = usePublication();

  if (!data || !form) return null;

  const nextVersion = data.profile.latestVersion + 1;

  return (
    <>
      <div className="settings-page-intro">
        <span>Publication Settings</span>
        <h2 className="text-balance">History & System</h2>
        <p className="text-pretty">Track settings changes, organization stats, and advanced platform details.</p>
      </div>

      <SettingSection id="system" title="System Status" description="Audit log and technical configuration details.">
        <div className="grid gap-6 md:grid-cols-2">
          
          {/* Settings History Card */}
          <div className="rounded-lg bg-muted/10 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileClock className="h-4.5 w-4.5 text-primary" />
                  <h3 className="text-sm font-bold">Settings History</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Audit log of all saved publication profiles.</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
                {data.profile.versions.length} versions
              </span>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {data.profile.versions.map((version, index) => (
                <div
                  key={version.id}
                  className={`relative rounded-md p-4 transition-all duration-200 ${
                    index === 0
                      ? 'bg-primary/5 dark:bg-primary/10'
                      : 'bg-muted/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-lg font-bold tabular-nums">v{version.version}</span>
                      {index === 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider font-semibold text-primary">
                          Active
                        </span>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-[10px] text-muted-foreground">
                    <div>
                      <div className="font-mono uppercase tracking-wider text-[9px]">Created At</div>
                      <div className="mt-1 text-foreground font-medium">{formatDate(version.createdAt)}</div>
                    </div>
                    <div>
                      <div className="font-mono uppercase tracking-wider text-[9px]">Drafts Processed</div>
                      <div className="mt-1 text-foreground font-medium tabular-nums">{version.analysisCount} articles</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Advanced Info & Stats Column */}
          <div className="space-y-6">
            {/* Organization Stats */}
            <div className="rounded-lg bg-muted/10 p-5 shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-primary" />
                Organization Overview
              </h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Workspace', value: data.organization.name, icon: Users },
                  { label: 'Categories', value: `${(form.categories || []).length} items`, icon: Tags },
                  { label: 'Source Policy', value: form.sourcePolicy, icon: ShieldCheck },
                ].map(({ label, value, icon: IconComponent }) => (
                  <div key={label} className="rounded-md bg-muted/20 px-2 py-3">
                    <IconComponent className="mx-auto h-4 w-4 text-muted-foreground/85" />
                    <div className="mt-1 text-[11px] font-bold text-foreground truncate">{value}</div>
                    <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced system info */}
            <div className="rounded-lg bg-muted/10 p-5 shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-primary" />
                Advanced System Telemetry
              </h3>
              <div className="space-y-3 font-mono text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/30">
                  <span>Profile Identifier</span>
                  <span className="truncate text-foreground font-medium max-w-[200px]" title={data.profile.key}>
                    {data.profile.key}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/30">
                  <span>Current Active Version</span>
                  <span className="text-foreground font-medium">v{data.profile.latestVersion}</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/30">
                  <span>Next Version</span>
                  <span className="text-foreground font-medium">v{nextVersion} {hasChanges && '(Unsaved)'}</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/30">
                  <span>Platform Core Rules</span>
                  <span className="text-foreground font-medium">v{data.coreGuardrailsVersion}</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <span>Organization Slug</span>
                  <span className="text-foreground font-medium">{data.organization.slug}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </SettingSection>
    </>
  );
}
