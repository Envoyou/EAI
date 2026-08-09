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
  const editorWorkflow = read('../EditorWorkflowPanel.tsx');
  const publicationSeo = read('../PublicationSeoPanel.tsx');
  const finalDraft = read('../FinalDraftPanel.tsx');
  const library = read('../SavedArticlesLibrary.tsx');
  const storage = read('../../workspace/hooks/useWorkspaceStorage.ts');
  const editor = read('../Editor.tsx');
  const editorStyles = read('../../app/styles/workspace/editor.css');
  const navigation = read('../app-shell/navigation/main-navigation.ts');
  const autosave = read('../../workspace/hooks/useWorkspaceAutosave.ts');
  const copilot = read('../AICopilotPanel.tsx');
  const strategist = read('../../lib/hooks/useContentStrategist.ts');
  const sessionSidebar = read('../strategist-tab/components/SessionSidebar.tsx');

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
    expect(library).toContain("presentation.stage === 'ready') return `/publication");
    expect(library).toContain("presentation.stage === 'review' || presentation.stage === 'blocked'");
    expect(library).toContain('return `/review${query}`');
  });

  it('keeps destructive library selection visible and accessible', () => {
    expect(library).toContain('visibleSelectedIds');
    expect(library).toContain('ids: visibleSelectedIds');
    expect(library).toContain("aria-label={t('selectArticle'");
    expect(library).toContain('aria-expanded={!isCollapsed}');
    expect(library).toContain('pending={isDeleting}');
  });

  it('keeps history out of the editor and scopes contextual tools by stage', () => {
    expect(workspace).not.toContain('<DocumentHistoryPanel');
    expect(workspace).toContain("allowedTabs={stage === 'review' ? ['feedback'] : ['strategist', 'notes', 'deep_report']}");
    expect(workspace).toContain('rightPanel={renderContextPanel()}');
    expect(workspace).toContain("if (stage === 'publication')");
    expect(publicationSeo).toContain("t('seoPackTitle')");
    expect(finalDraft).not.toContain('publicationMetadataRows.map');
    expect(workspace).toContain("stage === 'editor' && (isStreaming || editorHandoff)");
    expect(editorWorkflow).toContain('<EditorialProgress');
    expect(editorWorkflow).toContain("handoff.hasSeoPackage ? t('seoIncluded') : t('seoPending')");
  });

  it('hands a durable refinement to Review or Publication instead of leaving it in Editor', () => {
    expect(workspace).toContain('router.push(`/${editorHandoff.destination}?history=');
    expect(editorWorkflow).toContain("opensPublication ? t('openPublication') : t('openReview')");
    expect(workspace).toContain('onSave={handleSavePublicationMetadata}');
    expect(workspace).not.toContain('InPlaceRefineFeedbackModal');
  });

  it('keeps workflow stages out of global navigation', () => {
    expect(navigation).toContain("id: 'workspace'");
    expect(navigation).toContain("id: 'articles'");
    expect(navigation).toContain("id: 'dashboard'");
    expect(navigation).not.toContain("id: 'editor'");
    expect(navigation).not.toContain("id: 'review'");
    expect(navigation).not.toContain("id: 'publication'");
  });

  it('offers explicit creation paths and safe clearing', () => {
    expect(editor).toContain("useTranslations('ArticleEditor')");
    expect(editor).toContain("t('startWithAi')");
    expect(editor).toContain("t('fromBlueprint')");
    expect(editor).toContain("t('fromNotes')");
    expect(editor).toContain('<ConfirmDestructiveDialog');
    expect(editor).not.toContain("sessionStorage.removeItem('eai_strategist_messages')");
    expect(editor).toContain('article-launch-option-content');
    expect(editorStyles).toContain('.article-launch-option.ui-btn');
    expect(editorStyles).toContain('justify-content: flex-start');
    expect(editorStyles).toContain('white-space: normal');
    expect(workspace).toContain("onStartChat={() => openStrategistEntry('new_chat')}");
    expect(workspace).toContain("onOpenBlueprints={() => openStrategistEntry('blueprints')}");
    expect(copilot).toContain('startNewChat()');
    expect(copilot).toContain('openBlueprintLibrary()');
    expect(strategist).toContain("setSessionListMode('blueprints')");
    expect(sessionSidebar).toContain('sessions.filter(session => session.hasBlueprint)');
  });

  it('does not equate an idle autosave request with a successful save', () => {
    expect(autosave).toContain("setSaveState('dirty')");
    expect(autosave).toContain("setSaveState('failed')");
    expect(autosave).toContain("setSaveState('saved')");
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
