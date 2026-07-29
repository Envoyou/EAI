import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '@/lib/db';
import { requireAuth } from '@/middleware/auth';
import { ResearchNotesArraySchema, SeoMetadataSchema } from '@eai/shared';
import { getWorkspaceState } from '@/lib/user-workspace';
import { preparePublicationDraft, resolvePublicationPackageStatus } from '@/routes/analyze/utils/text';
import { redisRateLimiter } from '@/middleware/rate-limit';
import {
  mergeConfirmedInternalUrls,
  readConfirmedInternalUrls,
} from '@/lib/confirmed-internal-links';
import {
  mergeQualityResolutions,
  readQualityResolutions,
} from '@/lib/quality-resolution-ledger';
import {
  ContentArtifactStage,
  ContentArtifactType,
  ContentSourceType,
} from '@prisma/client';
import { upsertContentArtifact } from '@/lib/content-memory';

const router = Router();

const HttpSourceUrlSchema = z.string().max(2000).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Source URL must use HTTP or HTTPS');

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
  isApplied: z.boolean().nullable().optional(),
  isAccepted: z.boolean().nullable().optional(),
  isVerified: z.boolean().nullable().optional(),
  verifiedSource: HttpSourceUrlSchema.nullable().optional(),
}).passthrough();

const EditorialResolutionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve_editorial_feedback'),
    feedback: z.array(EditorialFeedbackSchema),
    polishedDraft: z.string().max(100000),
    flags: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal('update_final_draft'),
    polishedDraft: z.string().min(1).max(100000),
  }),
  z.object({
    action: z.literal('update_publication_package'),
    publicationPackage: SeoMetadataSchema.extend({
      excerpt: z.string().min(1).max(300),
      metaTitle: z.string().min(1).max(80),
    }),
  }),
  z.object({
    action: z.literal('confirm_publication_package'),
  }),
]);

const HistoryItemPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  isPinned: z.boolean().optional(),
}).refine(
  ({ title, isPinned }) => title !== undefined || isPinned !== undefined,
  'A title or pin state is required'
);

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
    await upsertContentArtifact({
      organizationId: workspace.organizationId,
      createdByUserId: userId,
      artifactType: ContentArtifactType.DRAFT,
      sourceType: ContentSourceType.MANUAL_DRAFT,
      sourceId: log.id,
      currentStage: ContentArtifactStage.DRAFTING,
      title:
        typeof metadata?.workingTitle === 'string'
          ? metadata.workingTitle
          : typeof metadata?.title === 'string'
            ? metadata.title
            : undefined,
      topic:
        typeof metadata?.topic === 'string' ? metadata.topic : undefined,
      content: content || '',
    }).catch((artifactError) => {
      console.error(
        '[CONTENT_MEMORY] Failed to index manual draft:',
        artifactError
      );
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
        isPinned: true,
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
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

const autosaveRateLimiter = redisRateLimiter({
  namespace: 'history:autosave',
  windowMs: 60_000,
  max: 100,
  message: 'Too many autosave requests. Please try again later.',
});

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
    const existingArtifact = await prisma.contentArtifact.findFirst({
      where: {
        organizationId: workspace.organizationId,
        sourceId: id,
      },
      select: { sourceType: true },
    });
    await upsertContentArtifact({
      organizationId: workspace.organizationId,
      createdByUserId: userId,
      artifactType: ContentArtifactType.DRAFT,
      sourceType:
        existingArtifact?.sourceType ?? ContentSourceType.MANUAL_DRAFT,
      sourceId: id,
      currentStage: ContentArtifactStage.DRAFTING,
      title:
        newTitle ??
        (typeof updatedMetadata.workingTitle === 'string'
          ? updatedMetadata.workingTitle
          : typeof updatedMetadata.title === 'string'
            ? updatedMetadata.title
            : undefined),
      topic:
        typeof updatedMetadata.topic === 'string'
          ? updatedMetadata.topic
          : undefined,
      audience:
        typeof updatedMetadata.targetAudience === 'string'
          ? updatedMetadata.targetAudience
          : undefined,
      summary:
        typeof updatedMetadata.brief === 'string'
          ? updatedMetadata.brief
          : undefined,
      content: content ?? log.content,
    }).catch((artifactError) => {
      console.error(
        '[CONTENT_MEMORY] Failed to refresh autosaved draft:',
        artifactError
      );
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

    const systemMetadata =
      metadata._system && typeof metadata._system === 'object' && !Array.isArray(metadata._system)
        ? (metadata._system as Record<string, unknown>)
        : {};

    if (resolution.data.action === 'update_final_draft') {
      const nextPolishedDraft = preparePublicationDraft(resolution.data.polishedDraft);
      const publicationPackageStatus = resolvePublicationPackageStatus({
        storedStatus: metadata.publicationPackageStatus,
        hasPackage: Boolean(metadata.generatedMetadata),
        bodyChanged: true,
      });
      await prisma.analysisLog.update({
        where: { id },
        data: {
          feedback: [] as Prisma.InputJsonValue,
          flags: [] as Prisma.InputJsonValue,
          verdict: 'needs_review',
          summary: 'The final draft was edited and needs a content quality check.',
          metadata: {
            ...metadata,
            publicationPackageStatus,
            _system: {
              ...systemMetadata,
              polishedDraft: nextPolishedDraft,
              readiness: 'needs_review',
              publicationPackageStatus,
              qualityGateCheckedAt: null,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return res.json({
        success: true,
        polishedDraft: nextPolishedDraft,
        readiness: 'needs_review',
        publicationPackageStatus,
      });
    }

    if (resolution.data.action === 'update_publication_package') {
      if (systemMetadata.readiness !== 'ready') {
        return res.status(409).json({
          error: 'Complete or approve the current quality findings before saving publication metadata.',
        });
      }
      await prisma.analysisLog.update({
        where: { id },
        data: {
          metadata: {
            ...metadata,
            generatedMetadata: resolution.data.publicationPackage,
            publicationPackageStatus: 'current',
            _system: {
              ...systemMetadata,
              publicationPackageStatus: 'current',
              seoEditedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return res.json({
        success: true,
        generatedMetadata: resolution.data.publicationPackage,
        publicationPackageStatus: 'current',
      });
    }

    if (resolution.data.action === 'confirm_publication_package') {
      const publicationPackageStatus = resolvePublicationPackageStatus({
        storedStatus: metadata.publicationPackageStatus,
        hasPackage: Boolean(metadata.generatedMetadata),
      });
      const savedDraft = typeof systemMetadata.polishedDraft === 'string'
        ? preparePublicationDraft(systemMetadata.polishedDraft)
        : '';
      if (publicationPackageStatus === 'not_generated' || !savedDraft) {
        return res.status(409).json({
          error: 'Generate and save publication metadata before confirming it.',
        });
      }

      const confirmedAt = new Date().toISOString();
      await prisma.analysisLog.update({
        where: { id },
        data: {
          metadata: {
            ...metadata,
            publicationPackageStatus: 'current',
            _system: {
              ...systemMetadata,
              publicationPackageStatus: 'current',
              seoConfirmedAt: confirmedAt,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return res.json({
        success: true,
        publicationPackageStatus: 'current',
        confirmedAt,
      });
    }

    const unresolved = resolution.data.feedback.filter(
      (item) => item.status !== 'pass' && !item.isApplied && !item.isAccepted && !item.isVerified
    );
    const previousPolishedDraft = typeof systemMetadata.polishedDraft === 'string'
      ? preparePublicationDraft(systemMetadata.polishedDraft)
      : '';
    const nextPolishedDraft = preparePublicationDraft(resolution.data.polishedDraft);
    const bodyChanged = previousPolishedDraft !== nextPolishedDraft;
    const publicationPackageStatus = resolvePublicationPackageStatus({
      storedStatus: metadata.publicationPackageStatus,
      hasPackage: Boolean(metadata.generatedMetadata),
      bodyChanged,
    });
    const readiness = bodyChanged
      ? 'needs_review'
      : unresolved.length === 0
        ? 'ready'
        : systemMetadata.readiness === 'blocked' && unresolved.some((item) => item.status === 'fail')
          ? 'blocked'
          : 'needs_review';
    const confirmedInternalUrls = mergeConfirmedInternalUrls(
      readConfirmedInternalUrls(systemMetadata),
      resolution.data.feedback
    );
    const resolvedQualityFindings = mergeQualityResolutions(
      readQualityResolutions(systemMetadata),
      resolution.data.feedback
    );

    await prisma.analysisLog.update({
      where: { id },
      data: {
        feedback: resolution.data.feedback as Prisma.InputJsonValue,
        flags: (readiness === 'ready' ? [] : resolution.data.flags ?? []) as Prisma.InputJsonValue,
        verdict: readiness,
        metadata: {
          ...metadata,
          publicationPackageStatus,
          _system: {
            ...systemMetadata,
            polishedDraft: nextPolishedDraft,
            readiness,
            publicationPackageStatus,
            confirmedInternalUrls,
            resolvedQualityFindings,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return res.json({ success: true, readiness, publicationPackageStatus });
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

    const validation = HistoryItemPatchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.issues[0]?.message || 'Invalid history update',
      });
    }

    const { title, isPinned } = validation.data;
    const metadata =
      log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};

    await prisma.analysisLog.update({
      where: { id },
      data: {
        ...(title !== undefined
          ? {
              metadata: {
                ...metadata,
                title,
              } as Prisma.InputJsonValue,
            }
          : {}),
        ...(isPinned !== undefined ? { isPinned } : {}),
      },
    });

    return res.json({ success: true, isPinned });
  } catch (error) {
    console.error('[HISTORY_ID_PATCH]', error);
    return res.status(500).json({ error: 'Failed to update history item' });
  }
});

export default router;
