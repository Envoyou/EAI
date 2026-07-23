import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import type { ResponseMode, Role } from '@eai/shared';
import { getGeminiGenerateConfig } from '@/lib/ai/gemini-request-policy';

export type AiProvider = 'gemini' | 'groq' | 'openrouter';
export type AnalysisSpeed = 'fast' | 'balanced' | 'deep';

export const GEMINI_REVIEW_OUTPUT_TOKENS = {
  standard: 3072,
  compact: 2400,
  manual_fallback: 1800,
} as const;

export const GROQ_MODEL = 'qwen/qwen3-32b';
export const GROQ_SEO_MODEL = 'llama-3.1-8b-instant';

export const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';
export const OPENROUTER_DEFAULT_SEO_MODEL = 'openai/gpt-4o-mini';

/**
 * Legacy GoogleGenAI client singleton.
 * @deprecated Use getProvider('gemini') for unified abstraction.
 */
export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'empty',
});

/**
 * Legacy Groq client singleton.
 * @deprecated Use getProvider('groq') for unified abstraction.
 */
export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'empty',
});

/**
 * Legacy OpenAI client singleton pointed to OpenRouter.
 * @deprecated Use getProvider('openrouter') for unified abstraction.
 */
export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || 'empty',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://envoyou.com',
    'X-Title': process.env.OPENROUTER_APP_TITLE || 'Envoyou AI',
  },
});

export const getNativeGeminiConfig = () => getGeminiGenerateConfig();

export const getOpenRouterSamplingConfig = (temperature: number): { temperature: number } =>
  ({ temperature });

/**
 * @deprecated Use getNativeGeminiConfig() for direct Gemini API calls
 * or getOpenRouterSamplingConfig(temperature) for OpenRouter.
 * This function is kept for backward-compat with non-gemini-3.x models.
 */
export const getGeminiSamplingConfig = (model: string, temperature: number) =>
  model.startsWith('gemini-3')
    ? getNativeGeminiConfig()
    : { temperature };

/**
 * @deprecated Use providers/gemini/mapper.ts extractGeminiText instead.
 */
export const extractGeminiText = (response: {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}) => {
  if (response.text) return response.text;

  return response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('') ?? '';
};

/**
 * @deprecated Use providers/gemini/mapper.ts extractGeminiFinishReason instead.
 */
export const getGeminiFinishReason = (response: {
  candidates?: Array<{
    finishReason?: string;
  }>;
}) => response.candidates?.[0]?.finishReason;

/**
 * @deprecated Use resolveModel from model-router.ts instead.
 */
export const getGeminiModelForRole = (
  role: Role,
  analysisSpeed: AnalysisSpeed = 'balanced'
): string => {
  if (role === 'seo') {
    return process.env.GEMINI_SEO_MODEL || 'gemini-3.5-flash-lite';
  }

  const customGeminiModel = process.env.GEMINI_MODEL;
  if (customGeminiModel) {
    return customGeminiModel;
  }

  if (analysisSpeed === 'fast') {
    switch (role) {
      case 'fact-checker':
        return 'gemini-3.6-flash';
      case 'polish':
      case 'author':
      case 'editor':
      default:
        return 'gemini-3.5-flash-lite';
    }
  }

  switch (role) {
    case 'author':
      return 'gemini-3.5-flash-lite';
    case 'polish':
    case 'editor':
    case 'fact-checker':
    default:
      return 'gemini-3.6-flash';
  }
};

/**
 * @deprecated Use resolveOutputLimit from model-router.ts instead.
 */
export const getGeminiReviewOutputLimit = (
  role: Role,
  mode: ResponseMode
) => {
  if (role === 'polish') {
    return mode === 'standard' ? 4096 : mode === 'compact' ? 3072 : 2048;
  }
  return GEMINI_REVIEW_OUTPUT_TOKENS[mode];
};

/**
 * @deprecated Use resolveOutputLimit from model-router.ts instead.
 */
export const getGroqReviewOutputLimit = (mode: ResponseMode) =>
  GEMINI_REVIEW_OUTPUT_TOKENS[mode];

/**
 * @deprecated Use resolveOutputLimit from model-router.ts instead.
 */
export const getOpenRouterReviewOutputLimit = (mode: ResponseMode) => {
  return mode === 'standard' ? 6000 : 4000;
};

/**
 * @deprecated Use resolveModel from model-router.ts instead.
 */
export const getOpenRouterModelForRole = (
  role: Role,
  _analysisSpeed: AnalysisSpeed = 'balanced'
): string => {
  const defaultModel = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;

  if (role === 'seo') {
    return process.env.OPENROUTER_SEO_MODEL || defaultModel;
  }

  return defaultModel;
};

/**
 * @deprecated Use providers/openrouter/mapper.ts extractOpenRouterText instead.
 */
export const extractOpenRouterText = (chunk: {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
    message?: {
      content?: string | null;
    };
  }>;
}) => chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? '';

/**
 * @deprecated Use providers/openrouter/mapper.ts extractOpenRouterUsage instead.
 */
export const extractOpenRouterUsage = (response: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
}) => response.usage;

// Re-export registry functions for convenience
export { getProvider } from './providers/registry';
