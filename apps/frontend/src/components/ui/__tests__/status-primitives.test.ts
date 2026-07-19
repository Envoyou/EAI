import { describe, expect, it } from 'vitest';

import { alertVariants } from '../alert';
import { badgeVariants } from '../badge';

function tokens(value: string) {
  return new Set(value.split(/\s+/));
}

describe('canonical status primitive contracts', () => {
  it.each([
    ['muted', 'ui-badge-muted'],
    ['surface', 'ui-badge-surface'],
    ['primary', 'ui-badge-primary'],
    ['success', 'ui-badge-success'],
    ['warning', 'ui-badge-warning'],
    ['danger', 'ui-badge-danger'],
  ] as const)('maps Badge %s to its semantic visual class', (variant, expected) => {
    const classes = tokens(badgeVariants({ variant }));
    expect(classes).toContain('ui-badge');
    expect(classes).toContain(expected);
  });

  it('maps the xs Badge size to the compact visual contract', () => {
    expect(tokens(badgeVariants({ size: 'xs' }))).toContain('ui-badge-xs');
  });

  it.each([
    ['primary', 'ui-alert-primary'],
    ['success', 'ui-alert-success'],
    ['warning', 'ui-alert-warning'],
    ['danger', 'ui-alert-danger'],
    ['muted', 'ui-alert-muted'],
  ] as const)('maps Alert %s to its semantic visual class', (variant, expected) => {
    const classes = tokens(alertVariants({ variant }));
    expect(classes).toContain('ui-alert');
    expect(classes).toContain(expected);
  });

  it('keeps destructive as an Alert compatibility alias', () => {
    expect(tokens(alertVariants({ variant: 'destructive' }))).toContain('ui-alert-danger');
  });
});
