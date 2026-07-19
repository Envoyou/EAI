import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generalSource = readFileSync(new URL('../general/page.tsx', import.meta.url), 'utf8');
const defaultsSource = readFileSync(new URL('../defaults/page.tsx', import.meta.url), 'utf8');

describe('Settings form-control contract', () => {
  it('migrates General Settings behind canonical surface controls', () => {
    expect(generalSource).not.toMatch(/<input\b/);
    expect(generalSource).not.toMatch(/ui-control|ui-input|ui-select/);
    expect(generalSource.match(/<Input\b/g)).toHaveLength(1);
    expect(generalSource.match(/<SelectTrigger\b/g)).toHaveLength(2);
    expect(generalSource.match(/variant="surface"/g)).toHaveLength(3);
  });

  it('migrates Defaults Settings behind canonical surface controls', () => {
    expect(defaultsSource).not.toMatch(/<input\b/);
    expect(defaultsSource).not.toMatch(/ui-control|ui-input|ui-select/);
    expect(defaultsSource.match(/<Input\b/g)).toHaveLength(2);
    expect(defaultsSource.match(/<SelectTrigger\b/g)).toHaveLength(2);
    expect(defaultsSource.match(/variant="surface"/g)).toHaveLength(4);
  });
});
