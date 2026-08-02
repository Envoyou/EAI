export interface HistoryItem {
  id: string;
  createdAt: string;
  role: string;
  verdict?: string;
  summary?: string;
  isPinned: boolean;
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
};

const isUnresolvedFinding = (item: NonNullable<HistoryItem['feedback']>[number]) =>
  item.status !== 'pass'
  && !item.isApplied
  && !item.isAccepted
  && !item.isVerified;

export const getArticleFamilyKey = (item: HistoryItem) =>
  item.metadata?.sourceRef?.trim() || item.id;

export const getCurrentArticleHistoryItems = (items: HistoryItem[]) => {
  const currentByFamily = new Map<string, HistoryItem>();
  for (const item of items) {
    const familyKey = getArticleFamilyKey(item);
    const current = currentByFamily.get(familyKey);
    if (!current || new Date(item.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      currentByFamily.set(familyKey, item);
    }
  }
  return [...currentByFamily.values()].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
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

  return {
    title:
      metadata?.title?.trim()
      || metadata?.generatedMetadata?.title?.trim()
      || metadata?.workingTitle?.trim()
      || metadata?._system?.workingTitle?.trim()
      || fallbackTaxonomy
      || fallbackTitle,
    stage: resolveStage(item.verdict, unresolvedFeedback),
    hasFinalDraft: Boolean(polishedDraft),
    hasPublicationMetadata: Boolean(metadata?.generatedMetadata),
    noteCount: Array.isArray(metadata?.researchNotes) ? metadata.researchNotes.length : 0,
    attachmentCount: Array.isArray(metadata?.attachments) ? metadata.attachments.length : 0,
    wordCount: polishedDraft ? polishedDraft.split(/\s+/u).length : 0,
    wasExported: metadata?.exportStatus?.lastExportStatus === 'success',
    unresolvedFindingCount: unresolvedFeedback.length,
    blockingFindingCount: unresolvedFeedback.filter(feedback => feedback.status === 'fail').length,
    hasFindingSnapshot: Object.prototype.hasOwnProperty.call(item, 'feedback'),
  };
};
