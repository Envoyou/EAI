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
import { assessDraftRevision } from '@/lib/draft-revision-impact';
import { runSerializableTransaction } from '@/lib/serializable-transaction';
import {
  assertDraftRevisionMatches,
  createDraftChangeSet,
  DraftRevisionMismatchError,
  DraftChangeOriginSchema,
  readDraftRevisionIdentity,
} from '@/lib/draft-revision';
import {
  assignPersistentEditorialIdentities,
  restoreTrustedFeedbackIdentities,
} from '@/lib/editorial-identity';

const router = Router();

const HttpSourceUrlSchema = z.string().max(2000).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Source URL must use HTTP or HTTPS');

const EditorialFeedbackSchema = z.object({
  feedbackId: z.string().min(1).max(100).nullable().optional(),
  ruleId: z.string().min(1).max(100).nullable().optional(),
  claimId: z.string().min(1).max(100).nullable().optional(),
  blockId: z.string().min(1).max(100).nullable().optional(),
  sourceIds: z.array(z.string().min(1).max(100)).max(20).nullable().optional(),
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

const RevisionExpectationFields = {
  revisionId: z.string().min(1).max(100).optional(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
};

const EditorialResolutionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve_editorial_feedback'),
    feedback: z.array(EditorialFeedbackSchema),
    polishedDraft: z.string().max(100000),
    flags: z.array(z.string()).optional(),
    origin: DraftChangeOriginSchema.optional(),
    ...RevisionExpectationFields,
  }),
  z.object({
    action: z.literal('update_final_draft'),
    polishedDraft: z.string().min(1).max(100000),
    ...RevisionExpectationFields,
  }),
  z.object({
    action: z.literal('update_publication_package'),
    publicationPackage: SeoMetadataSchema.extend({
      excerpt: z.string().min(1).max(300),
      metaTitle: z.string().min(1).max(80),
    }),
    ...RevisionExpectationFields,
  }),
  z.object({
    action: z.literal('confirm_publication_package'),
    ...RevisionExpectationFields,
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

const updateAnalysisLogIfRevisionCurrent = async ({
  id,
  expectedRevisionId,
  expectedBodyHash,
  data,
}: {
  id: string;
  expectedRevisionId: string;
  expectedBodyHash: string;
  data: Prisma.AnalysisLogUpdateArgs['data'];
}): Promise<void> => {
  await runSerializableTransaction(async (tx) => {
    const current = await tx.analysisLog.findUnique({ where: { id } });
    if (!current) throw new Error('History not found');
    const metadata = current.metadata
      && typeof current.metadata === 'object'
      && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};
    const system = metadata._system
      && typeof metadata._system === 'object'
      && !Array.isArray(metadata._system)
        ? metadata._system as Record<string, unknown>
        : {};
    const currentBody = typeof system.polishedDraft === 'string'
      ? preparePublicationDraft(system.polishedDraft)
      : '';
    const currentRevision = readDraftRevisionIdentity({
      system,
      body: currentBody,
      fallbackCreatedAt: current.createdAt,
    });
    assertDraftRevisionMatches({
      current: currentRevision,
      expectedRevisionId,
      expectedBodyHash,
    });
    const requestedMetadata = data.metadata
      && typeof data.metadata === 'object'
      && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : null;
    const currentSystem = system;
    const requestedSystem = requestedMetadata?._system
      && typeof requestedMetadata._system === 'object'
      && !Array.isArray(requestedMetadata._system)
        ? requestedMetadata._system as Record<string, unknown>
        : {};
    const nextData: Prisma.AnalysisLogUpdateArgs['data'] = requestedMetadata
      ? {
          ...data,
          metadata: {
            ...metadata,
            ...requestedMetadata,
            _system: {
              ...currentSystem,
              ...requestedSystem,
            },
          } as Prisma.InputJsonValue,
        }
      : data;
    await tx.analysisLog.update({ where: { id }, data: nextData });
  });
};

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
    const storedPolishedDraft = typeof systemMetadata.polishedDraft === 'string'
      ? preparePublicationDraft(systemMetadata.polishedDraft)
      : '';
    const currentDraftRevision = readDraftRevisionIdentity({
      system: systemMetadata,
      body: storedPolishedDraft,
      fallbackCreatedAt: log.createdAt,
    });
    assertDraftRevisionMatches({
      current: currentDraftRevision,
      expectedRevisionId: resolution.data.revisionId,
      expectedBodyHash: resolution.data.bodyHash,
    });

    if (resolution.data.action === 'update_final_draft') {
      const nextPolishedDraft = preparePublicationDraft(resolution.data.polishedDraft);
      const previousPolishedDraft = typeof systemMetadata.polishedDraft === 'string'
        ? systemMetadata.polishedDraft
        : '';
      const protectedTargets = Array.isArray(log.feedback)
        ? log.feedback
            .map((item) =>
              item && typeof item === 'object' && !Array.isArray(item)
                ? (item as Record<string, unknown>).targetText
                : undefined
            )
            .filter((target): target is string => typeof target === 'string')
        : [];
      const assessment = assessDraftRevision({
        previousDraft: previousPolishedDraft,
        nextDraft: nextPolishedDraft,
        publicationMetadata:
          metadata.generatedMetadata && typeof metadata.generatedMetadata === 'object'
            ? metadata.generatedMetadata
            : null,
        protectedTargets,
      });
      const revisionState = createDraftChangeSet({
        previousBody: previousPolishedDraft,
        nextBody: nextPolishedDraft,
        origin: 'manual_edit',
        assessment,
        system: systemMetadata,
        fallbackCreatedAt: log.createdAt,
      });
      const invalidatesPublicationReview = assessment.validationLevel === 'full';
      const previousReadiness =
        systemMetadata.readiness === 'ready'
        || systemMetadata.readiness === 'needs_review'
        || systemMetadata.readiness === 'blocked'
          ? systemMetadata.readiness
          : 'needs_review';
      const readiness = invalidatesPublicationReview ? 'needs_review' : previousReadiness;
      const previousQualityGateState =
        systemMetadata.qualityGateState === 'valid'
        || systemMetadata.qualityGateState === 'validation_recommended'
        || systemMetadata.qualityGateState === 'stale'
          ? systemMetadata.qualityGateState
          : previousReadiness === 'ready'
            ? 'valid'
            : 'stale';
      const qualityGateState = previousQualityGateState === 'stale'
        ? 'stale'
        : assessment.qualityGateState === 'stale'
          ? 'stale'
          : assessment.qualityGateState === 'validation_recommended'
            ? 'validation_recommended'
            : previousQualityGateState;
      const previousSeoReviewState =
        systemMetadata.seoReviewState === 'valid'
        || systemMetadata.seoReviewState === 'possibly_stale'
        || systemMetadata.seoReviewState === 'stale'
          ? systemMetadata.seoReviewState
          : metadata.publicationPackageStatus === 'stale'
            ? 'stale'
            : 'valid';
      const seoReviewState = previousSeoReviewState === 'stale'
        ? 'stale'
        : assessment.seoReviewState === 'stale'
          ? 'stale'
          : assessment.seoReviewState === 'possibly_stale'
            ? 'possibly_stale'
            : previousSeoReviewState;
      const publicationPackageStatus = resolvePublicationPackageStatus({
        storedStatus: metadata.publicationPackageStatus,
        hasPackage: Boolean(metadata.generatedMetadata),
        bodyChanged: assessment.seoReviewState === 'stale',
      });
      await updateAnalysisLogIfRevisionCurrent({
        id,
        expectedRevisionId: currentDraftRevision.revisionId,
        expectedBodyHash: currentDraftRevision.bodyHash,
        data: {
          ...(invalidatesPublicationReview
            ? {
                feedback: [] as Prisma.InputJsonValue,
                flags: [] as Prisma.InputJsonValue,
                verdict: 'needs_review',
                summary: 'The final draft changed factual or source-sensitive content and needs a content quality check.',
              }
            : {}),
          metadata: {
            ...metadata,
            publicationPackageStatus,
            _system: {
              ...systemMetadata,
              polishedDraft: nextPolishedDraft,
              readiness,
              publicationPackageStatus,
              revisionImpact: assessment.impact,
              revisionValidationLevel: assessment.validationLevel,
              revisionValidationReasons: assessment.reasons,
              qualityGateState,
              seoReviewState,
              draftRevision: revisionState.draftRevision,
              contentBlocks: revisionState.contentBlocks,
              lastDraftChangeSet: revisionState.changeSet,
              finalDraftEditedAt: new Date().toISOString(),
              qualityGateCheckedAt: invalidatesPublicationReview
                ? null
                : systemMetadata.qualityGateCheckedAt,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return res.json({
        success: true,
        polishedDraft: nextPolishedDraft,
        readiness,
        publicationPackageStatus,
        revisionImpact: assessment.impact,
        revisionValidationLevel: assessment.validationLevel,
        revisionValidationReasons: assessment.reasons,
        qualityGateState,
        seoReviewState,
        draftRevision: revisionState.draftRevision,
        qualityCheckInvalidated: invalidatesPublicationReview,
        seoInvalidated: assessment.seoReviewState === 'stale' && publicationPackageStatus === 'stale',
      });
    }

    if (resolution.data.action === 'update_publication_package') {
      if (systemMetadata.readiness !== 'ready') {
        return res.status(409).json({
          error: 'Complete or approve the current quality findings before saving publication metadata.',
        });
      }
      await updateAnalysisLogIfRevisionCurrent({
        id,
        expectedRevisionId: currentDraftRevision.revisionId,
        expectedBodyHash: currentDraftRevision.bodyHash,
        data: {
          metadata: {
            ...metadata,
            generatedMetadata: resolution.data.publicationPackage,
            publicationPackageStatus: 'current',
            _system: {
              ...systemMetadata,
              publicationPackageStatus: 'current',
              seoReviewState: 'valid',
              draftRevision: currentDraftRevision,
              seoEditedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return res.json({
        success: true,
        generatedMetadata: resolution.data.publicationPackage,
        publicationPackageStatus: 'current',
        seoReviewState: 'valid',
        draftRevision: currentDraftRevision,
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
      await updateAnalysisLogIfRevisionCurrent({
        id,
        expectedRevisionId: currentDraftRevision.revisionId,
        expectedBodyHash: currentDraftRevision.bodyHash,
        data: {
          metadata: {
            ...metadata,
            publicationPackageStatus: 'current',
            _system: {
              ...systemMetadata,
              publicationPackageStatus: 'current',
              seoReviewState: 'valid',
              draftRevision: currentDraftRevision,
              seoConfirmedAt: confirmedAt,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return res.json({
        success: true,
        publicationPackageStatus: 'current',
        seoReviewState: 'valid',
        draftRevision: currentDraftRevision,
        confirmedAt,
      });
    }

    const storedFeedback = Array.isArray(log.feedback)
      ? log.feedback.filter(
          (item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        ) as unknown as import('@eai/shared').FeedbackItem[]
      : [];
    const trustedFeedback = restoreTrustedFeedbackIdentities({
      submitted: resolution.data.feedback as import('@eai/shared').FeedbackItem[],
      stored: storedFeedback,
    });
    const resolvedFeedback = trustedFeedback.feedback;
    const previousPolishedDraft = typeof systemMetadata.polishedDraft === 'string'
      ? preparePublicationDraft(systemMetadata.polishedDraft)
      : '';
    const parsedResearchNotes = ResearchNotesArraySchema.safeParse(metadata.researchNotes);
    const trustedIdentityUpdate = assignPersistentEditorialIdentities({
      feedback: trustedFeedback.trustedResolutions,
      finalDraft: previousPolishedDraft,
      system: systemMetadata,
      researchNotes: parsedResearchNotes.success ? parsedResearchNotes.data : [],
      fallbackCreatedAt: log.createdAt,
    });
    const trustedResolutionByLegacyKey = new Map(
      trustedFeedback.trustedResolutions.map((item, index) => [
        `${item.category}\u001f${item.targetText ?? item.message}`,
        trustedIdentityUpdate.feedback[index],
      ])
    );
    const identifiedResolvedFeedback = resolvedFeedback.map((item) =>
      trustedResolutionByLegacyKey.get(`${item.category}\u001f${item.targetText ?? item.message}`)
      ?? item
    );
    const unresolved = identifiedResolvedFeedback.filter(
      (item) => item.status !== 'pass' && !item.isApplied && !item.isAccepted && !item.isVerified
    );
    const nextPolishedDraft = preparePublicationDraft(resolution.data.polishedDraft);
    const bodyChanged = previousPolishedDraft !== nextPolishedDraft;
    const bodyChangeAssessment = bodyChanged
      ? assessDraftRevision({
          previousDraft: previousPolishedDraft,
          nextDraft: nextPolishedDraft,
          publicationMetadata:
            metadata.generatedMetadata && typeof metadata.generatedMetadata === 'object'
              ? metadata.generatedMetadata
              : null,
          protectedTargets: identifiedResolvedFeedback
            .map((item) => item.targetText)
            .filter((target): target is string => typeof target === 'string'),
        })
      : null;
    const revisionState = bodyChanged && bodyChangeAssessment
      ? createDraftChangeSet({
          previousBody: previousPolishedDraft,
          nextBody: nextPolishedDraft,
          origin: resolution.data.origin ?? 'apply_feedback',
          assessment: bodyChangeAssessment,
          system: systemMetadata,
          fallbackCreatedAt: log.createdAt,
        })
      : null;
    const nextDraftRevision = revisionState?.draftRevision ?? currentDraftRevision;
    const publicationPackageStatus = resolvePublicationPackageStatus({
      storedStatus: metadata.publicationPackageStatus,
      hasPackage: Boolean(metadata.generatedMetadata),
      bodyChanged: bodyChangeAssessment?.seoReviewState === 'stale',
    });
    const previousResolutionSeoState =
      systemMetadata.seoReviewState === 'valid'
      || systemMetadata.seoReviewState === 'possibly_stale'
      || systemMetadata.seoReviewState === 'stale'
        ? systemMetadata.seoReviewState
        : metadata.publicationPackageStatus === 'stale'
          ? 'stale'
          : 'valid';
    const seoReviewState = previousResolutionSeoState === 'stale'
      ? 'stale'
      : bodyChangeAssessment?.seoReviewState === 'stale'
        ? 'stale'
        : bodyChangeAssessment?.seoReviewState === 'possibly_stale'
          ? 'possibly_stale'
          : previousResolutionSeoState;
    const readiness = bodyChanged
      ? 'needs_review'
      : unresolved.length === 0
        ? 'ready'
        : systemMetadata.readiness === 'blocked' && unresolved.some((item) => item.status === 'fail')
          ? 'blocked'
          : 'needs_review';
    const confirmedInternalUrls = mergeConfirmedInternalUrls(
      readConfirmedInternalUrls(systemMetadata),
      identifiedResolvedFeedback
    );
    const resolvedQualityFindings = mergeQualityResolutions(
      readQualityResolutions(systemMetadata),
      trustedIdentityUpdate.feedback
    );

    await updateAnalysisLogIfRevisionCurrent({
      id,
      expectedRevisionId: currentDraftRevision.revisionId,
      expectedBodyHash: currentDraftRevision.bodyHash,
      data: {
        feedback: identifiedResolvedFeedback as unknown as Prisma.InputJsonValue,
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
            qualityGateState: readiness === 'ready' ? 'valid' : 'stale',
            seoReviewState,
            confirmedInternalUrls,
            resolvedQualityFindings,
            editorialIdentities: trustedIdentityUpdate.editorialIdentities,
            draftRevision: nextDraftRevision,
            ...(revisionState
              ? {
                  contentBlocks: revisionState.contentBlocks,
                  lastDraftChangeSet: revisionState.changeSet,
                }
              : {}),
          },
        } as Prisma.InputJsonValue,
      },
    });

    return res.json({
      success: true,
      readiness,
      publicationPackageStatus,
      qualityGateState: readiness === 'ready' ? 'valid' : 'stale',
      seoReviewState,
      draftRevision: nextDraftRevision,
    });
  } catch (error) {
    if (error instanceof DraftRevisionMismatchError) {
      return res.status(409).json({
        error: error.message,
        code: 'DRAFT_REVISION_MISMATCH',
      });
    }
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
