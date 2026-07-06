import { Router, Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { createClerkClient } from '@clerk/backend';
import {
  adjustOrganizationCredits,
  adjustPersonalCredits,
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
            OR: [
              { subscription: null },
              {
                subscription: {
                  OR: [
                    { status: { not: 'active' } },
                    { currentPeriodEnd: { lte: now } }
                  ]
                }
              }
            ]
          },
          {
            OR: [
              { organizationId: null },
              {
                organization: {
                  OR: [
                    { subscription: null },
                    {
                      subscription: {
                        OR: [
                          { status: { not: 'active' } },
                          { currentPeriodEnd: { lte: now } }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        ];
      } else {
        where.OR = [
          {
            subscription: {
              plan: { equals: planFilter, mode: 'insensitive' },
              status: 'active',
              currentPeriodEnd: { gt: now }
            }
          },
          {
            organization: {
              subscription: {
                plan: { equals: planFilter, mode: 'insensitive' },
                status: 'active',
                currentPeriodEnd: { gt: now }
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
        status: 'active',
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

    return res.json({
      user,
      transactions,
      analysisLogs,
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
      select: { email: true }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    
    const redirectUrl = process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
      ? `${req.protocol}://${req.get('host')}${process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL}`
      : undefined;

    await clerk.invitations.createInvitation({
      emailAddress: user.email,
      redirectUrl,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_USER_RESEND_INVITE]', error);
    return res.status(500).json({ error: 'Failed to resend invite' });
  }
});

export default router;
