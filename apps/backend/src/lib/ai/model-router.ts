/**
 * ModelRouter — editorial business logic for model and output-limit selection.
 *
 * This deliberately lives OUTSIDE the provider implementations.
 * Model selection is a business/editorial decision (cost, speed, quality trade-offs),
 * not a transport concern. Providers only know HOW to call a model; the router
 * knows WHICH model to call.
 *
 * Consolidates:
 *  - getGeminiModelForRole()
 *  - getOpenRouterModelForRole()
 *  - getGeminiReviewOutputLimit()
 *  - getGroqReviewOutputLimit()
 *  - getOpenRouterReviewOutputLimit()
 *
 * from provider-runtime.ts. Those functions are preserved there for backward compat
 * but delegate to this module.
 */

import type { Role, ResponseMode } from '@eai/shared';
import type { AnalysisSpeed } from '@/lib/ai/provider-runtime';
import type { RegisteredProvider } from './providers/registry';

// ── Constants (duplicated for backward compat in provider-runtime.ts) ─────────

export const GROQ_DEFAULT_MODEL = 'qwen/qwen3-32b';
export const GROQ_DEFAULT_SEO_MODEL = 'llama-3.1-8b-instant';

export const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';
export const OPENROUTER_DEFAULT_SEO_MODEL = 'openai/gpt-4o-mini';

const GEMINI_REVIEW_OUTPUT_TOKENS = {
  standard: 3072,
  compact: 2400,
  manual_fallback: 1800,
} as const;

// ── Model Selection ───────────────────────────────────────────────────────────

function resolveGeminiModel(role: Role, speed: AnalysisSpeed): string {
  if (role === 'seo') {
    return process.env.GEMINI_SEO_MODEL || 'gemini-3.5-flash-lite';
  }

  const customModel = process.env.GEMINI_MODEL;
  if (customModel) return customModel;

  if (speed === 'fast') {
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
}

function resolveOpenRouterModel(role: Role, _speed: AnalysisSpeed): string {
  const defaultModel = process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;
  if (role === 'seo') {
    return process.env.OPENROUTER_SEO_MODEL || defaultModel;
  }
  return defaultModel;
}

function resolveGroqModel(role: Role): string {
  if (role === 'seo') return GROQ_DEFAULT_SEO_MODEL;
  return GROQ_DEFAULT_MODEL;
}

/**
 * Resolves the model name for a given provider, editorial role, and analysis speed.
 *
 * @param modelOverride - If provided, always returned as-is (user-selected model).
 */
export function resolveModel(
  provider: RegisteredProvider,
  role: Role,
  speed: AnalysisSpeed,
  modelOverride?: string | null
): string {
  if (modelOverride) return modelOverride;

  switch (provider) {
    case 'gemini':
      return resolveGeminiModel(role, speed);
    case 'openrouter':
      return resolveOpenRouterModel(role, speed);
    case 'groq':
      return resolveGroqModel(role);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`[ModelRouter] Unknown provider: "${String(_exhaustive)}"`);
    }
  }
}

// ── Output Token Limits ───────────────────────────────────────────────────────

/**
 * Resolves the maximum output token count for a given provider, role, and response mode.
 */
export function resolveOutputLimit(
  provider: RegisteredProvider,
  role: Role,
  mode: ResponseMode
): number {
  switch (provider) {
    case 'gemini': {
      if (role === 'polish') {
        return mode === 'standard' ? 4096 : mode === 'compact' ? 3072 : 2048;
      }
      return GEMINI_REVIEW_OUTPUT_TOKENS[mode];
    }
    case 'groq':
      return GEMINI_REVIEW_OUTPUT_TOKENS[mode]; // Same limits work for Groq
    case 'openrouter':
      return mode === 'standard' ? 6000 : 4000;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`[ModelRouter] Unknown provider: "${String(_exhaustive)}"`);
    }
  }
}
