import { z } from 'zod';

const singleLineString = (label: string, max: number) =>
  z.string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max)
    .refine(
      // eslint-disable-next-line no-control-regex
      (value) => !/[\r\n\u0000-\u001F\u007F]/.test(value),
      `${label} must be a single line without control characters.`
    );

const multiLineString = (label: string, max: number) =>
  z.string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max)
    .refine(
      // eslint-disable-next-line no-control-regex
      (value) => !/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/.test(value),
      `${label} must not contain invalid control characters.`
    );

export const AllowedEditorialTermSchema = z.object({
  value: z.string().trim().min(1, 'Value is required').max(100),
  type: z.enum(['abbreviation', 'framework', 'duration', 'brand_term']),
  scope: z.enum(['global', 'category']).default('global'),
  categories: z.array(z.string().trim().max(80)).optional(),
});

export const EditorialProfileConfigSchema = z.object({
  brandName: singleLineString('Brand name', 80),
  positioning: multiLineString('Positioning', 1000),
  categories: z.array(singleLineString('Category', 80)).min(1).max(20),
  articleTypes: z.array(singleLineString('Article type', 80)).min(1).max(20).optional(),
  audience: multiLineString('Audience', 1000),
  tone: z.array(singleLineString('Tone', 60)).min(1).max(12),
  articleStructure: z.array(singleLineString('Article structure', 80)).min(1).max(20),
  additionalProhibitedPatterns: z.array(singleLineString('Prohibited pattern', 200)).max(30),
  sourcePolicy: z.enum(['standard', 'strict']),
  seoRules: z.object({
    titleMaxLength: z.number().int().min(10).max(120),
    metaTitleMaxLength: z.number().int().min(10).max(80),
    metaDescriptionMaxLength: z.number().int().min(50).max(160),
    tagCountMin: z.number().int().min(3).max(5),
    tagCountMax: z.number().int().min(3).max(5),
  }).refine(
    (rules) => rules.tagCountMin <= rules.tagCountMax,
    { message: 'Minimum tag count cannot exceed maximum tag count.' }
  ),
  internalLinkDomains: z.array(singleLineString('Internal link domain', 200)).max(20),
  internalLinkBaseUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
  customInstructions: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().optional(),
  allowedEditorialTerms: z.array(AllowedEditorialTermSchema).max(100).default([]),
}).strict();

export type EditorialProfileConfigInput = z.infer<typeof EditorialProfileConfigSchema>;
