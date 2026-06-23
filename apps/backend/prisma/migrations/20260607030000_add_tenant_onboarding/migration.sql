CREATE TYPE "OnboardingStatus" AS ENUM ('pending', 'completed');
CREATE TYPE "CmsConnectionStatus" AS ENUM ('pending', 'verified', 'failed');

ALTER TABLE "Organization"
    ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'completed',
    ADD COLUMN "activatedAt" TIMESTAMP(3),
    ADD COLUMN "publicationName" TEXT,
    ADD COLUMN "domain" TEXT;

UPDATE "Organization"
SET "activatedAt" = COALESCE("activatedAt", "createdAt")
WHERE "onboardingStatus" = 'completed';

CREATE TABLE "OnboardingDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'organization',
    "data" JSONB NOT NULL,
    "encryptedCredentials" TEXT,
    "credentialKeyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmsConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedCredentials" TEXT,
    "credentialKeyVersion" TEXT,
    "status" "CmsConnectionStatus" NOT NULL DEFAULT 'pending',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmsConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingDraft_userId_key" ON "OnboardingDraft"("userId");
CREATE UNIQUE INDEX "CmsConnection_organizationId_adapterKey_key"
    ON "CmsConnection"("organizationId", "adapterKey");
CREATE INDEX "CmsConnection_organizationId_isActive_idx"
    ON "CmsConnection"("organizationId", "isActive");

ALTER TABLE "OnboardingDraft"
    ADD CONSTRAINT "OnboardingDraft_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CmsConnection"
    ADD CONSTRAINT "CmsConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
