import { describe, expect, it } from 'vitest';
import type { FeedbackItem, ResearchNote } from '@eai/shared';
import {
  applyAutomaticDeterministicRemediations,
  buildQualitySourceCorpus,
  canUseGeneratedRemediation,
} from '@/lib/automatic-remediation';

const notes: ResearchNote[] = [{
  id: 'note-1',
  content: 'The primary report documents the verified program result.',
  sources: [{ url: 'https://example.com/report', domain: 'example.com' }],
  savedAt: '2026-08-01T00:00:00.000Z',
}];

describe('automatic remediation', () => {
  it('repairs mechanical sentence spacing before findings reach Review', () => {
    const result = applyAutomaticDeterministicRemediations({
      draft: 'The first sentence ends.The second sentence starts.',
      feedback: [],
      researchNotes: [],
    });

    expect(result.draft).toBe('The first sentence ends. The second sentence starts.');
    expect(result.appliedCount).toBe(1);
  });

  it('removes duplicate empty headings and unsupported parenthetical details', () => {
    const draft = [
      '## Automation',
      '',
      '## Automation',
      '',
      'Traditional robotic process automation (RPA) follows strict rules.',
    ].join('\n');
    const feedback: FeedbackItem[] = [{
      category: 'Source Fidelity',
      status: 'warning',
      verificationStatus: 'needs_citation',
      message: 'The draft adds an unsupported entity: "RPA".',
      targetText: 'Traditional robotic process automation (RPA) follows strict rules.',
      operation: 'manual',
    }];

    const result = applyAutomaticDeterministicRemediations({ draft, feedback, researchNotes: [] });

    expect(result.draft.match(/^## Automation$/gmu)).toHaveLength(1);
    expect(result.draft).toContain('Traditional robotic process automation follows strict rules.');
    expect(result.appliedCount).toBe(2);
  });

  it('automatically attaches only a source URL supplied by research notes', () => {
    const targetText = 'The verified program result is documented.';
    const supported = applyAutomaticDeterministicRemediations({
      draft: targetText,
      researchNotes: notes,
      feedback: [{
        category: 'Source Verification',
        status: 'warning',
        verificationStatus: 'needs_citation',
        message: 'Attach the supplied primary report.',
        targetText,
        operation: 'manual',
        verifiedSource: 'https://example.com/report',
      }],
    });
    const invented = applyAutomaticDeterministicRemediations({
      draft: targetText,
      researchNotes: notes,
      feedback: [{
        category: 'Source Verification',
        status: 'warning',
        verificationStatus: 'needs_citation',
        message: 'Attach a source.',
        targetText,
        operation: 'manual',
        verifiedSource: 'https://invented.example/report',
      }],
    });

    expect(supported.draft).toContain('(https://example.com/report)');
    expect(supported.trustedSourceUrls).toEqual(['https://example.com/report']);
    expect(invented.draft).toBe(targetText);
  });

  it('preserves the requested structured insertion operation', () => {
    const result = applyAutomaticDeterministicRemediations({
      draft: 'Opening paragraph.\n\nClosing paragraph.',
      researchNotes: [],
      feedback: [{
        category: 'Structure',
        status: 'warning',
        message: 'Add the missing transition.',
        targetText: 'Closing paragraph.',
        replacementText: 'Transition paragraph.\n\n',
        operation: 'insert_before',
      }],
    });

    expect(result.draft).toContain('Opening paragraph.\n\nTransition paragraph.\n\nClosing paragraph.');
  });

  it('limits generated remediation to non-factual findings with an exact target', () => {
    expect(canUseGeneratedRemediation({
      category: 'Structure',
      status: 'warning',
      message: 'The conclusion repeats the introduction.',
      targetText: 'Repeated conclusion.',
      operation: 'manual',
    })).toBe(true);
    expect(canUseGeneratedRemediation({
      category: 'Source Fidelity',
      status: 'warning',
      verificationStatus: 'needs_citation',
      message: 'This claim needs evidence.',
      targetText: 'A factual claim.',
      operation: 'manual',
    })).toBe(false);
  });

  it('adds research notes and their URLs to the deterministic source corpus', () => {
    const corpus = buildQualitySourceCorpus('Original draft.', notes);
    expect(corpus).toContain('Original draft.');
    expect(corpus).toContain(notes[0]!.content);
    expect(corpus).toContain('https://example.com/report');
  });
});
