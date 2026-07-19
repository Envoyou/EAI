import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../BillingDetailsForm.tsx', import.meta.url), 'utf8');

describe('BillingDetailsForm control contract', () => {
  it('uses canonical component APIs for every visual control', () => {
    expect(source).not.toMatch(/<button\b/);
    expect(source).not.toMatch(/<input\b/);
    expect(source).not.toMatch(/<textarea\b/);
    expect(source.match(/<Button\b/g)).toHaveLength(1);
    expect(source.match(/<Input\b/g)).toHaveLength(2);
    expect(source.match(/<Textarea\b/g)).toHaveLength(1);
  });

  it('preserves the filled billing-field appearance through the surface variant', () => {
    expect(source.match(/variant="surface"/g)).toHaveLength(3);
  });
});
