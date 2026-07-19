import React from 'react';
import { getAllFeatureFlags } from '@eai/shared/server';
import { FeatureFlagsClient } from './FeatureFlagsClient';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feature Flags | EAI Admin Console',
};

export default async function FeatureFlagsAdminPage() {
  const flags = await getAllFeatureFlags();

  return (
    <>
      <div className="settings-page-intro">
        <Badge variant="warning" size="xs" className="mb-2 uppercase tracking-wider">Internal Use Only</Badge>
        <h2 className="text-balance">Feature Flags</h2>
        <p className="text-pretty">Control production capabilities globally through Vercel Edge Config without redeploying.</p>
      </div>

      <FeatureFlagsClient initialFlags={flags} />
    </>
  );
}
