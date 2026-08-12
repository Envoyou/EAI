import { describe, expect, it } from 'vitest';
import {
  applyDeterministicQualityChecks,
  detectAdjacentDuplicateHeadings,
  detectContentAfterReferences,
  detectMissingSentenceBoundaries,
} from '../final-quality';
import { applyAutomaticDeterministicRemediations } from '../automatic-remediation';

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

  it('projects an unambiguous paragraph-boundary finding as an executable patch', () => {
    const target = 'Editors maintain control over the narrative and protect brand integrity. Editorial systems then move from raw generation to structured refinement.';
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: '',
        changes: [],
        feedback: [{
          category: 'Structure',
          status: 'warning',
          message: 'The section conclusion introduces the next topic without a paragraph break.',
          suggestion: 'Separate the paragraph by adding a paragraph break between the two sentences.',
          targetText: target,
          operation: 'manual',
        }],
        flags: [],
      },
      target,
      target
    );

    expect(result.feedback[0]).toMatchObject({
      ruleId: 'structure.missing_paragraph_boundary',
      operation: 'replace',
      targetText: target,
      replacementText: 'Editors maintain control over the narrative and protect brand integrity.\n\nEditorial systems then move from raw generation to structured refinement.',
    });

    const remediated = applyAutomaticDeterministicRemediations({
      draft: target,
      feedback: result.feedback,
      researchNotes: [],
    });
    expect(remediated.draft).toBe(
      'Editors maintain control over the narrative and protect brand integrity.\n\nEditorial systems then move from raw generation to structured refinement.'
    );
    expect(remediated.appliedCount).toBe(1);
  });

  it('keeps ambiguous multi-sentence paragraph findings manual', () => {
    const target = 'First sentence closes a section. Second sentence adds context. Third sentence introduces another topic.';
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: '',
        changes: [],
        feedback: [{
          category: 'Structure',
          status: 'warning',
          message: 'This passage may need a paragraph break.',
          suggestion: 'Separate the paragraph at the appropriate editorial boundary.',
          targetText: target,
          operation: 'manual',
        }],
        flags: [],
      },
      target,
      target
    );

    expect(result.feedback[0]).toMatchObject({ operation: 'manual' });
    expect(result.feedback[0]?.replacementText).toBeUndefined();
  });

  it('resolves a unique quoted paragraph anchor when model target text is descriptive', () => {
    const draft = 'Editors retain authority over factual accuracy and editorial integrity. Content refinement then starts from a different premise.';
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: '',
        changes: [],
        feedback: [{
          category: 'Structure',
          status: 'warning',
          message: 'A missing paragraph break concatenates the conclusion of human-controlled drafting with the introduction to content refinement.',
          suggestion: "Insert a double line break after 'editorial integrity.' to separate the two distinct analytical concepts.",
          targetText: 'A missing paragraph break concatenates the conclusion of human-controlled drafting with the introduction to content refinement.',
          operation: 'manual',
        }],
        flags: [],
      },
      draft,
      draft
    );

    expect(result.feedback[0]).toMatchObject({
      ruleId: 'structure.missing_paragraph_boundary',
      operation: 'replace',
      targetText: 'editorial integrity. Content',
      replacementText: 'editorial integrity.\n\nContent',
    });

    const remediated = applyAutomaticDeterministicRemediations({
      draft,
      feedback: result.feedback,
      researchNotes: [],
    });
    expect(remediated.draft).toBe(
      'Editors retain authority over factual accuracy and editorial integrity.\n\nContent refinement then starts from a different premise.'
    );
  });

  it('keeps quoted paragraph anchors manual when the location is not unique', () => {
    const draft = 'First section ends with editorial integrity. Content continues. Another section ends with editorial integrity. Content resumes.';
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: '',
        changes: [],
        feedback: [{
          category: 'Structure',
          status: 'warning',
          message: 'A paragraph break is missing.',
          suggestion: "Insert a double line break after 'editorial integrity.'.",
          targetText: 'A paragraph break is missing.',
          operation: 'manual',
        }],
        flags: [],
      },
      draft,
      draft
    );

    expect(result.feedback[0]).toMatchObject({ operation: 'manual' });
    expect(result.feedback[0]?.replacementText).toBeUndefined();
  });
});
