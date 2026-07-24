import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('composite Button cascade contracts', () => {
  const globals = readSource('../../app/globals.css');
  const strategistStyles = readSource(
    '../../app/styles/workspace/strategist.css'
  );
  const feedbackStyles = readSource(
    '../../app/styles/components/feedback.css'
  );
  const compositeStyles = readSource(
    '../../app/styles/components/composite-controls.css'
  );

  it('loads bounded composite selectors after the Button primitive', () => {
    expect(globals.indexOf('./styles/components/buttons.css')).toBeLessThan(
      globals.indexOf('./styles/components/composite-controls.css')
    );
    expect(globals.indexOf('./styles/components/buttons.css')).toBeLessThan(
      globals.indexOf('./styles/workspace/strategist.css')
    );
  });

  it('keeps Copilot tabs and Notes actions responsive without important overrides', () => {
    const copilot = readSource('../AICopilotPanel.tsx');
    const notes = readSource('../NotesTab.tsx');

    expect(copilot).toContain('strategist-copilot-tab');
    expect(copilot).toContain('strategist-copilot-tab-label');
    expect(copilot).toContain('aria-selected={activeTab === tab.key}');
    expect(notes).toContain('strategist-notes-clear-action');
    expect(notes).toContain('strategist-note-delete-action');
    expect(strategistStyles).toContain(
      '.strategist-copilot-tab.ui-btn-muted[aria-selected="true"]'
    );
    expect(strategistStyles).toContain('@media (min-width: 769px)');
    expect(strategistStyles).toContain('@container (min-width: 340px)');
    expect(strategistStyles).not.toContain('!important');
  });

  it('keeps Feedback accordion triggers rectangular across viewport sizes', () => {
    const feedbackPanel = readSource('../FeedbackPanel.tsx');
    const feedbackItem = readSource(
      '../feedback-panel/components/FeedbackItemCard.tsx'
    );

    expect(feedbackPanel).toContain('feedback-seo-trigger');
    expect(feedbackItem).toContain('feedback-accordion-trigger');
    expect(feedbackStyles).toContain(
      '.feedback-accordion-trigger.ui-btn-muted'
    );
    expect(feedbackStyles).not.toContain('!important');
  });

  it('protects workspace chrome, sidebar, and adaptive mode controls', () => {
    const chromeStyles = readSource('../../app/styles/workspace/chrome.css');
    const editorStyles = readSource('../../app/styles/workspace/editor.css');
    const sidebarStyles = readSource('../../app/styles/workspace/sidebar.css');
    const menus = readSource('../../app/styles/components/menus.css');
    const workspace = readSource('../EditorialWorkspace.tsx');

    expect(chromeStyles).toContain('.ide-tab.ui-btn-muted:hover:not(:disabled)');
    expect(chromeStyles).toContain(
      '.workspace-mobile-nav-action.ui-btn-muted[aria-pressed="true"]'
    );
    expect(editorStyles).toContain(
      '.document-tab.ui-btn-muted:hover:not(:disabled)'
    );
    expect(sidebarStyles).toContain(
      '.sidebar-filter-pill.ui-btn-muted:hover:not(:disabled)'
    );
    expect(menus).toContain('.ui-menu-item.ui-btn-muted:hover:not(:disabled)');
    expect(workspace).toContain('aria-pressed={mobileViewTab ===');
    expect(workspace.match(/<Select\b/g)).toHaveLength(1);
    expect(workspace).toContain(
      'Adaptive Mode Selector (desktop popover, mobile bottom sheet)'
    );
    expect(workspace).not.toContain('isMobileModeSheetOpen');
    expect(workspace).not.toContain('workspace-analysis-mode-option');
  });

  it('removes Strategist important modifiers while preserving compact responsive actions', () => {
    const messages = readSource(
      '../strategist-tab/components/ChatMessageList.tsx'
    );
    const input = readSource(
      '../strategist-tab/components/ChatInputBar.tsx'
    );
    const strategist = readSource('../StrategistTab.tsx');

    expect(messages).toContain('strategist-transcript-item');
    expect(messages).toContain('strategist-sources-toggle');
    expect(messages).toContain('strategist-suggestion-action');
    expect(messages).not.toContain('!rounded-lg');
    expect(messages).toContain('whitespace-normal break-words');
    expect(messages).toContain('Source [{msg.payload.sources.length}]');
    expect(messages).toContain('expandedSources[msg.id] &&');
    expect(messages).not.toContain('.slice(');
    expect(input).toContain('strategist-mode-select');
    expect(input).not.toContain('!rounded-full');
    expect(strategistStyles).toContain(
      '.strategist-suggestion-action.ui-btn-surface:hover:not(:disabled)'
    );
    expect(strategistStyles).toContain(
      '[data-slot="select-trigger"].strategist-mode-select[data-size="sm"]'
    );
    expect(strategist).toContain('strategist-toolbar-title');
    expect(strategist).toContain('strategist-toolbar-label');
  });

  it('preserves public indicator, switch, and segmented-control shapes', () => {
    const auth = readSource('../AuthPageShell.tsx');
    const pricing = readSource('../PricingGrid.tsx');
    const roles = readSource('../RoleToggle.tsx');

    expect(auth).toContain('auth-slide-indicator');
    expect(pricing).toContain('pricing-cycle-toggle');
    expect(pricing).toContain("useTranslations('PricingGrid')");
    expect(roles).toContain('role-toggle-option');
    expect(compositeStyles).toContain(
      '.auth-slide-indicator.ui-btn-muted[data-active="true"]'
    );
    expect(compositeStyles).toContain(
      '.pricing-cycle-toggle.ui-btn-muted:hover:not(:disabled)'
    );
    expect(compositeStyles).not.toContain('!important');
  });
});
