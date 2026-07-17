import { describe, it, expect } from 'vitest';
import { checkMissingSources, calculateReadiness, extractArticleMetadata, extractQualityGate } from '../utils';
import type { FeedbackItem, ResearchNote } from '@eai/shared';

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
