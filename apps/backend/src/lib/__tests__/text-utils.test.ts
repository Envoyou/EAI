import { describe, expect, it } from 'vitest';
import { repairMissingSentenceWhitespace } from '../text-utils';

describe('repairMissingSentenceWhitespace', () => {
  it('inserts a paragraph break after a closed bold sentence', () => {
    const before = '**AI proposes, the editor decides.**Refinement operates on a different premise.';
    const after = repairMissingSentenceWhitespace(before);

    expect(after).toBe(
      '**AI proposes, the editor decides.**\n\nRefinement operates on a different premise.'
    );
    expect(after.replace(/\s+/gu, '')).toBe(before.replace(/\s+/gu, ''));
  });

  it('does not mistake an opening bold delimiter for a closing boundary', () => {
    const value = 'The introduction ends.**The next sentence is intentionally bold.**';

    expect(repairMissingSentenceWhitespace(value)).toBe(value);
  });

  it('does not repair Markdown examples inside fenced code', () => {
    const value = '```md\n**AI proposes.**Refinement follows.\n```';

    expect(repairMissingSentenceWhitespace(value)).toBe(value);
  });
});
