export type Role = 'polish' | 'author' | 'editor' | 'seo' | 'fact-checker';
export type AnalyzeMode = 'analyze' | 'refine' | 'fix_targeted';
export type ResponseMode = 'standard' | 'compact' | 'manual_fallback';
export type VerificationStatus = 'source_backed' | 'needs_citation' | 'high_risk_factual_claim';
export type EditorialReadiness = 'ready' | 'needs_review' | 'blocked';
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
  exportStatus?: {
    blogPostId?: string;
    blogEditUrl?: string;
    lastExportedAt?: string;
    lastExportStatus?: 'success' | 'failed';
    lastExportError?: string;
  };
}

export interface FeedbackItem {
  category: string;
  status: 'pass' | 'warning' | 'fail';
  verificationStatus?: VerificationStatus;
  message: string;
  suggestion?: string;
  targetText?: string;
  replacementText?: string;
  reason?: string;
  operation?: 'replace' | 'insert_before' | 'insert_after' | 'manual';
  isAccepted?: boolean;
  isVerified?: boolean;
  verifiedSource?: string;
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
  generatedMetadata?: {
    title?: string;
    slug?: string;
    excerpt?: string;
    metaTitle?: string;
    metaDescription?: string;
    coverImageAltText?: string;
    tags?: string[];
  };
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

