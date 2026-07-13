import React from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AdminLayoutShell } from '@/components/AdminLayoutShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const ownerUserIds = process.env.OWNER_USER_IDS || '';
  const isSuperAdmin = ownerUserIds.split(',').map(s => s.trim()).includes(userId);

  if (!isSuperAdmin) {
    redirect('/settings/general');
  }

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
