import React from 'react';
import { auth } from '@clerk/nextjs/server';
import { getWorkspaceState, toClerkOrganizationContext } from '@/lib/user-workspace';
import { getPlanCheckoutDisclosure, PLANS, type CheckoutDisclosure } from '@eai/shared';
import PricingGrid from '@/components/PricingGrid';
import { getAllFeatureFlags } from '@eai/shared/server';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const featureFlags = await getAllFeatureFlags();
  const billingEnabled = featureFlags.billing_checkout_enabled;
  const authContext = await auth();
  const { userId } = authContext;

  const workspace = userId
    ? await getWorkspaceState(userId, toClerkOrganizationContext(authContext))
    : null;

  const disclosures: Record<string, CheckoutDisclosure> = {};
  for (const planId of Object.keys(PLANS)) {
    disclosures[planId] = getPlanCheckoutDisclosure(PLANS[planId]) as CheckoutDisclosure;
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

      <PricingGrid
        workspace={workspace}
        disclosures={disclosures}
        billingEnabled={billingEnabled}
      />
    </div>
  );
}
