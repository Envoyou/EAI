import { describe, expect, it } from 'vitest';
import { derivePublicationUxState } from '../publication-ux-state';

describe('publication UX state', () => {
  it('hides internal mechanics behind user-facing priority states', () => {
    expect(derivePublicationUxState({
      isChecking: true,
      qualityGateState: 'stale',
      publicationPackageStatus: 'stale',
    })).toBe('checking');
    expect(derivePublicationUxState({
      isChecking: false,
      qualityGateState: 'stale',
      publicationPackageStatus: 'stale',
    })).toBe('content_decision_required');
    expect(derivePublicationUxState({
      isChecking: false,
      qualityGateState: 'valid',
      publicationPackageStatus: 'stale',
      seoFieldStates: { title: { status: 'review_required' } },
    })).toBe('metadata_decision_required');
  });

  it('shows a quiet completed state for a non-blocking checked revision', () => {
    expect(derivePublicationUxState({
      isChecking: false,
      qualityGateState: 'validation_recommended',
      publicationPackageStatus: 'current',
    })).toBe('changes_checked');
  });
});
