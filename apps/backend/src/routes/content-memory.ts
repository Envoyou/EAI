import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getWorkspaceState } from '@/lib/user-workspace';
import {
  evaluateContentDuplicates,
  recordDuplicateGuardEvent,
} from '@/lib/content-memory';
import { ContentArtifactStatus } from '@prisma/client';

const router = Router();

const ContentMemoryCheckSchema = z.object({
  title: z.string().max(500).optional(),
  topic: z.string().max(2_000).optional(),
  angle: z.string().max(2_000).optional(),
  audience: z.string().max(1_000).optional(),
  primaryKeyword: z.string().max(300).optional(),
  searchIntent: z.string().max(1_000).optional(),
  outline: z.union([z.string().max(25_000), z.array(z.string().max(2_000)).max(100)]).optional(),
  summary: z.string().max(5_000).optional(),
  content: z.string().max(100_000).optional(),
  language: z.string().max(30).optional(),
  locale: z.string().max(30).optional(),
  market: z.string().max(100).optional(),
}).refine(
  (input) => Boolean(input.title || input.topic || input.angle || input.content),
  'A title, topic, angle, or content is required'
);

const resolveWorkspace = async (req: Request) => {
  const { userId, orgId, orgSlug, orgRole } = req.auth!;
  return getWorkspaceState(userId, {
    clerkOrganizationId: orgId,
    clerkOrganizationSlug: orgSlug,
    clerkOrganizationRole: orgRole,
  });
};

// Detection and disclosure remain separate: this endpoint exposes only
// collaboration-safe metadata, never indexed body text or private chat.
router.get('/', requireAuth, async (req, res) => {
  try {
    const workspace = await resolveWorkspace(req);
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100))
      : 50;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim().slice(0, 500)
        : '';
    const artifacts = await prisma.contentArtifact.findMany({
      where: {
        organizationId: workspace.organizationId,
        status: {
          in: [ContentArtifactStatus.ACTIVE, ContentArtifactStatus.ARCHIVED],
        },
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { topic: { contains: search, mode: 'insensitive' } },
                { angle: { contains: search, mode: 'insensitive' } },
                {
                  primaryKeyword: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        artifactType: true,
        sourceType: true,
        title: true,
        topic: true,
        angle: true,
        audience: true,
        primaryKeyword: true,
        searchIntent: true,
        currentStage: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
    });
    const hasMore = artifacts.length > limit;
    const data = hasMore ? artifacts.slice(0, limit) : artifacts;
    return res.json({
      data,
      nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    console.error('[CONTENT_MEMORY_LIST]', error);
    return res.status(500).json({ error: 'Failed to load Content Memory' });
  }
});

router.post('/check', requireAuth, async (req, res) => {
  try {
    const input = ContentMemoryCheckSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({
        error: 'Invalid Content Memory check',
        issues: input.error.issues,
      });
    }
    const workspace = await resolveWorkspace(req);
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }

    const result = await evaluateContentDuplicates({
      organizationId: workspace.organizationId,
      input: input.data,
    });
    await recordDuplicateGuardEvent({
      organizationId: workspace.organizationId,
      userId: req.auth!.userId,
      input: input.data,
      result,
    }).catch((eventError) => {
      console.error(
        '[CONTENT_MEMORY_CHECK_EVENT] Failed to record telemetry:',
        eventError
      );
    });
    return res.json(result);
  } catch (error) {
    console.error('[CONTENT_MEMORY_CHECK]', error);
    return res.status(500).json({ error: 'Failed to check related content' });
  }
});

export default router;
