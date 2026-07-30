ALTER TABLE "AnalysisLog"
ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "AnalysisLog_userId_requestId_key"
ON "AnalysisLog"("userId", "requestId");
