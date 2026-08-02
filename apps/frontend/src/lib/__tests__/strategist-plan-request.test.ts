import { describe, expect, test, vi } from 'vitest';
import { recoverStrategistPlanResult } from '../strategist-plan-request';

describe('recoverStrategistPlanResult', () => {
  test('returns a committed blueprint after an ambiguous frontend failure', async () => {
    const result = {
      reply: 'Blueprint ready',
      plan: { angle: 'Recovered angle' },
      sessionId: 'session-1',
      sourceRef: 'article-family-1',
    };
    const directFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          result,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );

    await expect(
      recoverStrategistPlanResult(directFetch, crypto.randomUUID())
    ).resolves.toEqual(result);
    expect(directFetch).toHaveBeenCalledTimes(1);
  });

  test('polls a pending request without starting a second generation', async () => {
    const directFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'completed',
            result: { plan: { angle: 'One blueprint' } },
          }),
          { status: 200 }
        )
      );
    const wait = vi.fn().mockResolvedValue(undefined);

    const recovered = await recoverStrategistPlanResult(
      directFetch,
      crypto.randomUUID(),
      { attempts: 2, wait }
    );

    expect(recovered).toEqual({ plan: { angle: 'One blueprint' } });
    expect(directFetch).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test('returns null when no matching persisted request exists', async () => {
    const directFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      recoverStrategistPlanResult(directFetch, crypto.randomUUID())
    ).resolves.toBeNull();
  });
});
