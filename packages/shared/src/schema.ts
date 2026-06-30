import { z } from 'zod';
import type { Role } from './types';

export const FEEDBACK_OUTPUT_PROMPT_SCHEMA = `
{
  "score": number (integer 0-100),
  "verdict": "approve" | "revise" | "reject",
  "summary": string (1-2 kalimat, max 280 karakter),
  "feedback": Array<{
    "category": string,
    "status": "pass" | "warning" | "fail",
    "verificationStatus"?: "source_backed" | "needs_citation" | "high_risk_factual_claim",
    "message": string,
    "suggestion"?: string,
    "operation": "replace" | "insert_before" | "insert_after" | "manual",
    "targetText"?: string,
    "replacementText"?: string,
    "reason"?: string
  }>,
  "flags": Array<string>
}
`;

export const POLISH_DIAGNOSIS_OUTPUT_PROMPT_SCHEMA = `
{
  "summary": string (1-2 kalimat netral tentang arah transformasi, max 280 karakter),
  "feedback": Array<{
    "category": string,
    "status": "warning" | "fail",
    "verificationStatus"?: "source_backed" | "needs_citation" | "high_risk_factual_claim",
    "message": string,
    "suggestion"?: string,
    "operation": "replace" | "insert_before" | "insert_after" | "manual",
    "targetText"?: string,
    "replacementText"?: string,
    "reason"?: string
  }>,
  "flags": Array<string>
}
`;

export const SEO_METADATA_OUTPUT_PROMPT_SCHEMA = `
{
  "title": string,
  "slug": string,
  "excerpt": string,
  "metaTitle": string,
  "metaDescription": string,
  "coverImageAltText": string,
  "tags": Array<string>
}
`;

export const FeedbackItemSchema = z.object({
  category: z.string().min(1).describe('Short editorial issue category, for example Source Verification, Source Fidelity, Structure, Tone, SEO, or CMS Formatting.'),
  status: z.enum(['pass', 'warning', 'fail']).describe('Severity of the finding. Use warning for editor decisions and fail for blockers or high-risk issues.'),
  verificationStatus: z.enum(['source_backed', 'needs_citation', 'high_risk_factual_claim'])
    .describe('Source verification state for factual claims. Use only when the feedback concerns citation, provenance, source fidelity, or high-risk facts.')
    .optional(),
  message: z.string().min(1).describe('Concise explanation of the specific issue found in the draft.'),
  suggestion: z.string().describe('Concrete next action an editor can take to resolve or review the issue.').optional(),
  targetText: z.string().describe('Exact text from the draft final that the issue refers to. Keep it short, unique, and copyable when possible.').optional(),
  replacementText: z.string().describe('Replacement or insertion text for automatic operations. Do not use this to alter sensitive factual claims without source support.').optional(),
  reason: z.string().describe('Why this issue matters editorially, factually, or technically.').optional(),
  operation: z.enum(['replace', 'insert_before', 'insert_after', 'manual'])
    .describe('How the UI may apply this feedback. Use manual for factual/source risks or broad editorial judgment.')
    .default('manual'),
});

export const SeoMetadataSchema = z.object({
  title: z.string().min(10).max(120).describe('Editorial article title suitable for the tenant brand and topic.'),
  slug: z.string().min(3).max(120).describe('URL-friendly lowercase slug using hyphens and no unsafe characters.'),
  excerpt: z.string().max(300).describe('Short reader-facing excerpt or dek that summarizes the article angle.').optional(),
  metaTitle: z.string().max(80).describe('Search result title optimized for SEO and click clarity.').optional(),
  metaDescription: z.string().min(50).max(160).describe('SEO meta description that accurately reflects the article without unsupported claims.'),
  coverImageAltText: z.string().max(120).describe('Accessible alt text for the article cover image.').optional(),
  tags: z.array(z.string().min(2).max(40)).min(3).max(5).describe('Relevant taxonomy tags for CMS/search discovery.'),
});

export const FeedbackOutputSchema = z.object({
  score: z.number().int().min(0).max(100).describe('Integer editorial quality score for non-polish review roles.'),
  verdict: z.enum(['approve', 'revise', 'reject']).describe('Editorial decision for the draft based on the selected role.'),
  summary: z.string().max(280).describe('One to two sentence summary of the review result.'),
  polishedDraft: z.string().max(25000).optional(),
  feedback: z.array(FeedbackItemSchema).max(6).describe('Actionable feedback items only. Avoid praise-only or duplicate items.'),
  flags: z.array(z.string()).describe('Short machine-readable risk flags.').optional().default([]),
  generatedMetadata: SeoMetadataSchema.partial().optional(),
});

export type FeedbackOutput = z.infer<typeof FeedbackOutputSchema>;

export const FeedbackReviewResponseSchema = FeedbackOutputSchema.omit({
  generatedMetadata: true,
  polishedDraft: true,
});

const QualityResponseFeedbackItemSchema = FeedbackItemSchema.extend({
  status: z.enum(['warning', 'fail']),
});

export const PolishDiagnosisResponseSchema = z.object({
  summary: z.string().max(280).describe('Neutral transformation direction for rewriting the raw draft.'),
  feedback: z.array(QualityResponseFeedbackItemSchema).max(3).describe('Top rewrite priorities or factual protections for the polishing stage.'),
  flags: z.array(z.string()).max(3).describe('Short risk flags for rewrite planning.').optional().default([]),
});

export const PolishDiagnosisSchema = PolishDiagnosisResponseSchema.extend({
  polishedDraft: z.string().max(25000).optional(),
  generatedMetadata: SeoMetadataSchema.partial().optional(),
});

export type PolishDiagnosisOutput = z.infer<typeof PolishDiagnosisSchema>;

export const FinalQualityGateSchema = z.object({
  readiness: z.enum(['ready', 'needs_review', 'blocked']).describe('Final publication readiness after evaluating the polished draft.'),
  summary: z.string().max(280).describe('One to two sentence readiness summary focused on the final draft.'),
  changes: z.array(z.string().min(1).max(180)).min(1).max(5).describe('Important improvements made from source draft to final draft.'),
  feedback: z.array(FeedbackItemSchema).max(5).describe('Remaining actionable warning/fail checks on the final draft only.'),
  flags: z.array(z.string()).max(3).describe('Short remaining risk flags for the final draft.').optional().default([]),
});

export type FinalQualityGateOutput = z.infer<typeof FinalQualityGateSchema>;

export const FinalQualityGateResponseSchema = FinalQualityGateSchema.extend({
  changes: z.array(z.string().min(1).max(180)).min(2).max(5).describe('Two to five concrete improvements made from source draft to final draft.'),
  feedback: z.array(QualityResponseFeedbackItemSchema).max(5).describe('Remaining actionable warning/fail checks on the final draft only. Do not include pass items or duplicates.'),
});

const truncateSchemaText = (value: string, maxLength: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const suffix = '...';
  const hardLimit = maxLength - suffix.length;
  const clipped = normalized.slice(0, hardLimit).replace(/\s+\S*$/, '').trim();
  return `${clipped || normalized.slice(0, hardLimit).trim()}${suffix}`;
};

export const normalizeFinalQualityGateResponseCandidate = (candidate: unknown) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
  const nextCandidate = candidate as Record<string, unknown>;
  return {
    ...nextCandidate,
    summary: typeof nextCandidate.summary === 'string'
      ? truncateSchemaText(nextCandidate.summary, 280)
      : nextCandidate.summary,
    changes: Array.isArray(nextCandidate.changes)
      ? nextCandidate.changes.map((change) =>
          typeof change === 'string' ? truncateSchemaText(change, 180) : change
        )
      : nextCandidate.changes,
  };
};

export type SeoMetadataOutput = z.infer<typeof SeoMetadataSchema>;

export const PolishedDraftSchema = z.object({
  polishedDraft: z.string().min(200).max(25000),
});

export type PolishedDraftOutput = z.infer<typeof PolishedDraftSchema>;

const toGeminiJsonSchema = (schema: z.ZodType) => {
  const unsupportedKeywords = new Set([
    '$schema',
    '$defs',
    'additionalProperties',
    'default',
    'definitions',
    'format',
    'maximum',
    'maxItems',
    'maxLength',
    'minimum',
    'minItems',
    'minLength',
    'pattern',
  ]);
  const sanitize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !unsupportedKeywords.has(key))
        .map(([key, entry]) => [key, sanitize(entry)])
    );
  };

  return sanitize(z.toJSONSchema(schema)) as Record<string, unknown>;
};

export const FeedbackResponseJsonSchema = toGeminiJsonSchema(FeedbackReviewResponseSchema);
export const PolishDiagnosisResponseJsonSchema = toGeminiJsonSchema(PolishDiagnosisResponseSchema);
export const FinalQualityGateResponseJsonSchema = toGeminiJsonSchema(FinalQualityGateResponseSchema);
export const SeoMetadataResponseJsonSchema = toGeminiJsonSchema(SeoMetadataSchema);

export const getFeedbackResponseJsonSchema = (role: Role) => {
  if (role === 'polish') {
    return structuredClone(PolishDiagnosisResponseJsonSchema);
  }

  const schema = structuredClone(FeedbackResponseJsonSchema);
  if (role === 'author' || role === 'seo') {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    properties.verdict.enum = ['approve', 'revise'];
  }
  return schema;
};

export const ResearchNoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  sources: z.array(
    z.object({
      url: z.string(),
      domain: z.string(),
    })
  ),
  savedAt: z.string(),
});

export const ResearchNotesArraySchema = z.array(ResearchNoteSchema);

export const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  r2Key: z.string(),
  publicUrl: z.string(),
  contentType: z.string(),
  extractedText: z.string(),
  uploadedAt: z.string(),
});

export const AttachmentsArraySchema = z.array(AttachmentSchema);

