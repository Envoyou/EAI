import { prisma } from './db';
import { CreditBucket, CreditTransactionType } from '@prisma/client';

/**
 * Checks remaining credits for a user or organization.
 */
export async function checkCreditsRemaining(
  userId: string,
  organizationId: string | null
): Promise<number> {
  // 1. Check if there is an active subscription
  const activeSub = await prisma.subscription.findFirst({
    where: {
      userId: organizationId ? undefined : userId,
      organizationId: organizationId || undefined,
      status: 'active',
      currentPeriodEnd: { gt: new Date() },
    },
  });

  // 2. Fetch sum of transactions per bucket
  const transactions = await prisma.creditTransaction.groupBy({
    by: ['bucket'],
    where: {
      userId: organizationId ? undefined : userId,
      organizationId: organizationId || undefined,
    },
    _sum: {
      amount: true,
    },
  });

  const trialSum = transactions.find((t) => t.bucket === CreditBucket.trial)?._sum.amount ?? 0;
  const addonSum = transactions.find((t) => t.bucket === CreditBucket.addon)?._sum.amount ?? 0;
  const subSum = transactions.find((t) => t.bucket === CreditBucket.subscription)?._sum.amount ?? 0;

  return Math.max(0, trialSum + addonSum + (activeSub ? subSum : 0));
}

/**
 * Deducts the specified amount of credits from the best available bucket.
 */
export async function deductCredits(
  userId: string,
  organizationId: string | null,
  amount: number,
  type: CreditTransactionType,
  description: string,
  analysisLogId?: string
): Promise<void> {
  if (amount <= 0) return;

  await prisma.$transaction(async (tx) => {
    // 1. Check active subscription
    const activeSub = await tx.subscription.findFirst({
      where: {
        userId: organizationId ? undefined : userId,
        organizationId: organizationId || undefined,
        status: 'active',
        currentPeriodEnd: { gt: new Date() },
      },
    });

    // 2. Query bucket balances
    const transactions = await tx.creditTransaction.groupBy({
      by: ['bucket'],
      where: {
        userId: organizationId ? undefined : userId,
        organizationId: organizationId || undefined,
      },
      _sum: {
        amount: true,
      },
    });

    const trialBalance = transactions.find((t) => t.bucket === CreditBucket.trial)?._sum.amount ?? 0;
    const subBalance = transactions.find((t) => t.bucket === CreditBucket.subscription)?._sum.amount ?? 0;
    const addonBalance = transactions.find((t) => t.bucket === CreditBucket.addon)?._sum.amount ?? 0;

    // 3. Choose bucket to deduct from (trial -> subscription -> addon)
    let chosenBucket: CreditBucket;
    if (trialBalance >= amount) {
      chosenBucket = CreditBucket.trial;
    } else if (activeSub && subBalance >= amount) {
      chosenBucket = CreditBucket.subscription;
    } else if (addonBalance >= amount) {
      chosenBucket = CreditBucket.addon;
    } else {
      // Fallback if balance is tight
      chosenBucket = activeSub ? CreditBucket.subscription : CreditBucket.addon;
    }

    // 4. Create the negative transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        organizationId,
        type,
        bucket: chosenBucket,
        amount: -amount,
        analysisLogId,
        description,
      },
    });

    // 5. Log credit usage
    await tx.creditUsage.create({
      data: {
        userId,
        organizationId,
        analysisLogId,
        creditsConsumed: amount,
        costEstimate: 0.0, // Token pricing can optionally be snapshots later
      },
    });
  });
}
