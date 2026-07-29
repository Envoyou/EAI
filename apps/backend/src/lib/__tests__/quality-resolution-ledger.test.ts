import { describe, expect, test } from 'vitest';
import type { FeedbackItem, FinalQualityGateOutput } from '@eai/shared';
import { applyDeterministicQualityChecks } from '@/lib/final-quality';
import {
  mergeQualityResolutions,
  readQualityResolutions,
  readTrustedSourceUrls,
  reconcileQualityResolutions,
} from '@/lib/quality-resolution-ledger';

type QualityFeedbackItem = FinalQualityGateOutput['feedback'][number] &
  Pick<FeedbackItem, 'isAccepted' | 'isVerified' | 'verifiedSource'>;

const warning = (
  overrides: Partial<QualityFeedbackItem> = {}
): QualityFeedbackItem => ({
  category: 'Editorial Addition',
  status: 'warning',
  message: 'Confirm whether this framing should remain.',
  targetText: 'This is the exact editorial framing under review.',
  operation: 'manual',
  ...overrides,
});

const resultWith = (
  feedback: QualityFeedbackItem[]
): FinalQualityGateOutput => ({
  readiness: feedback.some((item) => item.status === 'fail')
    ? 'blocked'
    : 'needs_review',
  summary: 'The draft needs an editorial decision.',
  changes: ['Reviewed the current final draft.'],
  feedback,
  flags: ['Editorial review'],
});

describe('quality resolution ledger', () => {
  test('retains an accepted warning for the same unchanged target across a new gate run', () => {
    const accepted = warning({ isAccepted: true });
    const ledger = mergeQualityResolutions([], [accepted]);
    const nextResult = reconcileQualityResolutions(
      resultWith([warning()]),
      `Opening.\n\n${accepted.targetText}\n\nClosing.`,
      ledger,
      'id'
    );

    expect(nextResult.readiness).toBe('ready');
    expect(nextResult.feedback).toEqual([]);
    expect(nextResult.flags).toEqual([]);
    expect(nextResult.summary).toContain('keputusan editor sebelumnya');
  });

  test('does not reuse an old decision after the target text changes', () => {
    const ledger = mergeQualityResolutions([], [warning({ isAccepted: true })]);
    const changedFinding = warning({
      targetText: 'A materially different framing now appears in the draft.',
    });
    const nextResult = reconcileQualityResolutions(
      resultWith([changedFinding]),
      changedFinding.targetText!,
      ledger
    );

    expect(nextResult.readiness).toBe('needs_review');
    expect(nextResult.feedback).toEqual([changedFinding]);
  });

  test('never suppresses a fail using a previous warning decision', () => {
    const ledger = mergeQualityResolutions([], [warning({ isAccepted: true })]);
    const failedFinding = warning({ status: 'fail' });
    const nextResult = reconcileQualityResolutions(
      resultWith([failedFinding]),
      failedFinding.targetText!,
      ledger
    );

    expect(nextResult.readiness).toBe('blocked');
    expect(nextResult.feedback).toEqual([failedFinding]);
  });

  test('persists verified source URLs and excludes them from novel URL findings', () => {
    const sourceUrl = 'https://example.com/research/source';
    const ledger = mergeQualityResolutions([], [
      warning({
        category: 'Source Fidelity',
        verificationStatus: 'needs_citation',
        isVerified: true,
        verifiedSource: sourceUrl,
      }),
    ]);
    const stored = readQualityResolutions({
      resolvedQualityFindings: ledger,
    });
    const trustedSourceUrls = readTrustedSourceUrls(stored);
    const checked = applyDeterministicQualityChecks(
      {
        readiness: 'ready',
        summary: 'Ready.',
        changes: ['Added an editor-verified source.'],
        feedback: [],
        flags: [],
      },
      `Read [the source](${sourceUrl}).`,
      'Read the source.',
      {
        language: 'en',
        publicationMode: 'fast',
        trustedSourceUrls,
      }
    );

    expect(trustedSourceUrls).toEqual([sourceUrl]);
    expect(checked.feedback).toEqual([]);
    expect(checked.readiness).toBe('ready');
  });
});
