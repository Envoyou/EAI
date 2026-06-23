'use client';

import React, { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { toggleFeatureFlag } from './actions';
import { Power, Settings, Globe, AlertTriangle, type LucideIcon } from 'lucide-react';
import { SettingSection } from '@/components/SettingsUI';
import type { FeatureFlagKey } from '@/lib/feature-flags';

interface FeatureFlagsClientProps {
  initialFlags: Record<FeatureFlagKey, boolean>;
}

export function FeatureFlagsClient({ initialFlags }: FeatureFlagsClientProps) {
  const [flags, setFlags] = useState<Record<FeatureFlagKey, boolean>>(initialFlags);
  const [isPending, startTransition] = useTransition();
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const handleToggle = (key: FeatureFlagKey, currentValue: boolean) => {
    const newValue = !currentValue;
    
    // Optimistic UI update
    setFlags(prev => ({ ...prev, [key]: newValue }));
    setProcessingKey(key);

    startTransition(async () => {
      try {
        const res = await toggleFeatureFlag(key, newValue);
        if (res.mocked) {
          toast.info('Local Mock Mode', {
            description: 'Vercel Token missing. Flag state will not persist on refresh.',
          });
        } else if (!res.success) {
          setFlags(prev => ({ ...prev, [key]: currentValue }));
          toast.error('Feature Flag Not Updated', {
            description: res.message,
            duration: 10000,
          });
        } else {
          toast.success('Feature Flag Updated', {
            description: `Flag ${key} is now ${newValue ? 'Enabled' : 'Disabled'}.`,
          });
        }
      } catch (error: unknown) {
        // Revert optimistic update on failure
        setFlags(prev => ({ ...prev, [key]: currentValue }));
        toast.error('Failed to update flag', {
          description:
            error instanceof Error
              ? error.message
              : 'Check your permissions and API tokens.',
        });
      } finally {
        setProcessingKey(null);
      }
    });
  };

  // Human readable labels for default flags
  const getFlagDetails = (key: FeatureFlagKey) => {
    const map: Record<FeatureFlagKey, { title: string; desc: string; icon: LucideIcon }> = {
      maintenance_mode: {
        title: 'Maintenance Mode',
        desc: 'Pause AI processing, checkout, and CMS export across all tenants.',
        icon: AlertTriangle,
      },
      ai_processing_enabled: {
        title: 'AI Processing',
        desc: 'Allow article analysis, refinement, and AI drafting.',
        icon: Power,
      },
      cms_export_enabled: {
        title: 'CMS Export',
        desc: 'Allow publication-ready articles to be exported to connected CMS platforms.',
        icon: Globe,
      },
      billing_checkout_enabled: {
        title: 'Billing Checkout',
        desc: 'Allow new hosted checkout sessions. Payment webhooks remain active when disabled.',
        icon: Settings,
      },
      demo_enabled: {
        title: 'Demo Mode',
        desc: 'Allow unauthenticated visitors to use the limited editorial demo.',
        icon: Power,
      },
      signup_enabled: {
        title: 'Public Signup',
        desc: 'Allow new users to open the signup flow.',
        icon: Power,
      },
      pricing_enabled: {
        title: 'Pricing Page',
        desc: 'Make the public plans and pricing page available.',
        icon: Globe,
      },
    };

    return map[key];
  };

  return (
    <SettingSection id="edge-flags" title="Edge Configuration" description="Manage global system features without redeploying the application.">
      <div className="mt-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/50 shadow-sm divide-y divide-slate-200/60 dark:divide-slate-800/60 overflow-hidden">
        
        {(Object.entries(flags) as [FeatureFlagKey, boolean][]).map(([key, value]) => {
          const details = getFlagDetails(key);
          const Icon = details.icon;
          const isProcessing = isPending && processingKey === key;

          return (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
              <div className="flex gap-4">
                <div className={`flex shrink-0 h-10 w-10 items-center justify-center rounded-xl ${value ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{details.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{details.desc}</p>
                  <code className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 inline-block">{key}</code>
                </div>
              </div>
              
              <div className="shrink-0 pl-14 sm:pl-0">
                <button
                  type="button"
                  onClick={() => handleToggle(key, value)}
                  disabled={isProcessing}
                  className={`
                    relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed
                    ${value ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}
                  `}
                  role="switch"
                  aria-checked={value}
                >
                  <span className="sr-only">Toggle {details.title}</span>
                  <span
                    aria-hidden="true"
                    className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                      ${value ? 'translate-x-5' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>
            </div>
          );
        })}

        {Object.keys(flags).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No feature flags found in configuration.
          </div>
        )}
      </div>
    </SettingSection>
  );
}
