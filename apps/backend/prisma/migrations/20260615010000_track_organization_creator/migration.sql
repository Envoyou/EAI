ALTER TABLE "Organization"
ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Organization_createdByUserId_idx"
ON "Organization"("createdByUserId");
