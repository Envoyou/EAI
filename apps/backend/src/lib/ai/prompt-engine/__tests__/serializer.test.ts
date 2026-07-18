import { describe, it, expect } from 'vitest';
import { CompositePromptNode, PromptNode } from '@eai/shared';
import { PromptSerializer } from '../serializer';

describe('PromptSerializer', () => {
  it('should serialize a single leaf node to JSON', () => {
    const leaf: PromptNode = {
      id: 'core_rules',
      type: 'core',
      isStatic: true,
      priority: 1,
      render: () => 'System Rules Content',
    };

    const json = PromptSerializer.serialize(leaf, { format: 'markdown' });

    expect(json).toEqual({
      id: 'core_rules',
      type: 'core',
      isStatic: true,
      priority: 1,
      renderedContent: 'System Rules Content',
    });
  });

  it('should serialize a composite node tree recursively', () => {
    const leaf1: PromptNode = {
      id: 'node_1',
      type: 'core',
      isStatic: true,
      priority: 1,
      render: () => 'Static Content',
    };

    const leaf2: PromptNode = {
      id: 'node_2',
      type: 'context',
      isStatic: false,
      priority: 3,
      render: () => 'Dynamic Context',
    };

    const root = new CompositePromptNode('root_node', [leaf1, leaf2], 1);

    const json = PromptSerializer.serialize(root, { format: 'xml' });

    expect(json.id).toBe('root_node');
    expect(json.type).toBe('composite');
    expect(json.children).toHaveLength(2);
    expect(json.children![0].id).toBe('node_1');
    expect(json.children![1].id).toBe('node_2');
    expect(json.children![1].priority).toBe(3);
  });

  it('should deserialize JSON back into a functional PromptNode tree', () => {
    const json = {
      id: 'composite_root',
      type: 'composite' as const,
      isStatic: false,
      priority: 1,
      children: [
        {
          id: 'child_1',
          type: 'core' as const,
          isStatic: true,
          priority: 1,
          renderedContent: 'Hello System',
        },
        {
          id: 'child_2',
          type: 'tenant' as const,
          isStatic: false,
          priority: 4,
          renderedContent: 'Brand Voice Context',
        },
      ],
    };

    const node = PromptSerializer.deserialize(json);

    expect(node.id).toBe('composite_root');
    expect(node.priority).toBe(1);
    expect((node as CompositePromptNode).getChildren()).toHaveLength(2);

    const rendered = node.render({ format: 'text' });
    expect(rendered).toContain('Hello System');
    expect(rendered).toContain('Brand Voice Context');
  });
});
