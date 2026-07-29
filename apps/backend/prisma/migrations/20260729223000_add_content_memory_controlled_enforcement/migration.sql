ALTER TABLE "DuplicateGuardEvent"
  ADD COLUMN "enforcementMetadata" JSONB,
  ADD COLUMN "feedbackActorUserId" TEXT,
  ADD COLUMN "feedbackAt" TIMESTAMP(3);

ALTER TABLE "DuplicateGuardEvent"
  ADD CONSTRAINT "DuplicateGuardEvent_feedbackActorUserId_fkey"
  FOREIGN KEY ("feedbackActorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DuplicateGuardEvent_organizationId_verdict_laterConfirmedDuplicate_idx"
  ON "DuplicateGuardEvent"(
    "organizationId",
    "verdict",
    "laterConfirmedDuplicate"
  );
