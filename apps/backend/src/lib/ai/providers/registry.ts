/**
 * Provider registry.
 * Returns a singleton AIProvider instance per provider name.
 * This is the single import point for all callers — handlers, stage functions, runtime.
 */

import type { AIProvider } from './interface';
import { GeminiProvider } from './gemini/provider';
import { OpenRouterProvider } from './openrouter/provider';
import { GroqProvider } from './groq/provider';

export type RegisteredProvider = 'gemini' | 'groq' | 'openrouter';

const instances: Partial<Record<RegisteredProvider, AIProvider>> = {};

/**
 * Returns the singleton AIProvider for the given provider name.
 *
 * @throws {Error} if the provider name is not recognized.
 */
export function getProvider(name: RegisteredProvider): AIProvider {
  if (instances[name]) {
    return instances[name]!;
  }

  switch (name) {
    case 'gemini':
      instances.gemini = new GeminiProvider();
      return instances.gemini;
    case 'openrouter':
      instances.openrouter = new OpenRouterProvider();
      return instances.openrouter;
    case 'groq':
      instances.groq = new GroqProvider();
      return instances.groq;
    default: {
      // Exhaustiveness check — TypeScript will catch unhandled cases at compile time.
      const _exhaustive: never = name;
      throw new Error(`[ProviderRegistry] Unknown provider: "${String(_exhaustive)}"`);
    }
  }
}
