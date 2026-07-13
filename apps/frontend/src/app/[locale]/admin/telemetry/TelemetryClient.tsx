'use client';

import React from 'react';
import { toast } from 'sonner';
import { Activity, ExternalLink, ShieldAlert } from 'lucide-react';
import { SettingSection } from '@/components/SettingsUI';
import * as Sentry from '@sentry/nextjs';

export function TelemetryClient({ hasDsn }: { hasDsn: boolean }) {
  const triggerTestError = async () => {
    if (!hasDsn) {
      toast.error('Sentry DSN Missing', {
        description: 'NEXT_PUBLIC_SENTRY_DSN is not available in this deployment.',
      });
      return;
    }

    if (!Sentry.getClient()) {
      toast.error('Sentry SDK Not Initialized', {
        description: 'The browser SDK is unavailable. Redeploy after checking the Sentry instrumentation files.',
      });
      return;
    }

    const eventId = Sentry.captureException(
      new Error('Sentry telemetry test error from System Settings.'),
      {
        tags: {
          source: 'system-settings',
          test_event: 'true',
        },
      },
    );
    const flushed = await Sentry.flush(2_000);

    if (flushed) {
      toast.success('Test Error Sent', {
        description: `Sentry event ID: ${eventId}`,
      });
    } else {
      toast.error('Sentry Delivery Timed Out', {
        description: `Event ${eventId} was queued but could not be confirmed within 2 seconds.`,
      });
    }
  };

  return (
    <SettingSection id="sentry-telemetry" title="Sentry Integration" description="Monitor application performance and track exceptions in real-time.">
      <div className="mt-4 surface-card surface-card-md p-6 overflow-hidden space-y-6">
        
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${hasDsn ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
              Connection Status
              {hasDsn ? (
                <span className="ui-badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none">Active</span>
              ) : (
                <span className="ui-badge bg-rose-500/10 text-rose-600 dark:text-rose-400 border-none">Disconnected</span>
              )}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {hasDsn 
                ? 'Sentry is currently capturing frontend and backend exceptions.' 
                : 'Sentry DSN is not detected. Please connect via Vercel Integrations.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
          <a
            href="https://sentry.io"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn ui-btn-primary flex items-center gap-2"
          >
            <span>Open Sentry Dashboard</span>
            <ExternalLink className="h-4 w-4" />
          </a>
          
          <button
            onClick={() => void triggerTestError()}
            className="ui-btn ui-btn-outline flex items-center gap-2"
          >
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            <span>Test Error Capture</span>
          </button>
        </div>
      </div>
    </SettingSection>
  );
}
