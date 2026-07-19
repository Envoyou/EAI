import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const sdkMocks = vi.hoisted(() => ({
  geminiGenerateContent: vi.fn(),
  geminiGenerateContentStream: vi.fn(),
  openRouterCreate: vi.fn(),
  groqCreate: vi.fn(),
}));

vi.mock('../gemini/client', () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: sdkMocks.geminiGenerateContent,
      generateContentStream: sdkMocks.geminiGenerateContentStream,
    },
  }),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: sdkMocks.openRouterCreate } };
  },
}));

vi.mock('groq-sdk', () => ({
  default: class MockGroq {
    chat = { completions: { create: sdkMocks.groqCreate } };
  },
}));

import { GeminiProvider } from '../gemini/provider';
import { OpenRouterProvider } from '../openrouter/provider';
import { GroqProvider } from '../groq/provider';

const responseJsonSchema = {
  type: 'object',
  properties: {
    flags: { type: 'array', items: { type: 'string' } },
  },
  required: ['flags'],
};

const request = {
  systemInstruction: 'Return structured output.',
  userContent: 'Evaluate this draft.',
  model: 'test-model',
  responseFormat: 'json' as const,
  responseJsonSchema,
};

const emptyStream = () => ({
  async *[Symbol.asyncIterator]() {
    // No chunks are required to verify the outbound request contract.
  },
});

const originalServiceTier = process.env.GEMINI_SERVICE_TIER;

describe('provider structured-output transport contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.geminiGenerateContent.mockResolvedValue({ text: '{}' });
    sdkMocks.geminiGenerateContentStream.mockResolvedValue(emptyStream());
    sdkMocks.openRouterCreate.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
    });
    sdkMocks.groqCreate.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
    });
  });

  afterEach(() => {
    if (originalServiceTier === undefined) {
      delete process.env.GEMINI_SERVICE_TIER;
    } else {
      process.env.GEMINI_SERVICE_TIER = originalServiceTier;
    }
  });

  test('Gemini generate forwards MIME type and JSON schema', async () => {
    await new GeminiProvider().generate(request);

    expect(sdkMocks.geminiGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          responseJsonSchema,
        }),
      })
    );
  });

  test('Gemini stream forwards MIME type and JSON schema', async () => {
    await new GeminiProvider().stream(request);

    expect(sdkMocks.geminiGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          responseJsonSchema,
        }),
      })
    );
  });

  test('Gemini forwards Flex tier and timeout to generate and stream transports', async () => {
    process.env.GEMINI_SERVICE_TIER = 'flex';
    process.env.GEMINI_FLEX_TIMEOUT_MS = '900000';

    await new GeminiProvider().generate(request);
    await new GeminiProvider().stream(request);

    for (const sdkCall of [
      sdkMocks.geminiGenerateContent,
      sdkMocks.geminiGenerateContentStream,
    ]) {
      expect(sdkCall).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            serviceTier: 'flex',
            httpOptions: { timeout: 900_000 },
          }),
        })
      );
    }
  });

  test('OpenRouter generate forwards json_object response format', async () => {
    await new OpenRouterProvider().generate(request);

    expect(sdkMocks.openRouterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: false,
        response_format: { type: 'json_object' },
      })
    );
  });

  test('OpenRouter stream forwards json_object response format', async () => {
    sdkMocks.openRouterCreate.mockResolvedValueOnce(emptyStream());

    await new OpenRouterProvider().stream(request);

    expect(sdkMocks.openRouterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        response_format: { type: 'json_object' },
      })
    );
  });

  test('Groq generate forwards json_object response format', async () => {
    await new GroqProvider().generate(request);

    expect(sdkMocks.groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: false,
        response_format: { type: 'json_object' },
      })
    );
  });

  test('Groq stream forwards json_object response format', async () => {
    sdkMocks.groqCreate.mockResolvedValueOnce(emptyStream());

    await new GroqProvider().stream(request);

    expect(sdkMocks.groqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        response_format: { type: 'json_object' },
      })
    );
  });
});
