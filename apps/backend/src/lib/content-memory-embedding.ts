import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getGeminiClient } from '@/lib/ai/providers/gemini/client';

export const CONTENT_MEMORY_EMBEDDING_DIMENSIONS = 768;
export const CONTENT_MEMORY_EMBEDDING_MODEL =
  process.env.CONTENT_MEMORY_EMBEDDING_MODEL || 'gemini-embedding-001';

const EMBEDDING_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.CONTENT_MEMORY_EMBEDDING_TIMEOUT_MS) || 8_000
);
const MAX_EMBEDDING_ATTEMPTS = 5;

export type HybridCandidateScore = {
  artifactId: string;
  semanticScore?: number;
  lexicalScore?: number;
};

export type HybridRetrievalResult = {
  scores: Map<string, HybridCandidateScore>;
  semanticAvailable: boolean;
  semanticCandidateCount: number;
  lexicalCandidateCount: number;
};

const isConfiguredApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'empty' && key !== 'your-gemini-api-key');
};

export const isContentMemorySemanticEnabled = () =>
  process.env.CONTENT_MEMORY_SEMANTIC_ENABLED !== 'false' &&
  isConfiguredApiKey();

export const hashEmbeddingSource = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const toVectorLiteral = (values: number[]): string => {
  if (
    values.length !== CONTENT_MEMORY_EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Embedding must contain ${CONTENT_MEMORY_EMBEDDING_DIMENSIONS} finite values`
    );
  }
  return `[${values.join(',')}]`;
};

export const embedContentMemoryText = async (params: {
  text: string;
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
  title?: string | null;
}): Promise<number[]> => {
  if (!isContentMemorySemanticEnabled()) {
    throw new Error('Content Memory semantic retrieval is disabled');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    const usesEmbedding2 =
      CONTENT_MEMORY_EMBEDDING_MODEL.includes('gemini-embedding-2');
    const embeddingText = usesEmbedding2
      ? params.taskType === 'RETRIEVAL_QUERY'
        ? `Task: Retrieve semantically related editorial content.\nQuery:\n${params.text}`
        : `Task: Represent this editorial artifact for semantic retrieval.\n${
            params.title ? `Title: ${params.title}\n` : ''
          }Document:\n${params.text}`
      : params.text;
    const response = await getGeminiClient().models.embedContent({
      model: CONTENT_MEMORY_EMBEDDING_MODEL,
      contents: embeddingText.slice(0, 20_000),
      config: {
        ...(!usesEmbedding2
          ? {
              taskType: params.taskType,
              ...(params.taskType === 'RETRIEVAL_DOCUMENT' && params.title
                ? { title: params.title.slice(0, 500) }
                : {}),
            }
          : {}),
        outputDimensionality: CONTENT_MEMORY_EMBEDDING_DIMENSIONS,
        abortSignal: controller.signal,
      },
    });
    const values = response.embeddings?.[0]?.values;
    if (!values) throw new Error('Embedding provider returned no vector');
    toVectorLiteral(values);
    return values;
  } finally {
    clearTimeout(timeout);
  }
};

export const refreshContentSearchEmbedding = async (
  artifactId: string
): Promise<boolean> => {
  const document = await prisma.contentSearchDocument.findUnique({
    where: { artifactId },
    select: {
      id: true,
      artifactId: true,
      organizationId: true,
      searchText: true,
      embeddingSourceHash: true,
      embeddingModel: true,
      artifact: { select: { title: true } },
    },
  });
  if (!document?.searchText.trim()) return false;

  const sourceHash = hashEmbeddingSource(document.searchText);
  if (
    document.embeddingModel === CONTENT_MEMORY_EMBEDDING_MODEL &&
    document.embeddingSourceHash === sourceHash
  ) {
    return false;
  }

  try {
    const values = await embedContentMemoryText({
      text: document.searchText,
      title: document.artifact.title,
      taskType: 'RETRIEVAL_DOCUMENT',
    });
    const vector = toVectorLiteral(values);
    await prisma.$executeRaw`
      UPDATE "ContentSearchDocument"
      SET
        "embedding" = ${vector}::vector,
        "embeddingModel" = ${CONTENT_MEMORY_EMBEDDING_MODEL},
        "embeddingSourceHash" = ${sourceHash},
        "embeddingError" = NULL,
        "embeddingAttempts" = 0,
        "lastEmbeddingAttemptAt" = CURRENT_TIMESTAMP,
        "embeddedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${document.id}
        AND "organizationId" = ${document.organizationId}
        AND "artifactId" = ${document.artifactId}
        AND "searchText" = ${document.searchText}
    `;
    return true;
  } catch (error) {
    await prisma.contentSearchDocument
      .updateMany({
        where: {
          id: document.id,
          organizationId: document.organizationId,
        },
        data: {
          embeddingError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Unknown embedding failure',
          embeddingAttempts: { increment: 1 },
          lastEmbeddingAttemptAt: new Date(),
        },
      })
      .catch(() => undefined);
    throw error;
  }
};

export const enqueueContentSearchEmbedding = async (params: {
  artifactId: string;
  searchText: string;
}): Promise<void> => {
  if (!isContentMemorySemanticEnabled()) return;
  const sourceHash = hashEmbeddingSource(params.searchText).slice(0, 16);
  const { aiQueue } = await import('@/lib/queue');
  await aiQueue.add(
    'content-memory-embed',
    { artifactId: params.artifactId },
    {
      jobId: `content-memory-embed-${params.artifactId}-${sourceHash}`,
      attempts: MAX_EMBEDDING_ATTEMPTS,
    }
  );
};

export const refreshPendingContentSearchEmbeddings = async (
  limit = 25
): Promise<{ attempted: number; refreshed: number }> => {
  if (!isContentMemorySemanticEnabled()) {
    return { attempted: 0, refreshed: 0 };
  }
  const documents = await prisma.contentSearchDocument.findMany({
    where: {
      embeddingAttempts: { lt: MAX_EMBEDDING_ATTEMPTS },
      OR: [
        { embeddingModel: null },
        { embeddingModel: { not: CONTENT_MEMORY_EMBEDDING_MODEL } },
        { embeddedAt: null },
      ],
    },
    select: { artifactId: true },
    orderBy: { indexedAt: 'asc' },
    take: Math.max(1, Math.min(limit, 100)),
  });

  let refreshed = 0;
  for (const document of documents) {
    try {
      if (await refreshContentSearchEmbedding(document.artifactId)) {
        refreshed += 1;
      }
    } catch (error) {
      console.warn(
        '[CONTENT_MEMORY_EMBEDDING] Backfill item failed:',
        document.artifactId,
        error instanceof Error ? error.message : error
      );
    }
  }
  return { attempted: documents.length, refreshed };
};

type SemanticRow = {
  artifactId: string;
  semanticScore: number;
};

type LexicalRow = {
  artifactId: string;
  lexicalScore: number;
};

export const retrieveHybridCandidateScores = async (params: {
  organizationId: string;
  searchText: string;
  limit?: number;
}): Promise<HybridRetrievalResult> => {
  const query = params.searchText.trim().slice(0, 5_000);
  const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
  if (!query) {
    return {
      scores: new Map(),
      semanticAvailable: false,
      semanticCandidateCount: 0,
      lexicalCandidateCount: 0,
    };
  }

  const lexicalPromise = prisma
    .$queryRaw<LexicalRow[]>(Prisma.sql`
      SELECT
        document."artifactId"::text AS "artifactId",
        LEAST(
          1.0,
          GREATEST(
            similarity(document."searchText", ${query}),
            ts_rank_cd(
              to_tsvector('simple', document."searchText"),
              plainto_tsquery('simple', ${query})
            )
          )
        )::double precision AS "lexicalScore"
      FROM "ContentSearchDocument" AS document
      JOIN "ContentArtifact" AS artifact
        ON artifact."id" = document."artifactId"
       AND artifact."organizationId" = ${params.organizationId}
      WHERE document."organizationId" = ${params.organizationId}
        AND artifact."status" IN ('ACTIVE', 'ARCHIVED')
        AND (
          to_tsvector('simple', document."searchText")
            @@ plainto_tsquery('simple', ${query})
          OR similarity(document."searchText", ${query}) >= 0.12
        )
      ORDER BY "lexicalScore" DESC
      LIMIT ${limit}
    `)
    .catch((error) => {
      console.warn(
        '[CONTENT_MEMORY_RETRIEVAL] Lexical retrieval unavailable:',
        error instanceof Error ? error.message : error
      );
      return [] as LexicalRow[];
    });

  const semanticPromise = (async (): Promise<SemanticRow[]> => {
    if (!isContentMemorySemanticEnabled()) return [];
    const values = await embedContentMemoryText({
      text: query,
      taskType: 'RETRIEVAL_QUERY',
    });
    const vector = toVectorLiteral(values);
    return prisma.$queryRaw<SemanticRow[]>(Prisma.sql`
      SELECT
        document."artifactId"::text AS "artifactId",
        GREATEST(
          0.0,
          LEAST(1.0, 1 - (document."embedding" <=> ${vector}::vector))
        )::double precision AS "semanticScore"
      FROM "ContentSearchDocument" AS document
      JOIN "ContentArtifact" AS artifact
        ON artifact."id" = document."artifactId"
       AND artifact."organizationId" = ${params.organizationId}
      WHERE document."organizationId" = ${params.organizationId}
        AND document."embedding" IS NOT NULL
        AND document."embeddingModel" = ${CONTENT_MEMORY_EMBEDDING_MODEL}
        AND document."embeddedAt" IS NOT NULL
        AND artifact."status" IN ('ACTIVE', 'ARCHIVED')
      ORDER BY document."embedding" <=> ${vector}::vector
      LIMIT ${limit}
    `);
  })().catch((error) => {
    console.warn(
      '[CONTENT_MEMORY_RETRIEVAL] Semantic retrieval unavailable:',
      error instanceof Error ? error.message : error
    );
    return [] as SemanticRow[];
  });

  const [lexicalRows, semanticRows] = await Promise.all([
    lexicalPromise,
    semanticPromise,
  ]);
  const scores = new Map<string, HybridCandidateScore>();
  for (const row of lexicalRows) {
    scores.set(row.artifactId, {
      artifactId: row.artifactId,
      lexicalScore: Number(row.lexicalScore),
    });
  }
  for (const row of semanticRows) {
    const current = scores.get(row.artifactId);
    scores.set(row.artifactId, {
      ...current,
      artifactId: row.artifactId,
      semanticScore: Number(row.semanticScore),
    });
  }
  return {
    scores,
    semanticAvailable: semanticRows.length > 0,
    semanticCandidateCount: semanticRows.length,
    lexicalCandidateCount: lexicalRows.length,
  };
};
