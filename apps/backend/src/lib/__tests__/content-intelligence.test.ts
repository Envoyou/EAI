import { describe, expect, it } from 'vitest';
import type { ContentArtifactStage } from '@prisma/client';
import {
  buildContentIntelligenceSnapshot,
  type IntelligenceArtifact,
} from '@/lib/content-intelligence';

const artifact = (
  id: string,
  overrides: Partial<IntelligenceArtifact> = {}
): IntelligenceArtifact => ({
  id,
  rootArtifactId: null,
  title: `Article ${id}`,
  topic: `Topic ${id}`,
  angle: null,
  primaryKeyword: null,
  searchIntent: null,
  language: 'en',
  currentStage: 'DRAFTING' as ContentArtifactStage,
  status: 'ACTIVE',
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  ...overrides,
});

describe('Content Intelligence snapshot', () => {
  it('uses semantic relationships to form cross-language topic clusters', () => {
    const snapshot = buildContentIntelligenceSnapshot({
      artifacts: [
        artifact('en', {
          title: 'Measuring AI marketing ROI',
          language: 'en',
        }),
        artifact('id', {
          title: 'Mengukur hasil investasi pemasaran kecerdasan buatan',
          language: 'id',
        }),
      ],
      semanticPairs: [{ leftId: 'en', rightId: 'id', score: 0.84 }],
      embeddedArtifactCount: 2,
    });

    expect(snapshot.clusters).toHaveLength(1);
    expect(snapshot.clusters[0].languages).toEqual(
      expect.arrayContaining(['en', 'id'])
    );
    expect(snapshot.semanticCoverage).toBe(1);
  });

  it('detects cannibalization without flagging lifecycle derivatives', () => {
    const snapshot = buildContentIntelligenceSnapshot({
      artifacts: [
        artifact('published', {
          title: 'AI content marketing guide',
          topic: 'AI content marketing',
          primaryKeyword: 'AI content marketing',
          searchIntent: 'informational',
          currentStage: 'PUBLISHED',
        }),
        artifact('competing', {
          title: 'Complete guide to AI content marketing',
          topic: 'AI content marketing guide',
          primaryKeyword: 'AI content marketing',
          searchIntent: 'informational',
          currentStage: 'READY',
        }),
        artifact('derivative', {
          rootArtifactId: 'published',
          title: 'AI content marketing refined draft',
          topic: 'AI content marketing',
          primaryKeyword: 'AI content marketing',
          searchIntent: 'informational',
        }),
      ],
      semanticPairs: [
        { leftId: 'published', rightId: 'competing', score: 0.93 },
        { leftId: 'published', rightId: 'derivative', score: 0.99 },
      ],
    });

    expect(snapshot.cannibalizationRisks).toHaveLength(1);
    expect(snapshot.cannibalizationRisks[0]).toMatchObject({
      severity: 'critical',
      recommendation: 'set_canonical',
    });
    expect(snapshot.cannibalizationRisks[0].right.id).toBe('competing');
  });

  it('builds content gaps, refresh work, and internal-link opportunities', () => {
    const snapshot = buildContentIntelligenceSnapshot({
      now: new Date('2026-07-29T00:00:00.000Z'),
      artifacts: [
        artifact('pillar', {
          title: 'Content operations handbook',
          topic: 'Content operations',
          primaryKeyword: 'content operations',
          currentStage: 'PUBLISHED',
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
        artifact('supporting', {
          title: 'Content operations metrics',
          topic: 'Content operations',
          angle: 'Measurement',
          primaryKeyword: 'content operations metrics',
        }),
        artifact('planning-a', {
          topic: 'Editorial governance',
          primaryKeyword: 'editorial governance',
        }),
        artifact('planning-b', {
          topic: 'Editorial governance workflow',
          primaryKeyword: 'editorial governance',
        }),
      ],
      semanticPairs: [
        { leftId: 'pillar', rightId: 'supporting', score: 0.78 },
        { leftId: 'planning-a', rightId: 'planning-b', score: 0.8 },
      ],
      gapSignals: [
        {
          matchedArtifactIds: ['pillar'],
          alternativeAngles: ['Content operations ROI benchmark'],
        },
      ],
    });

    expect(snapshot.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'classifier_feedback',
          suggestedAngle: 'Content operations ROI benchmark',
        }),
        expect.objectContaining({
          source: 'lifecycle_coverage',
          topic: 'editorial governance',
        }),
      ])
    );
    expect(snapshot.updateRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'stale_published',
          artifact: expect.objectContaining({ id: 'pillar' }),
        }),
      ])
    );
    expect(snapshot.internalLinkOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: expect.objectContaining({ id: 'supporting' }),
          to: expect.objectContaining({ id: 'pillar' }),
        }),
      ])
    );
  });
});
