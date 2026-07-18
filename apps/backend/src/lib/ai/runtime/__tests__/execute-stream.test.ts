import { describe, test, expect, vi } from 'vitest';
import { executeStream } from '../execute-stream';
import type { AIProvider, StreamChunk, StreamRequest, ProviderCapabilities } from '../../providers/interface';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';

class FakeAIProvider implements AIProvider {
  readonly name = 'gemini' as const;
  
  constructor(
    private chunks: StreamChunk[],
    private shouldFail: boolean = false
  ) {}

  async stream(_request: StreamRequest): Promise<AsyncIterable<StreamChunk>> {
    if (this.shouldFail) {
      throw new Error('Fake provider stream failure');
    }

    const chunks = this.chunks;
    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    };
  }

  async generate(_request: StreamRequest) {
    return { text: '' };
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

describe('executeStream runtime orchestration', () => {
  test('should yield chunk text and record telemetry success', async () => {
    const chunks: StreamChunk[] = [
      { text: 'Hello ' },
      { text: 'world!' },
      {
        text: '',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cachedTokens: 5,
          reasoningTokens: 2,
        }
      }
    ];

    const fakeProvider = new FakeAIProvider(chunks);
    const telemetry = new AiTelemetryCollector();
    
    // Spy on recordGemini
    const recordSpy = vi.spyOn(telemetry, 'recordGemini');

    const resultChunks: string[] = [];
    const stream = executeStream({
      provider: fakeProvider,
      request: {
        systemInstruction: 'sys',
        userContent: 'user',
        model: 'gemini-3.5-flash',
      },
      telemetry,
      stage: 'test_rewrite',
    });

    for await (const chunkText of stream) {
      resultChunks.push(chunkText);
    }

    expect(resultChunks).toEqual(['Hello ', 'world!']);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'test_rewrite',
        model: 'gemini-3.5-flash',
        status: 'success',
        usage: expect.objectContaining({
          promptTokenCount: 10,
          candidatesTokenCount: 18,
          cachedContentTokenCount: 5,
          thoughtsTokenCount: 2,
          totalTokenCount: 30,
        })
      })
    );
  });

  test('should propagate error and record telemetry error', async () => {
    const fakeProvider = new FakeAIProvider([], true);
    const telemetry = new AiTelemetryCollector();
    const recordSpy = vi.spyOn(telemetry, 'recordGemini');

    const stream = executeStream({
      provider: fakeProvider,
      request: {
        systemInstruction: 'sys',
        userContent: 'user',
        model: 'gemini-3.5-flash',
      },
      telemetry,
      stage: 'test_error',
    });

    await expect(async () => {
      for await (const _ of stream) {
        // empty
      }
    }).rejects.toThrow('Fake provider stream failure');

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'test_error',
        model: 'gemini-3.5-flash',
        status: 'error',
      })
    );
  });
});
