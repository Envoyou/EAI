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

/**
 * Strips the leading "Excerpt: ..." paragraph from a draft body if it exists.
 * Returns the remaining body of the draft.
 */
export function stripLeadingExcerpt(text: string): string {
  if (!text) {
    return text;
  }

  const cleanText = text.trim();
  // Match "**Excerpt:**" or "Excerpt:" at the very start, followed by its content
  // up to the next double newline (end of paragraph) or end of text.
  const excerptRegex = /^\*?\*?Excerpt\*?\*?:?\s*([\s\S]*?)(?:\n\s*\n|$)/i;

  if (excerptRegex.test(cleanText)) {
    return cleanText.replace(excerptRegex, '').trimStart();
  }

  return text;
}

/** Promotes orphaned/deep Markdown headings without touching fenced code. */
export function normalizeMarkdownHeadingHierarchy(text: string): string {
  if (!text) return text;

  let inFence = false;
  let previousHeadingLevel: number | null = null;
  return text.split('\n').map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    const match = line.match(/^(\s*)(#{2,6})(\s+.+)$/);
    if (!match) return line;

    const requestedLevel = match[2].length;
    const maximumLevel = previousHeadingLevel === null
      ? 2
      : Math.min(6, previousHeadingLevel + 1);
    const normalizedLevel = Math.min(requestedLevel, maximumLevel);
    previousHeadingLevel = normalizedLevel;
    return `${match[1]}${'#'.repeat(normalizedLevel)}${match[3]}`;
  }).join('\n');
}
