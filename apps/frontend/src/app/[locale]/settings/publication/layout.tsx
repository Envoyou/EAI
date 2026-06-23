import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { PublicationProvider } from '@/components/PublicationProvider';
import { getWorkspaceState, toClerkOrganizationContext } from '@/lib/user-workspace';

export default async function PublicationSettingsLayout({ children }: { children: React.ReactNode }) {
  const authContext = await auth();
  const { userId } = authContext;
  if (!userId) redirect('/login');

  const workspace = await getWorkspaceState(userId, toClerkOrganizationContext(authContext));
  if (!workspace || !workspace.isAdmin) {
    redirect('/settings/general');
  }

  return <PublicationProvider>{children}</PublicationProvider>;
}
