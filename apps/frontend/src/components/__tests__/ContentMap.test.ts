import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('Content Map frontend contract', () => {
  const page = readSource('app/[locale]/dashboard/content-map/page.tsx');
  const shell = readSource('components/DashboardLayoutShell.tsx');

  it('exposes the tenant Content Map from the dashboard navigation', () => {
    expect(shell).toContain('href="/dashboard/content-map"');
    expect(shell).toContain("useTranslations('ContentMap')");
  });

  it('loads only the Content Memory registry API and renders safe metadata', () => {
    expect(page).toContain("directFetch(`/api/content-memory?");
    expect(page).toContain('artifact.createdBy?.name');
    expect(page).not.toContain('searchDocument');
    expect(page).not.toContain('contentHash');
  });

  it('uses canonical controls and includes the required mobile table hint', () => {
    expect(page).toContain('<Button');
    expect(page).toContain('<Input');
    expect(page).toContain('<Badge');
    expect(page).toContain('<Alert');
    expect(page).not.toContain('<button');
    expect(page).toContain(
      'px-4 pt-2 text-[9px] text-[var(--muted-foreground)] sm:hidden select-none'
    );
  });
});
