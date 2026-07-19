import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const checkbox = readFileSync(new URL('../checkbox.tsx', import.meta.url), 'utf8');
const switchControl = readFileSync(new URL('../switch.tsx', import.meta.url), 'utf8');
const fileInput = readFileSync(new URL('../file-input.tsx', import.meta.url), 'utf8');

describe('specialized control primitive contracts', () => {
  it('builds Checkbox and Switch on their Base UI primitives', () => {
    expect(checkbox).toContain('<CheckboxPrimitive.Root');
    expect(checkbox).toContain('<CheckboxPrimitive.Indicator');
    expect(switchControl).toContain('<SwitchPrimitive.Root');
    expect(switchControl).toContain('<SwitchPrimitive.Thumb');
  });

  it('keeps native file input semantics inside the canonical boundary', () => {
    expect(fileInput).toContain('<input');
    expect(fileInput).toContain('type="file"');
  });
});
