-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "editorialEvaluationConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "editorialEvaluationConsentUpdatedAt" TIMESTAMP(3),
ADD COLUMN "editorialEvaluationConsentByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Organization_editorialEvaluationConsent_idx" ON "Organization"("editorialEvaluationConsent");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_editorialEvaluationConsentByUserId_fkey" FOREIGN KEY ("editorialEvaluationConsentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
