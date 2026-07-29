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
  reasons: z.array(OverlapReasonSchema),
});

export type MatchedContentArtifact = z.infer<
  typeof MatchedContentArtifactSchema
>;

export const DuplicateGuardResultSchema = z.object({
  verdict: OverlapVerdictSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(OverlapReasonSchema),
  matchedArtifacts: z.array(MatchedContentArtifactSchema),
  recommendedAction: DuplicateGuardActionSchema,
});

export type DuplicateGuardResult = z.infer<
  typeof DuplicateGuardResultSchema
>;
