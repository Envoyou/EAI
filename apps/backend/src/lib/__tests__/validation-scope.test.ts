import { describe, expect, it } from 'vitest';
import type { FeedbackItem } from '@eai/shared';
import { assessDraftRevision } from '@/lib/draft-revision-impact';
import { createDraftChangeSet, createInitialDraftRevision } from '@/lib/draft-revision';
import { buildValidationScope } from '@/lib/validation-scope';

const original = [
  '## Program Results',
  'The program reached 42 participating organizations in 2026.',
  'Teams used the shared workflow to review evidence.',
  'Editors retained the final publication decision.',
].join('\n\n');

const systemForChange = (nextBody: string) => {
  const initial = createInitialDraftRevision({ body: original, origin: 'initial_analysis' });
  const assessment = assessDraftRevision({ previousDraft: original, nextDraft: nextBody });
  return createDraftChangeSet({
    previousBody: original,
    nextBody,
    origin: 'apply_feedback',
    assessment,
    system: initial,
  });
};

describe('validation scope', () => {
  it('routes a bounded factual change to targeted validation and resolves dependencies', () => {
    const changed = systemForChange(original.replace('42', '43'));
    const changedBlockId = changed.changeSet.changedBlocks[0]!.blockId;
    const feedback: FeedbackItem[] = [{
      feedbackId: 'feedback_1',
      ruleId: 'rule_1',
      claimId: 'claim_1',
      blockId: changedBlockId,
      sourceIds: ['source_1'],
      category: 'Source Fidelity',
      status: 'warning',
      message: 'Verify the participation count.',
      operation: 'manual',
    }];
    const scope = buildValidationScope({
      feedback,
      system: {
        ...changed,
        lastDraftChangeSet: changed.changeSet,
        editorialIdentities: {
          version: 1,
          sources: [],
          claims: [{
            claimId: 'claim_1',
            ruleId: 'rule_1',
            blockId: changedBlockId,
            targetHash: 'a'.repeat(64),
            sourceIds: ['source_1'],
            lastSeenRevisionId: changed.draftRevision.revisionId,
          }],
        },
      },
    });

    expect(scope).toMatchObject({
      validationMode: 'targeted',
      changedBlockIds: [changedBlockId],
      affectedClaimIds: ['claim_1'],
      affectedSourceIds: ['source_1'],
      affectedFeedbackIds: ['feedback_1'],
      affectedSeoFields: expect.arrayContaining(['excerpt', 'metaDescription']),
    });
  });

  it('uses light validation for a bounded structural edit', () => {
    const changed = systemForChange(original.replace('## Program Results', '## Verified Program Results'));
    const scope = buildValidationScope({
      feedback: [],
      system: { ...changed, lastDraftChangeSet: changed.changeSet },
    });

    expect(scope.validationMode).toBe('light');
    expect(scope.affectedSeoFields).toEqual(expect.arrayContaining([
      'excerpt',
      'metaDescription',
      'tags',
    ]));
  });

  it('escalates broad multi-block changes and missing lineage to the full gate', () => {
    const broadBody = original
      .split('\n\n')
      .map((block, index) => `${block} Updated section ${index}.`)
      .concat(['A new fifth block changes the article scope.'])
      .join('\n\n');
    const broad = systemForChange(broadBody);

    expect(buildValidationScope({
      feedback: [],
      system: { ...broad, lastDraftChangeSet: broad.changeSet },
    }).validationMode).toBe('full');
    expect(buildValidationScope({ feedback: [], system: {} })).toMatchObject({
      validationMode: 'full',
      reasons: ['missing_change_set'],
    });
  });

  it('skips AI validation for a formatting-only revision', () => {
    const changed = systemForChange(original.replace('42 participating', '42  participating'));
    expect(buildValidationScope({
      feedback: [],
      system: { ...changed, lastDraftChangeSet: changed.changeSet },
    }).validationMode).toBe('none');
  });
});
