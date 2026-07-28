import { describe, expect, test } from 'vitest';
import { classifyStrategistChatFailure } from '../chat-request-lifecycle';

describe('classifyStrategistChatFailure', () => {
  test.each([
    [429, 'PROVIDER_RATE_LIMIT'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [504, 'PROVIDER_TIMEOUT'],
  ] as const)('maps provider status %s to %s', (status, code) => {
    expect(classifyStrategistChatFailure({ status })).toEqual(
      expect.objectContaining({ code })
    );
  });

  test('does not expose raw provider messages', () => {
    const failure = classifyStrategistChatFailure(
      new Error('secret provider payload')
    );

    expect(failure.code).toBe('CHAT_FAILED');
    expect(failure.message).not.toContain('secret provider payload');
  });
});
