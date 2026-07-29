import { z } from 'zod';

export const OverlapVerdictSchema = z.enum([
  'exact_duplicate',
  'probable_duplicate',
  'high_overlap',
  'same_topic_new_angle',
  'related',
  'distinct',
]);

export type OverlapVerdict = z.infer<typeof OverlapVerdictSchema>;

export const OverlapReasonSchema = z.enum([
  'same_title',
  'same_search_intent',
  'same_primary_keyword',
  'same_angle',
  'outline_overlap',
  'content_summary_overlap',
  'shared_audience',
  'same_source',
  'semantic_similarity',
  'active_reservation',
]);

export type OverlapReason = z.infer<typeof OverlapReasonSchema>;

export const DuplicateGuardActionSchema = z.enum([
  'block',
  'require_confirmation',
  'suggest_repositioning',
  'continue_with_context',
  'continue',
]);

export type DuplicateGuardAction = z.infer<
  typeof DuplicateGuardActionSchema
>;

export const MatchedContentArtifactSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  topic: z.string().nullable(),
  angle: z.string().nullable(),
  status: z.string(),
  stage: z.string(),
  sourceType: z.string(),
  createdAt: z.string(),
  score: z.number().min(0).max(1),
  semanticScore: z.number().min(0).max(1).optional(),
  lexicalScore: z.number().min(0).max(1).optional(),
  reasons: z.array(OverlapReasonSchema),
});

export type MatchedContentArtifact = z.infer<
  typeof MatchedContentArtifactSchema
>;

export const ContentMemoryRetrievalSchema = z.object({
  mode: z.enum(['deterministic', 'hybrid']),
  semanticAvailable: z.boolean(),
  semanticCandidateCount: z.number().int().min(0),
  lexicalCandidateCount: z.number().int().min(0),
  classifierInvoked: z.boolean(),
  classifierModel: z.string().nullable(),
  classifierLatencyMs: z.number().int().min(0).nullable(),
});

export type ContentMemoryRetrieval = z.infer<
  typeof ContentMemoryRetrievalSchema
>;

export const ContentMemoryEnforcementSchema = z.object({
  mode: z.enum(['advisory', 'shadow', 'enforced']),
  reason: z.enum([
    'not_applicable',
    'feature_disabled',
    'outside_rollout',
    'below_confidence_threshold',
    'insufficient_labeled_samples',
    'precision_below_target',
    'calibration_unavailable',
    'calibrated_probable_duplicate',
    'explicit_override',
    'deterministic_block',
    'reservation_collision',
  ]),
  confidenceThreshold: z.number().min(0).max(1),
  minimumLabeledSamples: z.number().int().min(0),
  labeledSampleCount: z.number().int().min(0),
  measuredPrecision: z.number().min(0).max(1).nullable(),
  targetPrecision: z.number().min(0).max(1),
  rolloutPercent: z.number().int().min(0).max(100),
  overrideAllowed: z.boolean(),
});

export type ContentMemoryEnforcement = z.infer<
  typeof ContentMemoryEnforcementSchema
>;

export const DuplicateGuardResultSchema = z.object({
  requestId: z.uuid().optional(),
  verdict: OverlapVerdictSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(OverlapReasonSchema),
  matchedArtifacts: z.array(MatchedContentArtifactSchema),
  recommendedAction: DuplicateGuardActionSchema,
  sameElements: z.array(z.string()).optional(),
  differentElements: z.array(z.string()).optional(),
  alternativeAngles: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  retrieval: ContentMemoryRetrievalSchema.optional(),
  enforcement: ContentMemoryEnforcementSchema.optional(),
});

export type DuplicateGuardResult = z.infer<
  typeof DuplicateGuardResultSchema
>;
