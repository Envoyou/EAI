import { prisma } from '../lib/db';
import { PLANS } from '../lib/payment';

export async function runActivateQueuedDowngrade() {
  const now = new Date();

  // Find all queued subscriptions that are scheduled to start on or before now
  const queued = await prisma.subscription.findMany({
    where: {
      status: 'queued',
      currentPeriodStart: { lte: now }
    }
  });

  console.log(`[Job] Found ${queued.length} queued subscriptions ready for activation`);

  for (const sub of queued) {
    const plan = PLANS[sub.plan];
    if (!plan) continue;

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Expire the previous yearly subscription (it was marked cancels_at_period_end)
        await tx.subscription.updateMany({
          where: {
            userId: sub.userId,
            organizationId: sub.organizationId,
            status: 'cancels_at_period_end',
          },
          data: { status: 'expired' }
        });

        // 2. Calculate new period end (1 month from scheduled start date)
        const periodEnd = new Date(sub.currentPeriodStart);
        periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

        // 3. Activate the queued subscription
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'active',
            currentPeriodEnd: periodEnd,
            lastCreditAllocation: now
          }
        });

        // 4. Allocate monthly credits for the first month
        await tx.creditTransaction.create({
          data: {
            userId: sub.userId,
            organizationId: sub.organizationId,
            type: 'monthly_allocation',
            bucket: 'subscription',
            amount: plan.creditsPerMonth,
            subscriptionId: sub.id,
            idempotencyKey: `queued-activation:${sub.id}`,
            description: `First month credit allocation for the activated ${plan.name} plan`,
            periodStart: sub.currentPeriodStart,
            periodEnd: periodEnd,
            expiresAt: periodEnd
          }
        });

        console.log(`[Job] Successfully activated queued subscription ${sub.id} (plan: ${plan.name}) for owner: ${sub.userId || sub.organizationId}`);
      });
    } catch (error) {
      console.error(`[Job] Failed to activate queued subscription ${sub.id}:`, error);
    }
  }
}
