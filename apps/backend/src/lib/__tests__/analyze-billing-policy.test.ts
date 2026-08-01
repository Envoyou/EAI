import { describe, expect, it } from 'vitest';
import { isBillableAnalyzeMode } from '@/lib/analyze-billing-policy';

describe('analyze billing policy', () => {
  it('charges only full article generation workflows', () => {
    expect(isBillableAnalyzeMode('analyze')).toBe(true);
    expect(isBillableAnalyzeMode('refine')).toBe(true);
  });

  it.each([
    'fix_targeted',
    'quality_gate',
    'validate_revision',
    'generate_seo',
    'refresh_seo_fields',
  ] as const)('does not charge remediation mode %s', (mode) => {
    expect(isBillableAnalyzeMode(mode)).toBe(false);
  });
});
