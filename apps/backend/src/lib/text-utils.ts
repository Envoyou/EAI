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

/** Repairs unambiguous sentence boundaries without changing editorial meaning. */
export function repairMissingSentenceWhitespace(text: string): string {
  const protectedPattern = /```[\s\S]*?```|https?:\/\/[^\s)>\]}]+|`[^`\n]+`/giu;
  const repairSegment = (value: string, followsProtectedText = false) => {
    const withMarkdownParagraphRepair = value.replace(
      /([.!?]["'”’)]?\*\*)(?=\p{Lu}\p{Ll})/gu,
      (boundary, _capturedBoundary, offset: number, fullText: string) => {
        const openingDelimiterCount = fullText
          .slice(0, offset)
          .match(/\*\*/gu)?.length ?? 0;
        return openingDelimiterCount % 2 === 1
          ? `${boundary}\n\n`
          : boundary;
      }
    );
    const withBoundaryRepair = followsProtectedText
      ? withMarkdownParagraphRepair.replace(/^([.!?])([A-Z][a-z])/u, '$1 $2')
      : withMarkdownParagraphRepair;
    const repaired = withBoundaryRepair.replace(
      /([a-z0-9)"'\]])([.!?])([A-Z][a-z])/g,
      '$1$2 $3'
    );
    return value.replace(/\s+/gu, '') === repaired.replace(/\s+/gu, '')
      ? repaired
      : value;
  };
  let cursor = 0;
  let repaired = '';

  for (const match of text.matchAll(protectedPattern)) {
    const index = match.index ?? 0;
    repaired += repairSegment(text.slice(cursor, index), cursor > 0);
    repaired += match[0];
    cursor = index + match[0].length;
  }

  return repaired + repairSegment(text.slice(cursor), cursor > 0);
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
