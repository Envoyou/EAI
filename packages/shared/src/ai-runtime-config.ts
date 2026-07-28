import { z } from 'zod';

export const AiProviderSchema = z.enum(['gemini', 'groq', 'openrouter']);
export type AiProviderName = z.infer<typeof AiProviderSchema>;

export const AI_FUNCTION_KEYS = [
  'strategist_chat',
  'strategist_chat_search',
  'strategist_greeting',
  'strategist_data_analysis',
  'strategist_blueprint',
  'strategist_deep_research',
  'strategist_quick_draft',
  'strategist_draft_from_notes',
  'analyze_review',
  'analyze_rewrite',
  'analyze_refine',
  'analyze_seo',
  'analyze_quality_gate',
  'analyze_targeted_fix',
] as const;

export const AiFunctionKeySchema = z.enum(AI_FUNCTION_KEYS);
export type AiFunctionKey = z.infer<typeof AiFunctionKeySchema>;

export const AiProviderModelSchema = z.object({
  provider: AiProviderSchema,
  model: z.string().trim().min(1).max(150).nullable(),
});
export type AiProviderModel = z.infer<typeof AiProviderModelSchema>;

export const AiRuntimeConfigSchema = z.object({
  version: z.literal(1),
  default: AiProviderModelSchema,
  functions: z.partialRecord(
    AiFunctionKeySchema,
    AiProviderModelSchema
  ),
});
export type AiRuntimeConfig = z.infer<typeof AiRuntimeConfigSchema>;

export type AiFunctionDefinition = {
  key: AiFunctionKey;
  category: 'Strategist' | 'Analyze';
  label: string;
  description: string;
  allowedProviders: readonly AiProviderName[];
};

const ALL_PROVIDERS = ['gemini', 'groq', 'openrouter'] as const;
const GEMINI_ONLY = ['gemini'] as const;

export const AI_FUNCTION_DEFINITIONS: readonly AiFunctionDefinition[] = [
  {
    key: 'strategist_chat',
    category: 'Strategist',
    label: 'Fast Chat',
    description: 'Conversational Strategist without Google Search.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'strategist_chat_search',
    category: 'Strategist',
    label: 'Fast Chat + Search',
    description: 'Grounded Strategist chat using native Google Search.',
    allowedProviders: GEMINI_ONLY,
  },
  {
    key: 'strategist_greeting',
    category: 'Strategist',
    label: 'Greeting',
    description: 'Initial Strategist greeting and suggested actions.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'strategist_data_analysis',
    category: 'Strategist',
    label: 'Data Analysis',
    description: 'Opening analysis of imported performance data.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'strategist_blueprint',
    category: 'Strategist',
    label: 'Blueprint',
    description: 'Structured editorial blueprint and draft preview.',
    allowedProviders: GEMINI_ONLY,
  },
  {
    key: 'strategist_deep_research',
    category: 'Strategist',
    label: 'Deep Research',
    description: 'Background Deep Research agent and status lifecycle.',
    allowedProviders: GEMINI_ONLY,
  },
  {
    key: 'strategist_quick_draft',
    category: 'Strategist',
    label: 'Quick Draft',
    description: 'Quick draft and outline generation.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'strategist_draft_from_notes',
    category: 'Strategist',
    label: 'Draft from Notes',
    description: 'Generates an article draft from saved research notes.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'analyze_review',
    category: 'Analyze',
    label: 'Review',
    description: 'Editorial review, polish diagnosis, and fact checking.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'analyze_rewrite',
    category: 'Analyze',
    label: 'Rewrite',
    description: 'Full article rewrite after review.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'analyze_refine',
    category: 'Analyze',
    label: 'Refine',
    description: 'Instruction-driven iterative refinement.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'analyze_seo',
    category: 'Analyze',
    label: 'SEO',
    description: 'SEO metadata and publication package generation.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'analyze_quality_gate',
    category: 'Analyze',
    label: 'Quality Gate',
    description: 'Final readiness and compliance assessment.',
    allowedProviders: ALL_PROVIDERS,
  },
  {
    key: 'analyze_targeted_fix',
    category: 'Analyze',
    label: 'Targeted Fix',
    description: 'Applies a bounded fix to selected draft content.',
    allowedProviders: ALL_PROVIDERS,
  },
] as const;

export const AI_FUNCTION_DEFINITION_BY_KEY = Object.fromEntries(
  AI_FUNCTION_DEFINITIONS.map((definition) => [definition.key, definition])
) as Record<AiFunctionKey, AiFunctionDefinition>;

export function isProviderAllowedForAiFunction(
  key: AiFunctionKey,
  provider: AiProviderName
): boolean {
  return AI_FUNCTION_DEFINITION_BY_KEY[key].allowedProviders.includes(
    provider as never
  );
}
