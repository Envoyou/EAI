CREATE TYPE "CreditBucket" AS ENUM ('trial', 'subscription', 'addon');

CREATE TYPE "CreditTransactionType" AS ENUM (
    'trial',
    'monthly_allocation',
    'yearly_monthly_allocation',
    'addon_purchase',
    'article_refine',
    'refund',
    'cycle_reset',
    'manual_adjustment'
);

ALTER TABLE "User"
ADD COLUMN "trialUsed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "type" "CreditTransactionType" NOT NULL,
    "bucket" "CreditBucket" NOT NULL,
    "amount" INTEGER NOT NULL,
    "subscriptionId" TEXT,
    "analysisLogId" TEXT,
    "idempotencyKey" TEXT,
    "description" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "analysisLogId" TEXT,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 1,
    "costEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");

CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key"
ON "CreditTransaction"("idempotencyKey");
CREATE INDEX "CreditTransaction_userId_bucket_idx"
ON "CreditTransaction"("userId", "bucket");
CREATE INDEX "CreditTransaction_organizationId_bucket_idx"
ON "CreditTransaction"("organizationId", "bucket");
CREATE INDEX "CreditTransaction_periodStart_periodEnd_idx"
ON "CreditTransaction"("periodStart", "periodEnd");

CREATE UNIQUE INDEX "CreditUsage_analysisLogId_key" ON "CreditUsage"("analysisLogId");
CREATE INDEX "CreditUsage_userId_idx" ON "CreditUsage"("userId");
CREATE INDEX "CreditUsage_organizationId_idx" ON "CreditUsage"("organizationId");
CREATE INDEX "CreditUsage_createdAt_idx" ON "CreditUsage"("createdAt");

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditTransaction"
ADD CONSTRAINT "CreditTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditTransaction"
ADD CONSTRAINT "CreditTransaction_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditUsage"
ADD CONSTRAINT "CreditUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditUsage"
ADD CONSTRAINT "CreditUsage_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditUsage"
ADD CONSTRAINT "CreditUsage_analysisLogId_fkey"
FOREIGN KEY ("analysisLogId") REFERENCES "AnalysisLog"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
