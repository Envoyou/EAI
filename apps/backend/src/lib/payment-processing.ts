import { prisma } from './db';
import {
  getPlanCreditsGranted,
  getPlanPeriodEnd,
  PLANS,
} from './payment';
import type { PaymentEvent } from './payments/types';

export type PaymentProcessingResult =
  | 'processed'
  | 'already_processed'
  | 'status_updated';

export async function processVerifiedPaymentEvent(
  orderId: string,
  transaction: PaymentEvent
): Promise<PaymentProcessingResult> {
  const paymentOrder = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
  });
  if (!paymentOrder) throw new Error('Payment order not found');

  if (
    transaction.orderId !== paymentOrder.id ||
    transaction.amountIdr !== paymentOrder.amountIdr
  ) {
    throw new Error('Payment verification mismatch');
  }

  const plan = PLANS[paymentOrder.planId];
  if (!plan || (!paymentOrder.userId && !paymentOrder.organizationId)) {
    throw new Error('Invalid payment order target');
  }

  if (!transaction.isPaid) {
    await prisma.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: {
        status: transaction.status,
        transactionId: transaction.transactionId,
        paymentType: transaction.paymentType,
      },
    });
    return 'status_updated';
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentOrder.updateMany({
      where: {
        id: paymentOrder.id,
        status: { not: 'paid' },
      },
      data: {
        status: 'paid',
        transactionId: transaction.transactionId,
        paymentType: transaction.paymentType,
        paidAt: new Date(),
      },
    });
    if (claimed.count === 0) return 'already_processed';

    const now = new Date();
    const periodEnd = getPlanPeriodEnd(plan, now);
    const userId = paymentOrder.organizationId ? null : paymentOrder.userId;
    const organizationId = paymentOrder.organizationId;

    if (plan.isSubscription) {
      const subscription = await tx.subscription.upsert({
        where: organizationId
          ? { organizationId }
          : { userId: paymentOrder.userId as string },
        update: {
          id: paymentOrder.id,
          plan: plan.id,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        create: {
          id: paymentOrder.id,
          userId,
          organizationId,
          plan: plan.id,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      const subscriptionBalance = await tx.creditTransaction.aggregate({
        where: {
          userId: userId || undefined,
          organizationId: organizationId || undefined,
          bucket: 'subscription',
        },
        _sum: { amount: true },
      });
      const currentBalance = subscriptionBalance._sum.amount ?? 0;

      if (currentBalance > 0) {
        await tx.creditTransaction.create({
          data: {
            userId,
            organizationId,
            type: 'cycle_reset',
            bucket: 'subscription',
            amount: -currentBalance,
            subscriptionId: subscription.id,
            idempotencyKey: `reset:${paymentOrder.id}`,
            description: `Reset remaining credits after activating the ${plan.name} plan`,
            periodStart: now,
            periodEnd,
          },
        });
      }

      await tx.creditTransaction.create({
        data: {
          userId,
          organizationId,
          type:
            plan.billingMonths === 12
              ? 'yearly_monthly_allocation'
              : 'monthly_allocation',
          bucket: 'subscription',
          amount: getPlanCreditsGranted(plan),
          subscriptionId: subscription.id,
          idempotencyKey: `allocation:${paymentOrder.id}`,
          description:
            plan.billingMonths === 12
              ? `Prepaid 12-month credit allocation for the ${plan.name} plan`
              : `Monthly credit allocation for the ${plan.name} plan`,
          periodStart: now,
          periodEnd,
          expiresAt: periodEnd,
        },
      });
    } else {
      await tx.creditTransaction.create({
        data: {
          userId,
          organizationId,
          type: 'addon_purchase',
          bucket: 'addon',
          amount: getPlanCreditsGranted(plan),
          idempotencyKey: `addon:${paymentOrder.id}`,
          description: `Purchased ${plan.name}`,
        },
      });
    }

    return 'processed';
  });
}
