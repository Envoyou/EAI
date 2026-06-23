-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EditorialProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditorialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EditorialProfileVersion" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorialProfileVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AnalysisLog"
    ADD COLUMN "editorialProfileVersionId" TEXT,
    ADD COLUMN "editorialProfileKey" TEXT,
    ADD COLUMN "editorialProfileVersionNo" INTEGER,
    ADD COLUMN "coreGuardrailsVersion" TEXT,
    ADD COLUMN "promptConfigurationHash" TEXT;

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "EditorialProfile_organizationId_key_key" ON "EditorialProfile"("organizationId", "key");
CREATE INDEX "EditorialProfile_organizationId_isActive_idx" ON "EditorialProfile"("organizationId", "isActive");
CREATE UNIQUE INDEX "EditorialProfileVersion_profileId_version_key" ON "EditorialProfileVersion"("profileId", "version");
CREATE UNIQUE INDEX "EditorialProfileVersion_profileId_configHash_key" ON "EditorialProfileVersion"("profileId", "configHash");
CREATE INDEX "EditorialProfileVersion_profileId_createdAt_idx" ON "EditorialProfileVersion"("profileId", "createdAt");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "AnalysisLog_editorialProfileVersionId_idx" ON "AnalysisLog"("editorialProfileVersionId");

ALTER TABLE "User"
    ADD CONSTRAINT "User_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialProfile"
    ADD CONSTRAINT "EditorialProfile_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialProfileVersion"
    ADD CONSTRAINT "EditorialProfileVersion_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "EditorialProfile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalysisLog"
    ADD CONSTRAINT "AnalysisLog_editorialProfileVersionId_fkey"
    FOREIGN KEY ("editorialProfileVersionId") REFERENCES "EditorialProfileVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the current Envoyou behavior as immutable profile version 1.
INSERT INTO "Organization" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
VALUES ('org_envoyou', 'envoyou', 'Envoyou', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "EditorialProfile" (
    "id", "organizationId", "key", "name", "isActive", "createdAt", "updatedAt"
)
VALUES (
    'profile_envoyou', 'org_envoyou', 'envoyou', 'Envoyou Default', true,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "EditorialProfileVersion" (
    "id", "profileId", "version", "config", "configHash", "createdAt"
)
VALUES (
    'profile_envoyou_v1',
    'profile_envoyou',
    1,
    '{"brandName":"Envoyou","positioning":"Modern Insight Platform for Technology, AI, Business, and Future Economy.","categories":["Technology & AI","Digital Creator","Data & Insight","Finance & Investment"],"audience":"Professional and decision-maker readers aged 20-40","tone":["professional","modern","conversational","strategic","insightful"],"articleStructure":["Headline","Excerpt","Hook","Context","Body","Strategic Closing"],"additionalProhibitedPatterns":["Dalam era transformasi digital","Artikel ini akan membahas","Sebagai kesimpulan"],"sourcePolicy":"strict","seoRules":{"titleMaxLength":120,"metaTitleMaxLength":60,"metaDescriptionMaxLength":155,"tagCountMin":3,"tagCountMax":5},"internalLinkDomains":["blog.envoyou.com"],"internalLinkBaseUrl":"https://blog.envoyou.com/posts"}'::jsonb,
    'accb342ab93a3c829dc4320c49753603ae9660045ef8a82365a964f0d9db778d',
    CURRENT_TIMESTAMP
);

UPDATE "User"
SET "organizationId" = 'org_envoyou'
WHERE "organizationId" IS NULL;

-- Profile versions are audit records. Editing creates a new row instead.
CREATE OR REPLACE FUNCTION prevent_editorial_profile_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EditorialProfileVersion rows are immutable; create a new version instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER editorial_profile_version_no_update
BEFORE UPDATE OR DELETE ON "EditorialProfileVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_editorial_profile_version_mutation();

CREATE OR REPLACE FUNCTION protect_editorial_profile_identity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EditorialProfile rows use soft delete; set isActive to false instead';
  END IF;
  IF NEW."organizationId" <> OLD."organizationId" OR NEW."key" <> OLD."key" THEN
    RAISE EXCEPTION 'EditorialProfile organizationId and key are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER editorial_profile_identity_guard
BEFORE UPDATE OR DELETE ON "EditorialProfile"
FOR EACH ROW EXECUTE FUNCTION protect_editorial_profile_identity();
