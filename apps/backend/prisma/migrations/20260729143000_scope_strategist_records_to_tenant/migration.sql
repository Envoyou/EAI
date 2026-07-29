-- Scope durable Strategist request/recovery records to the active tenant.
ALTER TABLE "StrategistPlanRequest"
ADD COLUMN "organizationId" TEXT;

ALTER TABLE "StrategistChatRequest"
ADD COLUMN "organizationId" TEXT;

-- Safely attribute existing requests when their persisted session already owns
-- an organization. Requests without an attributable session remain in the
-- personal/null scope instead of being guessed from the user's current tenant.
UPDATE "StrategistPlanRequest" AS request
SET "organizationId" = session."organizationId"
FROM "ChatSession" AS session
WHERE request."sessionId" = session."id";

UPDATE "StrategistChatRequest" AS request
SET "organizationId" = session."organizationId"
FROM "ChatSession" AS session
WHERE request."sessionId" = session."id";

CREATE INDEX "ChatSession_userId_organizationId_idx"
ON "ChatSession"("userId", "organizationId");

CREATE INDEX "StrategistPlanRequest_organizationId_idx"
ON "StrategistPlanRequest"("organizationId");

CREATE INDEX "StrategistPlanRequest_userId_organizationId_idx"
ON "StrategistPlanRequest"("userId", "organizationId");

CREATE INDEX "StrategistChatRequest_organizationId_idx"
ON "StrategistChatRequest"("organizationId");

CREATE INDEX "StrategistChatRequest_userId_organizationId_idx"
ON "StrategistChatRequest"("userId", "organizationId");
