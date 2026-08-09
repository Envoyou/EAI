import type {
  EditorialReadiness,
  FeedbackItem,
  PublicationPackageStatus,
  RevisionValidationState,
  SeoFieldStates,
  SeoReviewState,
} from './types/index';

export type ArticleWorkflowStage =
  | 'drafting'
  | 'refining'
  | 'review_required'
  | 'ready'
  | 'preparing_publication'
  | 'exported';

export type ArticleQualityState =
  | 'unchecked'
  | 'checking'
  | 'needs_attention'
  | 'passed'
  | 'stale';

export type ArticleSaveState =
  | 'local_only'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'conflict';

export type ArticlePublicationState =
  | 'not_started'
  | 'metadata_required'
  | 'ready'
  | 'exporting'
  | 'exported'
  | 'failed';

export type ArticleNextAction =
  | 'continue_writing'
  | 'wait_for_refinement'
  | 'resolve_decisions'
  | 'prepare_publication'
  | 'complete_metadata'
  | 'export_to_cms'
  | 'open_cms_draft';

export type ArticleWorkflowDestination = 'editor' | 'review' | 'publication';

export interface ArticleWorkflowSnapshot {
  sourceRef: string;
  currentRevisionId?: string;
  currentAnalysisLogId: string;
  stage: ArticleWorkflowStage;
  qualityState: ArticleQualityState;
  saveState: ArticleSaveState;
  publicationState: ArticlePublicationState;
  unresolvedDecisionCount: number;
  blockingDecisionCount: number;
  nextAction: ArticleNextAction;
  destination: ArticleWorkflowDestination;
  blockedReason?: 'editorial_decisions' | 'quality_stale' | 'metadata_incomplete';
}

export interface ArticleWorkflowInput {
  sourceRef?: string | null;
  analysisLogId: string;
  revisionId?: string;
  hasDraft: boolean;
  isProcessing?: boolean;
  readiness?: EditorialReadiness | null;
  feedback?: FeedbackItem[] | null;
  publicationPackageStatus?: PublicationPackageStatus | null;
  qualityGateState?: RevisionValidationState | null;
  seoReviewState?: SeoReviewState | null;
  seoFieldStates?: SeoFieldStates | null;
  exportStatus?: {
    lastExportStatus?: 'success' | 'failed';
  } | null;
  saveState?: ArticleSaveState;
}

export const isUnresolvedWorkflowFeedback = (item: FeedbackItem) =>
  item.status !== 'pass'
  && !item.isApplied
  && !item.isAccepted
  && !item.isVerified;

const hasIncompleteSeoFields = (states?: SeoFieldStates | null) =>
  Object.values(states ?? {}).some(
    state => state?.status === 'stale' || state?.status === 'review_required'
  );

export function deriveArticleWorkflowSnapshot(
  input: ArticleWorkflowInput
): ArticleWorkflowSnapshot {
  const unresolved = (input.feedback ?? []).filter(isUnresolvedWorkflowFeedback);
  const blockingDecisionCount = unresolved.filter(item => item.status === 'fail').length;
  const exported = input.exportStatus?.lastExportStatus === 'success';
  const exportFailed = input.exportStatus?.lastExportStatus === 'failed';
  const packageStatus = input.publicationPackageStatus ?? 'not_generated';
  const metadataIncomplete = packageStatus !== 'current'
    || input.seoReviewState === 'stale'
    || hasIncompleteSeoFields(input.seoFieldStates);
  const qualityStale = input.qualityGateState === 'stale';

  let stage: ArticleWorkflowStage;
  let nextAction: ArticleNextAction;
  let destination: ArticleWorkflowDestination;
  let blockedReason: ArticleWorkflowSnapshot['blockedReason'];

  if (input.isProcessing) {
    stage = 'refining';
    nextAction = 'wait_for_refinement';
    destination = 'editor';
  } else if (unresolved.length > 0 || input.readiness === 'needs_review' || input.readiness === 'blocked') {
    stage = 'review_required';
    nextAction = 'resolve_decisions';
    destination = 'review';
    blockedReason = 'editorial_decisions';
  } else if (exported) {
    stage = 'exported';
    nextAction = 'open_cms_draft';
    destination = 'publication';
  } else if (input.readiness === 'ready') {
    if (packageStatus === 'not_generated') {
      stage = 'ready';
      nextAction = 'prepare_publication';
      destination = 'publication';
    } else {
      stage = 'preparing_publication';
      destination = 'publication';
      if (metadataIncomplete || qualityStale) {
        nextAction = 'complete_metadata';
        blockedReason = qualityStale ? 'quality_stale' : 'metadata_incomplete';
      } else {
        nextAction = 'export_to_cms';
      }
    }
  } else {
    stage = 'drafting';
    nextAction = 'continue_writing';
    destination = 'editor';
  }

  const qualityState: ArticleQualityState = input.isProcessing
    ? 'checking'
    : qualityStale
      ? 'stale'
      : unresolved.length > 0 || input.qualityGateState === 'validation_recommended'
        ? 'needs_attention'
        : input.readiness === 'ready'
          ? 'passed'
          : 'unchecked';

  const publicationState: ArticlePublicationState = exported
    ? 'exported'
    : exportFailed
      ? 'failed'
      : packageStatus === 'current' && !metadataIncomplete && !qualityStale
        ? 'ready'
        : packageStatus === 'not_generated'
          ? 'not_started'
          : 'metadata_required';

  return {
    sourceRef: input.sourceRef?.trim() || input.analysisLogId,
    currentRevisionId: input.revisionId,
    currentAnalysisLogId: input.analysisLogId,
    stage,
    qualityState,
    saveState: input.saveState ?? 'saved',
    publicationState,
    unresolvedDecisionCount: unresolved.length,
    blockingDecisionCount,
    nextAction,
    destination,
    blockedReason,
  };
}

export const destinationForWorkflow = (
  snapshot: Pick<ArticleWorkflowSnapshot, 'destination' | 'currentAnalysisLogId'>
) => `/${snapshot.destination}?history=${encodeURIComponent(snapshot.currentAnalysisLogId)}`;
