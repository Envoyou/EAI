import { prisma } from './db';
import {
  getPlanCreditsGranted,
  getPlanPeriodEnd,
  PLANS,
} from './payment';
import type { PaymentEvent, PaymentProvider } from './payments/types';

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
    transaction.amountIdr < paymentOrder.amountIdr
  ) {
    throw new Error('Payment verification mismatch');
  }

  if (transaction.amountIdr !== paymentOrder.amountIdr) {
    console.warn(`[Payment Warning] Order amount mismatch (paid: ${transaction.amountIdr}, expected: ${paymentOrder.amountIdr}). Proceeding as paid amount is greater than or equal to expected.`);
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

    // Check if they had an active subscription before archiving it (upgrade/downgrade)
    const activeSub = await tx.subscription.findFirst({
      where: {
        userId: organizationId ? undefined : (paymentOrder.userId as string),
        organizationId: organizationId || undefined,
        status: { in: ['active', 'cancels_at_period_end'] },
        currentPeriodEnd: { gt: now },
      },
    });

    if (plan.isSubscription) {
      // 1. Archive any existing active subscriptions inside the transaction
      await tx.subscription.updateMany({
        where: {
          userId: organizationId ? undefined : (paymentOrder.userId as string),
          organizationId: organizationId || undefined,
          status: { in: ['active', 'cancels_at_period_end'] },
        },
        data: {
          status: 'expired',
        },
      });

      // 2. Create the new active subscription inside the transaction
      const subscription = await tx.subscription.create({
        data: {
          id: `sub_${paymentOrder.id}`,
          userId,
          organizationId,
          plan: plan.id,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          lastCreditAllocation: plan.billingMonths === 12 ? now : null,
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

      // Only perform a cycle_reset if they did not have an active subscription (normal purchase or expired renewal)
      // If they had an active subscription, we skip cycle_reset to MERGE the credits!
      if (!activeSub && currentBalance > 0) {
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

      const isYearly = plan.billingMonths === 12;
      const firstMonthEnd = new Date(now);
      if (isYearly) {
        firstMonthEnd.setUTCMonth(firstMonthEnd.getUTCMonth() + 1);
      }

      await tx.creditTransaction.create({
        data: {
          userId,
          organizationId,
          type: isYearly ? 'yearly_monthly_allocation' : 'monthly_allocation',
          bucket: 'subscription',
          amount: isYearly ? plan.creditsPerMonth : getPlanCreditsGranted(plan),
          subscriptionId: subscription.id,
          idempotencyKey: `allocation:${paymentOrder.id}`,
          description: isYearly
            ? `First month prepaid credit allocation for the ${plan.name} plan`
            : `Monthly credit allocation for the ${plan.name} plan`,
          periodStart: now,
          periodEnd: isYearly ? firstMonthEnd : periodEnd,
          expiresAt: isYearly ? firstMonthEnd : periodEnd,
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

    // Apply the leftover account balance to User/Organization
    if (paymentOrder.organizationId) {
      await tx.organization.update({
        where: { id: paymentOrder.organizationId },
        data: { balanceIdr: paymentOrder.balanceRemaining },
      });
    } else if (paymentOrder.userId) {
      await tx.user.update({
        where: { id: paymentOrder.userId },
        data: { balanceIdr: paymentOrder.balanceRemaining },
      });
    }

    return 'processed';
  });
}

export async function processRpZeroCheckout(orderId: string): Promise<void> {
  const paymentOrder = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
  });
  if (!paymentOrder) throw new Error('Payment order not found');
  if (paymentOrder.amountIdr !== 0) throw new Error('Not a Rp 0 payment order');
  if (paymentOrder.status === 'paid') return;

  const mockTransaction: PaymentEvent = {
    provider: paymentOrder.provider as PaymentProvider,
    orderId,
    transactionId: `rp0_${Date.now()}`,
    status: 'paid',
    amountIdr: 0,
    isPaid: true,
    paymentType: 'account_balance',
  };

  await processVerifiedPaymentEvent(orderId, mockTransaction);
}
