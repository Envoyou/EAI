-- Phase 6.1: persist tenant-scoped Content Intelligence decisions and
-- canonical relationships without changing or deleting source article bodies.
CREATE TYPE "ContentIntelligenceDecisionType" AS ENUM (
  'NOT_CANNIBALIZATION',
  'REPOSITIONED',
  'SET_CANONICAL',
  'CONSOLIDATED',
  'ARCHIVED'
);

ALTER TABLE "ContentArtifact"
ADD COLUMN "canonicalArtifactId" TEXT;

CREATE TABLE "ContentIntelligenceDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "ContentIntelligenceDecisionType" NOT NULL,
  "artifactId" TEXT NOT NULL,
  "relatedArtifactId" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContentIntelligenceDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentArtifact_canonicalArtifactId_idx"
ON "ContentArtifact"("canonicalArtifactId");

CREATE INDEX "ContentIntelligenceDecision_organizationId_createdAt_idx"
ON "ContentIntelligenceDecision"("organizationId", "createdAt");

CREATE INDEX "ContentIntelligenceDecision_organizationId_artifactId_idx"
ON "ContentIntelligenceDecision"("organizationId", "artifactId");

CREATE INDEX "ContentIntelligenceDecision_organizationId_relatedArtifactId_idx"
ON "ContentIntelligenceDecision"("organizationId", "relatedArtifactId");

ALTER TABLE "ContentArtifact"
ADD CONSTRAINT "ContentArtifact_canonicalArtifactId_fkey"
FOREIGN KEY ("canonicalArtifactId") REFERENCES "ContentArtifact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentIntelligenceDecision"
ADD CONSTRAINT "ContentIntelligenceDecision_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentIntelligenceDecision"
ADD CONSTRAINT "ContentIntelligenceDecision_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
