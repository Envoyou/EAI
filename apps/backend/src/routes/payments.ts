import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getPaymentGateway, getPlanCreditsGranted, PLANS } from '@/lib/payment';
import type { PaymentProvider } from '@/lib/payments/types';
import { processVerifiedPaymentEvent } from '@/lib/payment-processing';
import { getWorkspaceState } from '@/lib/user-workspace';

const router = Router();

// GET /api/payments/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const orderId = (req.query.orderId as string)?.trim();
    if (!orderId) {
      return res.status(400).json({ error: 'Payment order ID is required.' });
    }

    const [order, workspace] = await Promise.all([
      prisma.paymentOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          provider: true,
          userId: true,
          organizationId: true,
          planId: true,
          amountIdr: true,
          status: true,
          transactionId: true,
          paymentType: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      getWorkspaceState(userId, {
        clerkOrganizationId: orgId,
        clerkOrganizationSlug: orgSlug,
        clerkOrganizationRole: orgRole,
      }),
    ]);

    if (!order) {
      return res.status(404).json({ error: 'Payment order not found.' });
    }

    const ownsOrder = order.organizationId
      ? workspace?.organizationId === order.organizationId
      : order.userId === userId;
    if (!ownsOrder) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let currentOrder = order;
    const canReconcile =
      order.status !== 'paid' &&
      Date.now() - order.createdAt.getTime() >= 60_000;
    if (canReconcile) {
      try {
        const remoteStatus = await getPaymentGateway(
          order.provider as PaymentProvider
        ).getPaymentStatus(order.id);
        if (remoteStatus) {
          await processVerifiedPaymentEvent(order.id, remoteStatus);
          currentOrder =
            (await prisma.paymentOrder.findUnique({
              where: { id: order.id },
              select: {
                id: true,
                provider: true,
                userId: true,
                organizationId: true,
                planId: true,
                amountIdr: true,
                status: true,
                transactionId: true,
                paymentType: true,
                paidAt: true,
                createdAt: true,
              },
            })) || order;
        }
      } catch (reconcileError) {
        console.error('[Payment Status] Reconciliation failed', {
          orderId: order.id,
          error: reconcileError instanceof Error ? reconcileError.message : 'Unknown reconciliation error',
        });
      }
    }

    const refreshedWorkspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    const plan = PLANS[currentOrder.planId];
    return res.json({
      order: {
        id: currentOrder.id,
        provider: currentOrder.provider,
        planId: currentOrder.planId,
        planName: plan?.name || currentOrder.planId,
        amountIdr: currentOrder.amountIdr,
        status: currentOrder.status,
        transactionId: currentOrder.transactionId,
        paymentType: currentOrder.paymentType,
        paidAt: currentOrder.paidAt,
        createdAt: currentOrder.createdAt,
        creditsGranted: plan ? getPlanCreditsGranted(plan) : null,
      },
      workspace: refreshedWorkspace
        ? {
            creditsRemaining: refreshedWorkspace.plan.creditsRemaining,
            activePlan: refreshedWorkspace.plan.activePlan,
          }
        : null,
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    return res.status(500).json({ error: 'Failed to verify payment status.' });
  }
});

// GET /api/payments/recent
router.get('/recent', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });

    const recentPayments = await prisma.paymentOrder.findMany({
      where: workspace?.organizationId
        ? { organizationId: workspace.organizationId }
        : { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        planId: true,
        amountIdr: true,
        status: true,
        provider: true,
        paidAt: true,
        createdAt: true,
      },
    });

    return res.json(recentPayments);
  } catch (error) {
    console.error('Recent payments fetch error:', error);
    return res.status(500).json({ error: 'Failed to load recent payments.' });
  }
});

export default router;
