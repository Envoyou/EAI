import { describe, expect, it } from 'vitest';
import type { FeedbackItem, PublicationPackage } from '@eai/shared';
import {
  applyPublicationMetadataFinding,
  PublicationMetadataFindingConflictError,
} from '@/lib/publication-metadata-finding';

const publicationPackage: PublicationPackage = {
  title: 'The Rise of Agentic AI in Enterprise Technology',
  slug: 'rise-of-agentic-ai-enterprise-autonomous-workflows',
  excerpt: 'A practical look at agentic AI adoption in enterprise technology.',
  metaTitle: 'Agentic AI and Enterprise Technology',
  metaDescription: 'Explore how agentic AI changes enterprise technology workflows, operating models, and automation decisions for modern organizations.',
  coverImageAltText: 'Agentic AI workflow diagram for enterprise technology',
  tags: ['Agentic AI', 'Enterprise', 'Automation'],
};

const slugFinding: FeedbackItem = {
  feedbackId: 'feedback_slug_length',
  category: 'Publication Metadata',
  status: 'warning',
  message: 'The slug contains 7 words; six or fewer is recommended.',
  targetField: 'publication.slug',
  targetText: publicationPackage.slug,
  replacementText: 'rise-agentic-ai-enterprise-autonomous-workflows',
  operation: 'manual',
};

describe('applyPublicationMetadataFinding', () => {
  it('updates metadata and resolves its finding as one state transition', () => {
    const result = applyPublicationMetadataFinding({
      feedback: [slugFinding],
      publicationPackage,
      feedbackId: slugFinding.feedbackId,
      targetField: 'publication.slug',
      targetText: slugFinding.targetText!,
      replacementText: slugFinding.replacementText!,
      previousReadiness: 'needs_review',
    });

    expect(result.publicationPackage.slug).toBe(
      'rise-agentic-ai-enterprise-autonomous-workflows'
    );
    expect(result.feedback[0]).toMatchObject({
      feedbackId: 'feedback_slug_length',
      isApplied: true,
      isAccepted: false,
      isVerified: false,
    });
    expect(result.readiness).toBe('ready');
  });

  it('retains needs_review when another finding is unresolved', () => {
    const otherFinding: FeedbackItem = {
      feedbackId: 'feedback_other',
      category: 'Source Fidelity',
      status: 'warning',
      message: 'Review the remaining source-sensitive claim.',
      targetField: 'body',
      operation: 'manual',
    };
    const result = applyPublicationMetadataFinding({
      feedback: [slugFinding, otherFinding],
      publicationPackage,
      feedbackId: slugFinding.feedbackId,
      targetField: 'publication.slug',
      targetText: slugFinding.targetText!,
      replacementText: slugFinding.replacementText!,
      previousReadiness: 'needs_review',
    });

    expect(result.readiness).toBe('needs_review');
    expect(result.feedback[1].isApplied).toBeUndefined();
  });

  it('rejects a stale or mismatched server finding', () => {
    expect(() => applyPublicationMetadataFinding({
      feedback: [slugFinding],
      publicationPackage,
      feedbackId: 'feedback_stale',
      targetField: 'publication.slug',
      targetText: slugFinding.targetText!,
      replacementText: slugFinding.replacementText!,
      previousReadiness: 'needs_review',
    })).toThrow(PublicationMetadataFindingConflictError);
  });

  it('supports a unique legacy finding without a feedback ID', () => {
    const { feedbackId: _feedbackId, ...legacyFinding } = slugFinding;
    const result = applyPublicationMetadataFinding({
      feedback: [legacyFinding],
      publicationPackage,
      targetField: 'publication.slug',
      targetText: legacyFinding.targetText!,
      replacementText: legacyFinding.replacementText!,
      previousReadiness: 'needs_review',
    });

    expect(result.feedback[0].isApplied).toBe(true);
  });
});
