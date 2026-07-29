import {
  ContentArtifactStatus,
  ContentIntelligenceDecisionType,
  Prisma,
} from '@prisma/client';
import type { ContentIntelligenceAction } from '@eai/shared';
import { prisma } from '@/lib/db';
import {
  buildContentMemorySearchText,
} from '@/lib/content-memory';
import {
  enqueueContentSearchEmbedding,
  hashEmbeddingSource,
} from '@/lib/content-memory-embedding';

type ActionArtifact = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  sourceType: string;
  currentStage: string;
  title: string | null;
  topic: string | null;
  angle: string | null;
  audience: string | null;
  primaryKeyword: string | null;
  searchIntent: string | null;
  summary: string | null;
  outline: Prisma.JsonValue | null;
  language: string | null;
  locale: string | null;
  market: string | null;
  status: ContentArtifactStatus;
};

export class ContentIntelligenceActionError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 403 | 404 | 409
  ) {
    super(message);
  }
}

const decisionType = (
  action: ContentIntelligenceAction['action']
): ContentIntelligenceDecisionType => {
  if (action === 'not_cannibalization') {
    return ContentIntelligenceDecisionType.NOT_CANNIBALIZATION;
  }
  if (action === 'reposition') {
    return ContentIntelligenceDecisionType.REPOSITIONED;
  }
  if (action === 'set_canonical') {
    return ContentIntelligenceDecisionType.SET_CANONICAL;
  }
  if (action === 'consolidate') {
    return ContentIntelligenceDecisionType.CONSOLIDATED;
  }
  return ContentIntelligenceDecisionType.ARCHIVED;
};

const canManageArtifact = (
  artifact: ActionArtifact,
  actorUserId: string,
  actorCanManageAll: boolean
) => actorCanManageAll || artifact.createdByUserId === actorUserId;

const outlineText = (outline: Prisma.JsonValue | null): string | undefined =>
  outline === null ? undefined : JSON.stringify(outline);

export const applyContentIntelligenceAction = async (params: {
  organizationId: string;
  actorUserId: string;
  actorCanManageAll: boolean;
  input: ContentIntelligenceAction;
}) => {
  const relatedArtifactId =
    'relatedArtifactId' in params.input
      ? params.input.relatedArtifactId
      : undefined;
  if (
    relatedArtifactId &&
    relatedArtifactId === params.input.artifactId
  ) {
    throw new ContentIntelligenceActionError(
      'An artifact cannot be compared with itself',
      400
    );
  }

  const artifacts = await prisma.contentArtifact.findMany({
    where: {
      organizationId: params.organizationId,
      id: {
        in: [
          params.input.artifactId,
          ...(relatedArtifactId ? [relatedArtifactId] : []),
        ],
      },
      status: {
        in: [ContentArtifactStatus.ACTIVE, ContentArtifactStatus.ARCHIVED],
      },
    },
    select: {
      id: true,
      organizationId: true,
      createdByUserId: true,
      sourceType: true,
      currentStage: true,
      title: true,
      topic: true,
      angle: true,
      audience: true,
      primaryKeyword: true,
      searchIntent: true,
      summary: true,
      outline: true,
      language: true,
      locale: true,
      market: true,
      status: true,
    },
  });
  const artifact = artifacts.find(
    (candidate) => candidate.id === params.input.artifactId
  );
  const relatedArtifact = relatedArtifactId
    ? artifacts.find((candidate) => candidate.id === relatedArtifactId)
    : undefined;
  if (!artifact || (relatedArtifactId && !relatedArtifact)) {
    throw new ContentIntelligenceActionError(
      'Content artifact not found in the active workspace',
      404
    );
  }

  const requiresArtifactManagement =
    params.input.action !== 'not_cannibalization';
  const managedArtifact =
    params.input.action === 'set_canonical' ||
    params.input.action === 'consolidate'
      ? relatedArtifact
      : artifact;
  if (
    requiresArtifactManagement &&
    managedArtifact &&
    !canManageArtifact(
      managedArtifact,
      params.actorUserId,
      params.actorCanManageAll
    )
  ) {
    throw new ContentIntelligenceActionError(
      'Only the artifact owner or a workspace administrator can apply this action',
      403
    );
  }

  let nextSearchText: string | null = null;
  if (params.input.action === 'reposition') {
    nextSearchText = buildContentMemorySearchText({
      title: artifact.title,
      topic: artifact.topic,
      angle: params.input.angle,
      audience: artifact.audience,
      primaryKeyword:
        params.input.primaryKeyword ?? artifact.primaryKeyword,
      searchIntent: params.input.searchIntent ?? artifact.searchIntent,
      outline: outlineText(artifact.outline),
      summary: artifact.summary,
      language: artifact.language,
      locale: artifact.locale,
      market: artifact.market,
    });
  }

  await prisma.$transaction(async (tx) => {
    if (params.input.action === 'reposition' && nextSearchText) {
      await tx.contentArtifact.update({
        where: { id: artifact.id },
        data: {
          angle: params.input.angle,
          primaryKeyword:
            params.input.primaryKeyword ?? artifact.primaryKeyword,
          searchIntent:
            params.input.searchIntent ?? artifact.searchIntent,
          searchDocument: {
            upsert: {
              create: {
                organizationId: params.organizationId,
                searchText: nextSearchText,
                searchMetadata: {
                  sourceType: artifact.sourceType,
                  stage: artifact.currentStage,
                },
              },
              update: {
                searchText: nextSearchText,
                embeddingModel: null,
                embeddingSourceHash: null,
                embeddingError: null,
                embeddingAttempts: 0,
                embeddedAt: null,
                indexedAt: new Date(),
              },
            },
          },
        },
      });
    } else if (
      params.input.action === 'set_canonical' &&
      relatedArtifact
    ) {
      await tx.contentArtifact.update({
        where: { id: relatedArtifact.id },
        data: { canonicalArtifactId: artifact.id },
      });
    } else if (
      params.input.action === 'consolidate' &&
      relatedArtifact
    ) {
      await tx.contentArtifact.update({
        where: { id: relatedArtifact.id },
        data: {
          canonicalArtifactId: artifact.id,
          status: ContentArtifactStatus.ARCHIVED,
        },
      });
    } else if (params.input.action === 'archive') {
      await tx.contentArtifact.update({
        where: { id: artifact.id },
        data: { status: ContentArtifactStatus.ARCHIVED },
      });
    }

    await tx.contentIntelligenceDecision.create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: decisionType(params.input.action),
        artifactId: artifact.id,
        relatedArtifactId: relatedArtifact?.id,
        details:
          params.input.action === 'reposition'
            ? {
                angle: params.input.angle,
                primaryKeyword: params.input.primaryKeyword,
                searchIntent: params.input.searchIntent,
              }
            : undefined,
      },
    });
  });

  if (params.input.action === 'reposition' && nextSearchText) {
    const sourceHash = hashEmbeddingSource(nextSearchText);
    await enqueueContentSearchEmbedding({
      artifactId: artifact.id,
      searchText: nextSearchText,
    }).catch((error) => {
      console.warn(
        '[CONTENT_INTELLIGENCE_ACTION] Failed to enqueue refreshed embedding:',
        error instanceof Error ? error.message : error,
        sourceHash
      );
    });
  }

  return {
    success: true as const,
    action: params.input.action,
    artifactId: artifact.id,
    relatedArtifactId: relatedArtifact?.id ?? null,
  };
};
