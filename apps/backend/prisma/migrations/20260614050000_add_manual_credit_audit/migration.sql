ALTER TABLE "CreditTransaction"
ADD COLUMN "adjustmentReason" TEXT,
ADD COLUMN "adjustmentGroupKey" TEXT,
ADD COLUMN "ticketReference" TEXT,
ADD COLUMN "performedByUserId" TEXT,
ADD COLUMN "performedByEmail" TEXT;

CREATE INDEX "CreditTransaction_performedByUserId_createdAt_idx"
ON "CreditTransaction"("performedByUserId", "createdAt");

CREATE INDEX "CreditTransaction_adjustmentGroupKey_idx"
ON "CreditTransaction"("adjustmentGroupKey");
