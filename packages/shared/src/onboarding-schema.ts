import { z } from 'zod';

import { EditorialProfileConfigSchema } from './editorial-profile-schema';

export const OnboardingStepSchema = z.enum([
  'activation',
  'discovery',
  'review',
]);

export const UserRoleSchema = z.enum([
  'editor_in_chief',
  'editor_reviewer',
  'content_writer',
  'it_ops_admin',
]);

export const AcquisitionSourceSchema = z.enum([
  'social_media',
  'colleague_recommendation',
  'google',
  'industry_blog',
  'chatgpt',
  'claude',
  'perplexity',
  'gemini',
  'other',
]);

export const USER_ROLE_LABELS: Record<z.infer<typeof UserRoleSchema>, string> = {
  editor_in_chief: 'Editor in Chief',
  editor_reviewer: 'Editor & Reviewer',
  content_writer: 'Content Writer',
  it_ops_admin: 'IT / Ops Admin',
};

export const ACQUISITION_SOURCE_LABELS: Record<z.infer<typeof AcquisitionSourceSchema>, string> = {
  google: 'Google Search',
  social_media: 'Social Media',
  colleague_recommendation: 'Colleague Recommendation',
  industry_blog: 'Industry Blog',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  other: 'Other Channel',
};

export const PRIMARY_GOAL_LABELS: Record<string, string> = {
  grow_traffic: 'Grow Organic Traffic',
  publish_faster: 'Publish Content Faster',
  knowledge_base: 'Build Knowledge Base',
  research: 'In-Depth Research',
  documentation: 'Technical Documentation',
};

export const ActivationDataSchema = z.object({
  workspaceName: z.string().trim().min(2).max(100),
  website: z.union([z.string().trim().url(), z.literal('')]),
  userRole: UserRoleSchema,
  acquisitionSource: AcquisitionSourceSchema,
  acquisitionSourceOther: z.string().trim().max(200).optional().nullable(),
  primaryGoal: z.enum(['grow_traffic', 'publish_faster', 'knowledge_base', 'research', 'documentation']),
  defaultLanguage: z.enum(['en', 'id', 'auto']),
}).refine(
  (val) => {
    if (val.acquisitionSource === 'other') {
      return Boolean(val.acquisitionSourceOther && val.acquisitionSourceOther.trim().length >= 2);
    }
    return true;
  },
  {
    message: 'Please specify your acquisition source channel (min 2 characters).',
    path: ['acquisitionSourceOther'],
  }
);

export const OnboardingDataSchema = z.object({
  activation: ActivationDataSchema,
  editorialProfile: EditorialProfileConfigSchema.optional().nullable(),
}).strict();

const OnboardingDraftDataSchema = z.object({
  activation: z.object({
    workspaceName: z.string().trim().max(100),
    website: z.string().trim().max(300),
    userRole: z.string().trim().max(50).optional(),
    acquisitionSource: z.string().trim().max(50).optional(),
    acquisitionSourceOther: z.string().trim().max(200).optional().nullable(),
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
export type UserRole = z.infer<typeof UserRoleSchema>;
export type AcquisitionSource = z.infer<typeof AcquisitionSourceSchema>;

export const DEFAULT_ONBOARDING_DATA: OnboardingData = {
  activation: {
    workspaceName: '',
    website: '',
    userRole: 'editor_in_chief' as const,
    acquisitionSource: 'google' as const,
    acquisitionSourceOther: '',
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
    metaTitleMaxLength: 70,
    metaDescriptionMaxLength: 160,
    tagCountMin: 3,
    tagCountMax: 5,
  },
  internalLinkDomains: [],
  internalLinkBaseUrl: '',
  customInstructions: '',
  allowedEditorialTerms: [],
});
