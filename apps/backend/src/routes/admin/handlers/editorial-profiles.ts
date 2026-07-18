import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { CORE_GUARDRAILS_VERSION, normalizeProfileConfig } from '@eai/shared/server';
import { createEditorialProfileVersion } from '@/lib/editorial-profile-server';
import { EditorialProfileConfigSchema } from '@eai/shared';
import { getAdminContext } from '../utils';

const router = Router();

// GET /api/admin/editorial-profile
router.get('/editorial-profile', requireAuth, async (req, res) => {
  try {
    const context = await getAdminContext(req);
    if ('error' in context) {
      return res.status(context.status || 500).json({ error: context.error });
    }

    const profile = await prisma.editorialProfile.findFirst({
      where: {
        organizationId: context.organization.id,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        isActive: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 20,
          select: {
            id: true,
            version: true,
            config: true,
            configHash: true,
            createdAt: true,
            _count: {
              select: { logs: true },
            },
          },
        },
      },
    });

    if (!profile || profile.versions.length === 0) {
      return res.status(404).json({ error: 'Publication settings not found' });
    }

    const latestConfig = normalizeProfileConfig(profile.versions[0].config);
    if (!latestConfig) {
      return res.status(500).json({ error: 'Latest publication settings are invalid' });
    }

    return res.json({
      organization: context.organization,
      profile: {
        id: profile.id,
        key: profile.key,
        name: profile.name,
        isActive: profile.isActive,
        latestVersion: profile.versions[0].version,
        config: latestConfig,
        versions: profile.versions.map((version) => ({
          id: version.id,
          version: version.version,
          configHash: version.configHash,
          createdAt: version.createdAt,
          analysisCount: version._count.logs,
        })),
      },
      coreGuardrailsVersion: CORE_GUARDRAILS_VERSION,
    });
  } catch (error) {
    console.error('[EDITORIAL_PROFILE_GET]', error);
    return res.status(500).json({ error: 'Failed to load publication settings' });
  }
});

// POST /api/admin/editorial-profile
router.post('/editorial-profile', requireAuth, async (req, res) => {
  try {
    const context = await getAdminContext(req);
    if ('error' in context) {
      return res.status(context.status || 500).json({ error: context.error });
    }

    const profile = await prisma.editorialProfile.findFirst({
      where: {
        organizationId: context.organization.id,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Publication settings not found' });
    }

    const parsed = EditorialProfileConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid publication settings',
        issues: parsed.error.flatten(),
      });
    }

    const version = await createEditorialProfileVersion(profile.id, {
      ...parsed.data,
      internalLinkBaseUrl: parsed.data.internalLinkBaseUrl || undefined,
      customInstructions: parsed.data.customInstructions || undefined,
    });

    return res.status(201).json({
      success: true,
      version: version.version,
      versionId: version.id,
      configHash: version.configHash,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Settings were saved elsewhere. Reload before saving again.' });
    }
    console.error('[EDITORIAL_PROFILE_POST]', error);
    return res.status(500).json({ error: 'Failed to save publication settings' });
  }
});

export default router;
