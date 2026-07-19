import { describe, expect, it } from 'vitest';

import { inputVariants } from '../input';
import { selectTriggerVariants } from '../select';
import { textareaVariants } from '../textarea';

function classTokens(value: string) {
  return new Set(value.split(/\s+/));
}

describe('canonical form-control style contract', () => {
  it('maps surface inputs to the existing semantic control classes', () => {
    const classes = classTokens(inputVariants({ variant: 'surface' }));

    expect(classes).toContain('ui-control');
    expect(classes).toContain('ui-input');
  });

  it('maps surface textareas to the existing semantic control classes', () => {
    const classes = classTokens(textareaVariants({ variant: 'surface' }));

    expect(classes).toContain('ui-control');
    expect(classes).toContain('ui-textarea');
  });

  it('maps surface select triggers to the existing semantic control classes', () => {
    const classes = classTokens(selectTriggerVariants({ variant: 'surface' }));

    expect(classes).toContain('ui-control');
    expect(classes).toContain('ui-select');
  });

  it('keeps the default form controls separate during incremental migration', () => {
    expect(classTokens(inputVariants({ variant: 'default' }))).not.toContain('ui-control');
    expect(classTokens(textareaVariants({ variant: 'default' }))).not.toContain('ui-control');
    expect(classTokens(selectTriggerVariants({ variant: 'default' }))).not.toContain('ui-control');
  });
});
