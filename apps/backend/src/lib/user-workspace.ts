import { createClerkClient } from '@clerk/backend';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { ensureOrganizationTrialCredits, ensurePersonalTrialCredits } from '@/lib/trial-credits';
import { normalizeProfileConfig } from '@eai/shared/server';
import { PLANS } from '@/lib/payment';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

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

const slugifyWorkspace = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'workspace';

export const ensureCurrentUserRecord = async (userId: string) => {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (existing) {
    await ensurePersonalTrialCredits(userId);

    // Self-healing check: Sync user details from Clerk if last sync is > 5 minutes ago
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - new Date(existing.updatedAt).getTime() > fiveMinutes) {
      try {
        const clerkUser = await clerk.users.getUser(userId);
        const email = clerkUser?.emailAddresses[0]?.emailAddress;
        if (clerkUser && email) {
          const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');
          const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
              email,
              name: name || null,
              imageUrl: clerkUser.imageUrl || null,
              lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt) : undefined,
            },
          });
          existing.name = updatedUser.name;
          existing.email = updatedUser.email;
          existing.imageUrl = updatedUser.imageUrl;
        }
      } catch (err) {
        console.warn(`[Clerk Sync Warning] Failed to background-sync user ${userId} from Clerk:`, err);
      }
    }

    return existing;
  }

  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!clerkUser || !email) return null;

  // Check if a user with this email already exists under a different ID
  const existingByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingByEmail) {
    // If the ID is different, the old record is stale (orphaned Clerk user).
    // Delete it to avoid unique constraint violations on email.
    await prisma.user.delete({
      where: { id: existingByEmail.id },
    });
  }

  const userRecord = await prisma.user.create({
    data: {
      id: userId,
      email,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
      imageUrl: clerkUser.imageUrl || null,
      lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt) : null,
    },
  });

  await ensurePersonalTrialCredits(userId);
  return userRecord;
};

const buildUniqueOrganizationSlug = async (preferredSlug: string, clerkOrganizationId: string) => {
  const baseSlug = slugifyWorkspace(preferredSlug);
  const existing = await prisma.organization.findUnique({
    where: { slug: baseSlug },
    select: { clerkOrganizationId: true },
  });
  if (!existing || existing.clerkOrganizationId === clerkOrganizationId) return baseSlug;

  return `${baseSlug}-${clerkOrganizationId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-8)}`;
};

const ensureLocalOrganizationForClerkContext = async (
  userId: string,
  context: ClerkOrganizationContext
) => {
  const clerkOrganizationId = context.clerkOrganizationId?.trim();
  if (!clerkOrganizationId) return null;

  let localOrganization = await prisma.organization.findUnique({
    where: { clerkOrganizationId },
  });

  if (!localOrganization) {
    const clerkOrganization = await clerk.organizations.getOrganization({
      organizationId: clerkOrganizationId,
    });
    const preferredSlug =
      clerkOrganization.slug || context.clerkOrganizationSlug || clerkOrganization.name;
    const createOrganization = async () => {
      const slug = await buildUniqueOrganizationSlug(preferredSlug, clerkOrganizationId);
      return prisma.organization.create({
        data: {
          clerkOrganizationId,
          createdByUserId: clerkOrganization.createdBy || null,
          slug,
          name: clerkOrganization.name,
          publicationName: clerkOrganization.name,
          onboardingStatus: 'pending',
        },
      });
    };

    try {
      localOrganization = await createOrganization();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      // The Clerk webhook and this lazy sync can arrive at the same time.
      localOrganization = await prisma.organization.findUnique({
        where: { clerkOrganizationId },
      });
      if (!localOrganization) {
        localOrganization = await createOrganization();
      }
    }
  } else if (!localOrganization.createdByUserId) {
    const clerkOrganization = await clerk.organizations.getOrganization({
      organizationId: clerkOrganizationId,
    });
    localOrganization = await prisma.organization.update({
      where: { id: localOrganization.id },
      data: {
        createdByUserId: clerkOrganization.createdBy || null,
      },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: localOrganization.id },
  });
  await ensureOrganizationTrialCredits(
    userId,
    localOrganization.id,
    localOrganization.createdByUserId
  );

  return localOrganization;
};

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
  context: ClerkOrganizationContext = {}
) => {
  const user = await ensureCurrentUserRecord(userId);
  if (!user) return null;

  const activeClerkOrganization = await ensureLocalOrganizationForClerkContext(userId, context);

  const workspaceUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      role: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          clerkOrganizationId: true,
          slug: true,
          name: true,
          publicationName: true,
          domain: true,
          npwp: true,
          billingAddress: true,
          editorialEvaluationConsent: true,
          editorialEvaluationConsentUpdatedAt: true,
          isActive: true,
          onboardingStatus: true,
          profiles: {
            where: { isActive: true },
            select: {
              id: true,
              versions: {
                take: 1,
                orderBy: { version: 'desc' },
                select: { config: true },
              },
            },
          },
        },
      },
    },
  });

  const activeOrganizationId = activeClerkOrganization?.id ?? workspaceUser?.organizationId ?? null;
  const activeOrganization = activeOrganizationId && activeOrganizationId !== workspaceUser?.organizationId
    ? await prisma.organization.findUnique({
        where: { id: activeOrganizationId },
        select: {
          id: true,
          clerkOrganizationId: true,
          slug: true,
          name: true,
          publicationName: true,
          domain: true,
          npwp: true,
          billingAddress: true,
          editorialEvaluationConsent: true,
          editorialEvaluationConsentUpdatedAt: true,
          isActive: true,
          onboardingStatus: true,
          profiles: {
            where: { isActive: true },
            select: {
              id: true,
              versions: {
                take: 1,
                orderBy: { version: 'desc' },
                select: { config: true },
              },
            },
          },
        },
      })
    : workspaceUser?.organization;

  const hasActiveProfile = Boolean(
    activeOrganization?.profiles?.some((p) => {
      const latestVersion = p.versions[0];
      return latestVersion && normalizeProfileConfig(latestVersion.config) !== null;
    })
  );

  const activeSub = await prisma.subscription.findFirst({
    where: {
      userId: activeOrganizationId ? undefined : userId,
      organizationId: activeOrganizationId || undefined,
      status: { in: ['active', 'cancels_at_period_end'] },
      currentPeriodEnd: { gt: new Date() },
    },
  });

  const queuedSub = await prisma.subscription.findFirst({
    where: {
      userId: activeOrganizationId ? undefined : userId,
      organizationId: activeOrganizationId || undefined,
      status: 'queued',
    },
    select: {
      plan: true,
      currentPeriodStart: true,
    },
  });

  const transactions = await prisma.creditTransaction.groupBy({
    by: ['bucket'],
    where: {
      userId: activeOrganizationId ? undefined : userId,
      organizationId: activeOrganizationId || undefined,
    },
    _sum: {
      amount: true,
    },
  });

  const trialSum = transactions.find((t) => t.bucket === 'trial')?._sum.amount ?? 0;
  const addonSum = transactions.find((t) => t.bucket === 'addon')?._sum.amount ?? 0;
  const subSum = transactions.find((t) => t.bucket === 'subscription')?._sum.amount ?? 0;

  const trialAllocation = await prisma.creditTransaction.aggregate({
    where: {
      userId: activeOrganizationId ? undefined : userId,
      organizationId: activeOrganizationId || undefined,
      bucket: 'trial',
      amount: { gt: 0 },
    },
    _sum: {
      amount: true,
    },
  });
  const trialCreditsTotal = trialAllocation._sum.amount ?? 0;

  const creditsRemaining = Math.max(0, trialSum + addonSum + (activeSub ? subSum : 0));

  const resolvedPlanId = activeSub?.plan ? activeSub.plan.replace('org:', '') : 'free';
  const planDetails = PLANS[resolvedPlanId];
  const subscriptionCreditsTotal = planDetails?.creditsPerMonth ?? 0;

  let currentPeriodUsage = 0;
  if (activeSub) {
    const spentInPeriod = await prisma.creditTransaction.aggregate({
      where: {
        userId: activeOrganizationId ? undefined : userId,
        organizationId: activeOrganizationId || undefined,
        bucket: 'subscription',
        amount: { lt: 0 },
        createdAt: { gte: activeSub.currentPeriodStart },
      },
      _sum: {
        amount: true,
      },
    });
    currentPeriodUsage = Math.abs(spentInPeriod._sum.amount ?? 0);
  }

  const subscriptionCreditsRemaining = activeSub
    ? Math.max(0, subscriptionCreditsTotal - currentPeriodUsage)
    : 0;

  return {
    ...workspaceUser,
    organizationId: activeOrganizationId,
    organization: activeOrganization,
    isAdmin: isOrganizationAdmin(context, workspaceUser?.role),
    needsOnboarding:
      !activeOrganizationId ||
      !activeOrganization?.isActive ||
      activeOrganization.onboardingStatus !== 'completed' ||
      !hasActiveProfile,
    plan: {
      maxTextLength: 15000,
      creditsRemaining,
      activePlan: activeSub?.plan || 'free',
      subscriptionStatus: activeSub?.status || 'none',
      currentPeriodEnd: activeSub?.currentPeriodEnd || null,
      subscriptionCreditsTotal,
      subscriptionCreditsRemaining,
      trialCreditsRemaining: Math.max(0, trialSum),
      trialCreditsTotal,
      queuedDowngrade: queuedSub ? {
        planId: queuedSub.plan,
        planName: PLANS[queuedSub.plan]?.name || queuedSub.plan,
        activatesOn: queuedSub.currentPeriodStart,
      } : null,
    },
  };
};
