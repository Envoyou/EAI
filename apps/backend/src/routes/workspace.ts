import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { DEFAULT_ARTICLE_TYPES } from '@eai/shared/server';
import { resolveEditorialProfileForUser, createEditorialProfileVersion } from '@/lib/editorial-profile-server';
import { getWorkspaceState } from '@/lib/user-workspace';

const router = Router();

// GET /api/workspace/state
router.get('/state', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const state = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    return res.json(state);
  } catch (error: unknown) {
    console.error('[WORKSPACE_STATE_GET]', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
});

// GET /api/workspace/config
router.get('/config', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const profile = await resolveEditorialProfileForUser(userId, workspace.organizationId);
    const cmsConnection = workspace.organizationId
      ? await prisma.cmsConnection.findFirst({
          where: {
            organizationId: workspace.organizationId,
            isActive: true,
            status: 'verified',
          },
          select: { id: true },
        })
      : null;

    return res.json({
      organization: workspace.organization,
      plan: workspace.plan,
      isAdmin: workspace.isAdmin,
      capabilities: {
        cmsExport: profile.profileKey === 'envoyou' || Boolean(cmsConnection),
      },
      editorial: {
        profileKey: profile.profileKey,
        brandName: profile.config.brandName,
        categories: profile.config.categories,
        articleTypes:
          profile.config.articleTypes?.length
            ? profile.config.articleTypes
            : DEFAULT_ARTICLE_TYPES,
        audience: profile.config.audience,
        sourcePolicy: profile.config.sourcePolicy,
      },
    });
  } catch (error) {
    console.error('[WORKSPACE_CONFIG_GET]', error);
    return res.status(500).json({ error: 'Active editorial profile could not be resolved.' });
  }
});

// PUT /api/workspace/config
router.put('/config', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding) {
      return res.status(404).json({ error: 'Active workspace not found or onboarding required' });
    }

    const { category, articleType } = req.body;
    const profile = await resolveEditorialProfileForUser(userId, workspace.organizationId);
    const currentConfig = profile.config;

    let updated = false;
    const categories = [...currentConfig.categories];
    const articleTypes = [...(currentConfig.articleTypes || [])];

    if (category && typeof category === 'string' && category.trim()) {
      const trimmedCategory = category.trim();
      if (!categories.includes(trimmedCategory)) {
        categories.push(trimmedCategory);
        updated = true;
      }
    }

    if (articleType && typeof articleType === 'string' && articleType.trim()) {
      const trimmedType = articleType.trim();
      if (!articleTypes.includes(trimmedType)) {
        articleTypes.push(trimmedType);
        updated = true;
      }
    }

    if (updated) {
      const updatedConfig = {
        ...currentConfig,
        categories,
        articleTypes,
      };

      const dbProfile = await prisma.editorialProfile.findFirst({
        where: {
          organizationId: workspace.organizationId!,
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (!dbProfile) {
        return res.status(404).json({ error: 'Editorial profile record not found' });
      }

      await createEditorialProfileVersion(dbProfile.id, updatedConfig);
    }

    return res.json({
      success: true,
      categories,
      articleTypes: articleTypes.length ? articleTypes : DEFAULT_ARTICLE_TYPES,
    });
  } catch (error) {
    console.error('[WORKSPACE_CONFIG_PUT]', error);
    return res.status(500).json({ error: 'Failed to update workspace configuration' });
  }
});

// PUT /api/workspace/billing-details
router.put('/billing-details', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    if (!workspace.organizationId) {
      return res.status(400).json({ error: 'Billing details can only be managed for organization workspaces.' });
    }

    if (!workspace.isAdmin) {
      return res.status(403).json({ error: 'Only workspace administrators can edit billing details.' });
    }

    const { name, npwp, billingAddress } = req.body;

    const updatedOrg = await prisma.organization.update({
      where: { id: workspace.organizationId },
      data: {
        name: typeof name === 'string' ? name.trim() : undefined,
        npwp: typeof npwp === 'string' ? npwp.trim() || null : undefined,
        billingAddress: typeof billingAddress === 'string' ? billingAddress.trim() || null : undefined,
      },
      select: {
        id: true,
        name: true,
        npwp: true,
        billingAddress: true,
      },
    });

    return res.json({ success: true, organization: updatedOrg });
  } catch (error) {
    console.error('[WORKSPACE_BILLING_DETAILS_PUT]', error);
    return res.status(500).json({ error: 'Failed to update organization billing details.' });
  }
});

export default router;
