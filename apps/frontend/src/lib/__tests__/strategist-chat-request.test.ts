import { describe, expect, test, vi } from 'vitest';
import { recoverStrategistChatRequest } from '../strategist-chat-request';

describe('recoverStrategistChatRequest', () => {
  test('recovers a committed chat response after transport failure', async () => {
    const directFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          result: {
            sessionId: 'session-1',
            text: 'Recovered response',
            sources: [],
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      recoverStrategistChatRequest(directFetch, crypto.randomUUID())
    ).resolves.toEqual({
      status: 'completed',
      result: {
        sessionId: 'session-1',
        text: 'Recovered response',
        sources: [],
      },
    });
  });

  test('returns a safe persisted failure instead of a generic stream error', async () => {
    const directFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'failed',
          error: {
            code: 'PROVIDER_UNAVAILABLE',
            message: 'The AI service is temporarily unavailable. Please retry.',
          },
        }),
        { status: 200 }
      )
    );

    const result = await recoverStrategistChatRequest(
      directFetch,
      crypto.randomUUID()
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
      })
    );
  });

  test('polls pending status without resubmitting the chat mutation', async () => {
    const directFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'completed',
            result: {
              sessionId: 'session-1',
              text: 'Done',
              sources: [],
            },
          }),
          { status: 200 }
        )
      );

    await recoverStrategistChatRequest(
      directFetch,
      crypto.randomUUID(),
      { attempts: 2, wait: async () => undefined }
    );

    expect(directFetch).toHaveBeenCalledTimes(2);
    expect(directFetch.mock.calls[0]?.[0]).toContain('/chat/request/');
    expect(directFetch.mock.calls[0]?.[1]?.method).toBeUndefined();
  });
});
