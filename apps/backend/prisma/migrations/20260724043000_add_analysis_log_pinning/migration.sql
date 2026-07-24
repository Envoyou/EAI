-- AlterTable
ALTER TABLE "AnalysisLog" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AnalysisLog_organizationId_isPinned_createdAt_idx"
ON "AnalysisLog"("organizationId", "isPinned", "createdAt");
