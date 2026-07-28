-- CreateTable
CREATE TABLE "StrategistChatRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategistChatRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategistChatRequest_userId_idx" ON "StrategistChatRequest"("userId");

-- CreateIndex
CREATE INDEX "StrategistChatRequest_status_idx" ON "StrategistChatRequest"("status");

-- CreateIndex
CREATE INDEX "StrategistChatRequest_createdAt_idx" ON "StrategistChatRequest"("createdAt");
