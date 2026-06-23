import { z } from 'zod';

import { AllowedEditorialTermSchema, EditorialProfileConfigSchema } from './editorial-profile-schema';

export const OnboardingStepSchema = z.enum([
  'organization',
  'editorial_profile',
  'editorial_rules',
  'cms_connection',
  'review',
]);

export const OnboardingDataSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(2).max(100),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60),
    domain: z.union([z.string().trim().url(), z.literal('')]),
    publicationName: z.string().trim().min(2).max(100),
  }),
  editorialProfile: EditorialProfileConfigSchema,
  cms: z.object({
    adapterKey: z.enum(['none', 'eai-rest-v1']),
    name: z.string().trim().max(100),
    baseUrl: z.union([z.string().trim().url(), z.literal('')]),
    verified: z.boolean(),
  }),
}).strict();

const OnboardingDraftDataSchema = z.object({
  organization: z.object({
    name: z.string().trim().max(100),
    slug: z.string().trim().max(60),
    domain: z.string().trim().max(300),
    publicationName: z.string().trim().max(100),
  }),
  editorialProfile: z.object({
    brandName: z.string().trim().max(80),
    positioning: z.string().trim().max(1000),
    categories: z.array(z.string().trim().max(80)).max(20),
    articleTypes: z.array(z.string().trim().max(80)).max(20),
    audience: z.string().trim().max(1000),
    tone: z.array(z.string().trim().max(60)).max(12),
    articleStructure: z.array(z.string().trim().max(80)).max(20),
    additionalProhibitedPatterns: z.array(z.string().trim().max(200)).max(30),
    sourcePolicy: z.enum(['standard', 'strict']),
    seoRules: z.object({
      titleMaxLength: z.number().int().min(10).max(120),
      metaTitleMaxLength: z.number().int().min(10).max(80),
      metaDescriptionMaxLength: z.number().int().min(50).max(160),
      tagCountMin: z.number().int().min(3).max(5),
      tagCountMax: z.number().int().min(3).max(5),
    }),
    internalLinkDomains: z.array(z.string().trim().max(200)).max(20),
    internalLinkBaseUrl: z.string().trim().max(300).optional(),
    customInstructions: z.string().trim().max(2000).optional(),
    allowedEditorialTerms: z.array(AllowedEditorialTermSchema).max(100).optional(),
  }),
  cms: z.object({
    adapterKey: z.enum(['none', 'eai-rest-v1']),
    name: z.string().trim().max(100),
    baseUrl: z.string().trim().max(300),
    verified: z.boolean(),
  }),
}).strict();

export const OnboardingSaveSchema = z.object({
  step: OnboardingStepSchema,
  data: OnboardingDraftDataSchema,
  cmsSecret: z.string().max(500).optional(),
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
  organization: {
    name: '',
    slug: '',
    domain: '',
    publicationName: '',
  },
  editorialProfile: {
    brandName: '',
    positioning: '',
    categories: [''],
    articleTypes: [],
    audience: '',
    tone: ['professional', 'clear'],
    articleStructure: ['Hook', 'Context', 'Body', 'Strategic Closing'],
    additionalProhibitedPatterns: [],
    sourcePolicy: 'standard',
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
  },
  cms: {
    adapterKey: 'none',
    name: '',
    baseUrl: '',
    verified: false,
  },
};

export const buildSandboxEditorialProfile = (
  publicationName: string
): OnboardingData['editorialProfile'] => ({
  ...DEFAULT_ONBOARDING_DATA.editorialProfile,
  brandName: publicationName,
  positioning: `A practical editorial workspace for ${publicationName}.`,
  categories: ['Technology & AI', 'Business & Economy'],
  articleTypes: ['Opinion', 'News Analysis', 'Explainer', 'Tutorial'],
  audience: 'Professional readers looking for clear, useful editorial insight.',
});
