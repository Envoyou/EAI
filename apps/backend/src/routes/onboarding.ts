import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { CREDENTIAL_KEY_VERSION, decryptCredentials, encryptCredentials } from '@/lib/credential-vault';
import { createEaiRestAdapter } from '@/lib/cms-adapter';
import { hashEditorialConfiguration } from '@eai/shared';
import {
  buildSandboxEditorialProfile,
  DEFAULT_ONBOARDING_DATA,
  OnboardingDataSchema,
  OnboardingSaveSchema,
  CmsConnectionTestSchema,
} from '@eai/shared';
import { ensureCurrentUserRecord, getWorkspaceState } from '@/lib/user-workspace';
import { createClerkClient } from '@clerk/backend';

const router = Router();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const buildOnboardingDataFromWorkspace = (
  workspace: Awaited<ReturnType<typeof getWorkspaceState>>
) => {
  const organization = workspace?.organization;
  const publicationName = organization?.publicationName || organization?.name || '';

  return {
    ...DEFAULT_ONBOARDING_DATA,
    organization: {
      name: organization?.name || '',
      slug: organization?.slug || '',
      domain: organization?.domain || '',
      publicationName,
    },
    editorialProfile: {
      ...DEFAULT_ONBOARDING_DATA.editorialProfile,
      brandName: publicationName,
    },
  };
};

const cannotConfigureClerkOrganization = (
  workspace: Awaited<ReturnType<typeof getWorkspaceState>>
) => Boolean(workspace?.organization?.clerkOrganizationId && !workspace.isAdmin);

const hasActiveClerkOrganization = (
  workspace: Awaited<ReturnType<typeof getWorkspaceState>>,
  clerkOrganizationId?: string | null
) => Boolean(
  clerkOrganizationId &&
  workspace?.organizationId &&
  workspace.organization?.clerkOrganizationId === clerkOrganizationId
);

// GET /api/onboarding
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const user = await ensureCurrentUserRecord(userId);
    if (!user) {
      return res.status(500).json({ error: 'Unable to sync user account' });
    }

    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!hasActiveClerkOrganization(workspace, orgId)) {
      return res.status(409).json({ error: 'Create or select a Clerk organization before starting onboarding.' });
    }
    const activeOrganizationId = workspace!.organizationId!;
    const activeOrganization = workspace!.organization!;
    if (cannotConfigureClerkOrganization(workspace)) {
      return res.status(403).json({ error: 'Only organization admins can configure this workspace.' });
    }
    if (!workspace?.needsOnboarding) {
      return res.json({
        completed: true,
        organization: workspace?.organization,
      });
    }

    const draft = await prisma.onboardingDraft.findUnique({
      where: { userId },
    });
    const activeDraft = draft?.organizationId === activeOrganizationId ? draft : null;
    return res.json({
      completed: false,
      step: activeDraft?.step || 'organization',
      organization: activeOrganization,
      data: activeDraft?.data || buildOnboardingDataFromWorkspace(workspace),
      hasStoredCredential: Boolean(activeDraft?.encryptedCredentials),
    });
  } catch (error: any) {
    console.error('[ONBOARDING_GET]', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// PUT /api/onboarding
router.put('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    await ensureCurrentUserRecord(userId);
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!hasActiveClerkOrganization(workspace, orgId)) {
      return res.status(409).json({ error: 'Create or select a Clerk organization before starting onboarding.' });
    }
    const activeOrganizationId = workspace!.organizationId!;
    const activeOrganization = workspace!.organization!;
    if (cannotConfigureClerkOrganization(workspace)) {
      return res.status(403).json({ error: 'Only organization admins can configure this workspace.' });
    }
    if (workspace && !workspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace is already active.' });
    }

    const parsed = OnboardingSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[ONBOARDING_PUT_VALIDATION_ERROR] Detailed issues:', JSON.stringify(parsed.error.issues, null, 2));
      return res.status(400).json({ error: 'Invalid onboarding draft', issues: parsed.error.issues });
    }

    const existingDraft = await prisma.onboardingDraft.findUnique({
      where: { userId },
      select: { organizationId: true },
    });
    const switchedOrganization = existingDraft?.organizationId !== activeOrganizationId;
    const credentialPatch = parsed.data.cmsSecret
      ? {
          encryptedCredentials: encryptCredentials({ secret: parsed.data.cmsSecret }),
          credentialKeyVersion: CREDENTIAL_KEY_VERSION,
        }
      : switchedOrganization
        ? {
            encryptedCredentials: null,
            credentialKeyVersion: null,
          }
        : {};
    const canonicalData = {
      ...parsed.data.data,
      organization: {
        ...parsed.data.data.organization,
        name: activeOrganization.name,
        slug: activeOrganization.slug,
      },
    };

    await prisma.onboardingDraft.upsert({
      where: { userId },
      update: {
        organizationId: activeOrganizationId,
        step: parsed.data.step,
        data: canonicalData,
        ...credentialPatch,
      },
      create: {
        userId,
        organizationId: activeOrganizationId,
        step: parsed.data.step,
        data: canonicalData,
        ...credentialPatch,
      },
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[ONBOARDING_PUT]', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// POST /api/onboarding
router.post('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!hasActiveClerkOrganization(workspace, orgId)) {
      return res.status(409).json({ error: 'Create or select a Clerk organization before starting onboarding.' });
    }
    if (cannotConfigureClerkOrganization(workspace)) {
      return res.status(403).json({ error: 'Only organization admins can configure this workspace.' });
    }
    if (workspace && !workspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace is already active.' });
    }

    const body = req.body || {};

    if (body.skip) {
      const publicationName =
        workspace?.organization?.publicationName ||
        workspace?.organization?.name ||
        'Publication';
      const sandboxProfileConfig = buildSandboxEditorialProfile(publicationName);

      try {
        const activated = await prisma.$transaction(async (tx) => {
          const organization = await tx.organization.update({
            where: { id: workspace!.organizationId! },
            data: {
              publicationName,
              isActive: true,
              onboardingStatus: 'completed',
              activatedAt: new Date(),
            },
          });
          const profile = await tx.editorialProfile.upsert({
            where: {
              organizationId_key: {
                organizationId: organization.id,
                key: organization.slug,
              },
            },
            update: {
              name: `${publicationName} Default`,
              isActive: true,
            },
            create: {
              organizationId: organization.id,
              key: organization.slug,
              name: `${publicationName} Default`,
              isActive: true,
            },
          });
          const latestVersion = await tx.editorialProfileVersion.findFirst({
            where: { profileId: profile.id },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const nextVersion = (latestVersion?.version || 0) + 1;
          const configHash = hashEditorialConfiguration(
            profile.key,
            nextVersion,
            sandboxProfileConfig
          );
          const version = await tx.editorialProfileVersion.create({
            data: {
              profileId: profile.id,
              version: nextVersion,
              config: sandboxProfileConfig,
              configHash,
            },
          });

          await tx.user.update({
            where: { id: userId },
            data: {
              organizationId: organization.id,
              role: 'admin',
            },
          });

          await tx.onboardingDraft.deleteMany({ where: { userId } });

          return {
            organization,
            profileVersionId: version.id,
          };
        });

        return res.json({ success: true, ...activated });
      } catch (error) {
        console.error('[ONBOARDING_SKIP]', error);
        return res.status(500).json({ error: 'Failed to skip onboarding' });
      }
    }

    const draft = await prisma.onboardingDraft.findUnique({
      where: { userId },
    });
    if (!draft) {
      return res.status(404).json({ error: 'Onboarding draft not found' });
    }
    if (draft.organizationId !== workspace?.organizationId) {
      return res.status(409).json({ error: 'This onboarding draft belongs to a different organization.' });
    }

    const parsed = OnboardingDataSchema.safeParse(draft.data);
    if (!parsed.success) {
      console.error('[ONBOARDING_POST_VALIDATION_ERROR] Detailed issues:', JSON.stringify(parsed.error.issues, null, 2));
      return res.status(400).json({ error: 'Onboarding data is incomplete', issues: parsed.error.issues });
    }
    const { organization, editorialProfile, cms } = parsed.data;
    if (cms.adapterKey !== 'none' && (!cms.verified || !draft.encryptedCredentials)) {
      return res.status(400).json({ error: 'CMS connection must be verified before activation.' });
    }
    if (cms.adapterKey !== 'none') {
      try {
        const credentials = decryptCredentials(draft.encryptedCredentials as string);
        const adapter = createEaiRestAdapter({
          key: cms.adapterKey,
          displayName: cms.name,
          baseUrl: cms.baseUrl,
          secret: credentials.secret || '',
        });
        await adapter.listPublishedPosts(1);
      } catch (error: any) {
        return res.status(502).json({
          error: error instanceof Error ? `CMS verification failed during activation: ${error.message}` : 'CMS verification failed during activation.',
        });
      }
    }

    try {
      const activated = await prisma.$transaction(async (tx) => {
        const activatedOrganization = await tx.organization.update({
          where: { id: workspace!.organizationId! },
          data: {
            publicationName: organization.publicationName,
            domain: organization.domain || null,
            onboardingStatus: 'completed',
            activatedAt: new Date(),
          },
        });
        const profile = await tx.editorialProfile.upsert({
          where: {
            organizationId_key: {
              organizationId: activatedOrganization.id,
              key: activatedOrganization.slug,
            },
          },
          update: {
            name: `${organization.publicationName} Default`,
            isActive: true,
          },
          create: {
            organizationId: activatedOrganization.id,
            key: activatedOrganization.slug,
            name: `${organization.publicationName} Default`,
            isActive: true,
          },
        });
        const latestVersion = await tx.editorialProfileVersion.findFirst({
          where: { profileId: profile.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const nextVersion = (latestVersion?.version ?? 0) + 1;
        const configHash = hashEditorialConfiguration(profile.key, nextVersion, editorialProfile);
        const version = await tx.editorialProfileVersion.create({
          data: {
            profileId: profile.id,
            version: nextVersion,
            config: editorialProfile,
            configHash,
          },
        });

        if (cms.adapterKey !== 'none') {
          await tx.cmsConnection.create({
            data: {
              organizationId: activatedOrganization.id,
              adapterKey: cms.adapterKey,
              name: cms.name,
              baseUrl: cms.baseUrl,
              encryptedCredentials: draft.encryptedCredentials,
              credentialKeyVersion: draft.credentialKeyVersion,
              status: 'verified',
              lastVerifiedAt: new Date(),
            },
          });
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            organizationId: activatedOrganization.id,
            role: 'admin',
          },
        });
        await tx.onboardingDraft.delete({ where: { userId } });

        return {
          organization: activatedOrganization,
          profileVersionId: version.id,
        };
      });

      return res.json({ success: true, ...activated });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Organization slug is already in use.' });
      }
      console.error('[ONBOARDING_ACTIVATE]', error);
      return res.status(500).json({ error: 'Failed to activate workspace' });
    }
  } catch (error) {
    console.error('[ONBOARDING_POST]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/onboarding/test-cms
router.post('/test-cms', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (
      !orgId ||
      !workspace?.organizationId ||
      workspace.organization?.clerkOrganizationId !== orgId
    ) {
      return res.status(409).json({
        error: 'Create or select a Clerk organization before configuring a CMS connection.',
      });
    }
    if (workspace?.organization?.clerkOrganizationId && !workspace.isAdmin) {
      return res.status(403).json({ error: 'Only organization admins can configure CMS connections.' });
    }
    if (workspace && !workspace.needsOnboarding) {
      return res.status(409).json({ error: 'Workspace is already active.' });
    }

    const parsed = CmsConnectionTestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid CMS connection details', issues: parsed.error.flatten() });
    }

    try {
      const adapter = createEaiRestAdapter({
        key: parsed.data.adapterKey,
        displayName: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
        secret: parsed.data.secret,
      });
      const posts = await adapter.listPublishedPosts(3);
      return res.json({
        success: true,
        adapterKey: adapter.key,
        samplePosts: posts,
      });
    } catch (error: any) {
      return res.status(502).json({ error: error.message || 'CMS connection failed.' });
    }
  } catch (error) {
    console.error('[ONBOARDING_TEST_CMS]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
