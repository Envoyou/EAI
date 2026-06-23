import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';

import { SystemStatePage } from '@/components/SystemStatePage';
import { isOwnerUser } from '@eai/shared';

export const metadata: Metadata = {
  title: 'Scheduled Maintenance | EAI',
  description: 'EAI is temporarily paused while system maintenance is completed.',
};

export default async function MaintenancePage() {
  const { userId } = await auth();

  return (
    <SystemStatePage
      eyebrow="Scheduled maintenance"
      title="We are preparing the editorial workspace."
      description="AI processing, new checkout sessions, and CMS export are temporarily paused while we complete system maintenance. Please check back shortly."
      primaryAction={{ href: '/', label: 'Try workspace again' }}
      secondaryAction={{ href: '/support', label: 'Contact support' }}
      ownerAction={
        isOwnerUser(userId)
          ? {
              href: '/settings/system/feature-flags',
              label: 'System owner controls',
            }
          : undefined
      }
    />
  );
}
