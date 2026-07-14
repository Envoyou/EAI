export interface StrippedDraft {
  title: string | null;
  body: string;
}

/**
 * Strips the leading H1 title (# Title) from a draft if it exists.
 * Returns the extracted title and the remaining body of the draft.
 */
export function stripLeadingH1(draft: string): StrippedDraft {
  if (!draft) {
    return { title: null, body: '' };
  }

  const lines = draft.split('\n');
  const firstLine = lines[0]?.trim();

  if (firstLine && firstLine.startsWith('# ')) {
    const title = firstLine.replace(/^#\s+/, '').trim();
    // Reconstruct body from remaining lines, preserving line breaks
    const body = lines.slice(1).join('\n').trimStart();
    return { title, body };
  }

  return { title: null, body: draft };
}
