ALTER TABLE "AnalysisLog"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "AnalysisLog_organizationId_updatedAt_idx"
ON "AnalysisLog"("organizationId", "updatedAt");
