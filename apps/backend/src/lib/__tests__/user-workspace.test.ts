import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  toClerkOrganizationContext,
  ensureCurrentUserRecord,
} from '../user-workspace';
import { prisma } from '../db';

vi.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/trial-credits', () => ({
  ensurePersonalTrialCredits: vi.fn().mockResolvedValue(true),
  ensureOrganizationTrialCredits: vi.fn().mockResolvedValue(true),
}));

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    users: {
      getUser: vi.fn(),
    },
    organizations: {
      getOrganization: vi.fn(),
    },
  }),
}));

type UserFindUniqueResult = Awaited<ReturnType<typeof prisma.user.findUnique>>;

describe('user-workspace service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toClerkOrganizationContext', () => {
    test('should map auth context fields to ClerkOrganizationContext', () => {
      const auth = {
        orgId: 'org_123',
        orgSlug: 'test-org',
        orgRole: 'org:admin',
      };
      const context = toClerkOrganizationContext(auth);

      expect(context).toEqual({
        clerkOrganizationId: 'org_123',
        clerkOrganizationSlug: 'test-org',
        clerkOrganizationRole: 'org:admin',
      });
    });

    test('should handle missing org fields gracefully', () => {
      const context = toClerkOrganizationContext({});
      expect(context).toEqual({
        clerkOrganizationId: undefined,
        clerkOrganizationSlug: undefined,
        clerkOrganizationRole: undefined,
      });
    });
  });

  describe('ensureCurrentUserRecord', () => {
    test('should return existing user without creating a new record', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
        imageUrl: null,
        role: 'user',
        organizationId: null,
        aiProviderOverride: null,
        trialUsed: false,
        balanceIdr: 0,
        lastSignInAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        mockUser as unknown as UserFindUniqueResult
      );

      const user = await ensureCurrentUserRecord('user_123');
      expect(user).toEqual(mockUser);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
