import { createHash } from 'node:crypto';
import {
  ContentIntelligenceDecisionType,
  Prisma,
  type ContentArtifactStage,
  type ContentSourceType,
} from '@prisma/client';
import type {
  CannibalizationRisk,
  ContentGap,
  ContentIntelligenceArtifact,
  ContentIntelligenceSnapshot,
  ContentUpdateRecommendation,
  InternalLinkOpportunity,
  TopicCluster,
} from '@eai/shared';
import { prisma } from '@/lib/db';
import {
  normalizeContentText,
  tokenSimilarity,
} from '@/lib/content-memory';
import { CONTENT_MEMORY_EMBEDDING_MODEL } from '@/lib/content-memory-embedding';
import {
  getArtifactPresentation,
  getContentArtifactPresentations,
} from '@/lib/content-artifact-presentation';

const MAX_ANALYZED_ARTIFACTS = 300;
const MAX_SEMANTIC_PAIRS = 2_000;
const MAX_OUTPUT_ITEMS = 20;
const DEFAULT_STALE_DAYS = 180;

export type IntelligenceArtifact = {
  id: string;
  rootArtifactId: string | null;
  canonicalArtifactId: string | null;
  createdByUserId: string | null;
  sourceType: ContentSourceType;
  sourceId: string | null;
  title: string | null;
  topic: string | null;
  angle: string | null;
  primaryKeyword: string | null;
  searchIntent: string | null;
  language: string | null;
  currentStage: ContentArtifactStage;
  status: 'ACTIVE' | 'ARCHIVED';
  sourceHref: string | null;
  ownerName: string | null;
  exportStatus: 'not_exported' | 'exported' | 'failed';
  lastExportedAt: string | null;
  canManage: boolean;
  metadataRepaired: boolean;
  updatedAt: Date;
};

export type SemanticArtifactPair = {
  leftId: string;
  rightId: string;
  score: number;
};

export type ContentGapSignal = {
  matchedArtifactIds: string[];
  alternativeAngles: string[];
};

const stableId = (...parts: string[]) =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 20);

const pairKey = (leftId: string, rightId: string) =>
  leftId < rightId
    ? `${leftId}:${rightId}`
    : `${rightId}:${leftId}`;

const artifactText = (artifact: IntelligenceArtifact) =>
  [
    artifact.title,
    artifact.topic,
    artifact.angle,
    artifact.primaryKeyword,
    artifact.searchIntent,
  ]
    .filter(Boolean)
    .join(' ');

const artifactRef = (
  artifact: IntelligenceArtifact
): ContentIntelligenceArtifact => ({
  id: artifact.id,
  title: artifact.title,
  topic: artifact.topic,
  angle: artifact.angle,
  primaryKeyword: artifact.primaryKeyword,
  searchIntent: artifact.searchIntent,
  language: artifact.language,
  stage: artifact.currentStage.toLocaleLowerCase('en-US'),
  status: artifact.status.toLocaleLowerCase('en-US'),
  sourceType: artifact.sourceType.toLocaleLowerCase('en-US'),
  sourceId: artifact.sourceId,
  sourceHref: artifact.sourceHref,
  ownerName: artifact.ownerName,
  exportStatus: artifact.exportStatus,
  lastExportedAt: artifact.lastExportedAt,
  canonicalArtifactId: artifact.canonicalArtifactId,
  canManage: artifact.canManage,
  updatedAt: artifact.updatedAt.toISOString(),
});

const isPublishedCoverage = (stage: ContentArtifactStage) =>
  stage === 'PUBLISHED' || stage === 'READY';

const artifactFamilyId = (artifact: IntelligenceArtifact) =>
  artifact.canonicalArtifactId ?? artifact.rootArtifactId ?? artifact.id;

const sameLineage = (
  left: IntelligenceArtifact,
  right: IntelligenceArtifact
) => {
  return artifactFamilyId(left) === artifactFamilyId(right);
};

class DisjointSet {
  private readonly parent = new Map<string, string>();

  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

const clusterLabel = (artifacts: IntelligenceArtifact[]) => {
  const keywordCounts = new Map<string, { value: string; count: number }>();
  for (const artifact of artifacts) {
    const value = artifact.primaryKeyword?.trim();
    const normalized = normalizeContentText(value);
    if (!value || !normalized) continue;
    const current = keywordCounts.get(normalized);
    keywordCounts.set(normalized, {
      value,
      count: (current?.count ?? 0) + 1,
    });
  }
  const keyword = [...keywordCounts.values()].sort(
    (left, right) => right.count - left.count
  )[0]?.value;
  if (keyword) return keyword;

  const candidates = artifacts
    .flatMap((artifact) => [artifact.topic, artifact.title])
    .filter((value): value is string => Boolean(value?.trim()))
    .sort((left, right) => left.length - right.length);
  return candidates[0]?.slice(0, 160) ?? 'Untitled topic';
};

const clusterKeywords = (artifacts: IntelligenceArtifact[]) => {
  const values = new Map<string, string>();
  for (const artifact of artifacts) {
    const keyword = artifact.primaryKeyword?.trim();
    const normalized = normalizeContentText(keyword);
    if (keyword && normalized && !values.has(normalized)) {
      values.set(normalized, keyword);
    }
  }
  return [...values.values()].slice(0, 5);
};

const resolveStaleDays = () => {
  const configured = Number(process.env.CONTENT_INTELLIGENCE_STALE_DAYS);
  return Number.isFinite(configured)
    ? Math.min(730, Math.max(30, Math.trunc(configured)))
    : DEFAULT_STALE_DAYS;
};

export const buildContentIntelligenceSnapshot = (params: {
  artifacts: IntelligenceArtifact[];
  semanticPairs?: SemanticArtifactPair[];
  gapSignals?: ContentGapSignal[];
  embeddedArtifactCount?: number;
  truncated?: boolean;
  suppressedRiskPairs?: Set<string>;
  now?: Date;
}): ContentIntelligenceSnapshot => {
  const now = params.now ?? new Date();
  const artifacts = params.artifacts;
  const artifactById = new Map(
    artifacts.map((artifact) => [artifact.id, artifact])
  );
  const semanticScores = new Map<string, number>();
  for (const pair of params.semanticPairs ?? []) {
    if (!artifactById.has(pair.leftId) || !artifactById.has(pair.rightId)) {
      continue;
    }
    semanticScores.set(
      pairKey(pair.leftId, pair.rightId),
      Math.min(1, Math.max(0, pair.score))
    );
  }

  const set = new DisjointSet(artifacts.map((artifact) => artifact.id));
  const pairMetadata = new Map<
    string,
    { semantic: number; topic: number; sameKeyword: boolean; sameIntent: boolean }
  >();

  for (let leftIndex = 0; leftIndex < artifacts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < artifacts.length;
      rightIndex += 1
    ) {
      const left = artifacts[leftIndex];
      const right = artifacts[rightIndex];
      const key = pairKey(left.id, right.id);
      const semantic = semanticScores.get(key) ?? 0;
      const topic = tokenSimilarity(artifactText(left), artifactText(right));
      const leftKeyword = normalizeContentText(left.primaryKeyword);
      const rightKeyword = normalizeContentText(right.primaryKeyword);
      const leftIntent = normalizeContentText(left.searchIntent);
      const rightIntent = normalizeContentText(right.searchIntent);
      const sameKeyword = Boolean(
        leftKeyword && rightKeyword && leftKeyword === rightKeyword
      );
      const sameIntent = Boolean(
        leftIntent && rightIntent && leftIntent === rightIntent
      );
      pairMetadata.set(key, {
        semantic,
        topic,
        sameKeyword,
        sameIntent,
      });
      if (
        semantic >= 0.66 ||
        topic >= 0.62 ||
        (sameKeyword && (sameIntent || topic >= 0.4))
      ) {
        set.union(left.id, right.id);
      }
    }
  }

  const clusterArtifacts = new Map<string, IntelligenceArtifact[]>();
  for (const artifact of artifacts) {
    const root = set.find(artifact.id);
    const current = clusterArtifacts.get(root) ?? [];
    current.push(artifact);
    clusterArtifacts.set(root, current);
  }

  const clusters: TopicCluster[] = [...clusterArtifacts.values()]
    .map((members) => {
      const publishedCount = members.filter((artifact) =>
        isPublishedCoverage(artifact.currentStage)
      ).length;
      const label = clusterLabel(members);
      return {
        id: `cluster_${stableId(...members.map((artifact) => artifact.id).sort())}`,
        label,
        coverage:
          publishedCount > 0
            ? 'established'
            : members.length >= 2
              ? 'growing'
              : 'emerging',
        artifactCount: members.length,
        publishedCount,
        languages: [
          ...new Set(
            members
              .map((artifact) => artifact.language?.trim())
              .filter((value): value is string => Boolean(value))
          ),
        ].slice(0, 5),
        keywords: clusterKeywords(members),
        artifacts: members
          .sort(
            (left, right) =>
              right.updatedAt.getTime() - left.updatedAt.getTime()
          )
          .slice(0, 8)
          .map(artifactRef),
      } satisfies TopicCluster;
    })
    .sort(
      (left, right) =>
        right.artifactCount - left.artifactCount ||
        left.label.localeCompare(right.label)
    );

  const clusterIdByArtifact = new Map<string, string>();
  for (const members of clusterArtifacts.values()) {
    const clusterId = `cluster_${stableId(
      ...members.map((artifact) => artifact.id).sort()
    )}`;
    for (const artifact of members) {
      clusterIdByArtifact.set(artifact.id, clusterId);
    }
  }

  const cannibalizationRisks: CannibalizationRisk[] = [];
  const riskFamilyPairs = new Set<string>();
  for (let leftIndex = 0; leftIndex < artifacts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < artifacts.length;
      rightIndex += 1
    ) {
      const left = artifacts[leftIndex];
      const right = artifacts[rightIndex];
      if (
        left.status !== 'ACTIVE' ||
        right.status !== 'ACTIVE' ||
        sameLineage(left, right) ||
        params.suppressedRiskPairs?.has(pairKey(left.id, right.id))
      ) {
        continue;
      }
      const familyKey = pairKey(
        artifactFamilyId(left),
        artifactFamilyId(right)
      );
      if (riskFamilyPairs.has(familyKey)) continue;
      const metadata = pairMetadata.get(pairKey(left.id, right.id));
      if (!metadata) continue;
      const isRisk =
        (metadata.sameKeyword &&
          (metadata.sameIntent ||
            metadata.semantic >= 0.7 ||
            metadata.topic >= 0.6)) ||
        metadata.semantic >= 0.86 ||
        (metadata.sameIntent && metadata.topic >= 0.72);
      if (!isRisk) continue;
      riskFamilyPairs.add(familyKey);

      const score = Math.min(
        1,
        Math.max(
          metadata.semantic,
          metadata.topic,
          (metadata.sameKeyword ? 0.55 : 0) +
            (metadata.sameIntent ? 0.25 : 0) +
            metadata.topic * 0.2
        )
      );
      const bothPublished =
        isPublishedCoverage(left.currentStage) &&
        isPublishedCoverage(right.currentStage);
      const reasons: CannibalizationRisk['reasons'] = [];
      if (metadata.sameKeyword) reasons.push('same_primary_keyword');
      if (metadata.sameIntent) reasons.push('same_search_intent');
      if (metadata.semantic >= 0.7) reasons.push('semantic_overlap');
      if (metadata.topic >= 0.6) reasons.push('topic_overlap');
      cannibalizationRisks.push({
        id: `risk_${stableId(left.id, right.id)}`,
        severity:
          score >= 0.9 && metadata.sameKeyword
            ? 'critical'
            : score >= 0.82
              ? 'high'
              : 'medium',
        score: Number(score.toFixed(4)),
        reasons,
        recommendation:
          bothPublished && metadata.sameKeyword
            ? 'set_canonical'
            : bothPublished
              ? 'consolidate'
              : 'reposition',
        left: artifactRef(left),
        right: artifactRef(right),
      });
    }
  }
  cannibalizationRisks.sort(
    (left, right) => right.score - left.score
  );
  const boundedRisks = cannibalizationRisks.slice(0, MAX_OUTPUT_ITEMS);

  const existingText = artifacts.map(artifactText);
  const gaps: ContentGap[] = [];
  const seenAngles = new Set<string>();
  for (const signal of params.gapSignals ?? []) {
    const clusterId =
      signal.matchedArtifactIds
        .map((artifactId) => clusterIdByArtifact.get(artifactId))
        .find(Boolean) ?? null;
    const cluster = clusters.find((item) => item.id === clusterId);
    for (const alternativeAngle of signal.alternativeAngles) {
      const normalized = normalizeContentText(alternativeAngle);
      if (
        !normalized ||
        seenAngles.has(normalized) ||
        existingText.some(
          (content) => tokenSimilarity(alternativeAngle, content) >= 0.8
        )
      ) {
        continue;
      }
      seenAngles.add(normalized);
      gaps.push({
        id: `gap_${stableId(normalized)}`,
        clusterId,
        topic: cluster?.label ?? alternativeAngle.slice(0, 160),
        suggestedAngle: alternativeAngle.slice(0, 500),
        source: 'classifier_feedback',
        rationale: 'classifier_identified_open_angle',
        relatedArtifacts: signal.matchedArtifactIds
          .map((artifactId) => artifactById.get(artifactId))
          .filter(
            (artifact): artifact is IntelligenceArtifact => Boolean(artifact)
          )
          .slice(0, 5)
          .map(artifactRef),
      });
      if (gaps.length >= MAX_OUTPUT_ITEMS) break;
    }
    if (gaps.length >= MAX_OUTPUT_ITEMS) break;
  }
  for (const cluster of clusters) {
    if (
      gaps.length >= MAX_OUTPUT_ITEMS ||
      cluster.artifactCount < 2 ||
      cluster.publishedCount > 0
    ) {
      continue;
    }
    gaps.push({
      id: `gap_${stableId(cluster.id, 'coverage')}`,
      clusterId: cluster.id,
      topic: cluster.label,
      suggestedAngle: cluster.label,
      source: 'lifecycle_coverage',
      rationale: 'no_published_coverage',
      relatedArtifacts: cluster.artifacts.slice(0, 5),
    });
  }

  const staleDays = resolveStaleDays();
  const millisecondsPerDay = 86_400_000;
  const updateRecommendations: ContentUpdateRecommendation[] = [];
  const updateIds = new Set<string>();
  const addUpdate = (
    artifact: IntelligenceArtifact,
    reason: ContentUpdateRecommendation['reason'],
    priority: ContentUpdateRecommendation['priority'],
    relatedArtifactId: string | null = null
  ) => {
    const id = `${artifact.id}:${reason}:${relatedArtifactId ?? ''}`;
    if (updateIds.has(id)) return;
    updateIds.add(id);
    updateRecommendations.push({
      id: `update_${stableId(id)}`,
      priority,
      reason,
      ageDays: Math.max(
        0,
        Math.floor((now.getTime() - artifact.updatedAt.getTime()) / millisecondsPerDay)
      ),
      artifact: artifactRef(artifact),
      relatedArtifactId,
      relatedArtifact: relatedArtifactId
        ? artifactById.has(relatedArtifactId)
          ? artifactRef(artifactById.get(relatedArtifactId)!)
          : null
        : null,
    });
  };
  for (const artifact of artifacts) {
    const ageDays = Math.max(
      0,
      Math.floor((now.getTime() - artifact.updatedAt.getTime()) / millisecondsPerDay)
    );
    if (
      artifact.status === 'ACTIVE' &&
      artifact.currentStage === 'PUBLISHED' &&
      ageDays >= staleDays
    ) {
      addUpdate(artifact, 'stale_published', 'medium');
    }
    if (artifact.status === 'ARCHIVED') {
      const related = artifacts.find(
        (candidate) =>
          candidate.status === 'ACTIVE' &&
          !sameLineage(artifact, candidate) &&
          tokenSimilarity(artifactText(artifact), artifactText(candidate)) >=
            0.65
      );
      if (related) {
        addUpdate(artifact, 'archived_overlap', 'low', related.id);
      }
    }
  }
  for (const risk of boundedRisks) {
    const artifact = artifactById.get(risk.left.id);
    if (artifact) {
      addUpdate(
        artifact,
        'cannibalization',
        risk.severity === 'critical' ? 'high' : 'medium',
        risk.right.id
      );
    }
  }
  updateRecommendations.sort((left, right) => {
    const priority = { high: 3, medium: 2, low: 1 };
    return priority[right.priority] - priority[left.priority];
  });

  const criticalRiskPairs = new Set(
    boundedRisks
      .filter((risk) => risk.severity === 'critical')
      .map((risk) => pairKey(risk.left.id, risk.right.id))
  );
  const internalLinkOpportunities: InternalLinkOpportunity[] = [];
  const linkedFamilyPairs = new Set<string>();
  for (let leftIndex = 0; leftIndex < artifacts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < artifacts.length;
      rightIndex += 1
    ) {
      const left = artifacts[leftIndex];
      const right = artifacts[rightIndex];
      const key = pairKey(left.id, right.id);
      if (sameLineage(left, right) || criticalRiskPairs.has(key)) continue;
      const familyKey = pairKey(
        artifactFamilyId(left),
        artifactFamilyId(right)
      );
      if (linkedFamilyPairs.has(familyKey)) continue;
      const metadata = pairMetadata.get(key);
      if (!metadata) continue;
      const related =
        metadata.semantic >= 0.62 ||
        metadata.topic >= 0.5 ||
        metadata.sameKeyword;
      if (!related) continue;

      const leftPublished = isPublishedCoverage(left.currentStage);
      const rightPublished = isPublishedCoverage(right.currentStage);
      if (!leftPublished && !rightPublished) continue;
      let from = left;
      let to = right;
      if (leftPublished && !rightPublished) {
        from = right;
        to = left;
      } else if (leftPublished && rightPublished) {
        from =
          left.updatedAt.getTime() >= right.updatedAt.getTime() ? left : right;
        to = from.id === left.id ? right : left;
      }
      const score = Math.max(
        metadata.semantic,
        metadata.topic,
        metadata.sameKeyword ? 0.7 : 0
      );
      internalLinkOpportunities.push({
        id: `link_${stableId(from.id, to.id)}`,
        score: Number(score.toFixed(4)),
        reason:
          metadata.semantic >= 0.62
            ? 'semantic_relationship'
            : metadata.sameKeyword
              ? 'keyword_relationship'
              : 'same_topic_cluster',
        from: artifactRef(from),
        to: artifactRef(to),
      });
      linkedFamilyPairs.add(familyKey);
    }
  }
  internalLinkOpportunities.sort(
    (left, right) => right.score - left.score
  );

  const boundedUpdates = updateRecommendations.slice(0, MAX_OUTPUT_ITEMS);
  const boundedLinks = internalLinkOpportunities.slice(0, MAX_OUTPUT_ITEMS);
  return {
    generatedAt: now.toISOString(),
    analyzedArtifactCount: artifacts.length,
    truncated: params.truncated ?? false,
    resultLimit: MAX_OUTPUT_ITEMS,
    resultsTruncated:
      clusters.length > MAX_OUTPUT_ITEMS ||
      cannibalizationRisks.length > MAX_OUTPUT_ITEMS ||
      gaps.length > MAX_OUTPUT_ITEMS ||
      updateRecommendations.length > MAX_OUTPUT_ITEMS ||
      internalLinkOpportunities.length > MAX_OUTPUT_ITEMS,
    semanticCoverage:
      artifacts.length > 0
        ? Number(
            (
              Math.min(
                artifacts.length,
                params.embeddedArtifactCount ?? 0
              ) / artifacts.length
            ).toFixed(4)
          )
        : 0,
    summary: {
      clusterCount: clusters.length,
      cannibalizationRiskCount: cannibalizationRisks.length,
      gapCount: gaps.length,
      updateRecommendationCount: updateRecommendations.length,
      internalLinkOpportunityCount: internalLinkOpportunities.length,
    },
    clusters: clusters.slice(0, MAX_OUTPUT_ITEMS),
    cannibalizationRisks: boundedRisks,
    gaps,
    updateRecommendations: boundedUpdates,
    internalLinkOpportunities: boundedLinks,
  };
};

const parseGapSignals = (
  events: Array<{
    matchedArtifactIds: Prisma.JsonValue;
    classifierMetadata: Prisma.JsonValue | null;
  }>
): ContentGapSignal[] =>
  events.flatMap((event) => {
    if (
      !Array.isArray(event.matchedArtifactIds) ||
      !event.classifierMetadata ||
      typeof event.classifierMetadata !== 'object' ||
      Array.isArray(event.classifierMetadata)
    ) {
      return [];
    }
    const metadata = event.classifierMetadata as Record<string, unknown>;
    const alternativeAngles = Array.isArray(metadata.alternativeAngles)
      ? metadata.alternativeAngles.filter(
          (value): value is string => typeof value === 'string'
        )
      : [];
    const matchedArtifactIds = event.matchedArtifactIds.filter(
      (value): value is string => typeof value === 'string'
    );
    return alternativeAngles.length > 0
      ? [{ matchedArtifactIds, alternativeAngles }]
      : [];
  });

export const getContentIntelligenceSnapshot = async (
  organizationId: string,
  viewer: {
    userId: string;
    canManageAll: boolean;
  }
): Promise<ContentIntelligenceSnapshot> => {
  const rows = await prisma.contentArtifact.findMany({
    where: {
      organizationId,
      status: { in: ['ACTIVE', 'ARCHIVED'] },
    },
    select: {
      id: true,
      rootArtifactId: true,
      canonicalArtifactId: true,
      createdByUserId: true,
      sourceType: true,
      sourceId: true,
      title: true,
      topic: true,
      angle: true,
      primaryKeyword: true,
      searchIntent: true,
      language: true,
      currentStage: true,
      status: true,
      updatedAt: true,
      createdBy: {
        select: { name: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_ANALYZED_ARTIFACTS + 1,
  });
  const truncated = rows.length > MAX_ANALYZED_ARTIFACTS;
  const boundedRows = rows.slice(0, MAX_ANALYZED_ARTIFACTS);
  const presentations = await getContentArtifactPresentations({
    organizationId,
    artifacts: boundedRows,
    viewerUserId: viewer.userId,
    viewerCanManageAll: viewer.canManageAll,
  });
  const artifacts = boundedRows.map((row) => {
    const presentation = getArtifactPresentation(presentations, row);
    return {
      ...row,
      status: row.status as 'ACTIVE' | 'ARCHIVED',
      title: presentation ? presentation.title : row.title,
      topic: presentation ? presentation.topic : row.topic,
      angle: presentation ? presentation.angle : row.angle,
      primaryKeyword: presentation
        ? presentation.primaryKeyword
        : row.primaryKeyword,
      searchIntent: presentation
        ? presentation.searchIntent
        : row.searchIntent,
      sourceId: presentation?.sourceId ?? row.sourceId,
      sourceHref: presentation?.sourceHref ?? null,
      ownerName: presentation?.ownerName ?? row.createdBy?.name ?? null,
      exportStatus: presentation?.exportStatus ?? 'not_exported',
      lastExportedAt: presentation?.lastExportedAt ?? null,
      canManage: presentation?.canManage ?? false,
      metadataRepaired: presentation?.metadataRepaired ?? false,
    } satisfies IntelligenceArtifact;
  });
  const artifactIds = artifacts.map((artifact) => artifact.id);
  if (artifactIds.length === 0) {
    return buildContentIntelligenceSnapshot({
      artifacts: [],
      truncated,
    });
  }

  const [events, decisions, semanticState] = await Promise.all([
    prisma.duplicateGuardEvent.findMany({
      where: {
        organizationId,
        classifierMetadata: { not: Prisma.DbNull },
      },
      select: {
        matchedArtifactIds: true,
        classifierMetadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.contentIntelligenceDecision.findMany({
      where: {
        organizationId,
        action: ContentIntelligenceDecisionType.NOT_CANNIBALIZATION,
        relatedArtifactId: { not: null },
      },
      select: {
        artifactId: true,
        relatedArtifactId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1_000,
    }),
    (async () => {
      try {
        const semanticArtifactIds = artifacts
          .filter((artifact) => !artifact.metadataRepaired)
          .map((artifact) => artifact.id);
        if (semanticArtifactIds.length === 0) {
          return { pairs: [], embeddedArtifactCount: 0 };
        }
        const [pairs, coverage] = await Promise.all([
          prisma.$queryRaw<SemanticArtifactPair[]>`
            SELECT
              left_document."artifactId" AS "leftId",
              right_document."artifactId" AS "rightId",
              1 - (
                left_document."embedding" <=>
                right_document."embedding"
              ) AS "score"
            FROM "ContentSearchDocument" AS left_document
            JOIN "ContentSearchDocument" AS right_document
              ON left_document."id" < right_document."id"
            JOIN "ContentArtifact" AS left_artifact
              ON left_artifact."id" = left_document."artifactId"
            JOIN "ContentArtifact" AS right_artifact
              ON right_artifact."id" = right_document."artifactId"
            WHERE left_document."organizationId" = ${organizationId}
              AND right_document."organizationId" = ${organizationId}
              AND left_artifact."organizationId" = ${organizationId}
              AND right_artifact."organizationId" = ${organizationId}
              AND left_document."artifactId" IN (${Prisma.join(semanticArtifactIds)})
              AND right_document."artifactId" IN (${Prisma.join(semanticArtifactIds)})
              AND left_document."embedding" IS NOT NULL
              AND right_document."embedding" IS NOT NULL
              AND left_document."embeddingModel" =
                ${CONTENT_MEMORY_EMBEDDING_MODEL}
              AND right_document."embeddingModel" =
                ${CONTENT_MEMORY_EMBEDDING_MODEL}
              AND 1 - (
                left_document."embedding" <=>
                right_document."embedding"
              ) >= 0.55
            ORDER BY "score" DESC
            LIMIT ${MAX_SEMANTIC_PAIRS}
          `,
          prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) AS "count"
            FROM "ContentSearchDocument" AS document
            JOIN "ContentArtifact" AS artifact
              ON artifact."id" = document."artifactId"
            WHERE document."organizationId" = ${organizationId}
              AND artifact."organizationId" = ${organizationId}
              AND document."artifactId" IN (${Prisma.join(semanticArtifactIds)})
              AND document."embedding" IS NOT NULL
              AND document."embeddingModel" =
                ${CONTENT_MEMORY_EMBEDDING_MODEL}
          `,
        ]);
        return {
          pairs: pairs.map((pair) => ({
            ...pair,
            score: Number(pair.score),
          })),
          embeddedArtifactCount: Number(coverage[0]?.count ?? 0),
        };
      } catch (error) {
        console.warn(
          '[CONTENT_INTELLIGENCE] Semantic graph unavailable; using metadata fallback:',
          error instanceof Error ? error.message : error
        );
        return { pairs: [], embeddedArtifactCount: 0 };
      }
    })(),
  ]);

  return buildContentIntelligenceSnapshot({
    artifacts,
    semanticPairs: semanticState.pairs,
    embeddedArtifactCount: semanticState.embeddedArtifactCount,
    gapSignals: parseGapSignals(events),
    suppressedRiskPairs: new Set(
      decisions
        .filter(
          (
            decision
          ): decision is {
            artifactId: string;
            relatedArtifactId: string;
          } => Boolean(decision.relatedArtifactId)
        )
        .map((decision) =>
          pairKey(decision.artifactId, decision.relatedArtifactId)
        )
    ),
    truncated,
  });
};
