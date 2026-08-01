import { describe, expect, it } from 'vitest';
import {
  StoredValidationResultSchema,
  VALIDATION_POLICY_VERSION,
} from '@/lib/validation-scope';

const storedResult = {
  policyVersion: VALIDATION_POLICY_VERSION,
  revisionId: 'revision-1',
  bodyHash: 'a'.repeat(64),
  validationLevel: 'light',
  status: 'passed',
  checkedAt: new Date().toISOString(),
  scope: {
    changedBlockIds: [],
    affectedClaimIds: [],
    affectedSourceIds: [],
    affectedFeedbackIds: [],
    affectedSeoFields: [],
    validationMode: 'light',
    reasons: ['minor_copy_edit'],
  },
  automatedRounds: 1,
};

describe('stored validation result policy version', () => {
  it('accepts a result produced by the current validation policy', () => {
    expect(StoredValidationResultSchema.safeParse(storedResult).success).toBe(true);
  });

  it('rejects a legacy result that could contain a false-ready decision', () => {
    const { policyVersion: _legacyMissingVersion, ...legacy } = storedResult;
    expect(StoredValidationResultSchema.safeParse(legacy).success).toBe(false);
  });
});
