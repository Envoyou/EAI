import type {
  EditorialReadiness,
  FeedbackItem,
  FindingTarget,
  PublicationPackage,
} from '@eai/shared';

export type PublicationMetadataFindingTarget = Exclude<
  FindingTarget,
  'body' | 'publication.tags'
>;

const publicationFieldMap: Record<
  PublicationMetadataFindingTarget,
  Exclude<keyof PublicationPackage, 'tags'>
> = {
  'publication.title': 'title',
  'publication.slug': 'slug',
  'publication.excerpt': 'excerpt',
  'publication.metaTitle': 'metaTitle',
  'publication.metaDescription': 'metaDescription',
  'publication.coverImageAlt': 'coverImageAltText',
};

type ApplyPublicationMetadataFindingInput = {
  feedback: FeedbackItem[];
  publicationPackage: PublicationPackage;
  feedbackId?: string;
  targetField: PublicationMetadataFindingTarget;
  targetText: string;
  replacementText: string;
  previousReadiness?: EditorialReadiness;
};

export class PublicationMetadataFindingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationMetadataFindingConflictError';
  }
}

export const applyPublicationMetadataFinding = ({
  feedback,
  publicationPackage,
  feedbackId,
  targetField,
  targetText,
  replacementText,
  previousReadiness,
}: ApplyPublicationMetadataFindingInput): {
  feedback: FeedbackItem[];
  publicationPackage: PublicationPackage;
  readiness: EditorialReadiness;
} => {
  const packageField = publicationFieldMap[targetField];
  const candidates = feedback
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      item.targetField === targetField
      && item.targetText === targetText
      && (!feedbackId || item.feedbackId === feedbackId)
    );

  if (candidates.length !== 1) {
    throw new PublicationMetadataFindingConflictError(
      'The publication finding changed or is no longer current.'
    );
  }

  const [{ item, index }] = candidates;
  if (
    item.status === 'pass'
    || item.isApplied
    || item.isAccepted
    || item.isVerified
  ) {
    throw new PublicationMetadataFindingConflictError(
      'The publication finding has already been resolved.'
    );
  }

  if (
    typeof publicationPackage[packageField] !== 'string'
    || publicationPackage[packageField] !== targetText
    || replacementText === targetText
  ) {
    throw new PublicationMetadataFindingConflictError(
      'The publication field changed or this suggestion is no longer current.'
    );
  }

  const nextFeedback = feedback.map((feedbackItem, feedbackIndex) =>
    feedbackIndex === index
      ? {
          ...feedbackItem,
          isApplied: true,
          isAccepted: false,
          isVerified: false,
        }
      : feedbackItem
  );
  const unresolved = nextFeedback.filter((feedbackItem) =>
    feedbackItem.status !== 'pass'
    && !feedbackItem.isApplied
    && !feedbackItem.isAccepted
    && !feedbackItem.isVerified
  );
  const readiness: EditorialReadiness = unresolved.length === 0
    ? 'ready'
    : previousReadiness === 'blocked'
      && unresolved.some((feedbackItem) => feedbackItem.status === 'fail')
      ? 'blocked'
      : 'needs_review';

  return {
    feedback: nextFeedback,
    publicationPackage: {
      ...publicationPackage,
      [packageField]: replacementText,
    },
    readiness,
  };
};
