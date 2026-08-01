import type { FeedbackItem, SeoField, ValidationScope } from '@eai/shared';
import { z } from 'zod';
import { DraftChangeSetSchema, type DraftChangeSet } from '@/lib/draft-revision';
import { EditorialIdentityStateSchema } from '@/lib/editorial-identity';

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const IdentityArraySchema = z.array(z.string().min(1).max(100)).max(500);

export const ValidationScopeSchema = z.object({
  changedBlockIds: IdentityArraySchema,
  affectedClaimIds: IdentityArraySchema,
  affectedSourceIds: IdentityArraySchema,
  affectedFeedbackIds: IdentityArraySchema,
  affectedSeoFields: z.array(z.enum([
    'title',
    'slug',
    'excerpt',
    'metaTitle',
    'metaDescription',
    'coverImageAltText',
    'tags',
  ])).max(7),
  validationMode: z.enum(['none', 'light', 'targeted', 'full']),
  reasons: z.array(z.string().min(1).max(100)).max(30),
});

export const StoredValidationResultSchema = z.object({
  revisionId: z.string().min(1).max(100),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  validationLevel: z.enum(['none', 'light', 'targeted', 'full']),
  status: z.enum(['passed', 'needs_review', 'blocked']),
  checkedAt: z.string().datetime(),
  scope: ValidationScopeSchema,
  automatedRounds: z.number().int().min(1).max(2),
});

export const readLastDraftChangeSet = (
  system: Record<string, unknown>
): DraftChangeSet | null => {
  const parsed = DraftChangeSetSchema.safeParse(system.lastDraftChangeSet);
  return parsed.success ? parsed.data : null;
};

const deriveSeoFields = (changeSet: DraftChangeSet): SeoField[] => {
  const fields: SeoField[] = [];
  const { signals } = changeSet;
  if (signals.numbersChanged || signals.entitiesChanged || signals.sensitiveTermsChanged) {
    fields.push('excerpt', 'metaDescription');
  }
  if (signals.headingsChanged || signals.structureChanged) {
    fields.push('excerpt', 'metaDescription', 'tags');
  }
  if (signals.topicShiftDetected) {
    fields.push('title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'coverImageAltText', 'tags');
  }
  return unique(fields);
};

export const buildValidationScope = ({
  system,
  feedback,
}: {
  system: Record<string, unknown>;
  feedback: FeedbackItem[];
}): ValidationScope => {
  const changeSet = readLastDraftChangeSet(system);
  if (!changeSet) {
    return {
      changedBlockIds: [],
      affectedClaimIds: [],
      affectedSourceIds: [],
      affectedFeedbackIds: [],
      affectedSeoFields: [],
      validationMode: 'full',
      reasons: ['missing_change_set'],
    };
  }

  const changedBlockIds = unique(changeSet.changedBlocks.map((block) => block.blockId));
  const identities = EditorialIdentityStateSchema.safeParse(system.editorialIdentities);
  const claims = identities.success
    ? identities.data.claims.filter((claim) => claim.blockId && changedBlockIds.includes(claim.blockId))
    : [];
  const affectedClaimIds = claims.map((claim) => claim.claimId);
  const affectedSourceIds = unique(claims.flatMap((claim) => claim.sourceIds));
  const affectedFeedbackIds = feedback
    .filter((item) => Boolean(
      (item.blockId && changedBlockIds.includes(item.blockId))
      || (item.claimId && affectedClaimIds.includes(item.claimId))
    ))
    .flatMap((item) => item.feedbackId ? [item.feedbackId] : []);
  const broadChange = changedBlockIds.length > 4
    || changeSet.changedBlocks.filter((block) => block.changeType === 'delete').length > 2
    || changeSet.reasons.includes('missing_comparison_draft')
    || changeSet.reasons.includes('claim_scope_changed')
    || changeSet.signals.topicShiftDetected;
  const validationMode = broadChange
    ? 'full'
    : changeSet.validationLevel === 'full'
      ? 'targeted'
      : changeSet.validationLevel === 'light'
        ? 'light'
        : 'none';

  return {
    changedBlockIds,
    affectedClaimIds,
    affectedSourceIds,
    affectedFeedbackIds,
    affectedSeoFields: deriveSeoFields(changeSet),
    validationMode,
    reasons: unique([
      ...changeSet.reasons,
      ...(validationMode === 'targeted' ? ['bounded_high_risk_change'] : []),
    ]),
  };
};
