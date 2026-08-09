-- CreateTable
CREATE TABLE "EditorialEvaluationTransition" (
    "id" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "transitionType" TEXT NOT NULL,
    "organizationId" TEXT,
    "sourceRef" TEXT,
    "inputRunId" TEXT,
    "outputRunId" TEXT,
    "provenance" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB NOT NULL,
    "contextSnapshot" JSONB,
    "deterministicSignals" JSONB,
    "evaluationResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialEvaluationTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditorialEvaluationTransition_transitionKey_key" ON "EditorialEvaluationTransition"("transitionKey");

-- CreateIndex
CREATE INDEX "EditorialEvaluationTransition_organizationId_createdAt_idx" ON "EditorialEvaluationTransition"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialEvaluationTransition_transitionType_createdAt_idx" ON "EditorialEvaluationTransition"("transitionType", "createdAt");

-- CreateIndex
CREATE INDEX "EditorialEvaluationTransition_sourceRef_idx" ON "EditorialEvaluationTransition"("sourceRef");

-- CreateIndex
CREATE INDEX "EditorialEvaluationTransition_inputRunId_idx" ON "EditorialEvaluationTransition"("inputRunId");

-- CreateIndex
CREATE INDEX "EditorialEvaluationTransition_outputRunId_idx" ON "EditorialEvaluationTransition"("outputRunId");

-- AddForeignKey
ALTER TABLE "EditorialEvaluationTransition" ADD CONSTRAINT "EditorialEvaluationTransition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialEvaluationTransition" ADD CONSTRAINT "EditorialEvaluationTransition_inputRunId_fkey" FOREIGN KEY ("inputRunId") REFERENCES "EditorialEvaluationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialEvaluationTransition" ADD CONSTRAINT "EditorialEvaluationTransition_outputRunId_fkey" FOREIGN KEY ("outputRunId") REFERENCES "EditorialEvaluationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
