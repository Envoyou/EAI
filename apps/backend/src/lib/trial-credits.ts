import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { isDisposableEmail, normalizeEmail } from '@/lib/email-utils';

const TRIAL_CREDITS = 10;

const hasClaimedTrialWithEquivalentEmail = async (
  userId: string,
  email: string,
  tx: Prisma.TransactionClient
) => {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain] = email.trim().toLowerCase().split('@');
  if (!localPart || !domain) return true;

  const basePrefix = localPart.replace(/[^a-z0-9]/g, '').slice(0, 3);
  const candidates = await tx.user.findMany({
    where: {
      id: { not: userId },
      trialUsed: true,
      email: {
        startsWith: basePrefix || undefined,
        endsWith: `@${domain}`,
      },
    },
    select: { email: true },
  });

  return candidates.some((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
};

export const ensureOrganizationTrialCredits = async (
  userId: string,
  organizationId: string,
  createdByUserId?: string | null
) => {
  if (!createdByUserId || createdByUserId !== userId) return;

  const organizationTrialKey = `trial:organization:${organizationId}`;
  const existingAllocation = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: organizationTrialKey },
    select: { id: true },
  });
  if (existingAllocation) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      );
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, trialUsed: true },
      });
      if (!user) return;

      const existingOrganizationTrial = await tx.creditTransaction.findFirst({
        where: {
          organizationId,
          type: 'trial',
          bucket: 'trial',
          amount: { gt: 0 },
        },
        select: { id: true },
      });
      if (existingOrganizationTrial) {
        if (!user.trialUsed) {
          await tx.user.update({
            where: { id: userId },
            data: { trialUsed: true },
          });
        }
        return;
      }

      const userTrial = await tx.creditTransaction.aggregate({
        where: { userId, organizationId: null, bucket: 'trial' },
        _sum: { amount: true },
      });
      const transferableCredits = Math.max(0, userTrial._sum.amount ?? 0);

      if (transferableCredits > 0) {
        await tx.creditTransaction.create({
          data: {
            userId,
            type: 'trial',
            bucket: 'trial',
            amount: -transferableCredits,
            idempotencyKey: `trial:transfer-out:${userId}:${organizationId}`,
            description: `Transferred trial credits to organization ${organizationId}`,
          },
        });
        await tx.creditTransaction.create({
          data: {
            organizationId,
            type: 'trial',
            bucket: 'trial',
            amount: transferableCredits,
            idempotencyKey: organizationTrialKey,
            description: 'Initial workspace trial credit allocation',
          },
        });
        return;
      }

      if (user.trialUsed) return;

      const shouldDenyTrial =
        isDisposableEmail(user.email) ||
        await hasClaimedTrialWithEquivalentEmail(userId, user.email, tx);

      if (!shouldDenyTrial) {
        await tx.creditTransaction.create({
          data: {
            organizationId,
            type: 'trial',
            bucket: 'trial',
            amount: TRIAL_CREDITS,
            idempotencyKey: organizationTrialKey,
            description: 'Initial workspace trial credit allocation',
          },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { trialUsed: true },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    throw error;
  }
};
