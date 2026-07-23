import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontendSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('revision-safe publication workflow', () => {
  it('offers draft editing, quality-only checks, and independent SEO regeneration', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');

    expect(panel).toContain('Edit Final Draft');
    expect(panel).toContain('Run Quality Check');
    expect(panel).toContain('Regenerate SEO metadata');
    expect(panel).toContain('Save Publication Metadata');
    expect(panel).toContain('Prepare current draft for export');
  });

  it('keeps secondary final-draft actions in a responsive portalled menu', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const menuStyles = readFrontendSource('app/styles/components/menus.css');

    expect(panel).toContain('<Popover.Portal>');
    expect(panel).toContain('final-draft-action-menu');
    expect(panel).toContain("t('workflowActions')");
    expect(panel).toContain("t('downloadActions')");
    expect(menuStyles).toContain('.final-draft-action-menu.ui-menu');
    expect(menuStyles).toContain('calc(100dvh - 2rem)');
  });

  it('uses standalone backend modes instead of full Analyze', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');

    expect(workspace).toContain("mode: 'quality_gate'");
    expect(workspace).toContain("mode: 'generate_seo'");
    expect(workspace).toContain("action: 'update_final_draft'");
    expect(workspace).toContain("action: 'update_publication_package'");
  });
});
