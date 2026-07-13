import { prisma } from '../lib/db';
import { PLANS } from '../lib/payment';

export async function runMonthlyCreditAllocation() {
  const now = new Date();
  
  // Cutoff date is 28 days ago to avoid double refill within the same month window
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 28);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      plan: { in: ['starter_yearly', 'pro_yearly', 'team_yearly'] },
      status: { in: ['active', 'cancels_at_period_end'] },
      currentPeriodEnd: { gt: now },
      OR: [
        { lastCreditAllocation: null },
        { lastCreditAllocation: { lt: cutoffDate } }
      ]
    }
  });

  console.log(`[Job] Found ${subscriptions.length} yearly subscriptions candidate for credit allocation refill`);

  for (const sub of subscriptions) {
    const plan = PLANS[sub.plan];
    if (!plan) continue;

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1; // 1-indexed
    const idempotencyKey = `monthly-refill:${sub.id}:${year}-${month}`;

    try {
      await prisma.$transaction(async (tx) => {
        // Check idempotency
        const existing = await tx.creditTransaction.findFirst({
          where: { idempotencyKey }
        });
        if (existing) {
          console.log(`[Job] Refill already processed for sub ${sub.id} in ${year}-${month}. Skipping.`);
          return;
        }

        // Calculate remaining subscription credits
        const aggregate = await tx.creditTransaction.aggregate({
          where: {
            subscriptionId: sub.id,
            bucket: 'subscription',
          },
          _sum: { amount: true },
        });
        const remaining = aggregate._sum.amount ?? 0;

        // Expiry/Reset remaining subscription credits using 'cycle_reset' type
        if (remaining > 0) {
          await tx.creditTransaction.create({
            data: {
              userId: sub.userId,
              organizationId: sub.organizationId,
              type: 'cycle_reset',
              bucket: 'subscription',
              amount: -remaining,
              subscriptionId: sub.id,
              idempotencyKey: `expiry:${idempotencyKey}`,
              description: `Monthly subscription credit expiry for the ${plan.name} plan`,
              periodStart: sub.currentPeriodStart,
              periodEnd: sub.currentPeriodEnd,
            }
          });
        }

        // Grant new monthly credits
        const allocationEnd = new Date(now);
        allocationEnd.setUTCMonth(allocationEnd.getUTCMonth() + 1);

        await tx.creditTransaction.create({
          data: {
            userId: sub.userId,
            organizationId: sub.organizationId,
            type: 'yearly_monthly_allocation',
            bucket: 'subscription',
            amount: plan.creditsPerMonth,
            subscriptionId: sub.id,
            idempotencyKey,
            description: `Monthly credit refill for the ${plan.name} plan`,
            periodStart: now,
            periodEnd: allocationEnd,
            expiresAt: allocationEnd,
          }
        });

        // Update lastCreditAllocation
        await tx.subscription.update({
          where: { id: sub.id },
          data: { lastCreditAllocation: now }
        });

        console.log(`[Job] Successfully refilled ${plan.creditsPerMonth} credits for sub ${sub.id} (owner: ${sub.userId || sub.organizationId})`);
      });
    } catch (error) {
      console.error(`[Job] Failed to allocate monthly credits for sub ${sub.id}:`, error);
    }
  }
}
