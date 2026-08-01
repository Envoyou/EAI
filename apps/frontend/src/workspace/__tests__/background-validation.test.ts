import { describe, expect, it } from 'vitest';
import { getBackgroundValidationDelay } from '../background-validation';

describe('manual-edit background validation policy', () => {
  it('does not schedule safe formatting or copy edits', () => {
    expect(getBackgroundValidationDelay('none')).toBeNull();
    expect(getBackgroundValidationDelay(undefined)).toBeNull();
  });

  it('debounces editorial changes and checks high-risk changes sooner', () => {
    expect(getBackgroundValidationDelay('light')).toBe(1_800);
    expect(getBackgroundValidationDelay('full')).toBe(800);
  });
});
