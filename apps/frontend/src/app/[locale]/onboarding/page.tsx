import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { OnboardingOrganizationGate } from '@/components/OnboardingOrganizationGate';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { getWorkspaceState, toClerkOrganizationContext } from '@/lib/user-workspace';

export default async function OnboardingPage() {
  const authContext = await auth();
  const { userId } = authContext;
  if (!userId) redirect('/login');

  if (!authContext.orgId) {
    return <OnboardingOrganizationGate />;
  }

  const workspace = await getWorkspaceState(userId, toClerkOrganizationContext(authContext));
  if (workspace && !workspace.needsOnboarding) redirect('/workspace');

  return <OnboardingWizard />;
}
