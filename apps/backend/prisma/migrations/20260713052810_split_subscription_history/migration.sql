-- DropIndex
DROP INDEX IF EXISTS "Subscription_organizationId_key";
DROP INDEX IF EXISTS "Subscription_userId_key";

-- Data Cleansing: Remove corrupted subscriptions where both userId and organizationId are set or both are NULL
DELETE FROM "Subscription" 
WHERE "userId" IS NOT NULL AND "organizationId" IS NOT NULL;

DELETE FROM "Subscription" 
WHERE "userId" IS NULL AND "organizationId" IS NULL;

-- Add CHECK Constraint for mutual exclusivity
ALTER TABLE "Subscription" ADD CONSTRAINT "chk_subscription_target"
CHECK (
  ("userId" IS NOT NULL AND "organizationId" IS NULL) OR
  ("userId" IS NULL AND "organizationId" IS NOT NULL)
);

-- Add Partial Unique Indexes for active subscriptions
CREATE UNIQUE INDEX "Subscription_active_userId_idx" ON "Subscription"("userId") WHERE ("status" = 'active');
CREATE UNIQUE INDEX "Subscription_active_organizationId_idx" ON "Subscription"("organizationId") WHERE ("status" = 'active');
