import React, { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { getWorkspaceState, toClerkOrganizationContext } from '@/lib/user-workspace';
import {
  getPlanCheckoutDisclosureWithRate,
  PLANS,
  type CheckoutDisclosure,
} from '@eai/shared';
import PricingGrid from '@/components/PricingGrid';
import { getAllFeatureFlags } from '@eai/shared/server';
import { getApiUrl } from '@/lib/api-url';
import { fetchWithTimeout } from '@/lib/fetch-utils';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const featureFlags = await getAllFeatureFlags();
  const billingEnabled = featureFlags.billing_checkout_enabled;
  const authContext = await auth();
  const { userId } = authContext;

  const workspace = userId
    ? await getWorkspaceState(userId, toClerkOrganizationContext(authContext))
    : null;

  // Sync real-time rate from backend container to avoid cold-start race conditions in serverless frontend
  let activeRate = 18000;
  try {
    const apiUrl = getApiUrl();
    const res = await fetchWithTimeout(`${apiUrl}/api/payments/rate`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.rate === 'number' && data.rate > 0) {
        activeRate = data.rate;
      }
    }
  } catch (error) {
    console.error('Failed to sync rate from backend:', error);
  }

  const disclosures: Record<string, CheckoutDisclosure> = {};
  for (const planId of Object.keys(PLANS)) {
    disclosures[planId] = getPlanCheckoutDisclosureWithRate(PLANS[planId], activeRate);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight sm:text-4xl">
          Upgrade Your Workspace
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Choose a plan that fits your editorial workflow. Upgrade, downgrade, or buy credit top-ups at any time.
        </p>
      </div>

      <Suspense fallback={<div className="h-96 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />}>
        <PricingGrid
          workspace={workspace}
          disclosures={disclosures}
          billingEnabled={billingEnabled}
        />
      </Suspense>
    </div>
  );
}
