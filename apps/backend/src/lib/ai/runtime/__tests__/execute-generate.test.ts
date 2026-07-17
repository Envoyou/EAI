import { describe, test, expect, vi } from 'vitest';
import { executeGenerate } from '../execute-generate';
import type { AIProvider, StreamRequest, ProviderCapabilities } from '../../providers/interface';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';

class FakeAIProvider implements AIProvider {
  readonly name = 'gemini' as const;

  constructor(
    private responseText: string,
    private shouldFail: boolean = false
  ) {}

  async stream(_request: StreamRequest): Promise<AsyncIterable<import('../../providers/interface').StreamChunk>> {
    return {
      async *[Symbol.asyncIterator]() {
        // empty
      }
    };
  }

  async generate(_request: StreamRequest) {
    if (this.shouldFail) {
      throw new Error('Fake provider generate failure');
    }
    return {
      text: this.responseText,
      usage: {
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40,
        cachedTokens: 10,
        reasoningTokens: 0,
      }
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      structuredOutput: true,
      grounding: true,
      thinking: true,
      caching: true,
    };
  }
}

describe('executeGenerate runtime orchestration', () => {
  test('should generate and record telemetry success', async () => {
    const fakeProvider = new FakeAIProvider('Generated response');
    const telemetry = new AiTelemetryCollector();
    const recordSpy = vi.spyOn(telemetry, 'recordGemini');

    const result = await executeGenerate({
      provider: fakeProvider,
      request: {
        systemInstruction: 'sys',
        userContent: 'user',
        model: 'gemini-3.5-flash',
      },
      telemetry,
      stage: 'test_generate',
    });

    expect(result.text).toBe('Generated response');
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'test_generate',
        model: 'gemini-3.5-flash',
        status: 'success',
        usage: expect.objectContaining({
          promptTokenCount: 15,
          candidatesTokenCount: 25,
          cachedContentTokenCount: 10,
          thoughtsTokenCount: 0,
          totalTokenCount: 40,
        })
      })
    );
  });

  test('should propagate error and record telemetry error', async () => {
    const fakeProvider = new FakeAIProvider('', true);
    const telemetry = new AiTelemetryCollector();
    const recordSpy = vi.spyOn(telemetry, 'recordGemini');

    await expect(
      executeGenerate({
        provider: fakeProvider,
        request: {
          systemInstruction: 'sys',
          userContent: 'user',
          model: 'gemini-3.5-flash',
        },
        telemetry,
        stage: 'test_generate_error',
      })
    ).rejects.toThrow('Fake provider generate failure');

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'test_generate_error',
        model: 'gemini-3.5-flash',
        status: 'error',
      })
    );
  });
});
