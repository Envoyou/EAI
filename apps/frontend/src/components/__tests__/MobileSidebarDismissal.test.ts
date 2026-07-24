import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('mobile sidebar dismissal', () => {
  const sidebarItem = readSource('../ui/sidebar-item.tsx');
  const appSidebar = readSource('../AppSidebarShell.tsx');
  const adminSidebar = readSource('../AdminLayoutShell.tsx');
  const history = readSource('../DocumentHistoryPanel.tsx');

  it('allows linked sidebar items to run a close callback', () => {
    expect(sidebarItem).toContain('render={<Link href={href} />}');
    expect(sidebarItem).toContain('onClick={onClick}');
    expect(sidebarItem).not.toContain('href && !disabled && !onClick');
  });

  it('closes global and admin navigation after mobile link selection', () => {
    expect(appSidebar).toContain('closeAfterMobileNavigation');
    expect(appSidebar).toContain("window.matchMedia('(max-width: 860px)').matches");
    expect(appSidebar.match(/onClick=\{closeAfterMobileNavigation\}/g)).toHaveLength(1);
    expect(appSidebar).toContain(': closeAfterMobileNavigation');

    expect(adminSidebar).toContain('closeAfterMobileNavigation');
    expect(adminSidebar.match(/onClick=\{closeAfterMobileNavigation\}/g)).toHaveLength(2);
  });

  it('closes Draft History after selecting or creating a draft on mobile', () => {
    expect(history).toContain('closeAfterMobileSelection');
    expect(history).toContain('handleHistoryItemSelect');
    expect(history).toContain('onClick={() => handleHistoryItemSelect(item.id)}');
  });
});
