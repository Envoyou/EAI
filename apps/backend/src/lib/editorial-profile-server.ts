import { prisma } from '@/lib/db';
import {
  EditorialProfileConfig,
  EditorialProfileSnapshot,
  ENVOYOU_EDITORIAL_PROFILE,
  ENVOYOU_PROFILE_ID,
  hashEditorialConfiguration,
  normalizeProfileConfig,
} from '@eai/shared';

const toSnapshot = (
  organizationId: string,
  profile: {
    key: string;
    versions: Array<{
      id: string;
      version: number;
      config: unknown;
      configHash: string;
    }>;
  } | undefined
): EditorialProfileSnapshot | null => {
  const profileVersion = profile?.versions[0];
  const config = normalizeProfileConfig(profileVersion?.config);
  if (!profile || !profileVersion || !config) return null;

  return {
    profileKey: profile.key,
    version: profileVersion.version,
    organizationId,
    profileVersionId: profileVersion.id,
    config,
    configHash: profileVersion.configHash,
  };
};

export const resolveEditorialProfileForUser = async (
  userId: string,
  organizationId?: string | null
): Promise<EditorialProfileSnapshot> => {
  if (organizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        isActive: true,
        profiles: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            key: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                version: true,
                config: true,
                configHash: true,
              },
            },
          },
        },
      },
    });

    const profile = organization?.profiles[0];
    if (organization?.isActive) {
      const snapshot = toSnapshot(organizationId, profile);
      if (snapshot) return snapshot;
      throw new Error(`Active editorial profile not found for organization ${organizationId}.`);
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      organization: {
        select: {
          isActive: true,
          profiles: {
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              key: true,
              versions: {
                orderBy: { version: 'desc' },
                take: 1,
                select: {
                  id: true,
                  version: true,
                  config: true,
                  configHash: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const profile = user?.organization?.profiles[0];
  if (user?.organizationId && user.organization?.isActive) {
    const snapshot = toSnapshot(user.organizationId, profile);
    if (snapshot) return snapshot;
    throw new Error(`Active editorial profile not found for organization ${user.organizationId}.`);
  }

  const defaultProfile = await prisma.editorialProfile.findUnique({
    where: { id: ENVOYOU_PROFILE_ID },
    select: {
      organizationId: true,
      key: true,
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
        select: {
          id: true,
          version: true,
          config: true,
          configHash: true,
        },
      },
    },
  });

  return defaultProfile
    ? toSnapshot(defaultProfile.organizationId, defaultProfile) ?? ENVOYOU_EDITORIAL_PROFILE
    : ENVOYOU_EDITORIAL_PROFILE;
};

export const createEditorialProfileVersion = async (
  profileId: string,
  config: EditorialProfileConfig
) => prisma.$transaction(async (tx) => {
  const normalizedConfig = normalizeProfileConfig(config);
  if (!normalizedConfig) {
    throw new Error('Editorial profile configuration is invalid.');
  }

  const profile = await tx.editorialProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: {
      key: true,
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { version: true },
      },
    },
  });
  const version = (profile.versions[0]?.version ?? 0) + 1;
  const configHash = hashEditorialConfiguration(profile.key, version, normalizedConfig);

  return tx.editorialProfileVersion.create({
    data: {
      profileId,
      version,
      config: JSON.parse(JSON.stringify(normalizedConfig)),
      configHash,
    },
  });
});
