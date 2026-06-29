import { Prisma } from '@prisma/client';
import { createClerkClient } from '@clerk/backend';

import { prisma } from '@/lib/db';
import { isOwnerUser } from '@eai/shared/server';
import {
  type BillingBalance,
  isSuperAdminRole,
  planCreditDeduction,
} from '@/lib/admin-billing-core';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export {
  type BillingBalance,
  isSuperAdminRole,
  planCreditDeduction,
} from '@/lib/admin-billing-core';

export type BillingAdminActor = {
  userId: string;
  email: string;
  role: string;
};

export const getBillingAdminActor = async (
  userId: string | null | undefined
): Promise<BillingAdminActor | null> => {
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return null;

  if (!isOwnerUser(userId) && !isSuperAdminRole(user.role)) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
};

const calculateOrganizationBalance = async (
  client: Prisma.TransactionClient | typeof prisma,
  organizationId: string
): Promise<BillingBalance> => {
  const [subscription, transactions] = await Promise.all([
    client.subscription.findUnique({
      where: { organizationId },
      select: {
        status: true,
        currentPeriodEnd: true,
      },
    }),
    client.creditTransaction.groupBy({
      by: ['bucket'],
      where: { organizationId },
      _sum: { amount: true },
    }),
  ]);

  const trial = transactions.find((item) => item.bucket === 'trial')?._sum.amount ?? 0;
  const addon = transactions.find((item) => item.bucket === 'addon')?._sum.amount ?? 0;
  const subscriptionIsActive = Boolean(
    subscription?.status === 'active' && subscription.currentPeriodEnd > new Date()
  );
  const subscriptionBalance = subscriptionIsActive
    ? transactions.find((item) => item.bucket === 'subscription')?._sum.amount ?? 0
    : 0;

  return {
    total: Math.max(0, trial + addon + subscriptionBalance),
    trial,
    subscription: subscriptionBalance,
    addon,
  };
};

const getOrganizationMembers = async (
  dbUsers: { id: string; email: string; name: string | null; role: string }[],
  clerkOrganizationId: string | null
) => {
  if (!clerkOrganizationId) {
    return dbUsers;
  }
  try {
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: clerkOrganizationId,
      limit: 50,
    });
    return memberships.data.map((m) => {
      let role = 'member';
      if (m.role === 'org:admin' || m.role === 'admin') {
        role = 'admin';
      }
      const firstName = m.publicUserData?.firstName || '';
      const lastName = m.publicUserData?.lastName || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');

      return {
        id: m.publicUserData?.userId || m.id,
        email: m.publicUserData?.identifier || '',
        name: fullName || null,
        role,
      };
    });
  } catch (error) {
    console.error(`[getOrganizationMembers] Failed to fetch memberships from Clerk for ${clerkOrganizationId}:`, error);
    return dbUsers;
  }
};

export const searchBillingOrganizations = async (query: string) => {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const organizations = await prisma.organization.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: cleanQuery, mode: 'insensitive' } },
        { publicationName: { contains: cleanQuery, mode: 'insensitive' } },
        { slug: { contains: cleanQuery, mode: 'insensitive' } },
        { domain: { contains: cleanQuery, mode: 'insensitive' } },
        { clerkOrganizationId: { contains: cleanQuery, mode: 'insensitive' } },
        {
          users: {
            some: {
              OR: [
                { email: { contains: cleanQuery, mode: 'insensitive' } },
                { name: { contains: cleanQuery, mode: 'insensitive' } },
              ],
            },
          },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      clerkOrganizationId: true,
      name: true,
      publicationName: true,
      slug: true,
      domain: true,
      users: {
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: { id: true, email: true, name: true, role: true },
      },
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodEnd: true,
        },
      },
    },
  });

  return Promise.all(organizations.map(async (organization) => {
    const users = await getOrganizationMembers(organization.users, organization.clerkOrganizationId);
    return {
      ...organization,
      users,
      balance: await calculateOrganizationBalance(prisma, organization.id),
    };
  }));
};

export const getBillingOrganizationDetail = async (organizationId: string) => {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      isActive: true,
    },
    select: {
      id: true,
      clerkOrganizationId: true,
      name: true,
      publicationName: true,
      slug: true,
      domain: true,
      createdAt: true,
      users: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, role: true },
      },
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          type: true,
          bucket: true,
          amount: true,
          idempotencyKey: true,
          description: true,
          adjustmentReason: true,
          adjustmentGroupKey: true,
          ticketReference: true,
          externalTicketId: true,
          externalTicketUrl: true,
          performedByUserId: true,
          performedByEmail: true,
          createdAt: true,
        },
      },
    },
  });
  if (!organization) return null;

  const users = await getOrganizationMembers(organization.users, organization.clerkOrganizationId);

  return {
    ...organization,
    users,
    balance: await calculateOrganizationBalance(prisma, organization.id),
  };
};

type ManualAdjustmentInput = {
  organizationId: string;
  direction: 'add' | 'deduct';
  amount: number;
  reason: string;
  ticketReference: string;
  externalTicketId?: string;
  externalTicketUrl?: string | null;
  idempotencyKey: string;
};

export const adjustOrganizationCredits = async (
  actor: BillingAdminActor,
  input: ManualAdjustmentInput
) => prisma.$transaction(async (tx) => {
  const organization = await tx.organization.findFirst({
    where: {
      id: input.organizationId,
      isActive: true,
    },
    select: { id: true, name: true },
  });
  if (!organization) {
    throw new Error('Active organization not found.');
  }

  const adjustmentGroupKey = `manual:${input.idempotencyKey}`;
  const existing = await tx.creditTransaction.findFirst({
    where: { adjustmentGroupKey },
    select: { id: true },
  });
  if (existing) {
    return {
      duplicate: true,
      organizationId: organization.id,
      balance: await calculateOrganizationBalance(tx, organization.id),
    };
  }

  const balance = await calculateOrganizationBalance(tx, organization.id);
  if (input.direction === 'deduct' && input.amount > balance.total) {
    throw new Error(`Cannot deduct ${input.amount} credits from a balance of ${balance.total}.`);
  }

  const commonData = {
    userId: null,
    organizationId: organization.id,
    type: 'manual_adjustment' as const,
    adjustmentReason: input.reason,
    adjustmentGroupKey,
    ticketReference: input.ticketReference,
    externalTicketId: input.externalTicketId,
    externalTicketUrl: input.externalTicketUrl,
    performedByUserId: actor.userId,
    performedByEmail: actor.email,
  };

  if (input.direction === 'add') {
    await tx.creditTransaction.create({
      data: {
        ...commonData,
        bucket: 'addon',
        amount: input.amount,
        idempotencyKey: `${adjustmentGroupKey}:addon`,
        description: `Manual credit addition: ${input.reason}`,
      },
    });
  } else {
    const deductionPlan = planCreditDeduction(balance, input.amount);
    for (const entry of deductionPlan.deductions) {
      await tx.creditTransaction.create({
        data: {
          ...commonData,
          bucket: entry.bucket,
          amount: entry.amount,
          idempotencyKey: `${adjustmentGroupKey}:${entry.bucket}`,
          description: `Manual credit deduction: ${input.reason}`,
        },
      });
    }

    if (deductionPlan.remaining > 0) {
      throw new Error('The available credit buckets changed during this adjustment. Please retry.');
    }
  }

  return {
    duplicate: false,
    organizationId: organization.id,
    balance: await calculateOrganizationBalance(tx, organization.id),
  };
}, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
});
