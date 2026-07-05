import { z } from 'zod';

import { EditorialProfileConfigSchema } from './editorial-profile-schema';

export const OnboardingStepSchema = z.enum([
  'activation',
  'discovery',
  'review',
]);

export const OnboardingDataSchema = z.object({
  activation: z.object({
    workspaceName: z.string().trim().min(2).max(100),
    website: z.union([z.string().trim().url(), z.literal('')]),
    primaryGoal: z.enum(['grow_traffic', 'publish_faster', 'knowledge_base', 'research', 'documentation']),
    defaultLanguage: z.enum(['en', 'id', 'auto']),
  }),
  editorialProfile: EditorialProfileConfigSchema.optional().nullable(),
}).strict();

const OnboardingDraftDataSchema = z.object({
  activation: z.object({
    workspaceName: z.string().trim().max(100),
    website: z.string().trim().max(300),
    primaryGoal: z.string().trim().max(50),
    defaultLanguage: z.string().trim().max(10),
  }),
  editorialProfile: z.any().optional(),
}).strict();

export const OnboardingSaveSchema = z.object({
  step: OnboardingStepSchema,
  data: OnboardingDraftDataSchema,
}).strict();

export const CmsConnectionTestSchema = z.object({
  adapterKey: z.literal('eai-rest-v1'),
  name: z.string().trim().min(2).max(100),
  baseUrl: z.string().trim().url(),
  secret: z.string().min(8).max(500),
}).strict();

export type OnboardingData = z.infer<typeof OnboardingDataSchema>;
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const DEFAULT_ONBOARDING_DATA: OnboardingData = {
  activation: {
    workspaceName: '',
    website: '',
    primaryGoal: 'grow_traffic' as const,
    defaultLanguage: 'auto' as const,
  },
  editorialProfile: null,
};

export const buildSandboxEditorialProfile = (
  publicationName: string
): z.infer<typeof EditorialProfileConfigSchema> => ({
  brandName: publicationName,
  positioning: `A practical editorial workspace for ${publicationName}.`,
  categories: ['Technology & AI', 'Business & Economy'],
  articleTypes: ['News & Trend Analysis', 'Opinion / Op-Ed', 'In-Depth Guide / Explainer', 'How-To / Tutorial'],
  audience: 'Professional readers looking for clear, useful editorial insight.',
  tone: ['professional', 'clear'],
  articleStructure: ['Hook', 'Context', 'Body', 'Strategic Closing'],
  additionalProhibitedPatterns: [],
  sourcePolicy: 'strict' as const,
  seoRules: {
    titleMaxLength: 120,
    metaTitleMaxLength: 60,
    metaDescriptionMaxLength: 155,
    tagCountMin: 3,
    tagCountMax: 5,
  },
  internalLinkDomains: [],
  internalLinkBaseUrl: '',
  customInstructions: '',
  allowedEditorialTerms: [],
});

