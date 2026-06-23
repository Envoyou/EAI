import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '@/lib/db';
import { requireAuth } from '@/middleware/auth';
import { FeedbackItemSchema } from '@eai/shared';
import { getWorkspaceState } from '@/lib/user-workspace';

const router = Router();

const EditorialFeedbackSchema = FeedbackItemSchema.extend({
  isAccepted: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  verifiedSource: z.string().max(2000).optional(),
});

const EditorialResolutionSchema = z.object({
  action: z.literal('resolve_editorial_feedback'),
  feedback: z.array(EditorialFeedbackSchema).max(5),
  polishedDraft: z.string().max(25000),
  flags: z.array(z.string().max(100)).max(3).optional(),
});

const canAccessLog = (
  log: { organizationId: string | null; userId: string | null },
  workspaceOrganizationId: string | null | undefined,
  userId: string
) => Boolean(workspaceOrganizationId && log.organizationId === workspaceOrganizationId)
  || (!log.organizationId && log.userId === userId);

// GET /api/history
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const search = (req.query.search as string) || '';
    const filter = (req.query.filter as string) || 'All';
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const cursor = req.query.cursor as string | undefined;

    const whereClause: Prisma.AnalysisLogWhereInput = {
      status: 'success',
      organizationId: workspace.organizationId,
    };

    if (filter !== 'All') {
      whereClause.verdict = filter;
    }

    if (search) {
      whereClause.summary = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const queryOptions: Prisma.AnalysisLogFindManyArgs = {
      where: whereClause,
      select: {
        id: true,
        createdAt: true,
        role: true,
        metadata: true,
        score: true,
        verdict: true,
        summary: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit + 1,
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    }

    const history = await prisma.analysisLog.findMany(queryOptions);

    let nextCursor = null;
    if (history.length > limit) {
      const nextItem = history.pop();
      nextCursor = nextItem?.id;
    }

    return res.json({
      data: history,
      nextCursor,
    });
  } catch (error) {
    console.error('[HISTORY_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/history/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID not found' });
    }

    const log = await prisma.analysisLog.findUnique({
      where: { id },
    });

    if (!log) {
      return res.status(404).json({ error: 'History not found' });
    }

    if (!canAccessLog(log, workspace.organizationId, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    return res.json(log);
  } catch (error) {
    console.error('[HISTORY_ID_GET]', error);
    return res.status(500).json({ error: 'Failed to fetch history details' });
  }
});

// DELETE /api/history/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID not found' });
    }

    const log = await prisma.analysisLog.findUnique({
      where: { id },
    });

    if (!log) {
      return res.status(404).json({ error: 'History not found' });
    }

    if (!canAccessLog(log, workspace.organizationId, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.analysisLog.delete({
      where: { id },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[HISTORY_ID_DELETE]', error);
    return res.status(500).json({ error: 'Failed to delete history item' });
  }
});

// PATCH /api/history/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { userId, orgId, orgSlug, orgRole } = req.auth!;
    const workspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID not found' });
    }

    const log = await prisma.analysisLog.findUnique({
      where: { id },
    });

    if (!log) {
      return res.status(404).json({ error: 'History not found' });
    }

    if (!canAccessLog(log, workspace.organizationId, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const metadata =
      log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, any>)
        : {};

    const resolution = EditorialResolutionSchema.safeParse(req.body);
    if (resolution.success) {
      const unresolved = resolution.data.feedback.filter(
        (item) => item.status !== 'pass' && !item.isAccepted && !item.isVerified
      );
      const systemMetadata =
        metadata._system && typeof metadata._system === 'object' && !Array.isArray(metadata._system)
          ? (metadata._system as Record<string, any>)
          : {};
      const readiness = unresolved.length === 0
        ? 'ready'
        : systemMetadata.readiness === 'blocked' && unresolved.some((item) => item.status === 'fail')
          ? 'blocked'
          : 'needs_review';

      await prisma.analysisLog.update({
        where: { id },
        data: {
          feedback: resolution.data.feedback as Prisma.InputJsonValue,
          flags: (readiness === 'ready' ? [] : resolution.data.flags ?? []) as Prisma.InputJsonValue,
          verdict: readiness,
          metadata: {
            ...metadata,
            _system: {
              ...systemMetadata,
              polishedDraft: resolution.data.polishedDraft,
              readiness,
            },
          } as Prisma.InputJsonValue,
        },
      });

      return res.json({ success: true, readiness });
    }

    const title = req.body?.title;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'A title or valid editorial resolution is required' });
    }
    
    await prisma.analysisLog.update({
      where: { id },
      data: {
        metadata: {
          ...metadata,
          title,
        } as Prisma.InputJsonValue,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[HISTORY_ID_PATCH]', error);
    return res.status(500).json({ error: 'Failed to update history item' });
  }
});

export default router;
