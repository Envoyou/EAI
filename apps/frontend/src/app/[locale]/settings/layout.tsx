import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getWorkspaceState, toClerkOrganizationContext } from '@/lib/user-workspace';
import { SettingsProvider } from '@/components/SettingsProvider';
import { SettingsActionProvider } from '@/components/SettingsActionProvider';
import { SettingsLayoutShell } from '@/components/SettingsLayoutShell';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const authContext = await auth();
  const { userId } = authContext;
  if (!userId) redirect('/login');

  const workspace = await getWorkspaceState(userId, toClerkOrganizationContext(authContext));
  if (!workspace || workspace.needsOnboarding) redirect('/onboarding');

  const ownerUserIds = process.env.OWNER_USER_IDS || '';
  const isSuperAdmin = ownerUserIds.split(',').map(s => s.trim()).includes(userId);

  return (
    <SettingsActionProvider>
      <SettingsProvider>
        <SettingsLayoutShell isAdmin={workspace.isAdmin} isSuperAdmin={isSuperAdmin}>
          {children}
        </SettingsLayoutShell>
      </SettingsProvider>
    </SettingsActionProvider>
  );
}
