import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { createClerkClient } from '@clerk/backend';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import {
  adjustOrganizationCredits,
  adjustPersonalCredits,
} from '@/lib/admin-billing';
import { getZohoDeskTicket, isZohoDeskEnabled } from '@/lib/zoho-desk';
import { getActor } from '../utils';
import { UserCreditAdjustmentSchema } from '../types';

const router = Router();

// GET /api/admin/users
router.get('/users', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || '1'));
    const limit = Math.max(1, parseInt((req.query.limit as string) || '10'));
    const search = ((req.query.search as string) || '').trim();
    const planFilter = ((req.query.plan as string) || '').trim();
    const statusFilter = ((req.query.status as string) || '').trim();
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = ((req.query.sortOrder as string) || 'desc') as 'asc' | 'desc';

    const where: Prisma.UserWhereInput = {};

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
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

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

    if (planFilter) {
      const now = new Date();
      if (planFilter.toLowerCase() === 'free') {
        where.AND = [
          {
            subscriptions: {
              none: {
                status: { in: ['active', 'cancels_at_period_end'] },
                currentPeriodEnd: { gt: now },
              },
            },
          },
          {
            OR: [
              { organizationId: null },
              {
                organization: {
                  subscriptions: {
                    none: {
                      status: { in: ['active', 'cancels_at_period_end'] },
                      currentPeriodEnd: { gt: now },
                    },
                  },
                },
              },
            ],
          },
        ];
      } else {
        where.OR = [
          {
            subscriptions: {
              some: {
                plan: { equals: planFilter, mode: 'insensitive' },
                status: { in: ['active', 'cancels_at_period_end'] },
                currentPeriodEnd: { gt: now },
              },
            },
          },
          {
            organization: {
              subscriptions: {
                some: {
                  plan: { equals: planFilter, mode: 'insensitive' },
                  status: { in: ['active', 'cancels_at_period_end'] },
                  currentPeriodEnd: { gt: now },
                },
              },
            },
          },
        ];
      }
    }

    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'name') {
      orderBy = { name: sortOrder };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    } else if (sortBy === 'analysesCount') {
      orderBy = { logs: { _count: sortOrder } };
    }

    const totalCount = await prisma.user.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

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
          },
        },
        onboardingDraft: {
          select: {
            step: true,
          },
        },
        _count: {
          select: {
            logs: true,
          },
        },
      },
    });

    const userIds = users.map((u) => u.id);
    const orgIds = users.map((u) => u.organization?.id).filter(Boolean) as string[];

    const activeSubs = await prisma.subscription.findMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { organizationId: { in: orgIds } },
        ],
        status: { in: ['active', 'cancels_at_period_end'] },
        currentPeriodEnd: { gt: new Date() },
      },
    });

    const txGroupByUser = await prisma.creditTransaction.groupBy({
      by: ['userId', 'bucket'],
      where: { userId: { in: userIds } },
      _sum: { amount: true },
    });

    const txGroupByOrg = orgIds.length > 0 ? await prisma.creditTransaction.groupBy({
      by: ['organizationId', 'bucket'],
      where: { organizationId: { in: orgIds } },
      _sum: { amount: true },
    }) : [];

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
        limit,
      },
    });
  } catch (error) {
    console.error('[ADMIN_USERS_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
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
    const parsed = UserCreditAdjustmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid credit adjustment inputs',
        issues: parsed.error.flatten(),
      });
    }

    const user = await prisma.user.findFirst({
      where: { id: targetUserId },
      select: { id: true, organizationId: true },
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
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        OR: [
          { userId: targetUserId },
          user.organization?.id ? { organizationId: user.organization.id } : undefined,
        ].filter(Boolean) as Prisma.CreditTransactionWhereInput[],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

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
        status: { in: ['active', 'cancels_at_period_end'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const queuedSubscription = await prisma.subscription.findFirst({
      where: {
        ...subTarget,
        status: 'queued',
      },
      orderBy: { createdAt: 'desc' },
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
      select: { email: true, name: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { customSubject, customMessage } = req.body;
    const subject = customSubject || 'Lanjutkan Pendaftaran Anda di Envoyou AI';
    const messageBody =
      customMessage ||
      `Halo ${user.name || 'User'},\n\nSilakan klik tautan di bawah ini untuk melanjutkan pendaftaran dan masuk ke workspace Envoyou AI Anda.`;

    const host = req.get('host') || 'eai.envoyou.com';
    const appUrl =
      host.includes('localhost') || host.includes('127.0.0.1')
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

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const redirectUrl = process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
      ? `${req.protocol}://${host}${process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL}`
      : undefined;

    try {
      await clerk.invitations.createInvitation({
        emailAddress: user.email,
        redirectUrl,
        ignoreExisting: true,
        notify: false,
      });
    } catch (clerkErr) {
      const errObj = clerkErr as { errors?: { longMessage?: string }[]; message?: string };
      const errMsg = errObj?.errors?.[0]?.longMessage || errObj?.message || String(clerkErr);
      console.warn(`[ADMIN_USER_RESEND_INVITE] Clerk invitation registry sync skipped/failed (non-blocking): ${errMsg}`);
    }

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

export default router;
