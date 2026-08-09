import { describe, it, expect } from 'vitest';
import {
  addSourceLinkToDraft,
  checkMissingSources,
  calculateReadiness,
  buildEditorHandoff,
  extractArticleMetadata,
  extractQualityGate,
  extractPublicationState,
  isFeedbackResolved,
  markFeedbackApplied,
  normalizeHttpSourceUrl,
  isCandidatePendingReview,
  deriveHandoffDestination,
} from '../utils';
import type { FeedbackItem, ResearchNote, AnalysisResult } from '@eai/shared';

describe('checkMissingSources', () => {
  it('should return empty array if draftText is empty', () => {
    const notes: ResearchNote[] = [
      { id: '1', content: 'test', savedAt: '2026-07-17T10:00:00Z', sources: [{ url: 'https://example.com', domain: 'example.com' }] }
    ];
    expect(checkMissingSources('', notes)).toEqual([]);
  });

  it('should detect when a source from research notes is missing from draft', () => {
    const notes: ResearchNote[] = [
      { id: '1', content: 'test', savedAt: '2026-07-17T10:00:00Z', sources: [{ url: 'https://missing.com', domain: 'missing.com' }] }
    ];
    const draftText = 'This is a draft without any links.';
    expect(checkMissingSources(draftText, notes)).toEqual([
      { url: 'https://missing.com', domain: 'missing.com' }
    ]);
  });

  it('should return empty if all sources are present in the draft', () => {
    const notes: ResearchNote[] = [
      { id: '1', content: 'test', savedAt: '2026-07-17T10:00:00Z', sources: [{ url: 'https://present.com', domain: 'present.com' }] }
    ];
    const draftText = 'According to https://present.com, it works.';
    expect(checkMissingSources(draftText, notes)).toEqual([]);
  });
});

describe('calculateReadiness', () => {
  it('should return ready when there are no unresolved feedback items', () => {
    const feedback: FeedbackItem[] = [
      { status: 'pass', message: 'Good', isAccepted: false, isVerified: false, category: 'style' }
    ];
    expect(calculateReadiness(feedback)).toBe('ready');
  });

  it('should return needs_review when there is an unresolved feedback item', () => {
    const feedback: FeedbackItem[] = [
      { status: 'fail', message: 'Issue', isAccepted: false, isVerified: false, category: 'style' }
    ];
    expect(calculateReadiness(feedback)).toBe('needs_review');
  });

  it('should return ready if the unresolved items are accepted or verified', () => {
    const feedback: FeedbackItem[] = [
      { status: 'fail', message: 'Issue 1', isAccepted: true, isVerified: false, category: 'style' },
      { status: 'fail', message: 'Issue 2', isAccepted: false, isVerified: true, category: 'style' }
    ];
    expect(calculateReadiness(feedback)).toBe('ready');
  });

  it('should treat applied feedback as resolved', () => {
    const feedback: FeedbackItem[] = [
      { status: 'fail', message: 'Issue', category: 'style', isApplied: true }
    ];
    expect(calculateReadiness(feedback)).toBe('ready');
  });

  it('marks body-changing resolutions as applied instead of accepted', () => {
    const feedback: FeedbackItem[] = [{
      status: 'warning',
      message: 'Unsupported entity detail',
      category: 'Source Fidelity',
      isAccepted: true,
      isVerified: true,
    }];

    const result = markFeedbackApplied(feedback, 0);

    expect(result[0]).toMatchObject({
      isApplied: true,
      isAccepted: false,
      isVerified: false,
    });
    expect(isFeedbackResolved(result[0])).toBe(true);
  });

  it('keeps an accepted decision resolved without marking the draft as changed', () => {
    const accepted: FeedbackItem = {
      status: 'warning',
      message: 'Intentional editorial wording',
      category: 'Editorial Review',
      isAccepted: true,
    };

    expect(isFeedbackResolved(accepted)).toBe(true);
    expect(calculateReadiness([accepted])).toBe('ready');
    expect(accepted.isApplied).toBeUndefined();
  });
});

describe('extractPublicationState', () => {
  it('restores independent Quality Gate and SEO advisory states', () => {
    expect(extractPublicationState({
      publicationPackageStatus: 'current',
      _system: {
        qualityGateState: 'validation_recommended',
        seoReviewState: 'possibly_stale',
      },
    })).toMatchObject({
      publicationPackageStatus: 'current',
      qualityGateState: 'validation_recommended',
      seoReviewState: 'possibly_stale',
    });
  });
});

describe('buildEditorHandoff', () => {
  it('sends a ready article and its current SEO package to Publication', () => {
    expect(buildEditorHandoff({
      analysisLogId: 'ready-log',
      readiness: 'ready',
      feedback: [],
      generatedMetadata: { title: 'Ready article', slug: 'ready-article' },
      publicationPackageStatus: 'current',
    })).toMatchObject({
      destination: 'publication',
      unresolvedFindingCount: 0,
      hasSeoPackage: true,
    });
  });

  it('sends unresolved current findings to Review even if readiness is contradictory', () => {
    expect(buildEditorHandoff({
      analysisLogId: 'review-log',
      readiness: 'ready',
      feedback: [{
        category: 'Source fidelity',
        status: 'fail',
        message: 'A source decision is required.',
      }],
      publicationPackageStatus: 'not_generated',
    })).toMatchObject({
      destination: 'review',
      unresolvedFindingCount: 1,
      blockingFindingCount: 1,
      hasSeoPackage: false,
    });
  });

  it('keeps a ready Fast Preview without an SEO package out of Publication', () => {
    expect(buildEditorHandoff({
      analysisLogId: 'fast-log',
      readiness: 'ready',
      feedback: [],
      publicationPackageStatus: 'not_generated',
    })).toMatchObject({
      destination: 'review',
      unresolvedFindingCount: 0,
      hasSeoPackage: false,
    });
  });
});

describe('feedback source URLs', () => {
  it('accepts only HTTP and HTTPS URLs', () => {
    expect(normalizeHttpSourceUrl('https://example.com/report')).toBe('https://example.com/report');
    expect(normalizeHttpSourceUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeHttpSourceUrl('https://example.com/report_(final)')).toBe(
      'https://example.com/report_%28final%29'
    );
    expect(normalizeHttpSourceUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpSourceUrl('not a URL')).toBeNull();
  });

  it('links a matching claim without appending internal verification notes', () => {
    const result = addSourceLinkToDraft(
      'Revenue grew by 20% in 2025.',
      'Revenue grew by 20% in 2025.',
      'https://example.com/report'
    );
    expect(result).toEqual({
      nextDraft: '[Revenue grew by 20% in 2025.](https://example.com/report)',
      linked: true,
    });
    expect(result.nextDraft).not.toContain('Verification Notes');
  });

  it('updates an existing claim link instead of nesting markdown links', () => {
    const result = addSourceLinkToDraft(
      '[Revenue grew by 20% in 2025.](https://old.example/report)',
      'Revenue grew by 20% in 2025.',
      'https://new.example/report'
    );
    expect(result.nextDraft).toBe(
      '[Revenue grew by 20% in 2025.](https://new.example/report)'
    );
  });

  it('leaves publication content unchanged when the claim cannot be located', () => {
    expect(
      addSourceLinkToDraft('Different content.', 'Missing claim', 'https://example.com')
    ).toEqual({ nextDraft: 'Different content.', linked: false });
  });
});

describe('extractArticleMetadata', () => {
  it('should handle undefined or null metadata', () => {
    expect(extractArticleMetadata(null)).toEqual({});
    expect(extractArticleMetadata(undefined)).toEqual({});
  });

  it('should extract valid keys from metadata object', () => {
    const raw = {
      category: 'Tech',
      type: 'Guide',
      strictness: 'strict',
      outputLanguage: 'id',
      extraField: 'should-be-ignored'
    };
    expect(extractArticleMetadata(raw)).toEqual({
      category: 'Tech',
      type: 'Guide',
      strictness: 'strict',
      outputLanguage: 'id'
    });
  });
});

describe('extractQualityGate', () => {
  it('should return empty if _system metadata is missing', () => {
    expect(extractQualityGate({ foo: 'bar' })).toEqual({});
  });

  it('should extract readiness and changes', () => {
    const raw = {
      _system: {
        readiness: 'ready',
        refinementChanges: ['fixed spelling', 'added citation']
      }
    };
    expect(extractQualityGate(raw)).toEqual({
      readiness: 'ready',
      changes: ['fixed spelling', 'added citation']
    });
  });
});

describe('isCandidatePendingReview', () => {
  it('should return true when analysis succeeds, draft exists, and not ready', () => {
    expect(isCandidatePendingReview(
      { polishedDraft: 'Candidate content', status: 'success', readiness: 'needs_review' } as unknown as AnalysisResult,
      { isStreaming: false, isRefining: false }
    )).toBe(true);
  });

  it('should return false if currently streaming or refining', () => {
    expect(isCandidatePendingReview(
      { polishedDraft: 'Candidate content', status: 'success', readiness: 'needs_review' } as unknown as AnalysisResult,
      { isStreaming: true, isRefining: false }
    )).toBe(false);

    expect(isCandidatePendingReview(
      { polishedDraft: 'Candidate content', status: 'success', readiness: 'needs_review' } as unknown as AnalysisResult,
      { isStreaming: false, isRefining: true }
    )).toBe(false);
  });

  it('should return false if readiness is already ready', () => {
    expect(isCandidatePendingReview(
      { polishedDraft: 'Candidate content', status: 'success', readiness: 'ready' } as unknown as AnalysisResult,
      { isStreaming: false, isRefining: false }
    )).toBe(false);
  });
});

describe('deriveHandoffDestination', () => {
  it('returns publication when ready and has publication package', () => {
    expect(deriveHandoffDestination({
      readiness: 'ready',
      hasPublicationPackage: true,
    })).toBe('publication');
  });

  it('returns review when missing publication package', () => {
    expect(deriveHandoffDestination({
      readiness: 'ready',
      hasPublicationPackage: false,
    })).toBe('review');
  });

  it('returns review when not ready', () => {
    expect(deriveHandoffDestination({
      readiness: 'needs_review',
      hasPublicationPackage: true,
    })).toBe('review');
  });
});
