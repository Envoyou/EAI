export type RenderFormat = 'xml' | 'markdown' | 'text';

export interface RenderContext {
  format: RenderFormat;
  targetLanguage?: 'en' | 'id' | 'follow_draft';
  [key: string]: any;
}

export interface PromptNode {
  id: string;
  type: 'core' | 'tenant' | 'context' | 'composite';
  isStatic: boolean;
  render(context: RenderContext): string;
}

/**
 * CompositePromptNode compiles a list of children PromptNodes.
 * It automatically groups static nodes first to maximize LLM prompt caching (e.g. Gemini),
 * placing dynamic nodes at the end.
 */
export class CompositePromptNode implements PromptNode {
  id: string;
  type = 'composite' as const;
  isStatic: boolean;
  private children: PromptNode[] = [];

  constructor(id: string, children: PromptNode[] = []) {
    this.id = id;
    this.children = children;
    // A composite node is only static if all its children are static
    this.isStatic = children.every((child) => child.isStatic);
  }

  addChild(child: PromptNode): void {
    this.children.push(child);
    this.isStatic = this.children.every((c) => c.isStatic);
  }

  getChildren(): PromptNode[] {
    return [...this.children];
  }

  render(context: RenderContext): string {
    const staticNodes = this.children.filter((n) => n.isStatic);
    const dynamicNodes = this.children.filter((n) => !n.isStatic);

    const renderedStatic = staticNodes
      .map((n) => n.render(context))
      .filter(Boolean)
      .join('\n\n');

    const renderedDynamic = dynamicNodes
      .map((n) => n.render(context))
      .filter(Boolean)
      .join('\n\n');

    if (renderedStatic && renderedDynamic) {
      if (context.format === 'xml') {
        return `${renderedStatic}\n\n<!-- DYNAMIC CONTEXT & CONSTRAINTS -->\n\n${renderedDynamic}`;
      }
      return `${renderedStatic}\n\n=== DYNAMIC CONTEXT & CONSTRAINTS ===\n\n${renderedDynamic}`;
    }

    return renderedStatic || renderedDynamic;
  }
}
