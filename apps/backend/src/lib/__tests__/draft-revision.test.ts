import { describe, expect, it } from 'vitest';
import { assessDraftRevision } from '@/lib/draft-revision-impact';
import {
  assertDraftRevisionMatches,
  computeDraftBodyHash,
  createDraftChangeSet,
  createInitialDraftRevision,
  DraftRevisionMismatchError,
} from '@/lib/draft-revision';

const original = [
  '## Overview',
  'The editorial workflow keeps each revision attributable.',
  'A supported claim remains connected to its source.',
].join('\n\n');

describe('draft revision identity', () => {
  it('creates an exact body hash and stable initial block identities', () => {
    const state = createInitialDraftRevision({
      body: original,
      origin: 'initial_analysis',
    });

    expect(state.draftRevision.bodyHash).toBe(computeDraftBodyHash(original));
    expect(state.contentBlocks).toHaveLength(3);
    expect(new Set(state.contentBlocks.map((block) => block.blockId)).size).toBe(3);
  });

  it('preserves block identity across a bounded update and records lineage', () => {
    const initial = createInitialDraftRevision({
      body: original,
      origin: 'initial_analysis',
    });
    const nextBody = original.replace('each revision attributable', 'every revision attributable');
    const assessment = assessDraftRevision({
      previousDraft: original,
      nextDraft: nextBody,
    });
    const next = createDraftChangeSet({
      previousBody: original,
      nextBody,
      origin: 'manual_edit',
      assessment,
      system: initial,
    });

    expect(next.draftRevision.previousRevisionId).toBe(initial.draftRevision.revisionId);
    expect(next.contentBlocks[0]?.blockId).toBe(initial.contentBlocks[0]?.blockId);
    expect(next.contentBlocks[1]?.blockId).toBe(initial.contentBlocks[1]?.blockId);
    expect(next.changeSet.changedBlocks).toEqual([
      expect.objectContaining({
        blockId: initial.contentBlocks[1]?.blockId,
        changeType: 'update',
      }),
    ]);
  });

  it('preserves unchanged blocks when a new block is inserted', () => {
    const initial = createInitialDraftRevision({ body: original, origin: 'refine' });
    const nextBody = `${original.split('\n\n')[0]}\n\nA new transition paragraph.\n\n${original.split('\n\n').slice(1).join('\n\n')}`;
    const assessment = assessDraftRevision({ previousDraft: original, nextDraft: nextBody });
    const next = createDraftChangeSet({
      previousBody: original,
      nextBody,
      origin: 'targeted_fix',
      assessment,
      system: initial,
    });

    expect(next.contentBlocks[0]?.blockId).toBe(initial.contentBlocks[0]?.blockId);
    expect(next.contentBlocks[2]?.blockId).toBe(initial.contentBlocks[1]?.blockId);
    expect(next.changeSet.changedBlocks).toContainEqual(
      expect.objectContaining({ changeType: 'insert', afterIndex: 1 })
    );
  });

  it('rejects a validator result for a different revision or body', () => {
    const initial = createInitialDraftRevision({ body: original, origin: 'refine' });
    expect(() => assertDraftRevisionMatches({
      current: initial.draftRevision,
      expectedRevisionId: 'rev_outdated',
      expectedBodyHash: initial.draftRevision.bodyHash,
    })).toThrow(DraftRevisionMismatchError);
  });
});
