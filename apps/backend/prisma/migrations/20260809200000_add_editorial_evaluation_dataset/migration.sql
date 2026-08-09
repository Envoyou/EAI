-- CreateTable
CREATE TABLE "EditorialEvaluationRun" (
    "id" TEXT NOT NULL,
    "analysisLogId" TEXT,
    "chatMessageId" TEXT,
    "requestId" TEXT,
    "environment" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "sourceRef" TEXT,
    "organizationId" TEXT,
    "userId" TEXT,
    "input" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptConfigurationHash" TEXT,
    "renderedPrompt" TEXT,
    "provider" TEXT,
    "modelName" TEXT NOT NULL,
    "modelParameters" JSONB,
    "output" TEXT,
    "automatedReview" JSONB,
    "score" INTEGER,
    "verdict" TEXT,
    "summary" TEXT,
    "telemetry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialEvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialRevisionEvent" (
    "id" TEXT NOT NULL,
    "evaluationRunId" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "revisionType" TEXT NOT NULL,
    "beforeText" TEXT NOT NULL,
    "afterText" TEXT NOT NULL,
    "changeSet" JSONB,
    "reviewStateBefore" TEXT,
    "reviewStateAfter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialRevisionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditorialEvaluationRun_analysisLogId_key" ON "EditorialEvaluationRun"("analysisLogId");
CREATE UNIQUE INDEX "EditorialEvaluationRun_chatMessageId_key" ON "EditorialEvaluationRun"("chatMessageId");
CREATE INDEX "EditorialEvaluationRun_environment_createdAt_idx" ON "EditorialEvaluationRun"("environment", "createdAt");
CREATE INDEX "EditorialEvaluationRun_organizationId_createdAt_idx" ON "EditorialEvaluationRun"("organizationId", "createdAt");
CREATE INDEX "EditorialEvaluationRun_workflow_stage_createdAt_idx" ON "EditorialEvaluationRun"("workflow", "stage", "createdAt");
CREATE INDEX "EditorialEvaluationRun_promptVersion_modelName_idx" ON "EditorialEvaluationRun"("promptVersion", "modelName");
CREATE INDEX "EditorialEvaluationRun_sourceRef_idx" ON "EditorialEvaluationRun"("sourceRef");
CREATE INDEX "EditorialRevisionEvent_evaluationRunId_createdAt_idx" ON "EditorialRevisionEvent"("evaluationRunId", "createdAt");
CREATE INDEX "EditorialRevisionEvent_organizationId_createdAt_idx" ON "EditorialRevisionEvent"("organizationId", "createdAt");
CREATE INDEX "EditorialRevisionEvent_revisionType_createdAt_idx" ON "EditorialRevisionEvent"("revisionType", "createdAt");

-- AddForeignKey
ALTER TABLE "EditorialEvaluationRun" ADD CONSTRAINT "EditorialEvaluationRun_analysisLogId_fkey" FOREIGN KEY ("analysisLogId") REFERENCES "AnalysisLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialEvaluationRun" ADD CONSTRAINT "EditorialEvaluationRun_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialEvaluationRun" ADD CONSTRAINT "EditorialEvaluationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialEvaluationRun" ADD CONSTRAINT "EditorialEvaluationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialRevisionEvent" ADD CONSTRAINT "EditorialRevisionEvent_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "EditorialEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialRevisionEvent" ADD CONSTRAINT "EditorialRevisionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialRevisionEvent" ADD CONSTRAINT "EditorialRevisionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
