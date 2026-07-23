import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const notesSource = readFileSync(
  fileURLToPath(new URL('../NotesTab.tsx', import.meta.url)),
  'utf8'
);

describe('Notes Markdown theme contract', () => {
  it('inverts Tailwind Typography tokens in dark mode', () => {
    expect(notesSource).toContain(
      'prose dark:prose-invert strategist-prose'
    );
  });
});
