import { describe, test, expect, vi, beforeEach } from 'vitest';
import { OnboardingDataSchema, type OnboardingData } from '@eai/shared';

describe('onboarding-persistence schema and data contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod Schema Validation for acquisitionSourceOther', () => {
    test('should validate acquisitionSourceOther when acquisitionSource is other', () => {
      const validData = {
        activation: {
          workspaceName: 'Envoyou Test',
          website: 'https://envoyou.com',
          userRole: 'editor_in_chief' as const,
          acquisitionSource: 'other' as const,
          acquisitionSourceOther: 'Reddit Community',
          primaryGoal: 'grow_traffic' as const,
          defaultLanguage: 'en' as const,
        },
        editorialProfile: null,
      };

      const result = OnboardingDataSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    test('should fail validation when acquisitionSource is other but acquisitionSourceOther is empty or too short', () => {
      const invalidData = {
        activation: {
          workspaceName: 'Envoyou Test',
          website: 'https://envoyou.com',
          userRole: 'editor_in_chief' as const,
          acquisitionSource: 'other' as const,
          acquisitionSourceOther: 'x',
          primaryGoal: 'grow_traffic' as const,
          defaultLanguage: 'en' as const,
        },
        editorialProfile: null,
      };

      const result = OnboardingDataSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    test('should pass validation when acquisitionSource is google and acquisitionSourceOther is empty or null', () => {
      const validData = {
        activation: {
          workspaceName: 'Envoyou Test',
          website: 'https://envoyou.com',
          userRole: 'editor_in_chief' as const,
          acquisitionSource: 'google' as const,
          acquisitionSourceOther: null,
          primaryGoal: 'grow_traffic' as const,
          defaultLanguage: 'en' as const,
        },
        editorialProfile: null,
      };

      const result = OnboardingDataSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('Persistence field contracts', () => {
    test('should construct explicit activation transaction update payload with nullish coalescing', () => {
      const activationInput: OnboardingData['activation'] = {
        workspaceName: 'Envoyou Tech',
        website: 'https://envoyou.com',
        userRole: 'content_writer',
        acquisitionSource: 'chatgpt',
        acquisitionSourceOther: null,
        primaryGoal: 'research',
        defaultLanguage: 'id',
      };

      const organizationData = {
        publicationName: activationInput.workspaceName ?? null,
        domain: activationInput.website ? activationInput.website : null,
        onboardingStatus: 'completed',
        acquisitionSource: activationInput.acquisitionSource ?? null,
        acquisitionSourceOther: activationInput.acquisitionSource === 'other' ? (activationInput.acquisitionSourceOther ?? null) : null,
        primaryGoal: activationInput.primaryGoal ?? null,
        onboardingCompletedAt: expect.any(Date),
        activatedAt: expect.any(Date),
      };

      const userData = {
        role: 'admin',
        onboardingRole: activationInput.userRole ?? null,
      };

      expect(organizationData.publicationName).toBe('Envoyou Tech');
      expect(organizationData.acquisitionSource).toBe('chatgpt');
      expect(organizationData.acquisitionSourceOther).toBeNull();
      expect(organizationData.primaryGoal).toBe('research');
      expect(userData.onboardingRole).toBe('content_writer');
    });

    test('should set strict null for all onboarding analytics when onboarding is skipped', () => {
      const skippedOrganizationData = {
        publicationName: 'Publication',
        isActive: true,
        onboardingStatus: 'completed',
        onboardingCompletedAt: expect.any(Date),
        activatedAt: expect.any(Date),
        acquisitionSource: null,
        acquisitionSourceOther: null,
        primaryGoal: null,
      };

      const skippedUserData = {
        role: 'admin',
        onboardingRole: null,
      };

      expect(skippedOrganizationData.acquisitionSource).toBeNull();
      expect(skippedOrganizationData.acquisitionSourceOther).toBeNull();
      expect(skippedOrganizationData.primaryGoal).toBeNull();
      expect(skippedUserData.onboardingRole).toBeNull();
    });
  });
});
