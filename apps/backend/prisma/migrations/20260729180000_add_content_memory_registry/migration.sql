-- CreateEnum
CREATE TYPE "ContentArtifactType" AS ENUM ('BLUEPRINT', 'DRAFT', 'PUBLISHED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ContentSourceType" AS ENUM ('STRATEGIST_BLUEPRINT', 'QUICK_DRAFT', 'DRAFT_FROM_NOTES', 'MANUAL_DRAFT', 'ANALYSIS', 'CMS_IMPORT');

-- CreateEnum
CREATE TYPE "ContentArtifactStage" AS ENUM ('PLANNING', 'DRAFTING', 'REFINED', 'READY', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ContentArtifactStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateTable
CREATE TABLE "ContentArtifact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "artifactType" "ContentArtifactType" NOT NULL,
    "sourceType" "ContentSourceType" NOT NULL,
    "sourceId" TEXT,
    "rootArtifactId" TEXT,
    "title" TEXT,
    "normalizedTitle" TEXT,
    "topic" TEXT,
    "normalizedTopic" TEXT,
    "angle" TEXT,
    "audience" TEXT,
    "primaryKeyword" TEXT,
    "searchIntent" TEXT,
    "language" TEXT,
    "locale" TEXT,
    "market" TEXT,
    "summary" TEXT,
    "outline" JSONB,
    "currentStage" "ContentArtifactStage" NOT NULL,
    "status" "ContentArtifactStatus" NOT NULL DEFAULT 'ACTIVE',
    "contentHash" TEXT,
    "reservationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSearchDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "searchMetadata" JSONB,
    "contentHash" TEXT,
    "embeddingModel" TEXT,
    "embeddedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reservationKey" TEXT NOT NULL,
    "normalizedTopic" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateGuardEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "artifactId" TEXT,
    "requestId" TEXT,
    "inputFingerprint" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "matchedArtifactIds" JSONB NOT NULL,
    "userAction" TEXT,
    "laterConfirmedDuplicate" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateGuardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentArtifact_organizationId_status_currentStage_idx" ON "ContentArtifact"("organizationId", "status", "currentStage");
CREATE INDEX "ContentArtifact_organizationId_normalizedTitle_idx" ON "ContentArtifact"("organizationId", "normalizedTitle");
CREATE INDEX "ContentArtifact_organizationId_normalizedTopic_idx" ON "ContentArtifact"("organizationId", "normalizedTopic");
CREATE INDEX "ContentArtifact_organizationId_primaryKeyword_idx" ON "ContentArtifact"("organizationId", "primaryKeyword");
CREATE INDEX "ContentArtifact_organizationId_contentHash_idx" ON "ContentArtifact"("organizationId", "contentHash");
CREATE UNIQUE INDEX "ContentArtifact_organizationId_sourceType_sourceId_key" ON "ContentArtifact"("organizationId", "sourceType", "sourceId");
CREATE INDEX "ContentArtifact_rootArtifactId_idx" ON "ContentArtifact"("rootArtifactId");
CREATE UNIQUE INDEX "ContentArtifact_organizationId_reservationKey_key" ON "ContentArtifact"("organizationId", "reservationKey");
CREATE UNIQUE INDEX "ContentSearchDocument_artifactId_key" ON "ContentSearchDocument"("artifactId");
CREATE INDEX "ContentSearchDocument_organizationId_idx" ON "ContentSearchDocument"("organizationId");
CREATE INDEX "ContentSearchDocument_organizationId_indexedAt_idx" ON "ContentSearchDocument"("organizationId", "indexedAt");
CREATE UNIQUE INDEX "ContentReservation_organizationId_reservationKey_key" ON "ContentReservation"("organizationId", "reservationKey");
CREATE UNIQUE INDEX "ContentReservation_organizationId_requestId_key" ON "ContentReservation"("organizationId", "requestId");
CREATE INDEX "ContentReservation_expiresAt_idx" ON "ContentReservation"("expiresAt");
CREATE INDEX "DuplicateGuardEvent_organizationId_createdAt_idx" ON "DuplicateGuardEvent"("organizationId", "createdAt");
CREATE INDEX "DuplicateGuardEvent_organizationId_verdict_idx" ON "DuplicateGuardEvent"("organizationId", "verdict");
CREATE INDEX "DuplicateGuardEvent_artifactId_idx" ON "DuplicateGuardEvent"("artifactId");

-- AddForeignKey
ALTER TABLE "ContentArtifact" ADD CONSTRAINT "ContentArtifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentArtifact" ADD CONSTRAINT "ContentArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentArtifact" ADD CONSTRAINT "ContentArtifact_rootArtifactId_fkey" FOREIGN KEY ("rootArtifactId") REFERENCES "ContentArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentSearchDocument" ADD CONSTRAINT "ContentSearchDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentSearchDocument" ADD CONSTRAINT "ContentSearchDocument_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ContentArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReservation" ADD CONSTRAINT "ContentReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReservation" ADD CONSTRAINT "ContentReservation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DuplicateGuardEvent" ADD CONSTRAINT "DuplicateGuardEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DuplicateGuardEvent" ADD CONSTRAINT "DuplicateGuardEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuplicateGuardEvent" ADD CONSTRAINT "DuplicateGuardEvent_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ContentArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing tenant drafts as canonical artifacts. Search documents are
-- derived and can be rebuilt when semantic retrieval is introduced.
INSERT INTO "ContentArtifact" (
    "id", "organizationId", "createdByUserId", "artifactType", "sourceType",
    "sourceId", "title", "normalizedTitle", "topic", "normalizedTopic",
    "summary", "currentStage", "status", "contentHash", "createdAt", "updatedAt"
)
SELECT DISTINCT ON (
    log."organizationId",
    COALESCE(log."metadata"->>'sourceRef', log."id")
)
    'artifact_log_' || log."id",
    log."organizationId",
    log."userId",
    'DRAFT'::"ContentArtifactType",
    CASE
      WHEN log."role" IN ('draft_generation', 'outline_generation')
        AND log."metadata"->>'source' = 'strategist_notes'
        THEN 'DRAFT_FROM_NOTES'::"ContentSourceType"
      WHEN log."role" IN ('draft_generation', 'outline_generation')
        THEN 'QUICK_DRAFT'::"ContentSourceType"
      WHEN log."role" = 'editor'
        THEN 'MANUAL_DRAFT'::"ContentSourceType"
      ELSE 'ANALYSIS'::"ContentSourceType"
    END,
    COALESCE(log."metadata"->>'sourceRef', log."id"),
    left(COALESCE(log."metadata"->>'workingTitle', log."metadata"->>'topic', log."summary"), 500),
    left(lower(regexp_replace(COALESCE(log."metadata"->>'workingTitle', log."metadata"->>'topic', log."summary", ''), '[^[:alnum:]]+', ' ', 'g')), 500),
    left(COALESCE(log."metadata"->>'topic', log."metadata"->>'workingTitle', log."summary"), 2000),
    left(lower(regexp_replace(COALESCE(log."metadata"->>'topic', log."metadata"->>'workingTitle', log."summary", ''), '[^[:alnum:]]+', ' ', 'g')), 500),
    log."summary",
    'DRAFTING'::"ContentArtifactStage",
    'ACTIVE'::"ContentArtifactStatus",
    md5(log."content"),
    log."createdAt",
    log."createdAt"
FROM "AnalysisLog" AS log
WHERE log."organizationId" IS NOT NULL
  AND log."status" = 'success'
ORDER BY
    log."organizationId",
    COALESCE(log."metadata"->>'sourceRef', log."id"),
    log."createdAt" DESC;

INSERT INTO "ContentSearchDocument" (
    "id", "organizationId", "artifactId", "searchText", "contentHash",
    "indexedAt", "updatedAt"
)
SELECT
    'search_' || artifact."id",
    artifact."organizationId",
    artifact."id",
    concat_ws(E'\n', artifact."title", artifact."topic", artifact."summary"),
    artifact."contentHash",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ContentArtifact" AS artifact;

-- Backfill durable Blueprint results without exposing the underlying chat.
INSERT INTO "ContentArtifact" (
    "id", "organizationId", "createdByUserId", "artifactType", "sourceType",
    "sourceId", "title", "normalizedTitle", "topic", "normalizedTopic",
    "angle", "audience", "searchIntent", "outline", "summary", "currentStage",
    "status", "contentHash", "createdAt", "updatedAt"
)
SELECT
    'artifact_plan_' || request."id",
    request."organizationId",
    creator."id",
    'BLUEPRINT'::"ContentArtifactType",
    'STRATEGIST_BLUEPRINT'::"ContentSourceType",
    request."id",
    left(request."response"->'plan'->>'angle', 500),
    left(lower(regexp_replace(COALESCE(request."response"->'plan'->>'angle', ''), '[^[:alnum:]]+', ' ', 'g')), 500),
    left(request."response"->'plan'->>'angle', 2000),
    left(lower(regexp_replace(COALESCE(request."response"->'plan'->>'angle', ''), '[^[:alnum:]]+', ' ', 'g')), 500),
    request."response"->'plan'->>'angle',
    request."response"->'plan'->>'audience',
    request."response"->'plan'->>'seoIntent',
    to_jsonb(request."response"->'plan'->>'outline'),
    request."response"->>'reply',
    'PLANNING'::"ContentArtifactStage",
    'ACTIVE'::"ContentArtifactStatus",
    md5(COALESCE(request."response"->'plan'->>'draft', '')),
    request."createdAt",
    request."updatedAt"
FROM "StrategistPlanRequest" AS request
JOIN "Organization" AS organization
  ON organization."id" = request."organizationId"
LEFT JOIN "User" AS creator
  ON creator."id" = request."userId"
WHERE request."organizationId" IS NOT NULL
  AND request."status" = 'completed'
  AND request."response"->'plan' IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "ContentSearchDocument" (
    "id", "organizationId", "artifactId", "searchText", "contentHash",
    "indexedAt", "updatedAt"
)
SELECT
    'search_' || artifact."id",
    artifact."organizationId",
    artifact."id",
    concat_ws(E'\n', artifact."title", artifact."topic", artifact."angle", artifact."audience", artifact."searchIntent", artifact."summary", artifact."outline" #>> '{}'),
    artifact."contentHash",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ContentArtifact" AS artifact
WHERE artifact."sourceType" = 'STRATEGIST_BLUEPRINT'
ON CONFLICT DO NOTHING;
