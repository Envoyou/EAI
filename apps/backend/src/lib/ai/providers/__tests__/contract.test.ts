import { describe, test, expect } from 'vitest';
import { getProvider } from '../registry';
import { GeminiProvider } from '../gemini/provider';
import { GroqProvider } from '../groq/provider';
import { OpenRouterProvider } from '../openrouter/provider';

describe('AIProvider contract compliance', () => {
  test('getProvider should return singleton instances matching provider types', () => {
    const geminiProv = getProvider('gemini');
    expect(geminiProv).toBeInstanceOf(GeminiProvider);
    expect(geminiProv.name).toBe('gemini');

    const groqProv = getProvider('groq');
    expect(groqProv).toBeInstanceOf(GroqProvider);
    expect(groqProv.name).toBe('groq');

    const openrouterProv = getProvider('openrouter');
    expect(openrouterProv).toBeInstanceOf(OpenRouterProvider);
    expect(openrouterProv.name).toBe('openrouter');
  });

  test('GeminiProvider has correct capabilities', () => {
    const geminiProv = getProvider('gemini');
    const capabilities = geminiProv.getCapabilities();
    expect(capabilities).toEqual({
      structuredOutput: false,
      grounding: true,
      thinking: true,
      caching: true,
    });
  });

  test('GroqProvider has correct capabilities', () => {
    const groqProv = getProvider('groq');
    const capabilities = groqProv.getCapabilities();
    expect(capabilities).toEqual({
      structuredOutput: true,
      grounding: false,
      thinking: false,
      caching: false,
    });
  });

  test('OpenRouterProvider has correct capabilities', () => {
    const openrouterProv = getProvider('openrouter');
    const capabilities = openrouterProv.getCapabilities();
    expect(capabilities).toEqual({
      structuredOutput: true,
      grounding: false,
      thinking: false,
      caching: false,
    });
  });
});
