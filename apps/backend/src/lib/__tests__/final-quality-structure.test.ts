import { describe, expect, it } from 'vitest';
import {
  applyDeterministicQualityChecks,
  detectAdjacentDuplicateHeadings,
  detectContentAfterReferences,
  detectMissingSentenceBoundaries,
} from '../final-quality';

describe('Final Quality Deterministic Structure Checks', () => {
  it('detects missing whitespace between sentences', () => {
    const text = 'This is paragraph one ending with mandates.The next paragraph begins immediately.';
    const matches = detectMissingSentenceBoundaries(text);
    expect(matches).toContain('s.Th');

    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      text,
      ''
    );
    expect(result.flags).toContain('Missing Sentence Whitespace');
    expect(result.readiness).toBe('needs_review');
    expect(result.feedback).toHaveLength(1);
    expect(result.feedback[0]).toMatchObject({
      ruleId: 'cms.missing_sentence_whitespace',
      operation: 'replace',
      targetText: 's.Th',
      replacementText: 's. Th',
    });
  });

  it('replaces duplicate model spacing findings with one deterministic finding', () => {
    const text = 'The conclusion ends.The next paragraph begins.';
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: '',
        changes: [],
        feedback: [
          {
            category: 'CMS Formatting',
            status: 'warning',
            message: 'Missing whitespace between two sentences creates concatenated text.',
            suggestion: 'Add the missing space.',
            operation: 'manual',
          },
          {
            category: 'CMS Formatting',
            status: 'warning',
            message: 'Target text contains concatenated sentences without punctuation space.',
            suggestion: 'Separate the sentences.',
            operation: 'manual',
          },
        ],
        flags: [],
      },
      text,
      ''
    );

    expect(result.feedback).toHaveLength(1);
    expect(result.feedback[0]?.ruleId).toBe('cms.missing_sentence_whitespace');
  });

  it('flags article prose added after the references section', () => {
    const text = `
## References
- Source 1

The trajectory of climate finance shows that capital availability is rarely the sole bottleneck. The real leverage lies in institutional architecture.
`;
    const check = detectContentAfterReferences(text);
    expect(check).not.toBeNull();
    expect(check?.hasNarrativeProse).toBe(true);

    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      text,
      ''
    );
    expect(result.flags).toContain('Content After References');
    expect(result.readiness).toBe('blocked');
  });

  it('blocks repeated headings with no article content between them', () => {
    const text = `
## How Agentic AI Replaces Rigid Automation

## How Agentic AI Replaces Rigid Automation

## How Agentic AI Replaces Rigid Automation

The article continues here.
`;

    expect(detectAdjacentDuplicateHeadings(text)).toEqual([
      'How Agentic AI Replaces Rigid Automation',
    ]);

    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      text,
      ''
    );
    expect(result.flags).toContain('Duplicate Heading');
    expect(result.feedback[0]?.category).toBe('Structure');
    expect(result.readiness).toBe('blocked');
  });

  it('allows the same heading text when article content separates the sections', () => {
    const text = `
## Reusable Pattern

The first section has meaningful content.

## Reusable Pattern

The second section has meaningful content.
`;

    expect(detectAdjacentDuplicateHeadings(text)).toEqual([]);
  });
});
