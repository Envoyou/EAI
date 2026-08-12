import { describe, expect, it } from 'vitest';
import {
  findEditorFocusRange,
  normalizeEditorFocusText,
} from '../editor-focus';

describe('candidate editor target focus', () => {
  it('finds a marked numeric finding in a long text block', () => {
    const target = 'A hypothetical statement like **"AI search reduced publisher traffic by 40%"**.';
    const block = [
      'A long introduction provides context before the finding.',
      'A hypothetical statement like "AI search reduced publisher traffic by 40%".',
      'The article continues for many more paragraphs.',
    ].join(' ');

    const range = findEditorFocusRange(block, target);

    expect(range).not.toBeNull();
    expect(block.slice(range!.from, range!.to)).toBe(
      'A hypothetical statement like "AI search reduced publisher traffic by 40%".'
    );
  });

  it('normalizes markdown links and escaped punctuation before matching', () => {
    expect(normalizeEditorFocusText('[Source](https://example.com) says \"hello\".'))
      .toBe('Source says "hello".');
  });
});
