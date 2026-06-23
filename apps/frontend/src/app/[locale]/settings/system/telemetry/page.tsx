import React from 'react';
import { TelemetryClient } from './TelemetryClient';

export const metadata = {
  title: 'Telemetry & Logs | EAI Settings',
};

export default function TelemetryPage() {
  const hasDsn = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">Telemetry & Logs</h2>
        <p className="text-pretty">System health monitoring, error tracking, and performance metrics.</p>
      </div>

      <TelemetryClient hasDsn={hasDsn} />
    </>
  );
}
