import { describe, expect, it } from 'vitest';
import type { FeedbackItem, ResearchNote } from '@eai/shared';
import { createInitialDraftRevision } from '@/lib/draft-revision';
import {
  assignPersistentEditorialIdentities,
  restoreTrustedFeedbackIdentities,
} from '@/lib/editorial-identity';

const body = [
  '## Evidence',
  'The verified program reached 42 participating organizations in 2026.',
  'Editors retain the final publication decision.',
].join('\n\n');

const finding = (targetText = 'The verified program reached 42 participating organizations in 2026.'): FeedbackItem => ({
  category: 'Source Fidelity',
  status: 'warning',
  verificationStatus: 'needs_citation',
  message: 'Confirm the evidence supporting this factual claim.',
  targetText,
  operation: 'manual',
});

describe('persistent editorial identities', () => {
  it('keeps feedback, rule, claim, and block identities stable for the same finding', () => {
    const revision = createInitialDraftRevision({ body, origin: 'initial_analysis' });
    const first = assignPersistentEditorialIdentities({
      feedback: [finding()],
      finalDraft: body,
      system: revision,
    });
    const second = assignPersistentEditorialIdentities({
      feedback: [finding()],
      finalDraft: body,
      system: { ...revision, editorialIdentities: first.editorialIdentities },
    });

    expect(second.feedback[0]).toMatchObject({
      feedbackId: first.feedback[0]?.feedbackId,
      ruleId: first.feedback[0]?.ruleId,
      claimId: first.feedback[0]?.claimId,
      blockId: revision.contentBlocks[1]?.blockId,
    });
    expect(second.editorialIdentities.claims).toHaveLength(1);
  });

  it('overwrites identity fields supplied by a model response', () => {
    const revision = createInitialDraftRevision({ body, origin: 'initial_analysis' });
    const result = assignPersistentEditorialIdentities({
      feedback: [{
        ...finding(),
        feedbackId: 'feedback_model',
        ruleId: 'rule_model',
        claimId: 'claim_model',
        blockId: 'block_model',
        sourceIds: ['source_model'],
      }],
      finalDraft: body,
      system: revision,
    });

    expect(result.feedback[0]?.feedbackId).not.toBe('feedback_model');
    expect(result.feedback[0]?.ruleId).not.toBe('rule_model');
    expect(result.feedback[0]?.claimId).not.toBe('claim_model');
    expect(result.feedback[0]?.blockId).not.toBe('block_model');
    expect(result.feedback[0]?.sourceIds).toBeUndefined();
  });

  it('creates a new claim identity when the claim target materially changes', () => {
    const revision = createInitialDraftRevision({ body, origin: 'initial_analysis' });
    const first = assignPersistentEditorialIdentities({
      feedback: [finding()],
      finalDraft: body,
      system: revision,
    });
    const changed = finding('The verified program reached 84 participating organizations in 2026.');
    const second = assignPersistentEditorialIdentities({
      feedback: [changed],
      finalDraft: body.replace('42', '84'),
      system: { ...revision, editorialIdentities: first.editorialIdentities },
    });

    expect(second.feedback[0]?.ruleId).toBe(first.feedback[0]?.ruleId);
    expect(second.feedback[0]?.claimId).not.toBe(first.feedback[0]?.claimId);
    expect(second.feedback[0]?.feedbackId).not.toBe(first.feedback[0]?.feedbackId);
  });

  it('canonicalizes a verified URL into a persistent source identity', () => {
    const revision = createInitialDraftRevision({ body, origin: 'initial_analysis' });
    const notes: ResearchNote[] = [{
      id: 'note_1',
      content: 'Program participation evidence.',
      sources: [{ url: 'https://EXAMPLE.com/report#section', domain: 'example.com' }],
      savedAt: '2026-08-01T00:00:00.000Z',
    }];
    const result = assignPersistentEditorialIdentities({
      feedback: [{ ...finding(), verifiedSource: 'https://example.com/report' }],
      finalDraft: body,
      system: revision,
      researchNotes: notes,
    });

    expect(result.feedback[0]?.sourceIds).toHaveLength(1);
    expect(result.editorialIdentities.sources).toContainEqual(expect.objectContaining({
      sourceId: result.feedback[0]?.sourceIds?.[0],
      url: 'https://example.com/report',
      researchNoteId: 'note_1',
    }));
  });

  it('discards forged client IDs and restores only server-persisted identities', () => {
    const stored = {
      ...finding(),
      feedbackId: 'feedback_server',
      ruleId: 'rule_server',
      claimId: 'claim_server',
      blockId: 'block_server',
    };
    const result = restoreTrustedFeedbackIdentities({
      stored: [stored],
      submitted: [{
        ...finding(),
        feedbackId: 'feedback_forged',
        ruleId: 'rule_forged',
        isAccepted: true,
      }],
    });

    expect(result.feedback[0]).toMatchObject({
      feedbackId: 'feedback_server',
      ruleId: 'rule_server',
      claimId: 'claim_server',
      blockId: 'block_server',
    });
    expect(result.trustedResolutions).toHaveLength(1);
  });
});
