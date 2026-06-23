import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { getWorkspaceState } from '@/lib/user-workspace';
import { createCheckoutSession, getPlanAmountIdr, PLANS } from '@/lib/payment';
import { getAllFeatureFlags } from '@eai/shared/server';
import { createClerkClient } from '@clerk/backend';

const router = Router();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

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
    if (
      typeof quotedAmountIdr !== 'number' ||
      quotedAmountIdr !== getPlanAmountIdr(planDetails)
    ) {
      return res.status(409).json({
        error: 'The checkout amount has changed. Refresh the pricing page and review the updated amount.',
      });
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

    const user = await clerk.users.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Customer';
    const callbackUrl = new URL('/pricing', req.headers.origin || 'https://eai.envoyou.com').toString();

    const checkoutData = await createCheckoutSession({
      planId: plan,
      userId,
      organizationId: workspace.organizationId,
      userEmail: email,
      userName: name,
      callbackUrl,
    });

    return res.json(checkoutData);
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unexpected server error occurred.',
    });
  }
});

export default router;
