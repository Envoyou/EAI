import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const componentsRoot = fileURLToPath(new URL('../../components/', import.meta.url));

describe('Workspace Panel Decoupling Contract', () => {
  it('useWorkspaceStorage manages leftPanelOpen and rightPanelOpen independently', () => {
    const storageSource = readFileSync(`${workspaceRoot}/hooks/useWorkspaceStorage.ts`, 'utf8');

    // Both state variables must exist independently
    expect(storageSource).toContain('leftPanelOpen');
    expect(storageSource).toContain('rightPanelOpen');
    expect(storageSource).toContain('setLeftPanelOpen');
    expect(storageSource).toContain('setRightPanelOpen');

    // Independent localStorage keys
    expect(storageSource).toContain("'eai-show-left-sidebar'");
    expect(storageSource).toContain("'eai-show-feedback-sidebar'");
  });

  it('useEditorialWorkspace exposes leftPanelOpen and rightPanelOpen separately', () => {
    const facadeSource = readFileSync(`${workspaceRoot}/useEditorialWorkspace.ts`, 'utf8');

    expect(facadeSource).toContain('leftPanelOpen,');
    expect(facadeSource).toContain('setLeftPanelOpen,');
    expect(facadeSource).toContain('rightPanelOpen,');
    expect(facadeSource).toContain('setRightPanelOpen,');
  });

  it('EditorialWorkspace separates application navigation from contextual tools', () => {
    const componentSource = readFileSync(`${componentsRoot}/EditorialWorkspace.tsx`, 'utf8');

    // ThreeColumnLayout should receive decoupled leftPanelOpen prop
    expect(componentSource).toMatch(/leftPanelOpen=\{leftPanelOpen && !isDemoMode\}/);
    expect(componentSource).toContain('rightPanelOpen={rightPanelOpen}');
    expect(componentSource).toContain('<PublicationSeoPanel');

    expect(componentSource).toContain('<AppSidebarShell');
    expect(componentSource).not.toContain('<DocumentHistoryPanel');
    expect(componentSource).toContain("allowedTabs={stage === 'review' ? ['feedback']");

    // Titlebar menu toggle must use setLeftPanelOpen
    expect(componentSource).toContain('onClick={() => setLeftPanelOpen(true)}');

    // Bottom-Right Floating Trigger when rightPanelOpen is false
    expect(componentSource).toContain('!rightPanelOpen &&');
    expect(componentSource).toContain("tWorkspace('openTools')");
  });

  it('PanelTabBar keeps only document tabs and removes redundant toggle icons', () => {
    const tabbarSource = readFileSync(`${componentsRoot}/PanelTabBar.tsx`, 'utf8');

    expect(tabbarSource).not.toContain('PanelLeft');
    expect(tabbarSource).not.toContain('PanelRight');
  });

  it('AICopilotPanel includes PanelRight header toggle button', () => {
    const copilotSource = readFileSync(`${componentsRoot}/AICopilotPanel.tsx`, 'utf8');

    expect(copilotSource).toContain('PanelRight');
    expect(copilotSource).toContain('onToggleSidebar');
  });
});
