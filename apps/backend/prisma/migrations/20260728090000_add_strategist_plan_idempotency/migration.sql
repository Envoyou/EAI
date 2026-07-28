-- CreateTable
CREATE TABLE "StrategistPlanRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategistPlanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategistPlanRequest_userId_idx" ON "StrategistPlanRequest"("userId");

-- CreateIndex
CREATE INDEX "StrategistPlanRequest_status_idx" ON "StrategistPlanRequest"("status");

-- CreateIndex
CREATE INDEX "StrategistPlanRequest_createdAt_idx" ON "StrategistPlanRequest"("createdAt");
