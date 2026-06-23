import { Router, Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import {
  adjustOrganizationCredits,
  getBillingAdminActor,
  getBillingOrganizationDetail,
  searchBillingOrganizations,
} from '@/lib/admin-billing';
import { getZohoDeskTicket, isZohoDeskEnabled } from '@/lib/zoho-desk';
import { CORE_GUARDRAILS_VERSION, normalizeProfileConfig } from '@eai/shared/server';
import { createEditorialProfileVersion } from '@/lib/editorial-profile-server';
import { EditorialProfileConfigSchema } from '@eai/shared';
import { getWorkspaceState } from '@/lib/user-workspace';

const router = Router();

const AdjustmentSchema = z.object({
  organizationId: z.string().min(1).max(100),
  direction: z.enum(['add', 'deduct']),
  amount: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(5).max(500),
  ticketReference: z.string().trim().min(2).max(100),
  idempotencyKey: z.string().trim().min(8).max(150)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid idempotency key'),
  confirmed: z.literal(true),
});

const getActor = async (userId: string) => {
  const actor = await getBillingAdminActor(userId);
  if (!actor) {
    return null;
  }
  return actor;
};

const getAdminContext = async (req: Request) => {
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

// GET /api/admin/billing
router.get('/billing', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const organizationId = (req.query.organizationId as string)?.trim();
    if (organizationId) {
      const organization = await getBillingOrganizationDetail(organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Active organization not found' });
      }
      return res.json({ organization });
    }

    const query = (req.query.q as string)?.trim() || '';
    const organizations = query.length >= 2
      ? await searchBillingOrganizations(query)
      : [];

    return res.json({
      actor,
      organizations,
    });
  } catch (error) {
    console.error('[ADMIN_BILLING_GET]', error);
    return res.status(500).json({ error: 'Failed to load billing administration data' });
  }
});

// POST /api/admin/billing
router.post('/billing', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const parsed = AdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid credit adjustment',
        issues: parsed.error.flatten(),
      });
    }

    const zohoTicket = isZohoDeskEnabled()
      ? await getZohoDeskTicket(parsed.data.ticketReference)
      : null;
    const result = await adjustOrganizationCredits(actor, {
      ...parsed.data,
      ticketReference: zohoTicket?.ticketNumber || parsed.data.ticketReference,
      externalTicketId: zohoTicket?.id,
      externalTicketUrl: zohoTicket?.url,
    });
    const organization = await getBillingOrganizationDetail(result.organizationId);

    return res.json({
      success: true,
      duplicate: result.duplicate,
      balance: result.balance,
      organization,
      ticket: zohoTicket,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'This adjustment has already been processed.' });
      }
      if (error.code === 'P2034') {
        return res.status(409).json({ error: 'The balance changed during the adjustment. Review it and retry.' });
      }
    }

    const message = error instanceof Error ? error.message : 'Failed to adjust credits';
    const isExpected = /not found|cannot deduct|changed during/i.test(message);
    console.error('[ADMIN_BILLING_POST]', error);
    return res.status(isExpected ? 409 : 500).json({ error: message });
  }
});

// GET /api/admin/billing/ticket
router.get('/billing/ticket', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }
    if (!isZohoDeskEnabled()) {
      return res.status(503).json({ error: 'Zoho Desk integration is disabled' });
    }

    const reference = (req.query.reference as string)?.trim() || '';
    if (!reference) {
      return res.status(400).json({ error: 'Ticket reference is required' });
    }

    const ticket = await getZohoDeskTicket(reference);
    return res.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify Zoho Desk ticket';
    const status = /not found/i.test(message) ? 404 : /configuration|oauth|disabled/i.test(message) ? 503 : 502;
    console.error('[ADMIN_BILLING_TICKET_GET]', error);
    return res.status(status).json({ error: message });
  }
});

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
