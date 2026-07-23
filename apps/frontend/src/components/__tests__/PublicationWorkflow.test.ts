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

  it('uses standalone backend modes instead of full Analyze', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');

    expect(workspace).toContain("mode: 'quality_gate'");
    expect(workspace).toContain("mode: 'generate_seo'");
    expect(workspace).toContain("action: 'update_final_draft'");
    expect(workspace).toContain("action: 'update_publication_package'");
  });
});
