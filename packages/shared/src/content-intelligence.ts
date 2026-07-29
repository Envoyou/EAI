import { z } from 'zod';

export const ContentIntelligenceArtifactSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  topic: z.string().nullable(),
  angle: z.string().nullable(),
  primaryKeyword: z.string().nullable(),
  searchIntent: z.string().nullable(),
  language: z.string().nullable(),
  stage: z.string(),
  status: z.string(),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  sourceHref: z.string().nullable(),
  ownerName: z.string().nullable(),
  exportStatus: z.enum(['not_exported', 'exported', 'failed']),
  lastExportedAt: z.string().nullable(),
  canonicalArtifactId: z.string().nullable(),
  canManage: z.boolean(),
  updatedAt: z.string(),
});

export type ContentIntelligenceArtifact = z.infer<
  typeof ContentIntelligenceArtifactSchema
>;

export const TopicClusterSchema = z.object({
  id: z.string(),
  label: z.string(),
  coverage: z.enum(['established', 'growing', 'emerging']),
  artifactCount: z.number().int().min(1),
  publishedCount: z.number().int().min(0),
  languages: z.array(z.string()),
  keywords: z.array(z.string()),
  artifacts: z.array(ContentIntelligenceArtifactSchema),
});

export type TopicCluster = z.infer<typeof TopicClusterSchema>;

export const CannibalizationRiskSchema = z.object({
  id: z.string(),
  severity: z.enum(['critical', 'high', 'medium']),
  score: z.number().min(0).max(1),
  reasons: z.array(
    z.enum([
      'same_primary_keyword',
      'same_search_intent',
      'semantic_overlap',
      'topic_overlap',
    ])
  ),
  recommendation: z.enum(['consolidate', 'reposition', 'set_canonical']),
  left: ContentIntelligenceArtifactSchema,
  right: ContentIntelligenceArtifactSchema,
});

export type CannibalizationRisk = z.infer<
  typeof CannibalizationRiskSchema
>;

export const ContentGapSchema = z.object({
  id: z.string(),
  clusterId: z.string().nullable(),
  topic: z.string(),
  suggestedAngle: z.string(),
  source: z.enum(['classifier_feedback', 'lifecycle_coverage']),
  rationale: z.enum([
    'classifier_identified_open_angle',
    'no_published_coverage',
  ]),
  relatedArtifacts: z.array(ContentIntelligenceArtifactSchema),
});

export type ContentGap = z.infer<typeof ContentGapSchema>;

export const ContentUpdateRecommendationSchema = z.object({
  id: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  reason: z.enum([
    'stale_published',
    'archived_overlap',
    'cannibalization',
  ]),
  ageDays: z.number().int().min(0),
  artifact: ContentIntelligenceArtifactSchema,
  relatedArtifactId: z.string().nullable(),
  relatedArtifact: ContentIntelligenceArtifactSchema.nullable(),
});

export type ContentUpdateRecommendation = z.infer<
  typeof ContentUpdateRecommendationSchema
>;

export const InternalLinkOpportunitySchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(1),
  reason: z.enum([
    'same_topic_cluster',
    'semantic_relationship',
    'keyword_relationship',
  ]),
  from: ContentIntelligenceArtifactSchema,
  to: ContentIntelligenceArtifactSchema,
});

export type InternalLinkOpportunity = z.infer<
  typeof InternalLinkOpportunitySchema
>;

export const ContentIntelligenceSnapshotSchema = z.object({
  generatedAt: z.string(),
  analyzedArtifactCount: z.number().int().min(0),
  truncated: z.boolean(),
  resultLimit: z.number().int().min(1),
  resultsTruncated: z.boolean(),
  semanticCoverage: z.number().min(0).max(1),
  summary: z.object({
    clusterCount: z.number().int().min(0),
    cannibalizationRiskCount: z.number().int().min(0),
    gapCount: z.number().int().min(0),
    updateRecommendationCount: z.number().int().min(0),
    internalLinkOpportunityCount: z.number().int().min(0),
  }),
  clusters: z.array(TopicClusterSchema),
  cannibalizationRisks: z.array(CannibalizationRiskSchema),
  gaps: z.array(ContentGapSchema),
  updateRecommendations: z.array(ContentUpdateRecommendationSchema),
  internalLinkOpportunities: z.array(InternalLinkOpportunitySchema),
});

export type ContentIntelligenceSnapshot = z.infer<
  typeof ContentIntelligenceSnapshotSchema
>;

export const ContentIntelligenceActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('not_cannibalization'),
    artifactId: z.string().min(1),
    relatedArtifactId: z.string().min(1),
  }),
  z.object({
    action: z.literal('reposition'),
    artifactId: z.string().min(1),
    angle: z.string().trim().min(1).max(2_000),
    primaryKeyword: z.string().trim().max(300).nullable().optional(),
    searchIntent: z.string().trim().max(1_000).nullable().optional(),
  }),
  z.object({
    action: z.literal('set_canonical'),
    artifactId: z.string().min(1),
    relatedArtifactId: z.string().min(1),
  }),
  z.object({
    action: z.literal('consolidate'),
    artifactId: z.string().min(1),
    relatedArtifactId: z.string().min(1),
  }),
  z.object({
    action: z.literal('archive'),
    artifactId: z.string().min(1),
  }),
]);

export type ContentIntelligenceAction = z.infer<
  typeof ContentIntelligenceActionSchema
>;
