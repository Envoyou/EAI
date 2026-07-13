import { prisma } from '@/lib/db';

export async function logAuditEvent(params: {
  action: string;
  actorId: string;
  actorEmail: string;
  targetId?: string | null;
  targetType?: string | null;
  description?: string | null;
  details?: Record<string, unknown> | Array<unknown> | null;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        action: params.action,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        targetId: params.targetId || null,
        targetType: params.targetType || null,
        description: params.description || null,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
      },
    });
  } catch (error) {
    console.error('[AUDIT_LOG_ERROR] Failed to save audit log:', error);
  }
}
