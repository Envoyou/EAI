import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getPaymentGateway, getPlanCreditsGranted, PLANS, getPlanPeriodEnd, getFriendlyInvoiceNumber } from '@/lib/payment';
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

    const friendlyInvoiceId = getFriendlyInvoiceNumber(order.id, order.paidAt || order.createdAt);

    const startDate = order.paidAt || order.createdAt;
    let periodText = '';
    if (plan && plan.billingMonths > 0) {
      const endDate = getPlanPeriodEnd(plan, startDate);
      const startStr = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(startDate);
      const endStr = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(endDate);
      periodText = `Period: ${startStr} – ${endStr}`;
    } else {
      periodText = 'One-time credit top-up (No expiration)';
    }

    const priceUsd = plan?.priceUsd || 0;
    const rateUsed = priceUsd > 0 ? Math.round(order.amountIdr / priceUsd) : 0;
    const rateNote = priceUsd > 0 ? `Billed as $${priceUsd} USD. Exchange Rate: 1 USD = Rp ${rateUsed.toLocaleString('id-ID')}` : '';

    const formatPaymentType = (type: string | null) => {
      if (!type) return 'N/A';
      const mapping: Record<string, string> = {
        bank_transfer: 'Bank Transfer',
        credit_card: 'Credit Card',
        gopay: 'GoPay',
        qris: 'QRIS',
        shopeepay: 'ShopeePay',
      };
      return mapping[type.toLowerCase()] || type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const subtotal = Math.round(order.amountIdr / 1.11);
    const taxAmount = order.amountIdr - subtotal;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${friendlyInvoiceId}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            background-color: #f8fafc;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-container {
            max-width: 850px;
            margin: 0 auto;
            background: #ffffff;
            padding: 40px;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
          }
          .header-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 30px;
            margin-bottom: 30px;
            align-items: center;
          }
          .logo-container svg {
            width: 180px;
            height: auto;
            color: #2563eb;
          }
          .meta-box {
            text-align: right;
          }
          .meta-box h1 {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.025em;
          }
          .meta-box p {
            margin: 4px 0;
            font-size: 13px;
            color: #64748b;
          }
          .meta-box .invoice-id {
            font-family: monospace;
            font-weight: 600;
            color: #334155;
          }
          .status-badge {
            display: inline-block;
            margin-top: 10px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-radius: 9999px;
            background-color: #dcfce7;
            color: #15803d;
            border: 1px solid #bbf7d0;
          }
          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 40px;
          }
          .details-col h3 {
            margin: 0 0 12px 0;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #94a3b8;
          }
          .details-col p {
            margin: 4px 0;
            font-size: 14px;
            line-height: 1.6;
            color: #334155;
          }
          .details-col .company-name {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          .table-section {
            margin-bottom: 40px;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
          }
          .invoice-table th {
            background-color: #f8fafc;
            padding: 14px 16px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            border-bottom: 2px solid #e2e8f0;
          }
          .invoice-table td {
            padding: 16px;
            font-size: 14px;
            color: #334155;
            border-bottom: 1px solid #f1f5f9;
          }
          .invoice-table td.amount-col {
            text-align: right;
            font-weight: 600;
          }
          .invoice-table th.amount-col {
            text-align: right;
          }
          .summary-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 40px;
          }
          .summary-box {
            width: 320px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
            color: #64748b;
          }
          .summary-row.total-row {
            border-top: 2px solid #e2e8f0;
            padding-top: 14px;
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
          }
          .legal-footer {
            border-top: 2px solid #f1f5f9;
            padding-top: 30px;
            margin-top: 40px;
            text-align: center;
          }
          .legal-footer p {
            margin: 4px 0;
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.6;
          }
          .legal-footer .thank-you {
            font-size: 14px;
            font-weight: 600;
            color: #475569;
            margin-bottom: 12px;
          }
          .legal-footer .policy-links {
            margin-top: 16px;
          }
          .legal-footer .policy-links a {
            color: #2563eb;
            text-decoration: none;
            margin: 0 10px;
            font-weight: 500;
          }
          .legal-footer .policy-links a:hover {
            text-decoration: underline;
          }
          .action-bar {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 30px;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 600;
            border-radius: 8px;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .btn-primary {
            background-color: #2563eb;
            color: #ffffff;
            border: none;
          }
          .btn-primary:hover {
            background-color: #1d4ed8;
          }
          .btn-outline {
            background-color: #ffffff;
            color: #475569;
            border: 1px solid #cbd5e1;
          }
          .btn-outline:hover {
            background-color: #f8fafc;
            color: #1e293b;
          }
          @media print {
            body {
              background-color: #ffffff;
              padding: 0;
            }
            .invoice-container {
              border: none;
              box-shadow: none;
              padding: 0;
            }
            .action-bar {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header-grid">
            <div class="logo-container">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 230">
                <path fill="currentColor" d="M308.4 10.3c-2.8 1.4-6.6 4.2-8.4 6.4s-10.6 17-19.5 32.9c-8.8 15.9-23 41-31.4 55.9-13.6 24-38.5 68.6-57.5 103l-6.6 12 19.1.3c20.6.3 25.1-.4 29.9-4.4 4.6-3.9 6.9-7.7 28.5-45.9 40-70.9 51.8-91.7 53.4-93.6 1.5-1.9 2.5-.4 19.9 30.9 10 18.1 18.2 33.4 18.2 34.1 0 1.1-2.6 1.2-12.7.7-14.3-.8-25.2.3-30.8 2.9-7 3.4-13.7 10.7-21.2 23.4-4 6.6-7.3 12.3-7.3 12.6s20.1.5 44.8.6c24.6.1 45.8.4 47.1.8 1.7.5 4.2 4.1 9.7 14.1 8.7 15.8 14 21.5 20.7 22.5 2.3.3 12.8.5 23.4.3l19.2-.3-3.9-6.7c-3.4-6-17.2-30.9-70.8-128.8-28.7-52.4-34.4-62.6-37.5-66.7-6.6-8.6-17-11.4-26.3-7M52.9 17.6c-12.5 3.2-20 7.5-29.5 16.9-6.2 6.1-9 9.8-11.7 15.5C5 63.7 5 63.9 5 119c0 54.5.2 56.5 6.2 68.9 4.6 9.5 16.9 21.6 26.8 26.5 13.2 6.4 16.6 6.7 67.9 6.4l45.6-.3 5.3-2.8c9.9-5.2 16.5-13.1 27-32l3.2-5.7h-60.8c-65.6 0-68.3-.2-72.9-5.2-4.1-4.6-4.7-7-5.1-22l-.4-14.7 53.3-.3 53.4-.3 3.3-2.3c3.1-2.3 8.8-11.2 18.5-29.4 2.6-4.7 4.7-8.9 4.7-9.2s-30-.6-66.6-.6H47.8l.4-12.9c.3-11.6.6-13.2 2.8-16.4 1.4-2 4.3-4.6 6.5-5.9l4-2.3 69.8-.5 69.8-.5L211.6 38c5.8-10.7 10.9-19.9 11.5-20.4.5-.6.9-1.3.9-1.7 0-.5-36.5-.7-81.1-.6-80.5.1-81.2.1-90 2.3m406.3 4c-22.8 11.4-16 46 9.6 48.2 7.3.6 13.4-1.4 18.8-6.1 10.6-9.4 12.2-22.3 4.1-34.3-6.7-10.1-21.1-13.5-32.5-7.8M451 96.2c0 .2-.1 22.8-.1 50.3-.2 55.7-.4 53.6 6.8 61.6 6.3 6.9 21.1 12.8 32.4 12.9h3.6l.5-37.2c.4-20.5.4-48.7.1-62.6l-.6-25.2h-21.3c-11.8 0-21.4.1-21.4.2"/>
              </svg>
            </div>
            <div class="meta-box">
              <h1>INVOICE</h1>
              <p>Invoice No: <span class="invoice-id">${friendlyInvoiceId}</span></p>
              <p>Date: ${dateStr}</p>
              <p style="margin: 4px 0; font-size: 13px; color: #64748b;"><strong>Paid via:</strong> ${order.provider === 'midtrans' ? 'Midtrans' : 'Doku'} - ${formatPaymentType(order.paymentType)}</p>
              <div class="status-badge">PAID</div>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-col">
              <h3>FROM</h3>
              <p class="company-name">EAI Editorial Intelligence</p>
              <p>Jl. Kh Wahid Hasyim, Banyuwangi</p>
              <p>Jawa Timur, 68482, Indonesia</p>
              <p style="margin-top: 8px;">NPWP: 93.115.884.4-627.000</p>
            </div>
            <div class="details-col">
              <h3>TO</h3>
              <p class="company-name">${workspace?.name || 'Workspace Member'}</p>
              ${workspace?.organization ? `<p><strong>Company:</strong> ${workspace.organization.name}</p>` : ''}
              ${workspace?.organization?.npwp ? `<p><strong>NPWP:</strong> ${workspace.organization.npwp}</p>` : ''}
              <p><strong>Email:</strong> ${workspace?.email || 'N/A'}</p>
              <p style="margin-top: 8px;"><strong>Billing Address:</strong></p>
              <p>
                ${workspace?.organization?.billingAddress || 'Indonesia'}
              </p>
            </div>
          </div>

          <div class="table-section">
            <table class="invoice-table">
              <thead>
                <tr>
                  <th>Item Description</th>
                  <th class="amount-col">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>${planName} Plan</strong><br>
                    <span style="font-size: 12px; color: #64748b;">${periodText}</span><br>
                    ${rateNote ? `<span style="font-size: 11px; color: #94a3b8;">${rateNote}</span>` : ''}
                  </td>
                  <td class="amount-col">Rp ${subtotal.toLocaleString('id-ID')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="summary-section">
            <div class="summary-box">
              <div class="summary-row">
                <span>Subtotal</span>
                <span>Rp ${subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div class="summary-row">
                <span>PPN (11%)</span>
                <span>Rp ${taxAmount.toLocaleString('id-ID')}</span>
              </div>
              <div class="summary-row total-row">
                <span>Total Paid</span>
                <span>Rp ${order.amountIdr.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          <div class="legal-footer">
            <p class="thank-you">Thank you for your business!</p>
            <p>This is a computer-generated invoice and requires no signature.</p>
            <p>If you have any questions, please contact support@envoyou.com</p>
            <p>Product: <a href="https://eai.envoyou.com" target="_blank">eai.envoyou.com</a> | Main Site: <a href="https://www.envoyou.com" target="_blank">www.envoyou.com</a> | Telp: +62 812 1637 5648</p>
            <p>Registered in Indonesia — NIB: 1410240116491 | PSE: 141024011649100010002</p>
            <div class="policy-links" style="margin-bottom: 20px;">
              <a href="https://www.envoyou.com/terms" target="_blank">Terms of Service</a> |
              <a href="https://www.envoyou.com/privacy" target="_blank">Privacy Policy</a> |
              <a href="https://www.envoyou.com/refund" target="_blank">Refund Policy</a>
            </div>
            <p style="font-style: italic; color: #64748b; font-size: 11px; margin-top: 20px; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.5;">
              "Build with the ambition of the world's best. Measure progress against who you were six months ago."
            </p>
            <p style="font-size: 10px; color: #94a3b8; margin-top: 25px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
              Powered by Envoyou
            </p>
          </div>
        </div>

        <div class="action-bar">
          <button class="btn btn-primary" onclick="window.print()">Print / PDF</button>
          <a href="/settings/billing" class="btn btn-outline">Back to Billing</a>
        </div>
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
