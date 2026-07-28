import { describe, expect, test } from 'vitest';
import { ChatInputSchema, GeneratePlanSchema } from '../types';

describe('GeneratePlanSchema', () => {
  test('accepts a UUID idempotency key and rejects malformed keys', () => {
    const validRequest = {
      requestId: crypto.randomUUID(),
      recommendation: 'Generate a blueprint for the agreed topic',
      sessionId: 'new',
    };

    expect(GeneratePlanSchema.safeParse(validRequest).success).toBe(true);
    expect(
      GeneratePlanSchema.safeParse({
        ...validRequest,
        requestId: 'not-a-uuid',
      }).success
    ).toBe(false);
    expect(
      GeneratePlanSchema.safeParse({
        recommendation: validRequest.recommendation,
      }).success
    ).toBe(true);
  });
});

describe('ChatInputSchema', () => {
  test('accepts an optional UUID request ID and rejects malformed IDs', () => {
    const request = {
      requestId: crypto.randomUUID(),
      messages: [{ role: 'user', content: 'Research editorial intelligence' }],
      mode: 'fast',
    };

    expect(ChatInputSchema.safeParse(request).success).toBe(true);
    expect(
      ChatInputSchema.safeParse({ ...request, requestId: 'duplicate-chat' })
        .success
    ).toBe(false);
    expect(
      ChatInputSchema.safeParse({
        messages: request.messages,
        mode: request.mode,
      }).success
    ).toBe(true);
  });
});
