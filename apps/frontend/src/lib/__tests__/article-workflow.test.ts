import { describe, expect, it } from 'vitest';
import { deriveArticleWorkflowSnapshot } from '@eai/shared';

const base = {
  analysisLogId: 'log_current',
  sourceRef: 'article_family',
  hasDraft: true,
};

describe('deriveArticleWorkflowSnapshot', () => {
  it('keeps an ordinary draft in Editor', () => {
    expect(deriveArticleWorkflowSnapshot(base)).toMatchObject({
      stage: 'drafting',
      nextAction: 'continue_writing',
      destination: 'editor',
    });
  });

  it('routes only current unresolved decisions to Review', () => {
    expect(deriveArticleWorkflowSnapshot({
      ...base,
      readiness: 'ready',
      feedback: [{ category: 'Source', status: 'fail', message: 'Verify claim' }],
    })).toMatchObject({
      stage: 'review_required',
      nextAction: 'resolve_decisions',
      destination: 'review',
      unresolvedDecisionCount: 1,
      blockingDecisionCount: 1,
    });
  });

  it('sends an editorially ready Fast Review result to publication preparation', () => {
    expect(deriveArticleWorkflowSnapshot({
      ...base,
      readiness: 'ready',
      feedback: [],
      publicationPackageStatus: 'not_generated',
    })).toMatchObject({
      stage: 'ready',
      nextAction: 'prepare_publication',
      destination: 'publication',
      publicationState: 'not_started',
    });
  });

  it('offers export only for a current complete package', () => {
    expect(deriveArticleWorkflowSnapshot({
      ...base,
      readiness: 'ready',
      publicationPackageStatus: 'current',
      qualityGateState: 'valid',
      seoFieldStates: {
        title: { status: 'valid' },
        slug: { status: 'valid' },
      },
    })).toMatchObject({
      stage: 'preparing_publication',
      nextAction: 'export_to_cms',
      publicationState: 'ready',
    });
  });

  it('keeps stale publication state out of export', () => {
    expect(deriveArticleWorkflowSnapshot({
      ...base,
      readiness: 'ready',
      publicationPackageStatus: 'stale',
      qualityGateState: 'stale',
    })).toMatchObject({
      stage: 'preparing_publication',
      nextAction: 'complete_metadata',
      blockedReason: 'quality_stale',
    });
  });

  it('treats a stale SEO review as incomplete publication work', () => {
    expect(deriveArticleWorkflowSnapshot({
      ...base,
      readiness: 'ready',
      publicationPackageStatus: 'current',
      qualityGateState: 'valid',
      seoReviewState: 'stale',
    })).toMatchObject({
      nextAction: 'complete_metadata',
      publicationState: 'metadata_required',
      blockedReason: 'metadata_incomplete',
    });
  });

  it('reports a successful export as completed work', () => {
    expect(deriveArticleWorkflowSnapshot({
      ...base,
      readiness: 'ready',
      publicationPackageStatus: 'current',
      exportStatus: { lastExportStatus: 'success' },
    })).toMatchObject({
      stage: 'exported',
      nextAction: 'open_cms_draft',
      publicationState: 'exported',
    });
  });
});
