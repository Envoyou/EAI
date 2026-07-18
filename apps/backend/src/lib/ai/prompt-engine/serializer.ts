import type { PromptNode, RenderContext } from '@eai/shared';
import { CompositePromptNode } from '@eai/shared';

export interface SerializedPromptNode {
  id: string;
  type: 'core' | 'tenant' | 'context' | 'composite';
  isStatic: boolean;
  priority: number;
  renderedContent?: string;
  children?: SerializedPromptNode[];
}

export class PromptSerializer {
  /**
   * Serializes a PromptNode tree into a transferable plain JSON object.
   */
  static serialize(
    node: PromptNode,
    context?: RenderContext
  ): SerializedPromptNode {
    const serialized: SerializedPromptNode = {
      id: node.id,
      type: node.type,
      isStatic: node.isStatic,
      priority: node.priority ?? 1,
    };

    if (
      node.type === 'composite' ||
      typeof (node as unknown as { getChildren?: () => PromptNode[] }).getChildren === 'function'
    ) {
      const children = (
        node as unknown as { getChildren: () => PromptNode[] }
      ).getChildren();
      serialized.children = children.map((c) => this.serialize(c, context));
    } else if (context) {
      serialized.renderedContent = node.render(context);
    }

    return serialized;
  }

  /**
   * Deserializes a plain JSON structure back into a live PromptNode AST tree.
   */
  static deserialize(json: SerializedPromptNode): PromptNode {
    if (json.children && json.children.length > 0) {
      const composite = new CompositePromptNode(
        json.id,
        json.children.map((childJson) => this.deserialize(childJson)),
        json.priority ?? 1
      );
      composite.isStatic = json.isStatic;
      return composite;
    }

    const renderedContent = json.renderedContent || '';
    return {
      id: json.id,
      type: json.type,
      isStatic: json.isStatic,
      priority: json.priority ?? 1,
      render: () => renderedContent,
    };
  }
}
