ALTER TABLE "OnboardingDraft"
ADD COLUMN "organizationId" TEXT;

CREATE INDEX "OnboardingDraft_organizationId_idx"
ON "OnboardingDraft"("organizationId");
