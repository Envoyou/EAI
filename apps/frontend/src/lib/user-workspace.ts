import { auth } from '@clerk/nextjs/server';
import { getApiUrl } from '@/lib/api-url';

export type ClerkOrganizationContext = {
  clerkOrganizationId?: string | null;
  clerkOrganizationSlug?: string | null;
  clerkOrganizationRole?: string | null;
};

export const toClerkOrganizationContext = (authContext: {
  orgId?: string | null;
  orgSlug?: string | null;
  orgRole?: string | null;
}): ClerkOrganizationContext => ({
  clerkOrganizationId: authContext.orgId,
  clerkOrganizationSlug: authContext.orgSlug,
  clerkOrganizationRole: authContext.orgRole,
});

export const isOrganizationAdmin = (
  context: ClerkOrganizationContext,
  fallbackUserRole?: string | null
) => {
  if (context.clerkOrganizationId) {
    return context.clerkOrganizationRole === 'org:admin';
  }

  return fallbackUserRole === 'admin';
};

export const getWorkspaceState = async (
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: ClerkOrganizationContext = {}
) => {
  try {
    const authObj = await auth();
    const token = await authObj.getToken();

    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/api/workspace/state`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      next: { revalidate: 0 }, // no-store caching so it's always fresh
    });

    if (!res.ok) {
      console.error('Failed to fetch workspace state from backend:', res.statusText);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('Error fetching workspace state:', error);
    return null;
  }
};
