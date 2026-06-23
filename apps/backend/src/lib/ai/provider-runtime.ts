import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import type { ResponseMode, Role } from '@/types';

export type AiProvider = 'gemini' | 'groq';
export type AnalysisSpeed = 'fast' | 'balanced' | 'deep';

export const GEMINI_REVIEW_OUTPUT_TOKENS = {
  standard: 3072,
  compact: 2400,
  manual_fallback: 1800,
} as const;

export const GROQ_MODEL = 'qwen/qwen3-32b';
export const GROQ_SEO_MODEL = 'llama-3.1-8b-instant';

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'empty',
});

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'empty',
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
