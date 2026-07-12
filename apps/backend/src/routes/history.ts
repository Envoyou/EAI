import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '@/lib/db';
import { requireAuth } from '@/middleware/auth';
import { ResearchNotesArraySchema } from '@eai/shared';
import { getWorkspaceState } from '@/lib/user-workspace';

const router = Router();

const EditorialFeedbackSchema = z.object({
  category: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  verificationStatus: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  suggestion: z.string().nullable().optional(),
  targetText: z.string().nullable().optional(),
  replacementText: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  operation: z.string().nullable().optional(),
  isAccepted: z.boolean().nullable().optional(),
  isVerified: z.boolean().nullable().optional(),
  verifiedSource: z.string().max(2000).nullable().optional(),
}).passthrough();

const EditorialResolutionSchema = z.object({
  action: z.literal('resolve_editorial_feedback'),
  feedback: z.array(EditorialFeedbackSchema),
  polishedDraft: z.string().max(100000),
  flags: z.array(z.string()).optional(),
});

const canAccessLog = (
  log: { organizationId: string | null; userId: string | null },
  workspaceOrganizationId: string | null | undefined,
  userId: string
) => Boolean(workspaceOrganizationId && log.organizationId === workspaceOrganizationId)
  || (!log.organizationId && log.userId === userId);

// POST /api/history
router.post('/', requireAuth, async (req, res) => {
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

    const { content, metadata } = req.body;

    const log = await prisma.analysisLog.create({
      data: {
        role: 'editor',
        content: content || '',
        metadata: (metadata || {}) as Prisma.InputJsonValue,
        promptVersion: 'n/a',
        modelName: 'n/a',
        status: 'success',
        verdict: 'draft',
        userId,
        organizationId: workspace.organizationId,
      },
    });

    return res.json({ id: log.id });
  } catch (error) {
    console.error('[HISTORY_POST]', error);
    return res.status(500).json({ error: 'Failed to create manual draft' });
  }
});

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

const AutosaveSchema = z.object({
  action: z.literal('autosave_draft'),
  content: z.string().optional(),
  title: z.string().optional(),
  notes: ResearchNotesArraySchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}
const autosaveRateLimitStore = new Map<string, RateLimitBucket>();

function autosaveRateLimiter(req: Request, res: Response, next: NextFunction) {
  const userId = req.auth?.userId || 'anonymous';
  const key = `autosave:${userId}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const max = 100; // 100 requests per minute

  let bucket = autosaveRateLimitStore.get(key);
  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
    autosaveRateLimitStore.set(key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed > windowMs) {
    bucket.tokens = max;
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    return res.status(429).json({ error: 'Too many autosave requests. Please try again later.' });
  }

  bucket.tokens--;
  next();
}

// PATCH /api/history/:id/autosave
router.patch('/:id/autosave', requireAuth, autosaveRateLimiter, async (req, res) => {
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

    const validation = AutosaveSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid autosave data', details: validation.error.format() });
    }

    const { content, title: newTitle, notes, metadata: extraMetadata } = validation.data;
    const metadata =
      log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};

    const updatedMetadata = {
      ...metadata,
      ...(extraMetadata || {}),
    };

    if (newTitle !== undefined) {
      updatedMetadata.title = newTitle;
    }
    if (notes !== undefined) {
      updatedMetadata.researchNotes = notes;
    }

    await prisma.analysisLog.update({
      where: { id },
      data: {
        content: content !== undefined ? content : undefined,
        metadata: updatedMetadata as Prisma.InputJsonValue,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[HISTORY_ID_AUTOSAVE_PATCH]', error);
    return res.status(500).json({ error: 'Failed to autosave history item' });
  }
});

// PATCH /api/history/:id/resolve
router.patch('/:id/resolve', requireAuth, async (req, res) => {
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

    const resolution = EditorialResolutionSchema.safeParse(req.body);
    if (!resolution.success) {
      return res.status(400).json({ error: 'Invalid editorial resolution data', details: resolution.error.format() });
    }

    const metadata =
      log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};

    const unresolved = resolution.data.feedback.filter(
      (item) => item.status !== 'pass' && !item.isAccepted && !item.isVerified
    );
    const systemMetadata =
      metadata._system && typeof metadata._system === 'object' && !Array.isArray(metadata._system)
        ? (metadata._system as Record<string, unknown>)
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
  } catch (error) {
    console.error('[HISTORY_ID_RESOLVE_PATCH]', error);
    return res.status(500).json({ error: 'Failed to resolve editorial feedback' });
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

    // This base PATCH route is now only used for updating the title
    const title = req.body?.title;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'A valid title is required' });
    }

    const metadata =
      log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};
    
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
