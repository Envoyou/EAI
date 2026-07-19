import React from 'react';
import { TelemetryClient } from './TelemetryClient';
import { Badge } from '@/components/ui/badge';

export const metadata = {
  title: 'Telemetry & Logs | EAI Admin Console',
};

export default function TelemetryAdminPage() {
  const hasDsn = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  return (
    <>
      <div className="settings-page-intro">
        <Badge variant="warning" size="xs" className="mb-2 uppercase tracking-wider">Internal Use Only</Badge>
        <h2 className="text-balance">Telemetry & Logs</h2>
        <p className="text-pretty">System health monitoring, error tracking, and performance metrics.</p>
      </div>

      <TelemetryClient hasDsn={hasDsn} />
    </>
  );
}
