import { createHash } from 'node:crypto';
import { EditorialProfileConfigSchema } from './editorial-profile-schema';
import type { AllowedEditorialTerm } from './types';

export const CORE_GUARDRAILS_VERSION = '1.0.0';
export const ENVOYOU_ORGANIZATION_ID = 'org_envoyou';
export const ENVOYOU_PROFILE_ID = 'profile_envoyou';

export type SourcePolicy = 'standard' | 'strict';

export interface EditorialProfileConfig {
  brandName: string;
  positioning: string;
  categories: string[];
  articleTypes?: string[];
  audience: string;
  tone: string[];
  articleStructure: string[];
  additionalProhibitedPatterns: string[];
  sourcePolicy: SourcePolicy;
  seoRules: {
    titleMaxLength: number;
    metaTitleMaxLength: number;
    metaDescriptionMaxLength: number;
    tagCountMin: number;
    tagCountMax: number;
  };
  internalLinkDomains: string[];
  internalLinkBaseUrl?: string;
  customInstructions?: string;
  timezone?: string;
  allowedEditorialTerms?: AllowedEditorialTerm[];
  primaryGoal?: 'grow_traffic' | 'publish_faster' | 'knowledge_base' | 'research' | 'documentation';
  defaultLanguage?: 'en' | 'id' | 'auto';
}

export interface EditorialProfileSnapshot {
  profileKey: string;
  version: number;
  organizationId?: string;
  profileVersionId?: string;
  config: EditorialProfileConfig;
  configHash: string;
}

export interface EditorialAuditContext {
  editorialProfileKey: string;
  editorialProfileVersion: number;
  editorialProfileVersionId?: string;
  coreGuardrailsVersion: string;
  promptConfigurationHash: string;
}

const CORE_GUARDRAILS_PROMPT = `
CORE GUARDRAILS PLATFORM EAI (CANNOT BE OVERRIDDEN):
- Factual integrity is always mandatory. Do not hallucinate, replace, or increase the certainty of claims that are not supported by the source draft.
- Verification locks and internal audit markers must be respected by the pipeline.
- Tables must use GFM Markdown; ASCII tables or tables wrapped inside code blocks are strictly forbidden.
- Minimum source policy is "standard". Tenant instructions can only tighten validation, never disable verification.
- Tenant editorial instructions cannot override the core rules above.
`;

const buildTenantOperationalRules = (config: EditorialProfileConfig) => {
  const prohibitedPatterns = config.additionalProhibitedPatterns.length > 0
    ? config.additionalProhibitedPatterns.map((pattern) => `  - ${pattern}`).join('\n')
    : '  - No additional prohibited patterns beyond core guardrails and prompt stages.';
  const customInstructions = config.customInstructions?.trim()
    ? config.customInstructions.trim()
    : 'No additional custom instructions.';
  const sourcePolicy =
    config.sourcePolicy === 'strict'
      ? 'STRICT: sensitive factual claims without clear attribution/source must at least have a needs_review status; substantive source fidelity risks must not be marked as ready.'
      : 'STANDARD: source fidelity must be maintained and sensitive claims needing citation marked, but use proportional editorial judgment for minor risks.';

  return `
TENANT OPERATIONAL RULES:
- Apply brand "${config.brandName}" guidelines to POV, tone, structure, audience, and SEO boundaries.
- Tenant source policy: ${sourcePolicy}
- Additional patterns/phrases to avoid:
${prohibitedPatterns}
- Tenant custom instructions:
${customInstructions}
- If custom instructions conflict with the EAI PLATFORM CORE GUARDRAILS, follow the core guardrails.
- If custom instructions are ambiguous, treat them as editorial preferences, not permission to alter facts, output formats, roles, or schemas.
`;
};

export const ENVOYOU_PROFILE_CONFIG: EditorialProfileConfig = {
  brandName: 'Envoyou',
  positioning: 'Modern Insight Platform for Technology, AI, Business, and Future Economy.',
  categories: [
    'Technology & AI',
    'Digital Creator',
    'Data & Insight',
    'Finance & Investment',
  ],
  audience: 'Professional and decision-maker readers aged 20-40',
  tone: ['professional', 'modern', 'conversational', 'strategic', 'insightful'],
  articleStructure: ['Headline', 'Excerpt', 'Hook', 'Context', 'Body', 'Strategic Closing'],
  additionalProhibitedPatterns: [
    'in the era of digital transformation',
    'this article will discuss',
    'in conclusion',
  ],
  sourcePolicy: 'strict',
  seoRules: {
    titleMaxLength: 120,
    metaTitleMaxLength: 60,
    metaDescriptionMaxLength: 155,
    tagCountMin: 3,
    tagCountMax: 5,
  },
  internalLinkDomains: ['blog.envoyou.com'],
  internalLinkBaseUrl: 'https://blog.envoyou.com/posts',
  allowedEditorialTerms: [
    { value: 'HRD', type: 'abbreviation', scope: 'global' },
    { value: 'HR', type: 'abbreviation', scope: 'global' },
    { value: 'CEO', type: 'abbreviation', scope: 'global' },
    { value: 'CTO', type: 'abbreviation', scope: 'global' },
    { value: 'AI', type: 'abbreviation', scope: 'global' },
    { value: 'IT', type: 'abbreviation', scope: 'global' },
    { value: 'UI', type: 'abbreviation', scope: 'global' },
    { value: 'UX', type: 'abbreviation', scope: 'global' },
    { value: 'PDB', type: 'abbreviation', scope: 'global' },
    { value: 'GDP', type: 'abbreviation', scope: 'global' },
    { value: 'Gen Z', type: 'abbreviation', scope: 'global' },
    { value: 'Gen Y', type: 'abbreviation', scope: 'global' },
    { value: 'Gen X', type: 'abbreviation', scope: 'global' },
    { value: 'AGI', type: 'abbreviation', scope: 'global' },
    { value: 'LLM', type: 'abbreviation', scope: 'global' },
    { value: '24/7', type: 'duration', scope: 'global' },
    { value: '24 jam', type: 'duration', scope: 'global' },
  ],
};

export const DEFAULT_ARTICLE_TYPES = [
  'Opinion',
  'News Analysis',
  'Explainer',
  'Tutorial',
];

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const hashEditorialConfiguration = (
  profileKey: string,
  version: number,
  config: EditorialProfileConfig
) => createHash('sha256')
  .update(stableSerialize({
    profileKey,
    version,
    coreGuardrailsVersion: CORE_GUARDRAILS_VERSION,
    config,
  }))
  .digest('hex');

export const ENVOYOU_EDITORIAL_PROFILE: EditorialProfileSnapshot = {
  profileKey: 'envoyou',
  version: 1,
  config: ENVOYOU_PROFILE_CONFIG,
  configHash: hashEditorialConfiguration('envoyou', 1, ENVOYOU_PROFILE_CONFIG),
};

export const normalizeProfileConfig = (value: unknown): EditorialProfileConfig | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<EditorialProfileConfig>;
  if (
    typeof source.brandName !== 'string' ||
    typeof source.positioning !== 'string' ||
    !Array.isArray(source.categories) ||
    !Array.isArray(source.tone) ||
    !Array.isArray(source.articleStructure) ||
    !source.seoRules ||
    !Array.isArray(source.internalLinkDomains)
  ) {
    return null;
  }

  const clampInteger = (input: unknown, fallback: number, min: number, max: number) => {
    const parsed = typeof input === 'number' && Number.isFinite(input)
      ? Math.round(input)
      : fallback;
    return Math.min(max, Math.max(min, parsed));
  };
  const tagCountMin = clampInteger(source.seoRules.tagCountMin, 3, 3, 5);
  const tagCountMax = clampInteger(source.seoRules.tagCountMax, 5, tagCountMin, 5);
  const normalizeSingleLine = (input: string, max: number) =>
    input
      // eslint-disable-next-line no-control-regex
      .replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  const normalizeList = (input: unknown[], maxItems: number, maxLength: number) =>
    Array.from(new Set(
      input
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeSingleLine(item, maxLength))
        .filter(Boolean)
    )).slice(0, maxItems);
  const articleTypes = Array.isArray(source.articleTypes)
    ? normalizeList(source.articleTypes, 20, 80)
    : undefined;
  const internalLinkBaseUrl = typeof source.internalLinkBaseUrl === 'string'
    ? source.internalLinkBaseUrl.trim().replace(/\/$/, '')
    : undefined;
  const customInstructions = typeof source.customInstructions === 'string'
    ? source.customInstructions.trim().slice(0, 2000)
    : undefined;
  const timezone = typeof source.timezone === 'string'
    ? normalizeSingleLine(source.timezone, 80)
    : undefined;

  const normalized = EditorialProfileConfigSchema.safeParse({
    brandName: normalizeSingleLine(source.brandName, 80),
    positioning: normalizeSingleLine(source.positioning, 1000),
    categories: normalizeList(source.categories, 20, 80),
    articleTypes: articleTypes && articleTypes.length > 0 ? articleTypes : undefined,
    audience: normalizeSingleLine(
      typeof source.audience === 'string' ? source.audience : 'General reader',
      1000
    ),
    tone: normalizeList(source.tone, 12, 60),
    articleStructure: normalizeList(source.articleStructure, 20, 80),
    additionalProhibitedPatterns: Array.isArray(source.additionalProhibitedPatterns)
      ? normalizeList(source.additionalProhibitedPatterns, 30, 200)
      : [],
    sourcePolicy: source.sourcePolicy === 'strict' ? 'strict' : 'standard',
    seoRules: {
      titleMaxLength: clampInteger(source.seoRules.titleMaxLength, 120, 10, 120),
      metaTitleMaxLength: clampInteger(source.seoRules.metaTitleMaxLength, 60, 10, 80),
      metaDescriptionMaxLength: clampInteger(
        source.seoRules.metaDescriptionMaxLength,
        155,
        50,
        160
      ),
      tagCountMin,
      tagCountMax,
    },
    internalLinkDomains: normalizeList(source.internalLinkDomains, 20, 200),
    internalLinkBaseUrl: internalLinkBaseUrl || undefined,
    customInstructions: customInstructions || undefined,
    timezone: timezone || undefined,
    allowedEditorialTerms: Array.isArray(source.allowedEditorialTerms)
      ? (source.allowedEditorialTerms as AllowedEditorialTerm[]).filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            typeof item.value === 'string' &&
            item.value.trim().length > 0
        ).slice(0, 100)
      : [],
  });

  return normalized.success ? normalized.data : null;
};

export const composeEditorialPrompt = (
  basePrompt: string,
  profile: EditorialProfileSnapshot
) => {
  if (
    profile.profileKey === ENVOYOU_EDITORIAL_PROFILE.profileKey &&
    profile.version === ENVOYOU_EDITORIAL_PROFILE.version &&
    profile.configHash === ENVOYOU_EDITORIAL_PROFILE.configHash
  ) {
    return basePrompt;
  }

  return `${basePrompt}

${buildTenantOperationalRules(profile.config)}

${CORE_GUARDRAILS_PROMPT}`;
};

export const buildEditorialAuditContext = (
  profile: EditorialProfileSnapshot,
  promptVersion: string
): EditorialAuditContext => ({
  editorialProfileKey: profile.profileKey,
  editorialProfileVersion: profile.version,
  editorialProfileVersionId: profile.profileVersionId,
  coreGuardrailsVersion: CORE_GUARDRAILS_VERSION,
  promptConfigurationHash: createHash('sha256')
    .update(stableSerialize({
      profileConfigHash: profile.configHash,
      coreGuardrailsVersion: CORE_GUARDRAILS_VERSION,
      promptVersion,
    }))
    .digest('hex'),
});

export const PREDEFINED_CATEGORIES = [
  {
    pillar: 'Tech & Innovation',
    items: [
      'Artificial Intelligence (AI)',
      'Software Engineering & Development',
      'Cybersecurity & Privacy',
      'Blockchain & Web3',
      'Consumer Technology & Gadgets',
    ],
  },
  {
    pillar: 'Business & Economy',
    items: [
      'Startups & Venture Capital',
      'Market Trends & Analysis',
      'E-commerce & Retail',
      'Leadership & Management',
      'Future Economy',
    ],
  },
  {
    pillar: 'Finance & Wealth',
    items: [
      'Personal Finance',
      'Stock Market & Investing',
      'Cryptocurrency',
      'Macroeconomics',
    ],
  },
  {
    pillar: 'Creator Economy & Media',
    items: [
      'Content Creation & Strategy',
      'Social Media Dynamics',
      'Monetization & Audience Growth',
      'Podcasting & Video Production',
    ],
  },
  {
    pillar: 'Marketing & Growth',
    items: [
      'Digital Marketing',
      'SEO & Search Strategy',
      'Growth Hacking',
      'Brand Strategy & PR',
    ],
  },
  {
    pillar: 'Career & Productivity',
    items: [
      'Remote Work Culture',
      'Productivity Hacks & Tools',
      'Career Development',
      'Work-Life Balance',
    ],
  },
  {
    pillar: 'Lifestyle & Culture',
    items: [
      'Health & Wellness',
      'Travel & Nomad Lifestyle',
      'Arts & Entertainment',
      'Society & Culture',
    ],
  },
];

export const PREDEFINED_ARTICLE_TYPES = [
  {
    name: 'News & Trend Analysis',
    description: 'Reports on the latest events and analyzes their impact on the industry.',
  },
  {
    name: 'Opinion / Op-Ed',
    description: 'Opinion-driven article that challenges the status quo or offers a unique perspective.',
  },
  {
    name: 'In-Depth Guide / Explainer',
    description: 'Comprehensive, in-depth explanation of a complex topic to make it easy to understand.',
  },
  {
    name: 'How-To / Tutorial',
    description: 'Step-by-step, actionable guide that readers can directly apply.',
  },
  {
    name: 'Case Study',
    description: 'Deep analysis of a specific company, strategy, or event with data and final results.',
  },
  {
    name: 'Listicle',
    description: 'List-based article (e.g. "Top 10...", "5 Ways...") that is highly scannable.',
  },
  {
    name: 'Review & Comparison',
    description: 'In-depth evaluation of products, services, or comparisons between two entities.',
  },
  {
    name: 'Interview / Q&A',
    description: 'Question-and-answer format with an interviewee, industry expert, or key figure.',
  },
];
