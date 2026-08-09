import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Editorial Evaluation Dataset', () => {
  const page = read('../../app/[locale]/dashboard/editorial-evaluation/page.tsx');
  const navigation = read('../app-shell/navigation/dashboard-navigation.ts');
  const workspaceSettings = read('../../app/[locale]/settings/workspace/page.tsx');

  it('keeps evaluation separate from aggregate validation and owner navigation', () => {
    expect(navigation).toContain("href: '/dashboard/editorial-evaluation'");
    expect(page).toContain('/api/analytics/editorial-evaluations');
    expect(page).toContain('/api/analytics/editorial-evaluations/backfill');
    expect(page).toContain('/api/analytics/editorial-evaluations/export');
    expect(page).toContain("t('export')");
    expect(page).toContain("description={t('scope')}");
  });

  it('uses canonical controls and includes the required mobile table helper', () => {
    expect(page).not.toMatch(/<button\b/);
    expect(page).toContain('<Button');
    expect(page).toContain('sm:hidden select-none');
    expect(page).toContain('<SideDrawer');
    expect(page).toContain('timeoutMs: 120_000');
  });

  it('requires a confirmed tenant privacy decision before changing evaluation consent', () => {
    expect(workspaceSettings).toContain('/api/workspace/editorial-evaluation-consent');
    expect(workspaceSettings).toContain('<Switch');
    expect(workspaceSettings).toContain('aria-modal="true"');
    expect(workspaceSettings).toContain("useTranslations('WorkspaceSettings')");
  });
});
