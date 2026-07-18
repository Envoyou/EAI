import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { getActor } from '../utils';
import { AuditLogSchema } from '../types';

const router = Router();

// GET /api/admin/audit-logs
router.get('/audit-logs', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || '1'));
    const limit = Math.max(1, parseInt((req.query.limit as string) || '10'));
    const search = ((req.query.search as string) || '').trim();
    const actionFilter = ((req.query.action as string) || '').trim();

    const where: Prisma.AuditLogWhereInput = {};

    if (search) {
      where.OR = [
        { actorEmail: { contains: search, mode: 'insensitive' } },
        { targetId: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (actionFilter) {
      where.action = actionFilter;
    }

    const totalCount = await prisma.auditLog.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.json({
      logs,
      pagination: {
        totalCount,
        totalPages,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('[ADMIN_AUDIT_LOGS_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// POST /api/admin/audit-logs
router.post('/audit-logs', requireAuth, async (req, res) => {
  try {
    const { userId } = req.auth!;
    const actor = await getActor(userId);
    if (!actor) {
      return res.status(403).json({ error: 'Owner or super-admin access required' });
    }

    const parsed = AuditLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid audit payload', issues: parsed.error.flatten() });
    }

    const log = await logAuditEvent({
      action: parsed.data.action,
      actorId: actor.userId,
      actorEmail: actor.email,
      targetId: parsed.data.targetId,
      targetType: parsed.data.targetType,
      description: parsed.data.description,
      details: parsed.data.details,
    });

    return res.status(201).json({ success: true, log });
  } catch (error) {
    console.error('[ADMIN_AUDIT_LOGS_POST]', error);
    return res.status(500).json({ error: 'Failed to create audit log' });
  }
});

export default router;
