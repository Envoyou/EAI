export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function extractDynamicSuggestions(content: string): { displayContent: string; suggestions?: string[] } {
  const match = content.match(/\[SUGGESTIONS:\s*([\s\S]*?)\](?![^\]]*\])/);
  if (match) {
    const suggestions = match[1].split('|').map(s => s.trim());
    const displayContent = content.replace(match[0], '').trim();
    return { displayContent, suggestions };
  }
  const displayContent = content.replace(/\[SUGGESTIONS:[\s\S]*/, '').trim();
  return { displayContent, suggestions: undefined };
}

/**
 * Replaces raw or escaped HTML line breaks inside GFM table rows
 * with a portable Markdown separator.
 *
 * Handles raw `<br>` variants and HTML-escaped `<br>` variants
 * without de-escaping unrelated HTML entities.
 */
export const normalizeStrategistMarkdown = (value: string): string => {
  const amp = '\u0026'; // &
  const lt = `${amp}lt;`;
  const gt = `${amp}gt;`;

  const escapedBr = new RegExp(
    `\\s*(?:<\\s*br\\s*\\/?>|${lt}\\s*br\\s*\\/?${gt})\\s*`,
    'gi'
  );

  return value
  .split('\n')
  .map((line) => {
    const trimmed = line.trim();
    const isTableRow =
      trimmed.startsWith('|') &&
      trimmed.endsWith('|');

    if (!isTableRow) return line;

    return line
      .replace(escapedBr, ' \u2014 ')
      .replace(/(?:\s+\u2014){2,}/g, ' \u2014 ');
  })
  .join('\n');
};