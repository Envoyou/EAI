import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentPath = fileURLToPath(new URL('../app-shell/GlobalNavigationRail.tsx', import.meta.url));

describe('App sidebar theme hydration', () => {
  it('keeps theme-dependent navigation content deterministic until hydration', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain('React.useSyncExternalStore(');
    expect(source).toContain("const isDark = isHydrated && resolvedTheme === 'dark';");
    expect(source).not.toContain("const isDark = resolvedTheme === 'dark';");
  });
});
