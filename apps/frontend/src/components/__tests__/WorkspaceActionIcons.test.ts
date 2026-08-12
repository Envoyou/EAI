import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('workspace semantic action icons', () => {
  it('maps distinct action intents to distinct Lucide icons', () => {
    const aiIcons = readSource('../ui/icons/ai.ts');
    const actionIcons = readSource('../ui/icons/actions.ts');

    expect(aiIcons).toContain('WandSparkles as RefineDraftIcon');
    expect(actionIcons).toContain('FileCheck2 as PreparePublicationIcon');
    expect(aiIcons).toContain('MessageCircle as AssistantChatIcon');
  });

  it('uses the semantic icons consistently across responsive workspace controls', () => {
    const workspace = readSource('../EditorialWorkspace.tsx');
    const finalDraft = readSource('../FinalDraftPanel.tsx');

    expect(workspace).toContain("stage === 'publication' ? DocumentIcon : AssistantChatIcon");
    expect(workspace).toContain(': RefineDraftIcon');
    expect(finalDraft.match(/icon=\{PreparePublicationIcon\}/g)).toHaveLength(2);
    expect(finalDraft).not.toContain('<Sparkles');
  });

  it('routes standard icon-and-label actions through ActionButton', () => {
    const actionButton = readSource('../ui/action-button.tsx');
    const workspace = readSource('../EditorialWorkspace.tsx');
    const finalDraft = readSource('../FinalDraftPanel.tsx');

    expect(actionButton).toContain("icon: SemanticIconToken");
    expect(actionButton).toContain("disabled={disabled || loading}");
    expect(workspace.match(/<ActionButton\b/g)).toHaveLength(3);
    expect(finalDraft.match(/<ActionButton\b/g)).toHaveLength(8);
    expect(finalDraft).toContain('icon={ForwardNavigationIcon}');
  });
});
