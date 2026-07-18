/**
 * Groq mapper.
 * Groq uses the same OpenAI-compatible API shape as OpenRouter,
 * so we simply re-export from the shared openrouter mapper.
 */

export {
  normalizeOpenAiChunk as normalizeGroqChunk,
  normalizeOpenAiUsage as normalizeGroqUsage,
  extractOpenAiResponseText as extractGroqResponseText,
  extractOpenAiText as extractGroqText,
} from '../openrouter/mapper';

export type {
  OpenAiCompatibleResponse,
  OpenAiCompatibleStreamChunk,
} from '../openrouter/mapper';
