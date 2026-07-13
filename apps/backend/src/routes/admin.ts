import { Router, Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { createClerkClient } from '@clerk/backend';
import { sendEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { redisConnection } from '@/lib/queue';
import {
  adjustOrganizationCredits,
  adjustPersonalCredits,
  getBillingAdminActor,
  getBillingOrganizationDetail,
  overrideOrganizationSubscription,
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
    
    await logAuditEvent({
      action: 'credit.adjust',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: result.organizationId,
      targetType: 'Tenant',
      description: `Adjusted credits for organization: ${parsed.data.direction === 'add' ? '+' : '-'}${parsed.data.amount} credits. Reason: ${parsed.data.reason}`,
      details: {
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        ticketReference: parsed.data.ticketReference,
      },
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

const OverridePlanSchema = z.object({
  organizationId: z.string().min(1).max(100),
  plan: z.string().min(1).max(50),
  durationDays: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(5).max(500),
  ticketReference: z.string().trim().min(2).max(100),
});

// POST /api/admin/billing/override-plan
router.post('/billing/override-plan', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const parsed = OverridePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid plan override request',
        issues: parsed.error.flatten(),
      });
    }

    const zohoTicket = isZohoDeskEnabled()
      ? await getZohoDeskTicket(parsed.data.ticketReference)
      : null;

    const subscription = await overrideOrganizationSubscription(actor, {
      ...parsed.data,
      ticketReference: zohoTicket?.ticketNumber || parsed.data.ticketReference,
      externalTicketId: zohoTicket?.id,
      externalTicketUrl: zohoTicket?.url,
    });

    await logAuditEvent({
      action: 'tenant.subscription.override',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: parsed.data.organizationId,
      targetType: 'Tenant',
      description: `Overrode organization subscription plan to: ${parsed.data.plan} for ${parsed.data.durationDays} days. Reason: ${parsed.data.reason}`,
      details: {
        plan: parsed.data.plan,
        durationDays: parsed.data.durationDays,
        reason: parsed.data.reason,
      },
    });

    const organization = await getBillingOrganizationDetail(parsed.data.organizationId);

    return res.json({
      success: true,
      subscription,
      organization,
      ticket: zohoTicket,
    });
  } catch (error) {
    console.error('[ADMIN_BILLING_OVERRIDE_PLAN]', error);
    const message = error instanceof Error ? error.message : 'Failed to override plan';
    return res.status(500).json({ error: message });
  }
});

// GET /api/admin/users
router.get('/users', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const page = Math.max(1, parseInt(req.query.page as string || '1'));
    const limit = Math.max(1, parseInt(req.query.limit as string || '10'));
    const search = (req.query.search as string || '').trim();
    const planFilter = (req.query.plan as string || '').trim();
    const statusFilter = (req.query.status as string || '').trim();
    const sortBy = (req.query.sortBy as string || 'createdAt');
    const sortOrder = (req.query.sortOrder as string || 'desc') as 'asc' | 'desc';

    // 1. Build Prisma 'where' clause
    const where: Prisma.UserWhereInput = {};

    // Search filter: Name, Email, or Organization ID / slug / name
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        {
          organization: {
            OR: [
              { id: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } }
            ]
          }
        }
      ];
    }

    // Status filter: active, onboarding, pending
    if (statusFilter) {
      if (statusFilter === 'active') {
        where.organization = { isNot: null };
      } else if (statusFilter === 'onboarding') {
        where.organization = null;
        where.onboardingDraft = { isNot: null };
      } else if (statusFilter === 'pending') {
        where.organization = null;
        where.onboardingDraft = null;
      }
    }

    // Plan filter: Free, Starter, Pro, Team
    if (planFilter) {
      const now = new Date();
      if (planFilter.toLowerCase() === 'free') {
        where.AND = [
          {
            subscriptions: {
              none: {
                status: { in: ['active', 'cancels_at_period_end'] },
                currentPeriodEnd: { gt: now }
              }
            }
          },
          {
            OR: [
              { organizationId: null },
              {
                organization: {
                  subscriptions: {
                    none: {
                      status: { in: ['active', 'cancels_at_period_end'] },
                      currentPeriodEnd: { gt: now }
                    }
                  }
                }
              }
            ]
          }
        ];
      } else {
        where.OR = [
          {
            subscriptions: {
              some: {
                plan: { equals: planFilter, mode: 'insensitive' },
                status: { in: ['active', 'cancels_at_period_end'] },
                currentPeriodEnd: { gt: now }
              }
            }
          },
          {
            organization: {
              subscriptions: {
                some: {
                  plan: { equals: planFilter, mode: 'insensitive' },
                  status: { in: ['active', 'cancels_at_period_end'] },
                  currentPeriodEnd: { gt: now }
                }
              }
            }
          }
        ];
      }
    }

    // Build orderBy
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'name') {
      orderBy = { name: sortOrder };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    } else if (sortBy === 'analysesCount') {
      orderBy = { logs: { _count: sortOrder } };
    }

    // Get total count of matching users
    const totalCount = await prisma.user.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

    // Query users
    const users = await prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastSignInAt: true,
        imageUrl: true,
        trialUsed: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        },
        onboardingDraft: {
          select: {
            step: true,
          }
        },
        _count: {
          select: {
            logs: true,
          }
        }
      }
    });

    const userIds = users.map((u) => u.id);
    const orgIds = users.map((u) => u.organization?.id).filter(Boolean) as string[];

    // 1. Get active subscriptions in bulk
    const activeSubs = await prisma.subscription.findMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { organizationId: { in: orgIds } }
        ],
        status: { in: ['active', 'cancels_at_period_end'] },
        currentPeriodEnd: { gt: new Date() },
      }
    });

    // 2. Sum transactions grouped by User and Org
    const txGroupByUser = await prisma.creditTransaction.groupBy({
      by: ['userId', 'bucket'],
      where: { userId: { in: userIds } },
      _sum: { amount: true }
    });

    const txGroupByOrg = orgIds.length > 0 ? await prisma.creditTransaction.groupBy({
      by: ['organizationId', 'bucket'],
      where: { organizationId: { in: orgIds } },
      _sum: { amount: true }
    }) : [];

    // 3. Get banned status from Clerk in bulk
    const bannedMap: Record<string, boolean> = {};
    if (userIds.length > 0) {
      try {
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const clerkUsers = await clerk.users.getUserList({
          userId: userIds,
          limit: 100,
        });
        for (const cu of clerkUsers.data) {
          bannedMap[cu.id] = cu.banned;
        }
      } catch (err) {
        console.error('[ADMIN_USERS_GET] Failed to fetch banned status from Clerk:', err);
      }
    }

    // 4. Map to enrich user objects
    const enrichedUsers = users.map((user) => {
      const orgId = user.organization?.id;
      
      const activeSub = activeSubs.find((s) => 
        orgId ? s.organizationId === orgId : s.userId === user.id
      );

      const txs = orgId
        ? txGroupByOrg.filter((t) => t.organizationId === orgId)
        : txGroupByUser.filter((t) => t.userId === user.id);

      const trialSum = txs.find((t) => t.bucket === 'trial')?._sum.amount ?? 0;
      const addonSum = txs.find((t) => t.bucket === 'addon')?._sum.amount ?? 0;
      const subSum = txs.find((t) => t.bucket === 'subscription')?._sum.amount ?? 0;

      const credits = Math.max(0, trialSum + addonSum + (activeSub ? subSum : 0));
      const plan = activeSub ? activeSub.plan : 'Free';

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
        imageUrl: user.imageUrl,
        trialUsed: user.trialUsed,
        organization: user.organization,
        onboardingDraft: user.onboardingDraft,
        plan,
        credits,
        analysesCount: user._count?.logs ?? 0,
        isBanned: bannedMap[user.id] ?? false,
      };
    });

    return res.json({
      users: enrichedUsers,
      pagination: {
        totalCount,
        totalPages,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('[ADMIN_USERS_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
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

// POST /api/admin/users/:id/adjust-credits
router.post('/users/:id/adjust-credits', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const targetUserId = req.params.id;
    const parsed = z.object({
      direction: z.enum(['add', 'deduct']),
      amount: z.number().int().min(1).max(1_000_000),
      reason: z.string().trim().min(5).max(500),
      ticketReference: z.string().trim().min(2).max(100),
      idempotencyKey: z.string().trim().min(8).max(150),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid credit adjustment inputs',
        issues: parsed.error.flatten(),
      });
    }

    const user = await prisma.user.findFirst({
      where: { id: targetUserId },
      select: { id: true, organizationId: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const zohoTicket = isZohoDeskEnabled()
      ? await getZohoDeskTicket(parsed.data.ticketReference)
      : null;

    const ticketInfo = {
      ticketReference: zohoTicket?.ticketNumber || parsed.data.ticketReference,
      externalTicketId: zohoTicket?.id,
      externalTicketUrl: zohoTicket?.url,
    };

    if (user.organizationId) {
      // Adjust organization credits
      const result = await adjustOrganizationCredits(actor, {
        organizationId: user.organizationId,
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        idempotencyKey: parsed.data.idempotencyKey,
        ...ticketInfo,
      });
      
      await logAuditEvent({
        action: 'credit.adjust',
        actorId: actor.userId,
        actorEmail: actor.email,
        targetId: user.organizationId,
        targetType: 'Tenant',
        description: `Adjusted organization credits via user: ${parsed.data.direction === 'add' ? '+' : '-'}${parsed.data.amount} credits. Reason: ${parsed.data.reason}`,
        details: {
          userId: targetUserId,
          direction: parsed.data.direction,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
        },
      });

      return res.json({
        success: true,
        type: 'organization',
        organizationId: user.organizationId,
        duplicate: result.duplicate,
        balance: result.balance,
        ticket: zohoTicket,
      });
    } else {
      // Adjust personal credits
      const result = await adjustPersonalCredits(actor, targetUserId, {
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        idempotencyKey: parsed.data.idempotencyKey,
        ...ticketInfo,
      });

      await logAuditEvent({
        action: 'credit.adjust',
        actorId: actor.userId,
        actorEmail: actor.email,
        targetId: targetUserId,
        targetType: 'User',
        description: `Adjusted personal credits: ${parsed.data.direction === 'add' ? '+' : '-'}${parsed.data.amount} credits. Reason: ${parsed.data.reason}`,
        details: {
          direction: parsed.data.direction,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
        },
      });

      return res.json({
        success: true,
        type: 'personal',
        userId: targetUserId,
        duplicate: result.duplicate,
        balance: result.balance,
        ticket: zohoTicket,
      });
    }
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
    console.error('[ADMIN_USER_CREDITS_ADJUST]', error);
    return res.status(isExpected ? 409 : 500).json({ error: message });
  }
});

// GET /api/admin/users/:id/details
router.get('/users/:id/details', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const targetUserId = req.params.id;
    const user = await prisma.user.findFirst({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastSignInAt: true,
        imageUrl: true,
        trialUsed: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        },
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch credit transactions (audit trail)
    const transactions = await prisma.creditTransaction.findMany({
      where: {
        OR: [
          { userId: targetUserId },
          user.organization?.id ? { organizationId: user.organization.id } : undefined
        ].filter(Boolean) as Prisma.CreditTransactionWhereInput[]
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Fetch recent analysis logs
    const analysisLogs = await prisma.analysisLog.findMany({
      where: { userId: targetUserId },
      select: {
        id: true,
        createdAt: true,
        status: true,
        verdict: true,
        score: true,
        role: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const subTarget = user.organization?.id
      ? { organizationId: user.organization.id }
      : { userId: targetUserId };

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        ...subTarget,
        status: { in: ['active', 'cancels_at_period_end'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    const queuedSubscription = await prisma.subscription.findFirst({
      where: {
        ...subTarget,
        status: 'queued'
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      user,
      transactions,
      analysisLogs,
      activeSubscription,
      queuedSubscription,
    });
  } catch (error) {
    console.error('[ADMIN_USER_DETAILS_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }
    const targetUserId = req.params.id;
    if (targetUserId === userId) {
      return res.status(400).json({ error: 'You cannot ban yourself' });
    }
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.users.banUser(targetUserId);

    await logAuditEvent({
      action: 'user.ban',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: targetUserId,
      targetType: 'User',
      description: `Banned user with ID: ${targetUserId}`,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_USER_BAN]', error);
    return res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST /api/admin/users/:id/unban
router.post('/users/:id/unban', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }
    const targetUserId = req.params.id;
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.users.unbanUser(targetUserId);

    await logAuditEvent({
      action: 'user.unban',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: targetUserId,
      targetType: 'User',
      description: `Unbanned user with ID: ${targetUserId}`,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_USER_UNBAN]', error);
    return res.status(500).json({ error: 'Failed to unban user' });
  }
});

// POST /api/admin/users/:id/resend-invite
router.post('/users/:id/resend-invite', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }
    const targetUserId = req.params.id;
    const user = await prisma.user.findFirst({
      where: { id: targetUserId },
      select: { email: true, name: true }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { customSubject, customMessage } = req.body;
    const subject = customSubject || 'Lanjutkan Pendaftaran Anda di Envoyou AI';
    
    // Default message template if none provided
    const messageBody = customMessage || `Halo ${user.name || 'User'},\n\nSilakan klik tautan di bawah ini untuk melanjutkan pendaftaran dan masuk ke workspace Envoyou AI Anda.`;

    const host = req.get('host') || 'eai.envoyou.com';
    // Use the official app URL as the primary target
    const appUrl = host.includes('localhost') || host.includes('127.0.0.1')
      ? `${req.protocol}://${host}/login`
      : 'https://eai.envoyou.com/login';

    const textContent = `${messageBody}\n\nLanjutkan ke Workspace: ${appUrl}\n\nSalam,\nTim Envoyou`;
    
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded-lg;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0d87cf; margin: 0;">Envoyou AI</h2>
          <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Editorial Intelligence</span>
        </div>
        <div style="font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-line;">
          ${messageBody}
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}" style="background-color: #0d87cf; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Lanjutkan ke Workspace</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <div style="font-size: 11px; color: #64748b; text-align: center;">
          Email ini dikirim dari Envoyou AI. Jika Anda tidak merasa mendaftar, silakan abaikan email ini.
        </div>
      </div>
    `;

    // 1. Sync invitation state with Clerk without sending Clerk's default automated email
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const redirectUrl = process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
      ? `${req.protocol}://${host}${process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL}`
      : undefined;

    try {
      await clerk.invitations.createInvitation({
        emailAddress: user.email,
        redirectUrl,
        ignoreExisting: true,
        notify: false, // Prevents Clerk from sending its own automated email
      });
    } catch (clerkErr) {
      const errObj = clerkErr as { errors?: { longMessage?: string }[]; message?: string };
      const errMsg = errObj?.errors?.[0]?.longMessage || errObj?.message || String(clerkErr);
      console.warn(`[ADMIN_USER_RESEND_INVITE] Clerk invitation registry sync skipped/failed (non-blocking): ${errMsg}`);
    }

    // 2. Send custom business email via Mailgun API / custom email helper
    const sent = await sendEmail({
      to: user.email,
      subject,
      text: textContent,
      html: htmlContent,
    });

    if (!sent) {
      return res.status(500).json({ error: 'Failed to deliver invitation email' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_USER_RESEND_INVITE]', error);
    return res.status(500).json({ error: 'Failed to resend invite' });
  }
});

// GET /api/admin/organizations/:id/ai-config
router.get('/organizations/:id/ai-config', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const orgId = req.params.id;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, aiProviderOverride: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    let provider = 'gemini';
    let model = '';

    if (org.aiProviderOverride) {
      if (org.aiProviderOverride.includes(':')) {
        const parts = org.aiProviderOverride.split(':');
        provider = parts[0];
        model = parts[1] || '';
      } else {
        provider = org.aiProviderOverride;
      }
    }

    return res.json({
      organizationId: org.id,
      name: org.name,
      provider,
      model,
    });
  } catch (error) {
    console.error('[ADMIN_AI_CONFIG_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch AI configuration' });
  }
});

// PUT /api/admin/organizations/:id/ai-config
router.put('/organizations/:id/ai-config', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const orgId = req.params.id;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, aiProviderOverride: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const schema = z.object({
      provider: z.enum(['gemini', 'groq', 'openrouter']),
      model: z.string().trim().max(100).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid config payload', issues: parsed.error.flatten() });
    }

    const { provider, model } = parsed.data;
    const value = model ? `${provider}:${model}` : provider;
    const oldVal = org.aiProviderOverride;

    await prisma.organization.update({
      where: { id: orgId },
      data: { aiProviderOverride: value },
    });

    // Invalidate Cache
    const cacheKey = `ai_config:org:${orgId}`;
    try {
      await redisConnection.del(cacheKey);
    } catch (cacheErr) {
      console.warn(`[ADMIN_AI_CONFIG_PUT] Failed to clear Redis cache:`, cacheErr);
    }

    // Log Audit Event
    await logAuditEvent({
      action: 'tenant.ai_config.update',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: orgId,
      targetType: 'Tenant',
      description: `Updated Refine AI Engine config for organization "${org.name}" to provider: ${provider}, model: ${model || 'default'}`,
      details: {
        oldValue: oldVal,
        newValue: value,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_AI_CONFIG_PUT]', error);
    return res.status(500).json({ error: 'Failed to update AI configuration' });
  }
});

// GET /api/admin/audit-logs
router.get('/audit-logs', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const page = Math.max(1, parseInt(req.query.page as string || '1'));
    const limit = Math.max(1, parseInt(req.query.limit as string || '10'));
    const search = (req.query.search as string || '').trim();
    const actionFilter = (req.query.action as string || '').trim();

    const where: Prisma.AuditLogWhereInput = {};

    if (search) {
      where.OR = [
        { actorEmail: { contains: search, mode: 'insensitive' } },
        { targetId: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (actionFilter) {
      where.action = actionFilter;
    }

    const totalCount = await prisma.auditLog.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.json({
      logs,
      pagination: {
        totalCount,
        totalPages,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('[ADMIN_AUDIT_LOGS_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// POST /api/admin/audit-logs
router.post('/audit-logs', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const schema = z.object({
      action: z.string().min(3).max(100),
      targetId: z.string().max(150).optional().nullable(),
      targetType: z.string().max(50).optional().nullable(),
      description: z.string().min(5).max(500),
      details: z.record(z.any()).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid audit payload', issues: parsed.error.flatten() });
    }

    const log = await logAuditEvent({
      action: parsed.data.action,
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: parsed.data.targetId,
      targetType: parsed.data.targetType,
      description: parsed.data.description,
      details: parsed.data.details,
    });

    return res.status(201).json({ success: true, log });
  } catch (error) {
    console.error('[ADMIN_AUDIT_LOGS_POST]', error);
    return res.status(500).json({ error: 'Failed to create audit log' });
  }
});

export default router;
