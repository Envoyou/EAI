import { Router, type Request } from 'express';
import { z } from 'zod';
import { ContentIntelligenceActionSchema } from '@eai/shared';
import { requireAuth } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { getWorkspaceState } from '@/lib/user-workspace';
import {
  evaluateContentDuplicates,
  recordDuplicateGuardEvent,
} from '@/lib/content-memory';
import { classifyAmbiguousContentOverlap } from '@/lib/content-memory-classifier';
import { ContentArtifactStatus } from '@prisma/client';
import { getAllFeatureFlags } from '@eai/shared/server';
import {
  contentMemoryRolloutBucket,
  getContentMemoryCalibration,
  getContentMemoryEnforcementConfig,
} from '@/lib/content-memory-enforcement';
import { getContentIntelligenceSnapshot } from '@/lib/content-intelligence';
import {
  getArtifactPresentation,
  getContentArtifactPresentations,
} from '@/lib/content-artifact-presentation';
import {
  applyContentIntelligenceAction,
  ContentIntelligenceActionError,
} from '@/lib/content-intelligence-actions';

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

const ContentMemoryFeedbackSchema = z.object({
  requestId: z.uuid(),
  laterConfirmedDuplicate: z.boolean(),
  userAction: z
    .enum([
      'continued',
      'changed_angle',
      'opened_existing',
      'cancelled',
      'overrode_block',
    ])
    .optional(),
});

const resolveWorkspace = async (req: Request) => {
  const { userId, orgId, orgSlug, orgRole } = req.auth!;
  return getWorkspaceState(userId, {
    clerkOrganizationId: orgId,
    clerkOrganizationSlug: orgSlug,
    clerkOrganizationRole: orgRole,
  });
};

const canManageAllContent = (req: Request) =>
  req.auth?.orgRole === 'org:admin' ||
  req.auth?.orgRole === 'admin' ||
  req.auth?.orgRole === 'owner';

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
        createdByUserId: true,
        artifactType: true,
        sourceType: true,
        sourceId: true,
        canonicalArtifactId: true,
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
    const presentations = await getContentArtifactPresentations({
      organizationId: workspace.organizationId,
      artifacts: data,
      viewerUserId: req.auth!.userId,
      viewerCanManageAll: canManageAllContent(req),
    });
    return res.json({
      data: data.map((artifact) => {
        const presentation = getArtifactPresentation(
          presentations,
          artifact
        );
        const {
          createdByUserId: _createdByUserId,
          ...publicArtifact
        } = artifact;
        return {
          ...publicArtifact,
          title: presentation ? presentation.title : artifact.title,
          topic: presentation ? presentation.topic : artifact.topic,
          angle: presentation ? presentation.angle : artifact.angle,
          primaryKeyword: presentation
            ? presentation.primaryKeyword
            : artifact.primaryKeyword,
          searchIntent: presentation
            ? presentation.searchIntent
            : artifact.searchIntent,
          sourceId: presentation?.sourceId ?? artifact.sourceId,
          sourceHref: presentation?.sourceHref ?? null,
          ownerName:
            presentation?.ownerName ?? artifact.createdBy?.name ?? null,
          exportStatus:
            presentation?.exportStatus ?? 'not_exported',
          lastExportedAt: presentation?.lastExportedAt ?? null,
          canManage: presentation?.canManage ?? false,
        };
      }),
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

    const deterministicResult = await evaluateContentDuplicates({
      organizationId: workspace.organizationId,
      input: input.data,
    });
    const result = await classifyAmbiguousContentOverlap({
      organizationId: workspace.organizationId,
      userId: req.auth!.userId,
      input: input.data,
      result: deterministicResult,
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

router.get('/enforcement', requireAuth, async (req, res) => {
  try {
    const workspace = await resolveWorkspace(req);
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }
    const [flags, calibration, probableEvents, overrideEvents] =
      await Promise.all([
        getAllFeatureFlags(),
        getContentMemoryCalibration(workspace.organizationId),
        prisma.duplicateGuardEvent.findMany({
          where: {
            organizationId: workspace.organizationId,
            verdict: 'probable_duplicate',
            requestId: { not: null },
          },
          distinct: ['requestId'],
          select: { requestId: true },
        }),
        prisma.duplicateGuardEvent.findMany({
          where: {
            organizationId: workspace.organizationId,
            userAction: 'overrode_block',
            requestId: { not: null },
          },
          distinct: ['requestId'],
          select: { requestId: true },
        }),
      ]);
    const probableEventCount = probableEvents.length;
    const overrideCount = overrideEvents.length;
    const config = getContentMemoryEnforcementConfig();
    const rolloutBucket = contentMemoryRolloutBucket(
      workspace.organizationId
    );
    return res.json({
      featureEnabled: flags.content_memory_enforcement_enabled,
      inRollout: rolloutBucket < config.rolloutPercent,
      rolloutBucket,
      config,
      calibration,
      probableEventCount,
      overrideCount,
      overrideRate:
        probableEventCount > 0
          ? Number((overrideCount / probableEventCount).toFixed(4))
          : null,
    });
  } catch (error) {
    console.error('[CONTENT_MEMORY_ENFORCEMENT_STATUS]', error);
    return res
      .status(500)
      .json({ error: 'Failed to load Content Memory enforcement status' });
  }
});

router.get('/intelligence', requireAuth, async (req, res) => {
  try {
    const workspace = await resolveWorkspace(req);
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }
    const snapshot = await getContentIntelligenceSnapshot(
      workspace.organizationId,
      {
        userId: req.auth!.userId,
        canManageAll: canManageAllContent(req),
      }
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(snapshot);
  } catch (error) {
    console.error('[CONTENT_INTELLIGENCE]', error);
    return res
      .status(500)
      .json({ error: 'Failed to build Content Intelligence snapshot' });
  }
});

router.post('/intelligence/actions', requireAuth, async (req, res) => {
  try {
    const input = ContentIntelligenceActionSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({
        error: 'Invalid Content Intelligence action',
        issues: input.error.issues,
      });
    }
    const workspace = await resolveWorkspace(req);
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }
    const result = await applyContentIntelligenceAction({
      organizationId: workspace.organizationId,
      actorUserId: req.auth!.userId,
      actorCanManageAll: canManageAllContent(req),
      input: input.data,
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(result);
  } catch (error) {
    if (error instanceof ContentIntelligenceActionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[CONTENT_INTELLIGENCE_ACTION]', error);
    return res
      .status(500)
      .json({ error: 'Failed to apply Content Intelligence action' });
  }
});

router.post('/feedback', requireAuth, async (req, res) => {
  try {
    const input = ContentMemoryFeedbackSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({
        error: 'Invalid Content Memory feedback',
        issues: input.error.issues,
      });
    }
    const workspace = await resolveWorkspace(req);
    if (!workspace || workspace.needsOnboarding || !workspace.organizationId) {
      return res.status(409).json({ error: 'Workspace onboarding required' });
    }
    const event = await prisma.duplicateGuardEvent.findFirst({
      where: {
        organizationId: workspace.organizationId,
        requestId: input.data.requestId,
        verdict: 'probable_duplicate',
        actorUserId: req.auth!.userId,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!event) {
      return res.status(404).json({
        error: 'Eligible Duplicate Guard event not found',
      });
    }
    await prisma.duplicateGuardEvent.update({
      where: { id: event.id },
      data: {
        laterConfirmedDuplicate: input.data.laterConfirmedDuplicate,
        feedbackActorUserId: req.auth!.userId,
        feedbackAt: new Date(),
        ...(input.data.userAction
          ? { userAction: input.data.userAction }
          : {}),
      },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('[CONTENT_MEMORY_FEEDBACK]', error);
    return res
      .status(500)
      .json({ error: 'Failed to record Content Memory feedback' });
  }
});

export default router;
