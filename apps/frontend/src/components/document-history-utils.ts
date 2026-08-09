import type { ArticleWorkflowSnapshot } from '@eai/shared';
import { destinationForWorkflow } from '@eai/shared';

export interface HistoryItem {
  id: string;
  createdAt: string;
  updatedAt?: string;
  role: string;
  verdict?: string;
  summary?: string;
  isPinned: boolean;
  workflow?: ArticleWorkflowSnapshot;
  feedback?: Array<{
    status?: string;
    isApplied?: boolean;
    isAccepted?: boolean;
    isVerified?: boolean;
  }> | null;
  metadata?: {
    sourceRef?: string;
    title?: string;
    workingTitle?: string;
    type?: string;
    category?: string;
    generatedMetadata?: {
      title?: string;
    };
    researchNotes?: unknown[];
    attachments?: unknown[];
    exportStatus?: {
      lastExportStatus?: 'success' | 'failed';
      lastExportedAt?: string;
    };
    _system?: {
      polishedDraft?: string;
      workingTitle?: string;
    };
  };
}

export type HistoryStage = 'draft' | 'review' | 'ready' | 'blocked';

export type HistoryItemPresentation = {
  title: string;
  stage: HistoryStage;
  hasFinalDraft: boolean;
  hasPublicationMetadata: boolean;
  noteCount: number;
  attachmentCount: number;
  wordCount: number;
  wasExported: boolean;
  unresolvedFindingCount: number;
  blockingFindingCount: number;
  hasFindingSnapshot: boolean;
  workflow: ArticleWorkflowSnapshot;
};

const isUnresolvedFinding = (item: NonNullable<HistoryItem['feedback']>[number]) =>
  item.status !== 'pass'
  && !item.isApplied
  && !item.isAccepted
  && !item.isVerified;

export const getArticleFamilyKey = (item: HistoryItem) =>
  item.metadata?.sourceRef?.trim() || item.id;

export const getHistoryItemUpdatedAt = (item: HistoryItem) =>
  item.updatedAt?.trim() || item.createdAt;

export const getCurrentArticleHistoryItems = (items: HistoryItem[]) => {
  const currentByFamily = new Map<string, HistoryItem>();
  for (const item of items) {
    const familyKey = getArticleFamilyKey(item);
    const current = currentByFamily.get(familyKey);
    if (
      !current
      || new Date(getHistoryItemUpdatedAt(item)).getTime()
        > new Date(getHistoryItemUpdatedAt(current)).getTime()
    ) {
      currentByFamily.set(familyKey, item);
    }
  }
  return [...currentByFamily.values()].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    return new Date(getHistoryItemUpdatedAt(right)).getTime()
      - new Date(getHistoryItemUpdatedAt(left)).getTime();
  });
};

const resolveStage = (
  verdict: string | undefined,
  unresolvedFeedback: NonNullable<HistoryItem['feedback']>
): HistoryStage => {
  if (unresolvedFeedback.length > 0) {
    if (
      verdict === 'blocked'
      || verdict === 'reject'
      || unresolvedFeedback.some(feedback => feedback.status === 'fail')
    ) return 'blocked';
    return 'review';
  }
  if (verdict === 'ready' || verdict === 'approve') return 'ready';
  if (verdict === 'blocked' || verdict === 'reject') return 'blocked';
  if (verdict === 'needs_review' || verdict === 'revise') return 'review';
  return 'draft';
};

export const getHistoryItemPresentation = (
  item: HistoryItem,
  fallbackTitle = 'Untitled article'
): HistoryItemPresentation => {
  const metadata = item.metadata;
  const polishedDraft = metadata?._system?.polishedDraft?.trim() ?? '';
  const unresolvedFeedback = Array.isArray(item.feedback)
    ? item.feedback.filter(isUnresolvedFinding)
    : [];
  const fallbackTaxonomy = [metadata?.type, metadata?.category]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  const fallbackStage = resolveStage(item.verdict, unresolvedFeedback);
  const workflow = item.workflow ?? {
    sourceRef: getArticleFamilyKey(item),
    currentAnalysisLogId: item.id,
    stage: fallbackStage === 'draft'
      ? 'drafting'
      : fallbackStage === 'ready'
        ? 'ready'
        : 'review_required',
    qualityState: fallbackStage === 'ready'
      ? 'passed'
      : fallbackStage === 'draft'
        ? 'unchecked'
        : 'needs_attention',
    saveState: 'saved',
    publicationState: metadata?.exportStatus?.lastExportStatus === 'success'
      ? 'exported'
      : metadata?.generatedMetadata
        ? 'ready'
        : 'not_started',
    unresolvedDecisionCount: unresolvedFeedback.length,
    blockingDecisionCount: unresolvedFeedback.filter(feedback => feedback.status === 'fail').length,
    nextAction: fallbackStage === 'draft'
      ? 'continue_writing'
      : fallbackStage === 'ready'
        ? 'prepare_publication'
        : 'resolve_decisions',
    destination: fallbackStage === 'draft'
      ? 'editor'
      : fallbackStage === 'ready'
        ? 'publication'
        : 'review',
  } satisfies ArticleWorkflowSnapshot;

  return {
    title:
      metadata?.title?.trim()
      || metadata?.generatedMetadata?.title?.trim()
      || metadata?.workingTitle?.trim()
      || metadata?._system?.workingTitle?.trim()
      || fallbackTaxonomy
      || fallbackTitle,
    stage: workflow.stage === 'drafting' || workflow.stage === 'refining'
      ? 'draft'
      : workflow.stage === 'review_required'
        ? workflow.blockingDecisionCount > 0 ? 'blocked' : 'review'
        : 'ready',
    hasFinalDraft: Boolean(polishedDraft),
    hasPublicationMetadata: Boolean(metadata?.generatedMetadata),
    noteCount: Array.isArray(metadata?.researchNotes) ? metadata.researchNotes.length : 0,
    attachmentCount: Array.isArray(metadata?.attachments) ? metadata.attachments.length : 0,
    wordCount: polishedDraft ? polishedDraft.split(/\s+/u).length : 0,
    wasExported: metadata?.exportStatus?.lastExportStatus === 'success',
    unresolvedFindingCount: unresolvedFeedback.length,
    blockingFindingCount: unresolvedFeedback.filter(feedback => feedback.status === 'fail').length,
    hasFindingSnapshot: Object.prototype.hasOwnProperty.call(item, 'feedback'),
    workflow,
  };
};

export const destinationForArticleWorkflow = (
  presentation: Pick<HistoryItemPresentation, 'workflow'>
) => destinationForWorkflow(presentation.workflow);
