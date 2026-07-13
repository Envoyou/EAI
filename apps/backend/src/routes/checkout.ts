import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { getWorkspaceState } from '@/lib/user-workspace';
import { createCheckoutSession, calculateCheckoutDetails, PLANS } from '@/lib/payment';
import { processRpZeroCheckout } from '@/lib/payment-processing';
import { getAllFeatureFlags } from '@eai/shared/server';
import { createClerkClient } from '@clerk/backend';
import { prisma } from '@/lib/db';

const router = Router();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// GET /api/checkout/preview
router.get('/preview', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const plan = req.query.plan as string;

    if (!plan) {
      return res.status(400).json({ error: 'A plan is required.' });
    }
    const planDetails = PLANS[plan];
    if (!planDetails) {
      return res.status(400).json({ error: 'Plan not found.' });
    }

    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const preview = await calculateCheckoutDetails({
      planId: plan,
      userId,
      organizationId: workspace.organizationId,
    });

    return res.json(preview);
  } catch (error) {
    console.error('Checkout preview error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unexpected server error occurred.',
    });
  }
});

// POST /api/checkout
router.post('/', requireAuth, async (req, res) => {
  try {
    const featureFlags = await getAllFeatureFlags();
    if (featureFlags.maintenance_mode || !featureFlags.billing_checkout_enabled) {
      return res.status(503).json({
        error: featureFlags.maintenance_mode
          ? 'Checkout is temporarily paused for maintenance.'
          : 'Billing checkout is currently unavailable.',
      });
    }

    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const { plan, quotedAmountIdr } = req.body;

    if (!plan) {
      return res.status(400).json({ error: 'A plan is required.' });
    }
    const planDetails = PLANS[plan];
    if (!planDetails) {
      return res.status(400).json({ error: 'Plan not found.' });
    }

    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }
    if (workspace.organizationId && !workspace.isAdmin) {
      return res.status(403).json({ error: 'Only workspace admins can change plans.' });
    }

    const orgIdDb = workspace.organizationId;

    // Check if there is an active queued downgrade
    const hasQueuedDowngrade = await prisma.subscription.findFirst({
      where: {
        userId: orgIdDb ? undefined : userId,
        organizationId: orgIdDb || undefined,
        status: 'queued',
      },
    });

    if (hasQueuedDowngrade && planDetails.billingMonths === 12) {
      return res.status(409).json({
        error: 'You have a pending downgrade scheduled. Please cancel your scheduled downgrade first if you wish to purchase or renew a yearly plan.',
        code: 'QUEUED_DOWNGRADE_EXISTS',
      });
    }

    // Check active subscription
    const activeSub = await prisma.subscription.findFirst({
      where: {
        userId: orgIdDb ? undefined : userId,
        organizationId: orgIdDb || undefined,
        status: { in: ['active', 'cancels_at_period_end'] },
        currentPeriodEnd: { gt: new Date() },
      },
    });

    // Skenario: yearly to monthly -> Delayed Downgrade
    const isDowngradeFromYearly =
      activeSub &&
      PLANS[activeSub.plan]?.billingMonths === 12 &&
      planDetails.billingMonths !== 12;

    if (isDowngradeFromYearly) {
      const periodEnd = new Date(activeSub.currentPeriodEnd);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

      await prisma.$transaction(async (tx) => {
        // Mark active as cancels_at_period_end
        await tx.subscription.update({
          where: { id: activeSub.id },
          data: { status: 'cancels_at_period_end' },
        });

        // Create queued subscription
        await tx.subscription.create({
          data: {
            id: `sub_queued_${Date.now()}`,
            userId: orgIdDb ? null : userId,
            organizationId: orgIdDb,
            plan: plan,
            status: 'queued',
            currentPeriodStart: activeSub.currentPeriodEnd,
            currentPeriodEnd: periodEnd,
          },
        });
      });

      return res.json({
        queued: true,
        activatesOn: activeSub.currentPeriodEnd,
        redirectUrl: '/settings/billing',
      });
    }

    // Calculate dynamic pricing with prorata/balance discount
    const calc = await calculateCheckoutDetails({
      planId: plan,
      userId,
      organizationId: orgIdDb,
    });

    if (
      typeof quotedAmountIdr !== 'number' ||
      quotedAmountIdr !== calc.finalAmountIdr
    ) {
      return res.status(409).json({
        error: 'The checkout amount has changed. Refresh the pricing page and review the updated amount.',
      });
    }

    const user = await clerk.users.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Customer';
    const callbackUrl = new URL('/settings/billing', req.headers.origin || 'https://eai.envoyou.com').toString();

    const checkoutData = await createCheckoutSession({
      planId: plan,
      userId,
      organizationId: workspace.organizationId,
      userEmail: email,
      userName: name,
      callbackUrl,
    });

    // If Rp 0, immediately execute the checkout activation logic on the backend!
    if (checkoutData.isPaid) {
      await processRpZeroCheckout(checkoutData.orderId!);
    }

    return res.json(checkoutData);
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unexpected server error occurred.',
    });
  }
});

export default router;
