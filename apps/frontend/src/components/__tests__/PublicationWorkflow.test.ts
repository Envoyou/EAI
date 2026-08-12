import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontendSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('revision-safe publication workflow', () => {
  it('offers draft editing, quality-only checks, and independent SEO regeneration', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const seoPanel = readFrontendSource('components/PublicationSeoPanel.tsx');
    const inlineEditor = readFrontendSource(
      'components/final-draft/InlineFinalDraftEditor.tsx'
    );
    const editorStyles = readFrontendSource('app/styles/workspace/editor.css');

    expect(panel).toContain('<InlineFinalDraftEditor');
    expect(panel).toContain("setActiveTab('preview')");
    expect(panel).toContain('saveDraftRevision');
    expect(panel).toContain('cancelDraftEditing');
    expect(panel).toContain("t('saveInvalidatesReview')");
    expect(panel).toContain('final-draft-edit-command');
    expect(panel.indexOf('final-draft-edit-command')).toBeLessThan(
      panel.indexOf('document-tabs')
    );
    expect(panel).not.toContain('final-draft-editor-textarea');
    expect(inlineEditor).toContain('useEditor({');
    expect(inlineEditor).toContain('Markdown.configure({');
    expect(inlineEditor).toContain('onChange(readMarkdown(currentEditor.storage))');
    expect(editorStyles).not.toContain('.final-draft-inline-editor-toolbar');
    expect(editorStyles).toContain('.final-draft-inline-editor');
    expect(editorStyles).toContain('caret-color: var(--primary)');
    expect(panel).toContain("t('qualityCheck')");
    expect(panel).toContain("t('regenerateSeo')");
    expect(seoPanel).toContain("t('savePublicationMetadata')");
    expect(panel).toContain("t('prepareForExport')");
    expect(seoPanel).toContain("t('confirmMetadataCurrent')");
    expect(seoPanel).toContain('onConfirm');
    expect(panel).toContain(
      'icon={PreparePublicationIcon}'
    );
    expect(panel).toContain('publication-command-row');
    expect(panel).toContain("t('readyToPublishTitle')");
    expect(panel).toContain("t('finishLater')");
    expect(panel).toContain("t('documentActions')");
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

  it('maps technical validation state to user-facing publication outcomes', () => {
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const seoPanel = readFrontendSource('components/PublicationSeoPanel.tsx');
    const uxState = readFrontendSource('workspace/publication-ux-state.ts');

    expect(panel).toContain('derivePublicationUxState({');
    expect(panel).toContain("publicationUxState === 'checking'");
    expect(panel).toContain("publicationUxState === 'content_decision_required'");
    expect(seoPanel).toContain("uxState === 'metadata_decision_required'");
    expect(panel).not.toContain("t('runOptionalQualityCheck')");
    expect(uxState).toContain("qualityGateState === 'stale'");
    expect(uxState).toContain("seoReviewState === 'possibly_stale'");
    expect(seoPanel).toContain("t('seoReviewRecommendedDescription')");
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

  it('persists a metadata value and its finding resolution through one atomic action', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const handlerStart = workspace.indexOf('const handleApplyPublicationFix = async');
    const handlerEnd = workspace.indexOf(
      'const handleConfirmPublicationMetadata = async',
      handlerStart
    );
    const handler = workspace.slice(handlerStart, handlerEnd);

    expect(handler).toContain("action: 'apply_publication_metadata_finding'");
    expect(handler).toContain('feedbackId: item.feedbackId');
    expect(handler).toContain('result.generatedMetadata ?? nextPackage');
    expect(handler).toContain('result.feedback as FeedbackItem[]');
    expect(handler).not.toContain('handleSavePublicationMetadata(nextPackage)');
  });

  it('distinguishes accepted decisions from body changes awaiting quality recheck', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const targetedFix = readFrontendSource('workspace/actions/targetedFix.ts');
    const feedbackPanel = readFrontendSource('components/FeedbackPanel.tsx');
    const feedbackCard = readFrontendSource(
      'components/feedback-panel/components/FeedbackItemCard.tsx'
    );

    expect(targetedFix).not.toContain('markFeedbackApplied');
    expect(targetedFix).toContain("operation: 'replace'");
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
    expect(workspace).toContain("mode: 'refresh_seo_fields'");
    expect(workspace).toContain('getSafeStaleSeoFields(context.seoFieldStates)');
    expect(workspace).toContain('await handleRefreshSeoFields({');
    expect(workspace).toContain('await executeTargetedFix');
    expect(workspace).toContain('sourceAddedAutomaticQualityCheck');
    expect(workspace).toContain('revisionId: draftRevision?.revisionId');
    expect(workspace).toContain('bodyHash: draftRevision?.bodyHash');
    expect(workspace).toContain("event.type === 'revision_identity'");
    expect(targetedFix).toContain('Promise<TargetedFixPreviewResult | null>');
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
    const targetedFix = readFrontendSource('workspace/actions/targetedFix.ts');
    const feedbackCard = readFrontendSource(
      'components/feedback-panel/components/FeedbackItemCard.tsx'
    );

    expect(feedbackCard).toContain('showAcceptEditorialDecision');
    expect(feedbackCard).toContain('showEAIRevision');
    expect(feedbackCard).toContain("t('generateSuggestion')");
    expect(feedbackCard).toContain('requiresGeneratedPreview');
    expect(targetedFix).toContain("item?.targetText?.trim() || fullDraft");
    expect(targetedFix).toContain("mode: 'fix_targeted'");
    expect(workspace).not.toContain('Resolve only this remaining editorial finding');
  });

  it('applies prepared patches optimistically and separates persistence failures from validation warnings', () => {
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const targetedFix = readFrontendSource('workspace/actions/targetedFix.ts');

    const optimisticUpdate = workspace.indexOf('polishedDraft: result.nextText');
    const persistence = workspace.indexOf('await persistEditorialResolution(', optimisticUpdate);
    expect(optimisticUpdate).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(optimisticUpdate);
    expect(workspace).toContain('prev.polishedDraft === result.nextText ? previousAnalysis : prev');
    expect(workspace).toContain("error.code === 'DRAFT_REVISION_MISMATCH'");
    expect(workspace).toContain('if (logId) await loadHistory(logId);');
    expect(workspace).toContain('await runAutomaticPublicationValidation(automaticValidation);');
    expect(targetedFix).toContain('replacementText,');
    expect(targetedFix).not.toContain('persistEditorialResolution');
  });

  it('keeps unresolved candidates behind an editorial review queue', () => {
    const canvas = readFrontendSource('components/EditorCanvas.tsx');
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const feedbackCard = readFrontendSource(
      'components/feedback-panel/components/FeedbackItemCard.tsx'
    );

    expect(canvas).toContain('isCandidatePendingReview');
    expect(canvas).toContain("analysis.readiness !== 'ready'");
    expect(canvas).toContain("t('reviewDecision')");
    expect(canvas).toContain('onOpenFeedbackSidebar();');
    expect(canvas).toContain("analysis.readiness === 'ready'");
    expect(panel).toContain("reviewMode ? t('candidateDraft') : t('finalDraft')");
    expect(feedbackCard).toContain("t('acceptChange')");
    expect(feedbackCard).toContain("t('keepCurrentText')");
    expect(feedbackCard).toContain("t('addSourceManually')");
    expect(feedbackCard).toContain("t('useSuggestedSource')");
    expect(feedbackCard).toContain('sourceOverride?: string');
    expect(feedbackCard).not.toContain("onCopy(item.suggestion!");
  });

  it('renders review actions only from canonical capabilities and separates candidate availability', () => {
    const canvas = readFrontendSource('components/EditorCanvas.tsx');
    const panel = readFrontendSource('components/FinalDraftPanel.tsx');
    const capability = readFrontendSource('workspace/review-capability.ts');

    expect(canvas).toContain('buildReviewDecisionQueue');
    expect(canvas).toContain('capability.autoApplicable');
    expect(canvas).toContain('autoApplicableCount > 0');
    expect(canvas).not.toContain("onFixFeedbackWithEAI(index)");
    expect(capability).toContain('projectReviewCapability');
    expect(panel).toContain('hasCandidateDraft');
    expect(panel).toContain('isPublicationReady');
    expect(panel).toContain('reviewMode && onSaveFinalDraft');
    expect(panel).toContain('!hasCandidateDraft');
    expect(panel).toContain('startEditing && onSaveFinalDraft');
    expect(panel).toContain('focusText={editorFocusText}');
    expect(canvas).toContain("t('editAffectedText')");
    expect(canvas).toContain('onActiveFeedbackChange(firstDecision.index)');
  });

  it('keeps cancellation available for the complete AI lifecycle and blocks overlapping actions', () => {
    const shell = readFrontendSource('components/EditorialWorkspace.tsx');
    const workspace = readFrontendSource('workspace/useEditorialWorkspace.ts');
    const analyze = readFrontendSource('workspace/actions/analyze.ts');
    const finalDraft = readFrontendSource('components/FinalDraftPanel.tsx');

    expect(shell).toContain('if (isAiBusy)');
    expect(shell).toContain("isAiBusy\n                        ? tWorkspace('cancelAiAction')");
    expect(workspace).toContain('analyzeAbortControllerRef.current');
    expect(workspace).toContain('generateAbortControllerRef.current');
    expect(analyze).toContain('const previousAnalysis = analysis');
    expect(analyze).toContain('setAnalysis(() => previousAnalysis)');
    expect(finalDraft).toContain('disabled={!ready || isAiBusy}');
    expect(finalDraft).toContain('disabled={!qualityReady || isGeneratingDraft || isAiBusy}');
  });
});
