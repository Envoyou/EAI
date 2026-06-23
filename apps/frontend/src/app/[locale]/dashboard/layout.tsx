import React from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardProvider } from '@/components/DashboardProvider';
import { DashboardLayoutShell } from '@/components/DashboardLayoutShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authContext = await auth();
  const { userId } = authContext;
  if (!userId) redirect('/login');

  const ownerUserIds = process.env.OWNER_USER_IDS || '';
  const isSuperAdmin = ownerUserIds.split(',').map(s => s.trim()).includes(userId);

  return (
    <DashboardProvider>
      <DashboardLayoutShell isSuperAdmin={isSuperAdmin}>
        {children}
      </DashboardLayoutShell>
    </DashboardProvider>
  );
}
