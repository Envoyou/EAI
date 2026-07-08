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

// GET /api/payments/:id/invoice
router.get('/:id/invoice', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const orderId = req.params.id;

    const [order, workspace] = await Promise.all([
      prisma.paymentOrder.findUnique({
        where: { id: orderId },
      }),
      getWorkspaceState(userId, {
        clerkOrganizationId: orgId,
        clerkOrganizationSlug: orgSlug,
        clerkOrganizationRole: orgRole,
      }),
    ]);

    if (!order) {
      return res.status(404).send('Payment order not found.');
    }

    const ownsOrder = order.organizationId
      ? workspace?.organizationId === order.organizationId
      : order.userId === userId;
    if (!ownsOrder) {
      return res.status(403).send('Forbidden');
    }

    if (order.status !== 'paid') {
      return res.status(400).send('Invoice is only available for paid orders.');
    }

    const plan = PLANS[order.planId];
    const planName = plan?.name || order.planId;
    const dateStr = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(order.paidAt || order.createdAt);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${order.id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
          .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); font-size: 16px; line-height: 24px; }
          .invoice-box table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; }
          .invoice-box table td { padding: 5px; vertical-align: top; }
          .invoice-box table tr td:nth-child(2) { text-align: right; }
          .invoice-box table tr.top table td { padding-bottom: 20px; }
          .invoice-box table tr.top table td.title { font-size: 45px; line-height: 45px; color: #2563eb; font-weight: bold; }
          .invoice-box table tr.information table td { padding-bottom: 40px; }
          .invoice-box table tr.heading td { background: #eee; border-bottom: 1px solid #ddd; font-weight: bold; }
          .invoice-box table tr.details td { padding-bottom: 20px; }
          .invoice-box table tr.item td { border-bottom: 1px solid #eee; }
          .invoice-box table tr.item.last td { border-bottom: none; }
          .invoice-box table tr.total td:nth-child(2) { border-top: 2px solid #eee; font-weight: bold; }
          .btn-print { display: block; max-width: 150px; margin: 20px auto; padding: 10px; background-color: #2563eb; color: #fff; text-align: center; border-radius: 5px; text-decoration: none; font-weight: bold; cursor: pointer; }
          @media print { .btn-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <table cellpadding="0" cellspacing="0">
            <tr class="top">
              <td colspan="2">
                <table>
                  <tr>
                    <td class="title">Envoyou AI</td>
                    <td>
                      Invoice #: ${order.id}<br>
                      Created: ${dateStr}<br>
                      Status: PAID
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr class="information">
              <td colspan="2">
                <table>
                  <tr>
                    <td>
                      Envoyou AI<br>
                      support@envoyou.com
                    </td>
                    <td>
                      Recipient:<br>
                      ${workspace?.organization?.name || workspace?.name || 'Workspace Member'}<br>
                      ${workspace?.email || ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr class="heading">
              <td>Payment Method</td>
              <td>Transaction ID</td>
            </tr>
            <tr class="details">
              <td>${order.paymentType || order.provider || 'Midtrans'}</td>
              <td>${order.transactionId || 'N/A'}</td>
            </tr>
            <tr class="heading">
              <td>Item</td>
              <td>Price</td>
            </tr>
            <tr class="item last">
              <td>${planName} Subscription / Credit Top-up</td>
              <td>Rp ${order.amountIdr.toLocaleString('id-ID')}</td>
            </tr>
            <tr class="total">
              <td></td>
              <td>Total: Rp ${order.amountIdr.toLocaleString('id-ID')}</td>
            </tr>
          </table>
        </div>
        <a class="btn-print" onclick="window.print()">Print Invoice</a>
      </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (error) {
    console.error('Invoice generation error:', error);
    return res.status(500).send('Failed to generate invoice.');
  }
});

export default router;
