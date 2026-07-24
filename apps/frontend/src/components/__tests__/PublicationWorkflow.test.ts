import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontendSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('revision-safe publication workflow', () => {
  it('offers draft editing, quality-only checks, and independent SEO regeneration', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const editorStyles = readFrontendSource('app/styles/workspace/editor.css');

    expect(panel).toContain('Edit Final Draft');
    expect(panel).toContain('final-draft-editor-card');
    expect(panel).toContain('final-draft-editor-textarea');
    expect(editorStyles).toContain('.final-draft-editor-card');
    expect(editorStyles).toContain('margin-top: 12px');
    expect(editorStyles).toContain('.final-draft-editor-textarea.ui-textarea');
    expect(editorStyles).toContain('field-sizing: fixed');
    expect(editorStyles).toContain('overflow-y: auto');
    expect(panel).toContain('Run Quality Check');
    expect(panel).toContain('Regenerate SEO metadata');
    expect(panel).toContain('Save Publication Metadata');
    expect(panel).toContain('Prepare current draft for export');
    expect(panel).toContain(
      'icon={PreparePublicationIcon}'
    );
    expect(panel).toContain(
      'labelClassName="hidden md:inline"'
    );
  });

  it('keeps secondary final-draft actions in an adaptive portalled menu', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const menuStyles = readFrontendSource('app/styles/components/menus.css');
    const popover = readFrontendSource('components/ui/popover.tsx');

    expect(panel).toContain('<PopoverContent');
    expect(panel).toContain('variant="menu"');
    expect(panel).toContain('mobileSheet');
    expect(panel).toContain('final-draft-action-menu');
    expect(panel).toContain("t('workflowActions')");
    expect(panel).toContain("t('downloadActions')");
    expect(popover).toContain('<PopoverPrimitive.Portal>');
    expect(popover).toContain('<PopoverPrimitive.Backdrop');
    expect(popover).toContain('max-md:!bottom-0');
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
