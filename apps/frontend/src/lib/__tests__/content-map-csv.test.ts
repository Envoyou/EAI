import { describe, expect, it } from 'vitest';
import type {
  ContentIntelligenceArtifact,
  ContentIntelligenceSnapshot,
} from '@eai/shared';
import {
  buildContentIntelligenceCsv,
  buildContentInventoryCsv,
} from '@/app/[locale]/dashboard/content-map/content-map-csv';

const artifact: ContentIntelligenceArtifact = {
  id: 'artifact-1',
  title: 'Article "One"',
  topic: 'Content operations',
  angle: 'Measurement',
  primaryKeyword: 'content operations',
  searchIntent: 'informational',
  language: 'en',
  stage: 'ready',
  status: 'active',
  sourceType: 'analysis',
  sourceId: 'log-1',
  sourceHref: '/workspace?history=log-1',
  ownerName: 'Editor One',
  exportStatus: 'exported',
  lastExportedAt: '2026-07-30T00:00:00.000Z',
  canonicalArtifactId: null,
  canManage: true,
  updatedAt: '2026-07-30T00:00:00.000Z',
};

describe('Content Map CSV exports', () => {
  it('exports inventory metadata with safe CSV escaping', () => {
    const csv = buildContentInventoryCsv([artifact]);
    expect(csv).toContain('"Article ""One"""');
    expect(csv).toContain('"Export status"');
    expect(csv).toContain('"exported"');
  });

  it('exports every Content Intelligence section', () => {
    const snapshot: ContentIntelligenceSnapshot = {
      generatedAt: '2026-07-30T00:00:00.000Z',
      analyzedArtifactCount: 1,
      truncated: false,
      resultLimit: 20,
      resultsTruncated: false,
      semanticCoverage: 1,
      summary: {
        clusterCount: 1,
        cannibalizationRiskCount: 1,
        gapCount: 1,
        updateRecommendationCount: 1,
        internalLinkOpportunityCount: 1,
      },
      clusters: [
        {
          id: 'cluster-1',
          label: 'Content operations',
          coverage: 'established',
          artifactCount: 1,
          publishedCount: 1,
          languages: ['en'],
          keywords: ['content operations'],
          artifacts: [artifact],
        },
      ],
      cannibalizationRisks: [
        {
          id: 'risk-1',
          severity: 'high',
          score: 0.9,
          reasons: ['semantic_overlap'],
          recommendation: 'reposition',
          left: artifact,
          right: { ...artifact, id: 'artifact-2', title: 'Article Two' },
        },
      ],
      gaps: [
        {
          id: 'gap-1',
          clusterId: 'cluster-1',
          topic: 'Content operations',
          suggestedAngle: 'Content operations ROI',
          source: 'classifier_feedback',
          rationale: 'classifier_identified_open_angle',
          relatedArtifacts: [artifact],
        },
      ],
      updateRecommendations: [
        {
          id: 'update-1',
          priority: 'medium',
          reason: 'cannibalization',
          ageDays: 10,
          artifact,
          relatedArtifactId: 'artifact-2',
          relatedArtifact: {
            ...artifact,
            id: 'artifact-2',
            title: 'Article Two',
          },
        },
      ],
      internalLinkOpportunities: [
        {
          id: 'link-1',
          score: 0.7,
          reason: 'semantic_relationship',
          from: artifact,
          to: { ...artifact, id: 'artifact-2', title: 'Article Two' },
        },
      ],
    };

    const csv = buildContentIntelligenceCsv(snapshot);
    expect(csv).toContain('"topic_cluster"');
    expect(csv).toContain('"cannibalization_risk"');
    expect(csv).toContain('"content_gap"');
    expect(csv).toContain('"update_recommendation"');
    expect(csv).toContain('"internal_link"');
  });
});
