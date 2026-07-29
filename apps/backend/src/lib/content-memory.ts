import { createHash, randomUUID } from 'node:crypto';
import type {
  DuplicateGuardAction,
  DuplicateGuardResult,
  MatchedContentArtifact,
  OverlapReason,
  OverlapVerdict,
} from '@eai/shared';
import {
  ContentArtifactStage,
  ContentArtifactStatus,
  ContentArtifactType,
  ContentSourceType,
  type Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  CONTENT_MEMORY_EMBEDDING_MODEL,
  enqueueContentSearchEmbedding,
  hashEmbeddingSource,
  retrieveHybridCandidateScores,
  type HybridCandidateScore,
} from '@/lib/content-memory-embedding';
import { classifyAmbiguousContentOverlap } from '@/lib/content-memory-classifier';
import {
  applyContentMemoryEnforcement,
  getContentMemoryEnforcementConfig,
} from '@/lib/content-memory-enforcement';

const RESERVATION_TTL_MS = 10 * 60 * 1000;
const MAX_CANDIDATES = 100;
const MAX_MATCHES = 5;

export interface ContentMemoryInput {
  title?: string | null;
  topic?: string | null;
  angle?: string | null;
  audience?: string | null;
  primaryKeyword?: string | null;
  searchIntent?: string | null;
  outline?: string | string[] | null;
  summary?: string | null;
  content?: string | null;
  language?: string | null;
  locale?: string | null;
  market?: string | null;
}

export interface ContentArtifactWriteInput extends ContentMemoryInput {
  organizationId: string;
  createdByUserId: string;
  artifactType: ContentArtifactType;
  sourceType: ContentSourceType;
  sourceId: string;
  currentStage: ContentArtifactStage;
  rootArtifactId?: string | null;
  status?: ContentArtifactStatus;
  reservationKey?: string | null;
}

type Candidate = {
  id: string;
  title: string | null;
  normalizedTitle: string | null;
  topic: string | null;
  normalizedTopic: string | null;
  angle: string | null;
  audience: string | null;
  primaryKeyword: string | null;
  searchIntent: string | null;
  summary: string | null;
  outline: Prisma.JsonValue | null;
  status: ContentArtifactStatus;
  currentStage: ContentArtifactStage;
  sourceType: ContentSourceType;
  contentHash: string | null;
  rootArtifactId: string | null;
  createdAt: Date;
};

export const normalizeContentText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const nonEmpty = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeIndexedText = (
  value: string | null | undefined
): string => normalizeContentText(value).slice(0, 500);

const extractContentTitle = (content: string | null | undefined): string | null => {
  const firstLine = content
    ?.split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, '').trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 200) : null;
};

const toOutlineText = (
  outline: ContentMemoryInput['outline'] | Prisma.JsonValue
): string => {
  if (typeof outline === 'string') return outline;
  if (Array.isArray(outline)) {
    return outline
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join('\n');
  }
  return outline ? JSON.stringify(outline) : '';
};

const hashText = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const contentHash = (content: string | null | undefined): string | null => {
  const normalized = normalizeContentText(content);
  return normalized ? hashText(normalized) : null;
};

const tokens = (value: string | null | undefined): Set<string> =>
  new Set(
    normalizeContentText(value)
      .split(' ')
      .filter((token) => token.length > 2)
  );

export const tokenSimilarity = (
  left: string | null | undefined,
  right: string | null | undefined
): number => {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return (2 * intersection) / (a.size + b.size);
};

const fieldSimilarity = (
  left: string | null | undefined,
  right: string | null | undefined
): number => {
  const a = normalizeContentText(left);
  const b = normalizeContentText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) {
    return 0.88;
  }
  return tokenSimilarity(a, b);
};

const inputTitle = (input: ContentMemoryInput): string | null =>
  nonEmpty(input.title) ??
  nonEmpty(input.topic) ??
  nonEmpty(input.angle) ??
  extractContentTitle(input.content);

export const buildReservationKey = (input: ContentMemoryInput): string => {
  const fingerprint = [
    normalizeContentText(
      input.topic ??
        input.title ??
        input.angle ??
        extractContentTitle(input.content)
    ),
    normalizeContentText(input.primaryKeyword),
    normalizeContentText(input.searchIntent),
    normalizeContentText(input.audience),
  ].join(':');
  return hashText(fingerprint);
};

export const buildContentMemorySearchText = (
  input: ContentMemoryInput
): string =>
  [
    inputTitle(input),
    input.topic,
    input.primaryKeyword,
    input.searchIntent,
    input.angle,
    input.audience,
    input.summary,
    toOutlineText(input.outline),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');

const scoreCandidate = (
  input: ContentMemoryInput,
  candidate: Candidate,
  retrieval?: HybridCandidateScore
): MatchedContentArtifact => {
  const title = inputTitle(input);
  const candidateTitle = candidate.title ?? candidate.topic ?? candidate.angle;
  const titleScore = Math.max(
    fieldSimilarity(title, candidateTitle),
    fieldSimilarity(input.topic, candidate.topic)
  );
  const keywordScore = fieldSimilarity(
    input.primaryKeyword,
    candidate.primaryKeyword
  );
  const intentScore = fieldSimilarity(input.searchIntent, candidate.searchIntent);
  const angleScore = fieldSimilarity(input.angle, candidate.angle);
  const audienceScore = fieldSimilarity(input.audience, candidate.audience);
  const outlineScore = tokenSimilarity(
    toOutlineText(input.outline),
    toOutlineText(candidate.outline)
  );
  const summaryScore = tokenSimilarity(input.summary, candidate.summary);
  const sameContent = Boolean(
    contentHash(input.content) &&
      contentHash(input.content) === candidate.contentHash
  );
  const semanticScore = retrieval?.semanticScore ?? 0;
  const lexicalScore = retrieval?.lexicalScore ?? 0;
  const reasons: OverlapReason[] = [];

  if (titleScore === 1) reasons.push('same_title');
  if (sameContent) reasons.push('same_source');
  if (keywordScore >= 0.8) reasons.push('same_primary_keyword');
  if (intentScore >= 0.8) reasons.push('same_search_intent');
  if (angleScore >= 0.8) reasons.push('same_angle');
  if (outlineScore >= 0.65) reasons.push('outline_overlap');
  if (summaryScore >= 0.75) reasons.push('content_summary_overlap');
  if (audienceScore >= 0.8) reasons.push('shared_audience');
  if (semanticScore >= 0.72) reasons.push('semantic_similarity');

  const weighted =
    titleScore * 0.35 +
    Math.max(titleScore, tokenSimilarity(input.topic, candidate.topic)) * 0.2 +
    keywordScore * 0.15 +
    intentScore * 0.1 +
    outlineScore * 0.1 +
    summaryScore * 0.1 +
    audienceScore * 0.05 +
    angleScore * 0.05;
  const deterministicScore =
    sameContent || titleScore === 1
      ? 1
      : Math.min(
          1,
          Math.max(
            weighted,
            keywordScore >= 0.9 ? 0.35 : 0,
            intentScore >= 0.9 ? 0.35 : 0,
            summaryScore >= 0.75 ? 0.4 : 0
          )
        );
  const semanticHybridScore =
    semanticScore * 0.55 +
    titleScore * 0.2 +
    keywordScore * 0.1 +
    outlineScore * 0.1 +
    intentScore * 0.05;
  const lexicalHybridScore = lexicalScore * 0.45 + deterministicScore * 0.55;
  const rawScore =
    sameContent || titleScore === 1
      ? 1
      : Math.min(
          1,
          Math.max(
            deterministicScore,
            semanticHybridScore,
            lexicalHybridScore
          )
        );
  const score =
    candidate.status === ContentArtifactStatus.ARCHIVED
      ? Math.min(0.49, rawScore)
      : rawScore;

  return {
    id: candidate.id,
    title: candidate.title,
    topic: candidate.topic,
    angle: candidate.angle,
    status: candidate.status.toLocaleLowerCase('en-US'),
    stage: candidate.currentStage.toLocaleLowerCase('en-US'),
    sourceType: candidate.sourceType.toLocaleLowerCase('en-US'),
    createdAt: candidate.createdAt.toISOString(),
    score: Number(score.toFixed(4)),
    ...(retrieval?.semanticScore !== undefined
      ? { semanticScore: Number(retrieval.semanticScore.toFixed(4)) }
      : {}),
    ...(retrieval?.lexicalScore !== undefined
      ? { lexicalScore: Number(retrieval.lexicalScore.toFixed(4)) }
      : {}),
    reasons,
  };
};

export const classifyContentMatches = (
  matches: MatchedContentArtifact[]
): Pick<
  DuplicateGuardResult,
  'verdict' | 'confidence' | 'reasons' | 'recommendedAction'
> => {
  const top = matches[0];
  if (!top) {
    return {
      verdict: 'distinct',
      confidence: 1,
      reasons: [],
      recommendedAction: 'continue',
    };
  }

  let verdict: OverlapVerdict;
  let recommendedAction: DuplicateGuardAction;
  if (
    top.score >= 0.98 &&
    (top.reasons.includes('same_title') || top.reasons.includes('same_source'))
  ) {
    verdict = 'exact_duplicate';
    recommendedAction = 'block';
  } else if (top.score >= 0.82) {
    verdict = 'probable_duplicate';
    recommendedAction = 'require_confirmation';
  } else if (top.score >= 0.65) {
    verdict = 'high_overlap';
    recommendedAction = 'suggest_repositioning';
  } else if (
    top.score >= 0.5 &&
    !top.reasons.includes('same_angle') &&
    (top.reasons.includes('same_primary_keyword') ||
      top.reasons.includes('same_search_intent'))
  ) {
    verdict = 'same_topic_new_angle';
    recommendedAction = 'continue_with_context';
  } else if (top.score >= 0.35) {
    verdict = 'related';
    recommendedAction = 'continue_with_context';
  } else {
    verdict = 'distinct';
    recommendedAction = 'continue';
  }

  return {
    verdict,
    confidence: Number(top.score.toFixed(4)),
    reasons: top.reasons,
    recommendedAction,
  };
};

const safeContextJson = (value: unknown): string =>
  JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

export const buildRelatedContentContext = (
  result: DuplicateGuardResult | null | undefined
): string => {
  if (!result || result.matchedArtifacts.length === 0) return '';
  return `
<related_content_context>
${safeContextJson({
  verdict: result.verdict,
  confidence: result.confidence,
  sameElements: result.sameElements ?? [],
  differentElements: result.differentElements ?? [],
  alternativeAngles: result.alternativeAngles ?? [],
  explanation: result.explanation ?? null,
  artifacts: result.matchedArtifacts.slice(0, MAX_MATCHES).map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    topic: artifact.topic,
    angle: artifact.angle,
    stage: artifact.stage,
    status: artifact.status,
    score: artifact.score,
  })),
})}
</related_content_context>
`.trim();
};

export const evaluateContentDuplicates = async (params: {
  organizationId: string;
  input: ContentMemoryInput;
  excludeArtifactId?: string;
  rootArtifactId?: string | null;
}): Promise<DuplicateGuardResult> => {
  const title = normalizeIndexedText(inputTitle(params.input));
  const topic = normalizeIndexedText(params.input.topic);
  const hash = contentHash(params.input.content);
  const baseWhere = {
    organizationId: params.organizationId,
    status: {
      in: [
        ContentArtifactStatus.ACTIVE,
        ContentArtifactStatus.ARCHIVED,
      ],
    },
    id: params.excludeArtifactId ? { not: params.excludeArtifactId } : undefined,
  } satisfies Prisma.ContentArtifactWhereInput;
  const select = {
    id: true,
    title: true,
    normalizedTitle: true,
    topic: true,
    normalizedTopic: true,
    angle: true,
    audience: true,
    primaryKeyword: true,
    searchIntent: true,
    summary: true,
    outline: true,
    status: true,
    currentStage: true,
    sourceType: true,
    contentHash: true,
    rootArtifactId: true,
    createdAt: true,
  } satisfies Prisma.ContentArtifactSelect;
  const exactConditions: Prisma.ContentArtifactWhereInput[] = [];
  if (title) exactConditions.push({ normalizedTitle: title });
  if (topic) exactConditions.push({ normalizedTopic: topic });
  if (hash) exactConditions.push({ contentHash: hash });
  if (params.input.primaryKeyword) {
    exactConditions.push({
      primaryKeyword: {
        equals: params.input.primaryKeyword,
        mode: 'insensitive',
      },
    });
  }

  const exactCandidates =
    exactConditions.length > 0
      ? await prisma.contentArtifact.findMany({
          where: { ...baseWhere, OR: exactConditions },
          take: 25,
          orderBy: { updatedAt: 'desc' },
          select,
        })
      : [];
  const exactMatches = exactCandidates
    .filter(
      (candidate) =>
        !params.rootArtifactId ||
        (candidate.id !== params.rootArtifactId &&
          candidate.rootArtifactId !== params.rootArtifactId)
    )
    .map((candidate) => scoreCandidate(params.input, candidate as Candidate))
    .filter((candidate) => candidate.score >= 0.25)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_MATCHES);
  const exactClassification = classifyContentMatches(exactMatches);
  if (exactClassification.recommendedAction === 'block') {
    return {
      ...exactClassification,
      matchedArtifacts: exactMatches,
      retrieval: {
        mode: 'deterministic',
        semanticAvailable: false,
        semanticCandidateCount: 0,
        lexicalCandidateCount: 0,
        classifierInvoked: false,
        classifierModel: null,
        classifierLatencyMs: null,
      },
    };
  }

  const retrieval = await retrieveHybridCandidateScores({
    organizationId: params.organizationId,
    searchText: buildContentMemorySearchText(params.input),
    limit: 20,
  });
  const [hybridCandidates, recentCandidates] = await Promise.all([
      retrieval.scores.size > 0
        ? prisma.contentArtifact.findMany({
            where: {
              ...baseWhere,
              id: {
                in: [...retrieval.scores.keys()],
                ...(params.excludeArtifactId
                  ? { not: params.excludeArtifactId }
                  : {}),
              },
            },
            select,
          })
        : Promise.resolve([]),
      prisma.contentArtifact.findMany({
        where: {
          ...baseWhere,
        },
        take: MAX_CANDIDATES,
        orderBy: { updatedAt: 'desc' },
        select,
      }),
    ]);
  const candidateMap = new Map<string, Candidate>();
  for (const candidate of [
    ...exactCandidates,
    ...hybridCandidates,
    ...recentCandidates,
  ]) {
    if (
      params.rootArtifactId &&
      (candidate.id === params.rootArtifactId ||
        candidate.rootArtifactId === params.rootArtifactId)
    ) {
      continue;
    }
    candidateMap.set(candidate.id, candidate as Candidate);
  }

  const matches = [...candidateMap.values()]
    .map((candidate) =>
      scoreCandidate(
        params.input,
        candidate,
        retrieval.scores.get(candidate.id)
      )
    )
    .filter((candidate) => candidate.score >= 0.25)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_MATCHES);
  return {
    ...classifyContentMatches(matches),
    matchedArtifacts: matches,
    retrieval: {
      mode:
        retrieval.semanticCandidateCount > 0 ||
        retrieval.lexicalCandidateCount > 0
          ? 'hybrid'
          : 'deterministic',
      semanticAvailable: retrieval.semanticAvailable,
      semanticCandidateCount: retrieval.semanticCandidateCount,
      lexicalCandidateCount: retrieval.lexicalCandidateCount,
      classifierInvoked: false,
      classifierModel: null,
      classifierLatencyMs: null,
    },
  };
};

const reservationCollisionResult = (): DuplicateGuardResult => {
  const enforcement = getContentMemoryEnforcementConfig();
  return {
    verdict: 'exact_duplicate',
    confidence: 1,
    reasons: ['active_reservation'],
    matchedArtifacts: [],
    recommendedAction: 'block',
    enforcement: {
      mode: 'enforced',
      reason: 'reservation_collision',
      confidenceThreshold: enforcement.confidenceThreshold,
      minimumLabeledSamples: enforcement.minimumLabeledSamples,
      labeledSampleCount: 0,
      measuredPrecision: null,
      targetPrecision: enforcement.targetPrecision,
      rolloutPercent: enforcement.rolloutPercent,
      overrideAllowed: false,
    },
  };
};

export const beginContentGenerationGuard = async (params: {
  organizationId: string;
  userId: string;
  requestId?: string;
  input: ContentMemoryInput;
  allowProbableDuplicateOverride?: boolean;
}): Promise<{
  result: DuplicateGuardResult;
  reservationId: string | null;
  reservationKey: string;
}> => {
  const requestId = params.requestId ?? randomUUID();
  const reservationKey = buildReservationKey(params.input);
  let result = await evaluateContentDuplicates({
    organizationId: params.organizationId,
    input: params.input,
  });
  result = await classifyAmbiguousContentOverlap({
    organizationId: params.organizationId,
    userId: params.userId,
    input: params.input,
    result,
  });
  try {
    result = await applyContentMemoryEnforcement({
      organizationId: params.organizationId,
      result,
      allowOverride: params.allowProbableDuplicateOverride,
    });
  } catch (enforcementError) {
    console.error(
      '[CONTENT_MEMORY_ENFORCEMENT] Falling back to advisory mode:',
      enforcementError
    );
    const config = getContentMemoryEnforcementConfig();
    result = {
      ...result,
      enforcement: {
        mode: 'shadow',
        reason: 'calibration_unavailable',
        confidenceThreshold: config.confidenceThreshold,
        minimumLabeledSamples: config.minimumLabeledSamples,
        labeledSampleCount: 0,
        measuredPrecision: null,
        targetPrecision: config.targetPrecision,
        rolloutPercent: config.rolloutPercent,
        overrideAllowed: false,
      },
    };
  }

  if (result.enforcement?.reason === 'explicit_override') {
    await prisma.duplicateGuardEvent.updateMany({
      where: {
        organizationId: params.organizationId,
        requestId,
        enforcementMetadata: {
          path: ['reason'],
          equals: 'calibrated_probable_duplicate',
        },
      },
      data: { userAction: 'overrode_block' },
    });
  }
  result = { ...result, requestId };

  await recordDuplicateGuardEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    requestId,
    input: params.input,
    result,
    userAction:
      result.enforcement?.reason === 'explicit_override'
        ? 'overrode_block'
        : undefined,
  }).catch((eventError) => {
    console.error(
      '[CONTENT_MEMORY] Failed to record duplicate guard event:',
      eventError
    );
  });

  if (result.recommendedAction === 'block') {
    return { result, reservationId: null, reservationKey };
  }

  const now = new Date();
  await prisma.contentReservation.deleteMany({
    where: { expiresAt: { lte: now } },
  });

  try {
    const reservation = await prisma.contentReservation.create({
      data: {
        organizationId: params.organizationId,
        createdByUserId: params.userId,
        requestId,
        reservationKey,
        normalizedTopic: normalizeContentText(
          params.input.topic ??
            params.input.title ??
            params.input.angle ??
            extractContentTitle(params.input.content)
        ),
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      },
    });
    return { result, reservationId: reservation.id, reservationKey };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      const collision = reservationCollisionResult();
      await recordDuplicateGuardEvent({
        organizationId: params.organizationId,
        userId: params.userId,
        requestId,
        input: params.input,
        result: collision,
      }).catch((eventError) => {
        console.error(
          '[CONTENT_MEMORY] Failed to record reservation collision:',
          eventError
        );
      });
      return { result: collision, reservationId: null, reservationKey };
    }
    throw error;
  }
};

export const releaseContentReservation = async (
  reservationId: string | null | undefined
): Promise<void> => {
  if (!reservationId) return;
  await prisma.contentReservation.deleteMany({ where: { id: reservationId } });
};

export const upsertContentArtifact = async (
  input: ContentArtifactWriteInput
) => {
  const title = inputTitle(input)?.slice(0, 500) ?? null;
  const normalizedTitle = normalizeIndexedText(title);
  const topic = nonEmpty(input.topic) ?? title;
  const normalizedTopic = normalizeIndexedText(topic);
  const outline = toOutlineText(input.outline);
  const searchText = buildContentMemorySearchText(input);
  const sourceHash = hashEmbeddingSource(searchText);
  const existingArtifact = await prisma.contentArtifact.findUnique({
    where: {
      organizationId_sourceType_sourceId: {
        organizationId: input.organizationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    select: {
      searchDocument: {
        select: {
          searchText: true,
          embeddingModel: true,
          embeddingSourceHash: true,
        },
      },
    },
  });
  const existingSearchDocument = existingArtifact?.searchDocument;
  const searchTextChanged =
    !existingSearchDocument ||
    existingSearchDocument.searchText !== searchText;
  const needsEmbedding =
    searchTextChanged ||
    existingSearchDocument?.embeddingModel !==
      CONTENT_MEMORY_EMBEDDING_MODEL ||
    existingSearchDocument?.embeddingSourceHash !== sourceHash;
  const artifact = await prisma.contentArtifact.upsert({
    where: {
      organizationId_sourceType_sourceId: {
        organizationId: input.organizationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      artifactType: input.artifactType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      rootArtifactId: input.rootArtifactId,
      title,
      normalizedTitle,
      topic,
      normalizedTopic,
      angle: nonEmpty(input.angle),
      audience: nonEmpty(input.audience),
      primaryKeyword: nonEmpty(input.primaryKeyword),
      searchIntent: nonEmpty(input.searchIntent),
      language: nonEmpty(input.language),
      locale: nonEmpty(input.locale),
      market: nonEmpty(input.market),
      summary: nonEmpty(input.summary),
      outline: outline || undefined,
      currentStage: input.currentStage,
      status: input.status ?? ContentArtifactStatus.ACTIVE,
      contentHash: contentHash(input.content),
      reservationKey: input.reservationKey,
      searchDocument: {
        create: {
          organizationId: input.organizationId,
          searchText,
          searchMetadata: {
            sourceType: input.sourceType,
            stage: input.currentStage,
          },
          contentHash: contentHash(input.content),
        },
      },
    },
    update: {
      rootArtifactId: input.rootArtifactId,
      title,
      normalizedTitle,
      topic,
      normalizedTopic,
      angle: nonEmpty(input.angle),
      audience: nonEmpty(input.audience),
      primaryKeyword: nonEmpty(input.primaryKeyword),
      searchIntent: nonEmpty(input.searchIntent),
      language: nonEmpty(input.language),
      locale: nonEmpty(input.locale),
      market: nonEmpty(input.market),
      summary: nonEmpty(input.summary),
      outline: outline || undefined,
      currentStage: input.currentStage,
      status: input.status ?? ContentArtifactStatus.ACTIVE,
      contentHash: contentHash(input.content),
      searchDocument: {
        upsert: {
          create: {
            organizationId: input.organizationId,
            searchText,
            searchMetadata: {
              sourceType: input.sourceType,
              stage: input.currentStage,
            },
            contentHash: contentHash(input.content),
          },
          update: {
            searchText,
            searchMetadata: {
              sourceType: input.sourceType,
              stage: input.currentStage,
            },
            contentHash: contentHash(input.content),
            ...(searchTextChanged
              ? {
                  embeddingModel: null,
                  embeddingSourceHash: null,
                  embeddingError: null,
                  embeddingAttempts: 0,
                  embeddedAt: null,
                }
              : {}),
            indexedAt: new Date(),
          },
        },
      },
    },
  });
  if (needsEmbedding) {
    await enqueueContentSearchEmbedding({
      artifactId: artifact.id,
      searchText,
    }).catch((embeddingError) => {
      console.warn(
        '[CONTENT_MEMORY] Failed to enqueue semantic indexing:',
        embeddingError instanceof Error
          ? embeddingError.message
          : embeddingError
      );
    });
  }
  return artifact;
};

export const recordDuplicateGuardEvent = async (params: {
  organizationId: string;
  userId: string;
  requestId?: string;
  artifactId?: string;
  input: ContentMemoryInput;
  result: DuplicateGuardResult;
  userAction?: string;
}): Promise<void> => {
  await prisma.duplicateGuardEvent.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.userId,
      artifactId: params.artifactId,
      requestId: params.requestId,
      inputFingerprint: buildReservationKey(params.input),
      verdict: params.result.verdict,
      confidence: params.result.confidence,
      reasons: params.result.reasons,
      recommendedAction: params.result.recommendedAction,
      matchedArtifactIds: params.result.matchedArtifacts.map(
        (artifact) => artifact.id
      ),
      retrievalMetadata: params.result.retrieval,
      classifierMetadata: params.result.retrieval?.classifierInvoked
        ? {
            model: params.result.retrieval.classifierModel,
            latencyMs: params.result.retrieval.classifierLatencyMs,
            sameElements: params.result.sameElements,
            differentElements: params.result.differentElements,
            alternativeAngles: params.result.alternativeAngles,
          }
        : undefined,
      enforcementMetadata: params.result.enforcement,
      userAction: params.userAction,
    },
  });
};

export const recordContentGuardOutcome = async (params: {
  organizationId: string;
  requestId: string;
  artifactId: string;
  userAction:
    | 'continued'
    | 'changed_angle'
    | 'opened_existing'
    | 'cancelled'
    | 'overrode_block';
}): Promise<void> => {
  await prisma.duplicateGuardEvent.updateMany({
    where: {
      organizationId: params.organizationId,
      requestId: params.requestId,
      userAction: null,
    },
    data: {
      artifactId: params.artifactId,
      userAction: params.userAction,
    },
  });
};
