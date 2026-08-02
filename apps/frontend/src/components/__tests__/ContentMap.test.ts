import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('Content Map frontend contract', () => {
  const page = readSource('app/[locale]/dashboard/content-map/page.tsx');
  const preview = readSource(
    'app/[locale]/dashboard/content-map/ContentArtifactPreviewDrawer.tsx'
  );
  const drawer = readSource('components/ui/side-drawer.tsx');
  const shell = readSource('components/DashboardLayoutShell.tsx');
  const dashboardNav = readSource('components/app-shell/navigation/DashboardNavigation.tsx');

  it('exposes the tenant Content Map from the dashboard navigation', () => {
    expect(dashboardNav).toContain('href={section.href}');
    expect(dashboardNav).toContain("useTranslations('ContentMap')");
    expect(shell).toContain('<DashboardNavigation');
  });

  it('loads only the Content Memory registry API and renders safe metadata', () => {
    expect(page).toContain("directFetch(`/api/content-memory?");
    expect(page).toContain('artifact.createdBy?.name');
    expect(page).not.toContain('searchDocument');
    expect(page).not.toContain('contentHash');
    expect(page).toContain('artifact.exportStatus');
    expect(page).toContain('artifact.topic');
    expect(page).toContain('<ContentArtifactPreviewDrawer');
    expect(page).not.toContain('router.push');
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

  it('previews tenant-scoped history in the shared right-side drawer', () => {
    expect(preview).toContain('`/api/history/${artifact.sourceId}`');
    expect(preview).toContain('extractPolishedDraft');
    expect(preview).toContain("t('actions.openWorkspace')");
    expect(drawer).toContain("from '@base-ui/react/drawer'");
    expect(drawer).toContain('swipeDirection="right"');
    expect(drawer).toContain('<Drawer.Title');
    expect(drawer).toContain('<Drawer.Description');
  });
});
