import type {
  PublicationPackageStatus,
  RevisionValidationState,
  SeoFieldStates,
  SeoReviewState,
} from '@eai/shared';
import { getProtectedSeoReviewFields } from './seo-field-state';

export type PublicationUxState =
  | 'checking'
  | 'content_decision_required'
  | 'metadata_decision_required'
  | 'metadata_attention_required'
  | 'changes_checked'
  | 'quiet';

export const derivePublicationUxState = ({
  isChecking,
  qualityGateState,
  seoReviewState,
  publicationPackageStatus,
  seoFieldStates,
}: {
  isChecking: boolean;
  qualityGateState?: RevisionValidationState;
  seoReviewState?: SeoReviewState;
  publicationPackageStatus?: PublicationPackageStatus;
  seoFieldStates?: SeoFieldStates;
}): PublicationUxState => {
  if (isChecking) return 'checking';
  if (qualityGateState === 'stale') return 'content_decision_required';
  if (
    getProtectedSeoReviewFields(seoFieldStates).length > 0
    || (seoReviewState === 'possibly_stale' && publicationPackageStatus === 'current')
  ) return 'metadata_decision_required';
  if (publicationPackageStatus === 'stale') return 'metadata_attention_required';
  if (qualityGateState === 'validation_recommended') return 'changes_checked';
  return 'quiet';
};
