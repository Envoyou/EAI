-- Preserve EditorialProfileVersion immutability by adding a new Envoyou
-- profile version instead of mutating the seeded historical version.
INSERT INTO "EditorialProfileVersion" (
    "id",
    "profileId",
    "version",
    "config",
    "configHash",
    "createdAt"
)
SELECT
    'profile_envoyou_v2',
    profile."id",
    2,
    jsonb_set(
        jsonb_set(
            latest."config",
            '{seoRules,metaTitleMaxLength}',
            '70'::jsonb,
            true
        ),
        '{seoRules,metaDescriptionMaxLength}',
        '160'::jsonb,
        true
    ),
    'ee8e8b426a070da635d442c704a168dc133bedcdef2d41323bbbc2207f729173',
    CURRENT_TIMESTAMP
FROM "EditorialProfile" AS profile
JOIN LATERAL (
    SELECT version."config"
    FROM "EditorialProfileVersion" AS version
    WHERE version."profileId" = profile."id"
    ORDER BY version."version" DESC
    LIMIT 1
) AS latest ON true
WHERE profile."id" = 'profile_envoyou'
  AND NOT EXISTS (
      SELECT 1
      FROM "EditorialProfileVersion" AS existing
      WHERE existing."profileId" = profile."id"
        AND existing."version" = 2
  );
