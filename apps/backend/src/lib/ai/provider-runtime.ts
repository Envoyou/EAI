import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import type { ResponseMode, Role } from '@eai/shared';

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

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'empty',
});

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'empty',
});

export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || 'empty',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://envoyou.com',
    'X-Title': process.env.OPENROUTER_APP_TITLE || 'Envoyou AI',
  },
});

export const getGeminiSamplingConfig = (model: string, temperature: number) =>
  model.startsWith('gemini-3')
    ? {}
    : { temperature };

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

export const getGeminiFinishReason = (response: {
  candidates?: Array<{
    finishReason?: string;
  }>;
}) => response.candidates?.[0]?.finishReason;

export const getGeminiModelForRole = (
  role: Role,
  analysisSpeed: AnalysisSpeed = 'balanced'
): string => {
  if (analysisSpeed === 'fast') {
    switch (role) {
      case 'fact-checker':
        return 'gemini-3.5-flash';
      case 'polish':
      case 'author':
      case 'editor':
      case 'seo':
      default:
        return 'gemini-3.1-flash-lite';
    }
  }

  switch (role) {
    case 'author':
    case 'seo':
      return 'gemini-3.1-flash-lite';
    case 'polish':
    case 'editor':
    case 'fact-checker':
    default:
      return 'gemini-3.5-flash';
  }
};

export const getGeminiReviewOutputLimit = (
  role: Role,
  mode: ResponseMode
) => {
  if (role === 'polish') {
    return mode === 'standard' ? 4096 : mode === 'compact' ? 3072 : 2048;
  }
  return GEMINI_REVIEW_OUTPUT_TOKENS[mode];
};

export const getGroqReviewOutputLimit = (mode: ResponseMode) =>
  GEMINI_REVIEW_OUTPUT_TOKENS[mode];

export const getOpenRouterReviewOutputLimit = (mode: ResponseMode) =>
  GEMINI_REVIEW_OUTPUT_TOKENS[mode];

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

export const extractOpenRouterUsage = (response: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  } | null;
}) => response.usage;
