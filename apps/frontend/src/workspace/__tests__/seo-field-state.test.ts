import { describe, expect, it } from 'vitest';
import {
  getProtectedSeoReviewFields,
  getSafeStaleSeoFields,
  parseSeoFieldStates,
} from '../seo-field-state';

describe('frontend SEO field state', () => {
  it('separates safe automatic refresh from protected editorial review', () => {
    const states = parseSeoFieldStates({
      title: { status: 'review_required', reason: 'topic_changed' },
      slug: { status: 'review_required' },
      excerpt: { status: 'stale' },
      metaDescription: { status: 'stale' },
      ignored: { status: 'stale' },
    });
    expect(getSafeStaleSeoFields(states)).toEqual(['excerpt', 'metaDescription']);
    expect(getProtectedSeoReviewFields(states)).toEqual(['title', 'slug']);
  });
});
