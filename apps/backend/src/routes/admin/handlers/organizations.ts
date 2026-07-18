import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { redisConnection } from '@/lib/queue';
import {
  adjustOrganizationCredits,
  getBillingOrganizationDetail,
  overrideOrganizationSubscription,
  searchBillingOrganizations,
} from '@/lib/admin-billing';
import { getZohoDeskTicket, isZohoDeskEnabled } from '@/lib/zoho-desk';
import { getActor } from '../utils';
import { AdjustmentSchema, OverridePlanSchema, AiConfigSchema } from '../types';

const router = Router();

// GET /api/admin/billing
router.get('/billing', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const organizationId = (req.query.organizationId as string)?.trim();
    if (organizationId) {
      const organization = await getBillingOrganizationDetail(organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Active organization not found' });
      }
      return res.json({ organization });
    }

    const query = (req.query.q as string)?.trim() || '';
    const organizations = query.length >= 2
      ? await searchBillingOrganizations(query)
      : [];

    return res.json({
      actor,
      organizations,
    });
  } catch (error) {
    console.error('[ADMIN_BILLING_GET]', error);
    return res.status(500).json({ error: 'Failed to load billing administration data' });
  }
});

// POST /api/admin/billing
router.post('/billing', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const parsed = AdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid credit adjustment',
        issues: parsed.error.flatten(),
      });
    }

    const zohoTicket = isZohoDeskEnabled()
      ? await getZohoDeskTicket(parsed.data.ticketReference)
      : null;
    const result = await adjustOrganizationCredits(actor, {
      ...parsed.data,
      ticketReference: zohoTicket?.ticketNumber || parsed.data.ticketReference,
      externalTicketId: zohoTicket?.id,
      externalTicketUrl: zohoTicket?.url,
    });

    await logAuditEvent({
      action: 'credit.adjust',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: result.organizationId,
      targetType: 'Tenant',
      description: `Adjusted credits for organization: ${parsed.data.direction === 'add' ? '+' : '-'}${parsed.data.amount} credits. Reason: ${parsed.data.reason}`,
      details: {
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        ticketReference: parsed.data.ticketReference,
      },
    });

    const organization = await getBillingOrganizationDetail(result.organizationId);

    return res.json({
      success: true,
      duplicate: result.duplicate,
      balance: result.balance,
      organization,
      ticket: zohoTicket,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'This adjustment has already been processed.' });
      }
      if (error.code === 'P2034') {
        return res.status(409).json({ error: 'The balance changed during the adjustment. Review it and retry.' });
      }
    }

    const message = error instanceof Error ? error.message : 'Failed to adjust credits';
    const isExpected = /not found|cannot deduct|changed during/i.test(message);
    console.error('[ADMIN_BILLING_POST]', error);
    return res.status(isExpected ? 409 : 500).json({ error: message });
  }
});

// POST /api/admin/billing/override-plan
router.post('/billing/override-plan', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const parsed = OverridePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid plan override request',
        issues: parsed.error.flatten(),
      });
    }

    const zohoTicket = isZohoDeskEnabled()
      ? await getZohoDeskTicket(parsed.data.ticketReference)
      : null;

    const subscription = await overrideOrganizationSubscription(actor, {
      ...parsed.data,
      ticketReference: zohoTicket?.ticketNumber || parsed.data.ticketReference,
      externalTicketId: zohoTicket?.id,
      externalTicketUrl: zohoTicket?.url,
    });

    await logAuditEvent({
      action: 'tenant.subscription.override',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: parsed.data.organizationId,
      targetType: 'Tenant',
      description: `Overrode organization subscription plan to: ${parsed.data.plan} for ${parsed.data.durationDays} days. Reason: ${parsed.data.reason}`,
      details: {
        plan: parsed.data.plan,
        durationDays: parsed.data.durationDays,
        reason: parsed.data.reason,
      },
    });

    const organization = await getBillingOrganizationDetail(parsed.data.organizationId);

    return res.json({
      success: true,
      subscription,
      organization,
      ticket: zohoTicket,
    });
  } catch (error) {
    console.error('[ADMIN_BILLING_OVERRIDE_PLAN]', error);
    const message = error instanceof Error ? error.message : 'Failed to override plan';
    return res.status(500).json({ error: message });
  }
});

// GET /api/admin/billing/ticket
router.get('/billing/ticket', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }
    if (!isZohoDeskEnabled()) {
      return res.status(503).json({ error: 'Zoho Desk integration is disabled' });
    }

    const reference = (req.query.reference as string)?.trim() || '';
    if (!reference) {
      return res.status(400).json({ error: 'Ticket reference is required' });
    }

    const ticket = await getZohoDeskTicket(reference);
    return res.json({ ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify Zoho Desk ticket';
    const status = /not found/i.test(message) ? 404 : /configuration|oauth|disabled/i.test(message) ? 503 : 502;
    console.error('[ADMIN_BILLING_TICKET_GET]', error);
    return res.status(status).json({ error: message });
  }
});

// GET /api/admin/organizations/:id/ai-config
router.get('/organizations/:id/ai-config', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const orgId = req.params.id;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, aiProviderOverride: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    let provider = 'gemini';
    let model = '';

    if (org.aiProviderOverride) {
      if (org.aiProviderOverride.includes(':')) {
        const parts = org.aiProviderOverride.split(':');
        provider = parts[0];
        model = parts[1] || '';
      } else {
        provider = org.aiProviderOverride;
      }
    }

    return res.json({
      organizationId: org.id,
      name: org.name,
      provider,
      model,
    });
  } catch (error) {
    console.error('[ADMIN_AI_CONFIG_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch AI configuration' });
  }
});

// PUT /api/admin/organizations/:id/ai-config
router.put('/organizations/:id/ai-config', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const orgId = req.params.id;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, aiProviderOverride: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const parsed = AiConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid config payload', issues: parsed.error.flatten() });
    }

    const { provider, model } = parsed.data;
    const value = model ? `${provider}:${model}` : provider;
    const oldVal = org.aiProviderOverride;

    await prisma.organization.update({
      where: { id: orgId },
      data: { aiProviderOverride: value },
    });

    // Invalidate Cache
    const cacheKey = `ai_config:org:${orgId}`;
    try {
      await redisConnection.del(cacheKey);
    } catch (cacheErr) {
      console.warn(`[ADMIN_AI_CONFIG_PUT] Failed to clear Redis cache:`, cacheErr);
    }

    // Log Audit Event
    await logAuditEvent({
      action: 'tenant.ai_config.update',
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: orgId,
      targetType: 'Tenant',
      description: `Updated Refine AI Engine config for organization "${org.name}" to provider: ${provider}, model: ${model || 'default'}`,
      details: {
        oldValue: oldVal,
        newValue: value,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_AI_CONFIG_PUT]', error);
    return res.status(500).json({ error: 'Failed to update AI configuration' });
  }
});

export default router;
