import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../SupportForm.tsx', import.meta.url), 'utf8');

describe('SupportForm control contract', () => {
  it('uses canonical component APIs for all form actions and fields', () => {
    expect(source).not.toMatch(/<button\b/);
    expect(source).not.toMatch(/<input\b/);
    expect(source).not.toMatch(/<textarea\b/);
    expect(source.match(/<Button\b/g)).toHaveLength(2);
    expect(source.match(/<Input\b/g)).toHaveLength(5);
    expect(source.match(/<Textarea\b/g)).toHaveLength(1);
  });

  it('preserves the filled support-form appearance through semantic surface variants', () => {
    expect(source.match(/variant="surface"/g)).toHaveLength(7);
  });
});
