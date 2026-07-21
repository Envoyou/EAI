import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));

const featureFiles = [
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
  // Batch 3: Feature Cards, Subsystems & Admin Pages
  'BillingAdmin.tsx',
  'PricingGrid.tsx',
  'PaymentStatusBanner.tsx',
  'UserDirectory.tsx',
  'user-directory/components/UserTable.tsx',
  'user-directory/components/OrganizationDetailDrawer.tsx',
  'user-directory/components/CreditAdjustmentModal.tsx',
  'StrategistTab.tsx',
  'strategist-tab/components/ChatInputBar.tsx',
  'strategist-tab/components/ChatMessageList.tsx',
  'FeedbackPanel.tsx',
  'feedback-panel/components/FeedbackItemCard.tsx',
  'HistorySidebar.tsx',
  'StatusBar.tsx',
  'OnboardingWizard.tsx',
  'ShortcutsModal.tsx',
  'SettingsMenu.tsx',
  'PublicationUI.tsx',
  '../app/[locale]/admin/ai-config/page.tsx',
  '../app/[locale]/admin/audit-logs/page.tsx',
  '../app/[locale]/admin/feature-flags/FeatureFlagsClient.tsx',
  '../app/[locale]/checkout/simulate/page.tsx',
  '../app/[locale]/dashboard/validation/page.tsx',
  '../app/[locale]/global-error.tsx',
  '../app/[locale]/settings/publication/standards/page.tsx',
];

describe('Canonical Button migration contract (Batch 1, 2 & 3)', () => {
  it.each(featureFiles)('%s does not use raw <button> elements', (filePath) => {
    const fullPath = `${sourceRoot}/${filePath}`;
    const source = readFileSync(fullPath, 'utf8');

    expect(source).not.toMatch(/<button\b/);
  });
});
