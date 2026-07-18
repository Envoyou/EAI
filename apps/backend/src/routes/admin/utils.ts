import { Request } from 'express';
import { getBillingAdminActor } from '@/lib/admin-billing';
import { getWorkspaceState } from '@/lib/user-workspace';

export const getActor = async (userId: string) => {
  const actor = await getBillingAdminActor(userId);
  if (!actor) {
    return null;
  }
  return actor;
};

export const getAdminContext = async (req: Request) => {
  const { userId, orgId, orgSlug, orgRole } = req.auth!;
  if (!userId) return { error: 'Unauthorized', status: 401 } as const;

  const workspace = await getWorkspaceState(userId, {
    clerkOrganizationId: orgId,
    clerkOrganizationSlug: orgSlug,
    clerkOrganizationRole: orgRole,
  });

  if (!workspace?.organization?.isActive) {
    return { error: 'Active organization not found', status: 404 } as const;
  }
  if (!workspace.isAdmin) {
    return { error: 'Admin access required', status: 403 } as const;
  }

  return {
    userId,
    organization: workspace.organization,
  } as const;
};
