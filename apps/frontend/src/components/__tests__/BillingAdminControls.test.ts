import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../BillingAdmin.tsx', import.meta.url), 'utf8');

describe('BillingAdmin form-control contract', () => {
  it('uses canonical components for all text-like admin fields', () => {
    expect(source).not.toMatch(/<input\b|<textarea\b/);
    expect(source.match(/<Input\b/g)).toHaveLength(5);
    expect(source.match(/<Textarea\b/g)).toHaveLength(2);
  });

  it('preserves the filled admin-field appearance through surface variants', () => {
    expect(source.match(/<(?:Input|Textarea|SelectTrigger)\b[^>]*\bvariant="surface"/g)).toHaveLength(7);
    expect(source).not.toMatch(/ui-control|ui-input|ui-textarea|ui-select/);
  });

  it('keeps both privileged operation forms behind their review handlers', () => {
    expect(source).toContain('<form onSubmit={prepareAdjustment}');
    expect(source).toContain('<form onSubmit={prepareOverride}');
    expect(source).toContain('setPending({');
    expect(source).toContain('setPendingOverride({');
  });
});
