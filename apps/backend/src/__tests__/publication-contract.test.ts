import { describe, expect, test } from 'vitest';
import type { FinalQualityGateOutput } from '@eai/shared';
import { applyDeterministicQualityChecks, detectSourceFidelitySignals } from '@/lib/final-quality';
import { VisualFormatSelectionPolicyNode } from '@/lib/ai/prompt-engine/core/format';
import { preparePublicationDraft, resolvePublicationPackageStatus } from '@/routes/analyze/utils/text';
import { sanitizeSuppressiveFeedbackItem } from '@/routes/analyze/utils/factual';

const missingH1Result = (): FinalQualityGateOutput => ({
  readiness: 'needs_review',
  summary: 'The body needs a title.',
  changes: ['Improved the opening.'],
  feedback: [{
    category: 'No H1 Title',
    status: 'warning',
    message: 'The draft lacks a primary H1 title.',
    suggestion: 'Insert # A New Title before the opening paragraph.',
    operation: 'insert_before',
    targetText: 'Opening paragraph.',
    replacementText: '# A New Title\n\nOpening paragraph.',
  }],
  flags: ['No H1 Title'],
});

describe('publication title contract', () => {
  test('publication preparation removes a rogue leading H1 deterministically', () => {
    expect(preparePublicationDraft('# Working Title\n\nOpening paragraph.'))
      .toBe('Opening paragraph.');
  });

  test('body mutations invalidate a current publication package', () => {
    expect(resolvePublicationPackageStatus({
      storedStatus: 'current',
      hasPackage: true,
      bodyChanged: true,
    })).toBe('stale');
    expect(resolvePublicationPackageStatus({
      storedStatus: 'current',
      hasPackage: true,
      bodyChanged: false,
    })).toBe('current');
  });

  test('Fast mode never requires publication fields or an H1 in the body', () => {
    const result = applyDeterministicQualityChecks(
      missingH1Result(),
      'Opening paragraph.\n\n## Section\n\nBody.',
      'Opening paragraph.',
      { publicationMode: 'fast', language: 'en' }
    );

    expect(result.feedback).toHaveLength(0);
    expect(result.flags).not.toContain('No H1 Title');
    expect(result.readiness).toBe('ready');
  });

  test('Publish Ready treats the package title as the page H1', () => {
    const result = applyDeterministicQualityChecks(
      missingH1Result(),
      'Opening paragraph.\n\n## Section\n\nBody.',
      'Opening paragraph.',
      {
        publicationMode: 'publish_ready',
        documentTitle: 'Canonical CMS Article Title',
        language: 'en',
      }
    );

    expect(result.feedback).toHaveLength(0);
    expect(result.flags).not.toContain('No H1 Title');
  });

  test('publication-field feedback cannot become a body text operation', () => {
    const item = sanitizeSuppressiveFeedbackItem({
      category: 'Publication Title',
      status: 'warning',
      message: 'The publication title is too vague.',
      suggestion: 'Rewrite the title field.',
      operation: 'insert_before',
      targetField: 'publication.title',
      targetText: 'Opening paragraph.',
      replacementText: '# Replacement title',
    }, 'Opening paragraph.');

    expect(item.operation).toBe('manual');
    expect(item.targetField).toBe('publication.title');
    expect(item.targetText).toBeUndefined();
    expect(item.replacementText).toBeUndefined();
  });

  test('does not praise an unsafe visual that is flagged for source fidelity', () => {
    const input: FinalQualityGateOutput = {
      readiness: 'needs_review',
      summary: 'One visual needs review.',
      changes: [
        'Added a clean Mermaid workflow diagram.',
        'Improved the opening hook.',
      ],
      feedback: [{
        category: 'Source Fidelity',
        status: 'warning',
        verificationStatus: 'needs_citation',
        message: 'The Mermaid diagram contains unsupported workflow stages.',
        suggestion: 'Remove unsupported nodes from the diagram.',
        operation: 'manual',
        targetField: 'body',
      }],
      flags: ['Unsupported Visual Claim'],
    };

    const result = applyDeterministicQualityChecks(
      input,
      'Opening paragraph.',
      'Opening paragraph.',
      { publicationMode: 'fast', language: 'en' }
    );

    expect(result.changes).toEqual(['Improved the opening hook.']);
  });
});

describe('visual and acronym policy', () => {
  test('defaults to prose and makes visual elements optional', () => {
    const prompt = new VisualFormatSelectionPolicyNode().render({ format: 'xml' });
    expect(prompt).toContain('Visual elements are optional, not mandatory');
    expect(prompt).toContain('Default to prose');
    expect(prompt).toContain('Do not invent operational stages, KPIs, integrations, APIs');
  });

  test('generic API and KPI abbreviations are not treated as novel entities', () => {
    const signals = detectSourceFidelitySignals(
      'The team measures operational performance.',
      'The team uses API integration and KPI tracking for operational performance.'
    );
    expect(signals.novelEntities).not.toContain('API');
    expect(signals.novelEntities).not.toContain('KPI');
  });
});
