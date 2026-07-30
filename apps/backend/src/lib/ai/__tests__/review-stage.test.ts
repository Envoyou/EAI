import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runEditorialReviewStage } from '../review-stage';
import { getProvider } from '../providers/registry';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { AIProvider, StreamChunk, StreamRequest, ProviderCapabilities } from '../providers/interface';
import { ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';

// Mock registry so getProvider returns our fake provider
vi.mock('../providers/registry', () => {
  return {
    getProvider: vi.fn(),
  };
});

class FakeAIProvider implements AIProvider {
  readonly name = 'gemini' as const;
  readonly requests: StreamRequest[] = [];
  
  constructor(
    private chunkLists: StreamChunk[][],
    private generateResponse: string = ''
  ) {}

  private callCount = 0;

  async stream(request: StreamRequest): Promise<AsyncIterable<StreamChunk>> {
    this.requests.push(request);
    const list = this.chunkLists[this.callCount] || this.chunkLists[this.chunkLists.length - 1] || [];
    this.callCount++;

    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of list) {
          yield chunk;
        }
      }
    };
  }

  async generate(_request: StreamRequest) {
    return { text: this.generateResponse };
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

describe('runEditorialReviewStage with FakeAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should successfully parse complete review and not retry', async () => {
    const validJson = JSON.stringify({
      score: 85,
      verdict: 'approve',
      summary: 'Well written draft.',
      feedback: []
    });

    const fakeProvider = new FakeAIProvider([
      [{ text: validJson }]
    ]);
    vi.mocked(getProvider).mockReturnValue(fakeProvider);

    const telemetry = new AiTelemetryCollector();
    const sendEvent = vi.fn();

    const result = await runEditorialReviewStage({
      provider: 'gemini',
      modelName: 'gemini-3.5-flash',
      role: 'author',
      editorialProfile: ENVOYOU_EDITORIAL_PROFILE,
      metadata: {
        researchNotes: [{
          id: 'note-1',
          content: 'The supplied source confirms the workflow order.',
          sources: [{ url: 'https://example.com/source', domain: 'example.com' }],
          savedAt: '2026-07-30T00:00:00.000Z',
        }],
      },
      draftText: 'Valid article draft content.',
      reviewPrompt: 'system prompt',
      telemetry,
      sendEvent,
      sanitizeFeedback: (item) => ({ ...item, operation: item.operation ?? 'manual' }),
      sanitizeSummary: (s) => s,
    });

    expect(result.data).toEqual(
      expect.objectContaining({
        verdict: 'approve',
        summary: 'Well written draft.',
        feedback: []
      })
    );
    expect(sendEvent).toHaveBeenCalledWith('verdict', 'approve');
    expect(sendEvent).toHaveBeenCalledWith('summary', 'Well written draft.');
    expect(fakeProvider.requests[0]?.userContent).toContain('<workspace_context>');
    expect(fakeProvider.requests[0]?.userContent).toContain(
      'The supplied source confirms the workflow order.'
    );
    expect(fakeProvider.requests[0]?.systemInstruction).toContain('<agent_instruction>');
  });

  test('should retry with compact prompt on truncated JSON and succeed on second attempt', async () => {
    const truncatedJson = '{"score": 80, "verdict": "revise", "summary": "Trunc';
    const validJson = JSON.stringify({
      score: 80,
      verdict: 'revise',
      summary: 'Succeeded on compact retry.',
      feedback: []
    });

    const fakeProvider = new FakeAIProvider([
      // First attempt: Truncated max tokens chunk
      [{ text: truncatedJson, finishReason: 'MAX_TOKENS' }],
      // Second attempt: Complete valid JSON
      [{ text: validJson }]
    ]);
    vi.mocked(getProvider).mockReturnValue(fakeProvider);

    const telemetry = new AiTelemetryCollector();
    const sendEvent = vi.fn();

    const result = await runEditorialReviewStage({
      provider: 'gemini',
      modelName: 'gemini-3.5-flash',
      role: 'author',
      editorialProfile: ENVOYOU_EDITORIAL_PROFILE,
      draftText: 'Valid article draft content.',
      reviewPrompt: 'system prompt',
      telemetry,
      sendEvent,
      sanitizeFeedback: (item) => ({ ...item, operation: item.operation ?? 'manual' }),
      sanitizeSummary: (s) => s,
    });

    expect(result.data.summary).toBe('Succeeded on compact retry.');
    expect(telemetry.snapshot().retryCount).toBe(1);
    expect(telemetry.snapshot().fallbackCount).toBe(1); // markFallback called once
  });
});
