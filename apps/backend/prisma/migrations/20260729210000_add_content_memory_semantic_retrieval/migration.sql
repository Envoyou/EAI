-- Enable tenant-scoped hybrid semantic retrieval in PostgreSQL.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "ContentSearchDocument"
  ADD COLUMN "embedding" vector(768),
  ADD COLUMN "embeddingSourceHash" TEXT,
  ADD COLUMN "embeddingError" TEXT,
  ADD COLUMN "embeddingAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastEmbeddingAttemptAt" TIMESTAMP(3);

ALTER TABLE "DuplicateGuardEvent"
  ADD COLUMN "retrievalMetadata" JSONB,
  ADD COLUMN "classifierMetadata" JSONB;

-- HNSW supports low-latency cosine nearest-neighbor retrieval and can be built
-- before the asynchronous embedding backfill has populated any rows.
CREATE INDEX "ContentSearchDocument_embedding_hnsw_idx"
  ON "ContentSearchDocument"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Keyword and fuzzy-title candidates remain available when the embedding
-- provider is disabled or temporarily unavailable.
CREATE INDEX "ContentSearchDocument_searchText_fts_idx"
  ON "ContentSearchDocument"
  USING gin (to_tsvector('simple', "searchText"));

CREATE INDEX "ContentSearchDocument_searchText_trgm_idx"
  ON "ContentSearchDocument"
  USING gin ("searchText" gin_trgm_ops);
