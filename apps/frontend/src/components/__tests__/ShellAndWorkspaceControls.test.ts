import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));

const batch1And2Files = [
  // Batch 1: Shell & Navigation
  'AdminLayoutShell.tsx',
  'AppSidebarShell.tsx',
  'ui/sidebar-item.tsx',
  'DashboardLayoutShell.tsx',
  'WorkspacePageShell.tsx',
  'AuthPageShell.tsx',
  'PanelTabBar.tsx',
  'ThemeToggle.tsx',
  'RoleToggle.tsx',
  // Batch 2: Workspace & Editor
  'EditorialWorkspace.tsx',
  'Editor.tsx',
  'editor/extensions/CommandList.tsx',
  'FinalDraftPanel.tsx',
  'DocumentHistoryPanel.tsx',
  'AICopilotPanel.tsx',
  'NotesTab.tsx',
];

describe('Shell & Workspace button migration contract (Batch 1 & 2)', () => {
  it.each(batch1And2Files)('%s does not use raw <button> elements', (filePath) => {
    const fullPath = `${sourceRoot}/${filePath}`;
    const source = readFileSync(fullPath, 'utf8');

    expect(source).not.toMatch(/<button\b/);
  });
});
