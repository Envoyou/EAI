import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SystemSettingsLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const ownerUserIds = process.env.OWNER_USER_IDS || '';
  const isSuperAdmin = ownerUserIds.split(',').map(s => s.trim()).includes(userId);

  if (!isSuperAdmin) {
    redirect('/settings/general');
  }

  return <>{children}</>;
}
