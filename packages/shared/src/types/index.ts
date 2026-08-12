export type Role = 'polish' | 'author' | 'editor' | 'seo' | 'fact-checker';
export type AnalyzeMode =
  | 'analyze'
  | 'refine'
  | 'fix_targeted'
  | 'quality_gate'
  | 'validate_revision'
  | 'refresh_seo_fields'
  | 'generate_seo';
export type ResponseMode = 'standard' | 'compact' | 'manual_fallback';
export type VerificationStatus = 'source_backed' | 'needs_citation' | 'high_risk_factual_claim';
export type EditorialReadiness = 'ready' | 'needs_review' | 'blocked';
export type PublicationPackageStatus = 'not_generated' | 'current' | 'stale';
export type RevisionValidationState = 'valid' | 'validation_recommended' | 'stale';
export type SeoReviewState = 'valid' | 'possibly_stale' | 'stale';
export type IncrementalValidationMode = 'none' | 'light' | 'targeted' | 'full';
export type SeoField =
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'metaTitle'
  | 'metaDescription'
  | 'coverImageAltText'
  | 'tags';
export type SeoFieldReviewStatus = 'valid' | 'stale' | 'review_required';
export type SeoFieldReview = {
  status: SeoFieldReviewStatus;
  reason?: string;
  revisionId?: string;
};
export type SeoFieldStates = Partial<Record<SeoField, SeoFieldReview>>;
export interface ValidationScope {
  changedBlockIds: string[];
  affectedClaimIds: string[];
  affectedSourceIds: string[];
  affectedFeedbackIds: string[];
  affectedSeoFields: SeoField[];
  validationMode: IncrementalValidationMode;
  reasons: string[];
}
export interface DraftRevisionIdentity {
  revisionId: string;
  previousRevisionId?: string;
  bodyHash: string;
  createdAt: string;
}
export type FindingTarget =
  | 'body'
  | 'publication.title'
  | 'publication.slug'
  | 'publication.excerpt'
  | 'publication.metaTitle'
  | 'publication.metaDescription'
  | 'publication.coverImageAlt'
  | 'publication.tags';
export type ReviewPatchOperation = 'replace' | 'insert_before' | 'insert_after';
export type ReviewCapability =
  | {
      kind: 'mechanical_fix';
      autoApplicable: true;
      target: string;
      replacement: string;
      operation: ReviewPatchOperation;
      targetField: 'body';
    }
  | {
      kind: 'prepared_proposal';
      autoApplicable: true;
      target: string;
      replacement: string;
      operation: ReviewPatchOperation;
      targetField: FindingTarget;
    }
  | {
      kind: 'source_decision';
      autoApplicable: false;
      allowAddSource: true;
      allowKeep: boolean;
      allowEdit: true;
      target: string;
    }
  | {
      kind: 'manual_editorial_decision';
      autoApplicable: false;
      allowKeep: boolean;
      allowEdit: true;
      target: string;
    };
export type EditorialProcessStage =
  | 'reviewing'
  | 'rewriting'
  | 'quality_gate'
  | 'seo'
  | 'finalizing';

export interface ArticleMetadata {
  category?: string;
  type?: string;
  targetAudience?: string;
  targetLength?: string;
  brief?: string;
  strictness?: 'balanced' | 'strict';
  outputLanguage?: 'follow_draft' | 'id' | 'en';
  sourceRef?: string;
  workingTitle?: string;
  researchNotes?: ResearchNote[];
  attachments?: Attachment[];
  publicationPackageStatus?: PublicationPackageStatus;
  exportStatus?: {
    blogPostId?: string;
    blogEditUrl?: string;
    lastExportedAt?: string;
    lastExportStatus?: 'success' | 'failed';
    lastExportError?: string;
  };
}

export interface FeedbackItem {
  /** Backend-issued identity for this finding. Never use client-supplied values as authority. */
  feedbackId?: string;
  /** Stable deterministic identity for the validator rule that produced the finding. */
  ruleId?: string;
  /** Identity of the factual/source-sensitive claim associated with this finding. */
  claimId?: string;
  /** Stable identity of the draft block targeted by this finding. */
  blockId?: string;
  /** Canonical backend-issued identities for sources linked to the claim. */
  sourceIds?: string[];
  category: string;
  status: 'pass' | 'warning' | 'fail';
  verificationStatus?: VerificationStatus;
  message: string;
  suggestion?: string;
  targetText?: string;
  replacementText?: string;
  reason?: string;
  operation?: 'replace' | 'insert_before' | 'insert_after' | 'manual';
  targetField?: FindingTarget;
  isApplied?: boolean;
  isAccepted?: boolean;
  isVerified?: boolean;
  verifiedSource?: string;
}

/** CMS-ready publication fields. The article body is stored separately and must not contain H1. */
export interface PublicationPackage {
  title?: string;
  slug?: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  coverImageAltText?: string;
  tags?: string[];
}

export type FeedbackOperation = NonNullable<FeedbackItem['operation']>;

export interface AnalysisResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  readiness?: EditorialReadiness;
  changes?: string[];
  score?: number;
  verdict?: 'approve' | 'revise' | 'reject' | EditorialReadiness;
  summary?: string;
  polishedDraft?: string;
  feedback?: FeedbackItem[];
  flags?: string[];
  errorMessage?: string;
  promptVersion?: string;
  responseMode?: ResponseMode;
  analysisLogId?: string;
  workingTitle?: string;
  publicationPackageStatus?: PublicationPackageStatus;
  qualityGateState?: RevisionValidationState;
  seoReviewState?: SeoReviewState;
  seoFieldStates?: SeoFieldStates;
  draftRevision?: DraftRevisionIdentity;
  /** @deprecated Prefer the PublicationPackage domain name. Kept for stored-data compatibility. */
  generatedMetadata?: PublicationPackage;
  sourceRef?: string;
  exportStatus?: {
    blogPostId?: string;
    blogEditUrl?: string;
    lastExportedAt?: string;
    lastExportStatus?: 'success' | 'failed';
    lastExportError?: string;
  };
  editorStatus?: string;
}

export interface AllowedEditorialTerm {
  value: string;
  type: 'abbreviation' | 'framework' | 'duration' | 'brand_term';
  scope?: 'global' | 'category';
  categories?: string[];
}

export interface ResearchNote {
  id: string;
  content: string;
  sources: { url: string; domain: string }[];
  savedAt: string; // ISO timestamp
}

export interface Attachment {
  id: string;
  filename: string;
  r2Key: string;
  publicUrl: string;
  contentType: string;
  extractedText: string;
  uploadedAt: string; // ISO timestamp
}
