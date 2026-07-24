import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('adaptive action menus', () => {
  const primitive = readSource('../ui/adaptive-action-menu.tsx');
  const sessions = readSource(
    '../strategist-tab/components/SessionSidebar.tsx'
  );
  const history = readSource('../DocumentHistoryPanel.tsx');
  const users = readSource(
    '../user-directory/components/UserActionMenu.tsx'
  );

  it('uses one global desktop dropdown and mobile bottom-sheet contract', () => {
    expect(primitive).toContain('<PopoverContent');
    expect(primitive).toContain('variant="menu"');
    expect(primitive).toContain('mobileSheet');
    expect(primitive).toContain('positionMethod="fixed"');
    expect(primitive).toContain('ui-menu-item');
  });

  it('shares the adaptive menu across session, draft, and user actions', () => {
    for (const source of [sessions, history, users]) {
      expect(source).toContain('<AdaptiveActionMenu');
    }
    expect(sessions).not.toContain('@base-ui/react/menu');
    expect(users).not.toContain('@base-ui/react/menu');
  });

  it('keeps session rows compact and exposes complete draft actions', () => {
    expect(sessions).toContain('className="space-y-1"');
    expect(sessions).toContain('px-2.5 py-1 rounded-lg');
    expect(history).toContain("key: 'pin'");
    expect(history).toContain("key: 'rename'");
    expect(history).toContain("key: 'delete'");
    expect(history).toContain('handleTogglePin');
  });
});
