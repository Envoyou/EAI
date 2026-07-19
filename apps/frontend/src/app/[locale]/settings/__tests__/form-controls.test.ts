import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generalSource = readFileSync(new URL('../general/page.tsx', import.meta.url), 'utf8');
const defaultsSource = readFileSync(new URL('../defaults/page.tsx', import.meta.url), 'utf8');
const usageSource = readFileSync(new URL('../usage/page.tsx', import.meta.url), 'utf8');
const workflowSource = readFileSync(new URL('../workflow/page.tsx', import.meta.url), 'utf8');

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

  it('migrates the Usage search field without changing its select contract', () => {
    expect(usageSource).not.toMatch(/<input\b/);
    expect(usageSource).not.toMatch(/ui-control|ui-input/);
    expect(usageSource.match(/<Input\b/g)).toHaveLength(1);
    expect(usageSource.match(/<Input\b[^>]*\bvariant="surface"/g)).toHaveLength(1);
  });

  it('uses canonical Switch and Select controls in Workflow Settings', () => {
    expect(workflowSource).not.toMatch(/<input\b/);
    expect(workflowSource.match(/<Switch\b/g)).toHaveLength(1);
    expect(workflowSource).toContain('onCheckedChange={(checked)');
    expect(workflowSource).not.toMatch(/ui-control|ui-select/);
    expect(workflowSource).toContain('<SelectTrigger variant="surface">');
  });
});
