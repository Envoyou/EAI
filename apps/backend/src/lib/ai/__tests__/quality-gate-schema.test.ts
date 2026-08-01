import { describe, expect, test } from 'vitest';
import {
  FinalQualityGateResponseSchema,
  normalizeFinalQualityGateResponseCandidate,
} from '@eai/shared';

describe('Final Quality Gate response normalization', () => {
  test('repairs string feedback and object flags from malformed provider output', () => {
    const normalized = normalizeFinalQualityGateResponseCandidate({
      readiness: 'ready',
      summary: 'The draft still requires review.',
      changes: ['Improved the article structure.'],
      feedback: ['Verify the unsupported market-size claim.'],
      flags: [
        { category: 'Source Verification' },
        { label: 'Unsupported Quantitative Claim' },
      ],
    });

    const result = FinalQualityGateResponseSchema.parse(normalized);

    expect(result.readiness).toBe('needs_review');
    expect(result.feedback).toEqual([
      expect.objectContaining({
        category: 'Editorial Review',
        status: 'warning',
        message: 'Verify the unsupported market-size claim.',
        suggestion: 'Review this issue manually before export.',
        operation: 'manual',
      }),
    ]);
    expect(result.flags).toEqual([
      'Source Verification',
      'Unsupported Quantitative Claim',
    ]);
  });

  test('drops unusable values while retaining valid structured items', () => {
    const normalized = normalizeFinalQualityGateResponseCandidate({
      readiness: 'needs_review',
      summary: 'Review required.',
      changes: [],
      feedback: [null, 42, {
        category: 'Structure',
        status: 'warning',
        message: 'The conclusion is abrupt.',
        operation: 'manual',
      }],
      flags: [null, 42, 'Structure Review'],
    });

    const result = FinalQualityGateResponseSchema.parse(normalized);

    expect(result.changes).toEqual(['Processed draft according to editorial brief.']);
    expect(result.feedback).toHaveLength(1);
    expect(result.feedback[0]?.suggestion).toBe(
      'Review the affected passage in the final draft and correct this issue before export.'
    );
    expect(result.flags).toEqual(['Structure Review']);
  });

  test('retains an allowlisted source candidate for automatic attachment', () => {
    const result = FinalQualityGateResponseSchema.parse({
      readiness: 'needs_review',
      summary: 'One supplied source must be attached.',
      changes: ['Preserved the supported claim.'],
      feedback: [{
        category: 'Source Verification',
        status: 'warning',
        verificationStatus: 'needs_citation',
        message: 'Attach the supplied primary report.',
        suggestion: 'Add the exact source URL from the research notes.',
        targetText: 'The documented program result.',
        operation: 'manual',
        verifiedSource: 'https://example.com/report',
      }],
      flags: ['Source attachment'],
    });

    expect(result.feedback[0]?.verifiedSource).toBe('https://example.com/report');
  });
});
