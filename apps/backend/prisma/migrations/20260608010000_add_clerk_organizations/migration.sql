ALTER TABLE "Organization"
    ADD COLUMN "clerkOrganizationId" TEXT;

ALTER TABLE "AnalysisLog"
    ADD COLUMN "organizationId" TEXT;

UPDATE "AnalysisLog" AS log
SET "organizationId" = "User"."organizationId"
FROM "User"
WHERE log."userId" = "User"."id"
  AND log."organizationId" IS NULL;

CREATE UNIQUE INDEX "Organization_clerkOrganizationId_key"
    ON "Organization"("clerkOrganizationId");

CREATE INDEX "AnalysisLog_organizationId_idx"
    ON "AnalysisLog"("organizationId");

ALTER TABLE "AnalysisLog"
    ADD CONSTRAINT "AnalysisLog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
