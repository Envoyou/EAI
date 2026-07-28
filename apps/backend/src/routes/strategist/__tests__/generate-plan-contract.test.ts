import { describe, expect, test } from 'vitest';
import { GeneratePlanSchema } from '../types';

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
