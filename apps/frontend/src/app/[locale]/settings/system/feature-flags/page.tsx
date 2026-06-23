import React from 'react';
import { getAllFeatureFlags } from '@eai/shared';
import { FeatureFlagsClient } from './FeatureFlagsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feature Flags | EAI Settings',
};

export default async function FeatureFlagsPage() {
  const flags = await getAllFeatureFlags();

  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">Feature Flags</h2>
        <p className="text-pretty">Control production capabilities globally through Vercel Edge Config without redeploying.</p>
      </div>

      <FeatureFlagsClient initialFlags={flags} />
    </>
  );
}
