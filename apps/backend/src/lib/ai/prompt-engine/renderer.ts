import type { PromptNode, RenderContext } from '@eai/shared';

export class PromptRenderer {
  /**
   * Renders a PromptNode tree into a clean, formally formatted prompt string.
   * Standardizes whitespace, line endings, and boundary markers.
   */
  static render(node: PromptNode, context: RenderContext): string {
    const raw = node.render(context).trim();
    if (!raw) return '';

    // Standardize line endings and remove excess consecutive blank lines
    const formatted = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    // Structural validation check for XML tags if format is XML
    if (context.format === 'xml') {
      this.validateXmlBoundaries(formatted, node.id);
    }

    return formatted;
  }

  /**
   * Performs basic structural validation on rendered XML tags.
   * Logs a warning if closing tags do not match opening tags.
   */
  private static validateXmlBoundaries(rendered: string, nodeId: string): void {
    const openTags = (rendered.match(/<[a-zA-Z0-9_-]+>/g) || []).map((t) =>
      t.slice(1, -1)
    );
    const closeTags = (rendered.match(/<\/[a-zA-Z0-9_-]+>/g) || []).map((t) =>
      t.slice(2, -1)
    );

    const openCounts = new Map<string, number>();
    for (const tag of openTags) {
      openCounts.set(tag, (openCounts.get(tag) || 0) + 1);
    }

    for (const tag of closeTags) {
      const count = openCounts.get(tag) || 0;
      if (count <= 0) {
        console.warn(
          `[PromptRenderer] Mismatched XML tag '</${tag}>' in node '${nodeId}'`
        );
      } else {
        openCounts.set(tag, count - 1);
      }
    }
  }
}
