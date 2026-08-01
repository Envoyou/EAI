import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontendSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('revision-safe publication workflow', () => {
  it('offers draft editing, quality-only checks, and independent SEO regeneration', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const inlineEditor = readFrontendSource(
      'components/final-draft/InlineFinalDraftEditor.tsx'
    );
    const editorStyles = readFrontendSource('app/styles/workspace/editor.css');

    expect(panel).toContain('<InlineFinalDraftEditor');
    expect(panel).toContain("setActiveTab('preview')");
    expect(panel).toContain('saveDraftRevision');
    expect(panel).toContain('cancelDraftEditing');
    expect(panel).toContain("t('saveInvalidatesReview')");
    expect(panel).toContain("t('revisionImpactPolicy')");
    expect(panel).not.toContain('final-draft-editor-textarea');
    expect(inlineEditor).toContain('useEditor({');
    expect(inlineEditor).toContain('Markdown.configure({');
    expect(inlineEditor).toContain('onChange(readMarkdown(currentEditor.storage))');
    expect(editorStyles).toContain('.final-draft-inline-editor-toolbar');
    expect(editorStyles).toContain('position: sticky');
    expect(editorStyles).toContain('.final-draft-inline-editor');
    expect(editorStyles).toContain('caret-color: var(--primary)');
    expect(panel).toContain('Run Quality Check');
    expect(panel).toContain('Regenerate SEO metadata');
    expect(panel).toContain('Save Publication Metadata');
    expect(panel).toContain('Prepare current draft for export');
    expect(panel).toContain("t('confirmMetadataCurrent')");
    expect(panel).toContain('onConfirmPublicationMetadata');
    expect(panel).toContain(
      'icon={PreparePublicationIcon}'
    );
    expect(panel).toContain(
      'labelClassName="hidden md:inline"'
    );
  });

  it('retains publication readiness for backend-classified safe edits', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');

    expect(workspace).toContain('result.qualityCheckInvalidated === true');
    expect(workspace).toContain("result.revisionImpact === 'formatting_only'");
    expect(workspace).toContain("result.revisionImpact === 'minor_copy_edit'");
    expect(workspace).toContain("result.revisionImpact === 'editorial_change'");
    expect(workspace).toContain("tFinalDraftPanel('substantiveEditSaved')");
    expect(workspace).toContain("analysis.seoReviewState !== 'stale'");
    expect(workspace).toContain("tFinalDraftPanel('existingSeoRetained')");
  });

  it('distinguishes advisory validation from blocking Quality Gate and SEO states', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');

    expect(panel).toContain("qualityGateState === 'validation_recommended'");
    expect(panel).toContain("qualityGateState === 'stale'");
    expect(panel).toContain("seoReviewState === 'possibly_stale'");
    expect(panel).toContain("t('runOptionalQualityCheck')");
    expect(panel).toContain("t('seoReviewRecommendedDescription')");
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
    const targetedFix = readFrontendSource('workspace/actions/targetedFix.ts');

    expect(workspace).toContain("options.automatic ? 'validate_revision' : 'quality_gate'");
    expect(workspace).toContain("mode: 'generate_seo'");
    expect(workspace).toContain("action: 'update_final_draft'");
    expect(workspace).toContain("action: 'update_publication_package'");
    expect(workspace).toContain("action: 'confirm_publication_package'");
    expect(workspace).toContain('originalDraft: sourceDraft');
    expect(targetedFix).toContain('originalDraft,');
    expect(targetedFix).toContain('researchNotes,');
  });

  it('distinguishes accepted decisions from body changes awaiting quality recheck', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const targetedFix = readFrontendSource('workspace/actions/targetedFix.ts');
    const feedbackPanel = readFrontendSource('components/FeedbackPanel.tsx');
    const feedbackCard = readFrontendSource(
      'components/feedback-panel/components/FeedbackItemCard.tsx'
    );

    expect(targetedFix).toContain('markFeedbackApplied');
    expect(targetedFix).not.toContain("isAccepted: actionType === 'remove'");
    expect(workspace).toContain('persisted.readiness');
    expect(workspace).toContain('persisted.publicationPackageStatus');
    expect(feedbackPanel).toContain('unresolvedFeedbackCount');
    expect(feedbackPanel).toContain("t('pendingQualityCheck')");
    expect(feedbackCard).toContain("t('appliedPendingQualityCheck')");
    expect(feedbackCard).toContain("t('acceptedPendingQualityCheck')");
  });

  it('automatically validates system-applied draft changes and refreshes only stale SEO', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const targetedFix = readFrontendSource('workspace/actions/targetedFix.ts');
    const summary = readFrontendSource(
      'components/feedback-panel/components/QualityGateSummary.tsx'
    );

    expect(workspace).toContain('runAutomaticPublicationValidation');
    expect(workspace).toContain('await handleQualityCheck({');
    expect(workspace).toContain("mode: options.automatic ? 'validate_revision' : 'quality_gate'");
    expect(workspace).toContain("context.publicationPackageStatus === 'stale'");
    expect(workspace).toContain("context.seoReviewState === 'stale'");
    expect(workspace).toContain('await handleRegenerateSeo({');
    expect(workspace).toContain('const result = await executeTargetedFix');
    expect(workspace).toContain('sourceAddedAutomaticQualityCheck');
    expect(workspace).toContain('revisionId: draftRevision?.revisionId');
    expect(workspace).toContain('bodyHash: draftRevision?.bodyHash');
    expect(workspace).toContain("event.type === 'revision_identity'");
    expect(targetedFix).toContain('Promise<TargetedFixResult | null>');
    expect(summary).toContain("t('applyAndVerify')");
  });

  it('schedules non-blocking validation after a durable manual revision', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');

    expect(workspace).toContain('getBackgroundValidationDelay(context.validationLevel)');
    expect(workspace).toContain('backgroundValidationAbortControllerRef');
    expect(workspace).toContain('preserveCurrentStateOnFailure: true');
    expect(workspace).toContain('background: true');
    expect(workspace).toContain('cancelBackgroundValidation();');
    expect(panel).toContain('isBackgroundValidation');
    expect(panel).toContain("t('checkingRecentChangesTitle')");
  });

  it('keeps targetless quality findings actionable without requiring full Analyze', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const feedbackCard = readFrontendSource(
      'components/feedback-panel/components/FeedbackItemCard.tsx'
    );

    expect(feedbackCard).toContain('showAcceptEditorialDecision');
    expect(feedbackCard).toContain('showEAIRevision');
    expect(feedbackCard).toContain("t('reviseWithEAI')");
    expect(workspace).toContain("!item.targetText?.trim()");
    expect(workspace).toContain('Resolve only this remaining editorial finding');
    expect(workspace).toContain('await handleRefineAgain(instruction, analysis.polishedDraft, true)');
  });

  it('keeps cancellation available for the complete AI lifecycle and blocks overlapping actions', () => {
    const shell = readFrontendSource('components/EditorialWorkspace.tsx');
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const analyze = readFrontendSource('workspace/actions/analyze.ts');
    const finalDraft = readFrontendSource('components/FinalDraftPanel.tsx');

    expect(shell).toContain('if (isAiBusy)');
    expect(shell).toContain("isAiBusy ? 'Cancel current AI request'");
    expect(workspace).toContain('analyzeAbortControllerRef.current');
    expect(workspace).toContain('generateAbortControllerRef.current');
    expect(analyze).toContain('const previousAnalysis = analysis');
    expect(analyze).toContain('setAnalysis(() => previousAnalysis)');
    expect(finalDraft).toContain('disabled={!ready || isAiBusy}');
    expect(finalDraft).toContain('disabled={!qualityReady || isGeneratingDraft || isAiBusy}');
  });
});
