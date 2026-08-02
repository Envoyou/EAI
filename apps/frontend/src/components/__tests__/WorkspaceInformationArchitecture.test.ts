import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('editorial workspace information architecture', () => {
  const workspacePage = read('../../app/[locale]/workspace/page.tsx');
  const editorPage = read('../../app/[locale]/editor/page.tsx');
  const reviewPage = read('../../app/[locale]/review/page.tsx');
  const publicationPage = read('../../app/[locale]/publication/page.tsx');
  const workspace = read('../EditorialWorkspace.tsx');
  const finalDraft = read('../FinalDraftPanel.tsx');
  const library = read('../SavedArticlesLibrary.tsx');
  const storage = read('../../workspace/hooks/useWorkspaceStorage.ts');

  it('uses workspace as the document home and preserves legacy document links', () => {
    expect(workspacePage).toContain('<SavedArticlesLibrary />');
    expect(workspacePage).toContain('redirect(`/editor?${forwarded.toString()}`)');
    expect(editorPage).toContain('stage="editor"');
  });

  it('gives review and publication their own queues and document surfaces', () => {
    expect(reviewPage).toContain('<SavedArticlesLibrary scope="review" />');
    expect(reviewPage).toContain('stage="review"');
    expect(publicationPage).toContain('<SavedArticlesLibrary scope="publication" />');
    expect(publicationPage).toContain('stage="publication"');
    expect(library).toContain("fetchWithTimeout('/api/history?limit=100&view=current')");
    expect(library).toContain('presentation.unresolvedFindingCount === 0');
  });

  it('keeps history out of the editor and scopes contextual tools by stage', () => {
    expect(workspace).not.toContain('<DocumentHistoryPanel');
    expect(workspace).toContain("allowedTabs={stage === 'review' ? ['feedback'] : ['strategist', 'notes', 'deep_report']}");
    expect(workspace).toContain("rightPanel={stage === 'publication' ? null : renderContextPanel()}");
  });

  it('uses a compact publication command instead of another decision card', () => {
    expect(finalDraft).toContain('publication-command-row');
    expect(finalDraft).not.toContain('final-draft-decision-bar');
  });

  it('opens New Article as a fresh editor session without restoring the previous document', () => {
    expect(library).toContain("router.push('/editor?new=1')");
    expect(editorPage).toContain("startNewDraft={firstValue(params.new) === '1'}");
    expect(storage).toContain('DOCUMENT_RECOVERY_KEYS.forEach');
    expect(storage).toContain("sessionStorage.removeItem('eai_research_notes')");
    expect(workspace).toContain("router.replace('/editor', { scroll: false })");
  });
});
