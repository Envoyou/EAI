import { describe, expect, it } from 'vitest';
import {
  parseStoredAiRuntimeConfig,
  resolveAiFunctionConfig,
  serializeAiRuntimeConfig,
} from '../ai-provider-resolver';

describe('AI provider resolver', () => {
  it('keeps legacy provider:model values backward compatible', () => {
    expect(parseStoredAiRuntimeConfig('groq:qwen/qwen3-32b')).toEqual({
      version: 1,
      default: {
        provider: 'groq',
        model: 'qwen/qwen3-32b',
      },
      functions: {},
    });
  });

  it('round-trips versioned per-function configuration', () => {
    const config = {
      version: 1 as const,
      default: {
        provider: 'gemini' as const,
        model: 'gemini-3.6-flash',
      },
      functions: {
        analyze_refine: {
          provider: 'groq' as const,
          model: 'qwen/qwen3-32b',
        },
        analyze_seo: {
          provider: 'openrouter' as const,
          model: 'openai/gpt-4o-mini',
        },
      },
    };

    expect(parseStoredAiRuntimeConfig(serializeAiRuntimeConfig(config))).toEqual(
      config
    );
  });

  it('uses a function override instead of the workspace default', () => {
    const selected = resolveAiFunctionConfig(
      {
        version: 1,
        default: { provider: 'gemini', model: null },
        functions: {
          strategist_chat: {
            provider: 'openrouter',
            model: 'openai/gpt-4o-mini',
          },
        },
      },
      'strategist_chat'
    );

    expect(selected).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
    });
  });

  it('protects Gemini-native functions from an incompatible default', () => {
    const selected = resolveAiFunctionConfig(
      {
        version: 1,
        default: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
        },
        functions: {},
      },
      'strategist_chat_search'
    );

    expect(selected).toEqual({ provider: 'gemini', model: null });
  });
});
