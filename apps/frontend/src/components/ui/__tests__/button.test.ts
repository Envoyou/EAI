import { describe, expect, it } from 'vitest';

import { buttonVariants } from '../button';

function classTokens(value: string) {
  return new Set(value.split(/\s+/));
}

describe('canonical Button style contract', () => {
  it.each([
    ['primary', 'ui-btn-primary'],
    ['outline', 'ui-btn-outline'],
    ['surface', 'ui-btn-surface'],
    ['muted', 'ui-btn-muted'],
    ['danger', 'ui-btn-danger'],
  ] as const)('maps the %s variant to its semantic ui class', (variant, expected) => {
    const classes = classTokens(buttonVariants({ variant }));

    expect(classes).toContain('ui-btn');
    expect(classes).toContain(expected);
  });

  it.each([
    ['default', 'ui-btn-primary'],
    ['secondary', 'ui-btn-surface'],
    ['ghost', 'ui-btn-muted'],
    ['destructive', 'ui-btn-danger'],
  ] as const)('keeps the %s compatibility alias on the same semantic contract', (variant, expected) => {
    const classes = classTokens(buttonVariants({ variant }));

    expect(classes).toContain('ui-btn');
    expect(classes).toContain(expected);
  });

  it.each([
    ['xs', 'ui-btn-xs'],
    ['sm', 'ui-btn-sm'],
    ['lg', 'ui-btn-lg'],
    ['icon', 'ui-btn-icon'],
  ] as const)('maps the %s size to its semantic ui class', (size, expected) => {
    const classes = classTokens(buttonVariants({ size }));

    expect(classes).toContain(expected);
  });

  it('does not expose a second background and radius styling system', () => {
    const classes = buttonVariants({ variant: 'default', size: 'default' });

    expect(classes).not.toContain('bg-primary');
    expect(classes).not.toContain('rounded-lg');
  });
});
