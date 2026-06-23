import type { Metadata } from 'next';

import { SystemStatePage } from '@/components/SystemStatePage';

export const metadata: Metadata = {
  title: 'Feature Unavailable | EAI',
};

export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  const isSignup = feature === 'signup';

  return (
    <SystemStatePage
      eyebrow="Limited availability"
      icon="restricted"
      title={isSignup ? 'New account registration is temporarily closed.' : 'Plans and pricing are temporarily unavailable.'}
      description={
        isSignup
          ? 'Existing users can continue to sign in and use their editorial workspace. Public registration will reopen when the next access window is available.'
          : 'The editorial workspace remains available to existing users. Plan comparison and new checkout sessions will return shortly.'
      }
      primaryAction={{ href: '/login', label: 'Sign in to EAI' }}
      secondaryAction={{ href: '/support', label: 'Contact support' }}
    />
  );
}
