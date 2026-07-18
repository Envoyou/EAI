import { describe, it, expect, vi } from 'vitest';
import { CompositePromptNode, PromptNode } from '@eai/shared';
import { PromptRenderer } from '../renderer';

describe('PromptRenderer', () => {
  it('should render a prompt node with standardized line endings and formatting', () => {
    const mockNode: PromptNode = {
      id: 'test_node',
      type: 'core',
      isStatic: true,
      render: () => '  Hello World\r\n\r\n\r\n\r\nThis is a test.  ',
    };

    const rendered = PromptRenderer.render(mockNode, { format: 'markdown' });
    expect(rendered).toBe('Hello World\n\nThis is a test.');
  });

  it('should return empty string for blank nodes', () => {
    const emptyNode: PromptNode = {
      id: 'empty',
      type: 'core',
      isStatic: true,
      render: () => '   \n  ',
    };

    const rendered = PromptRenderer.render(emptyNode, { format: 'text' });
    expect(rendered).toBe('');
  });

  it('should validate XML boundaries and warn on mismatched tags', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const invalidXmlNode: PromptNode = {
      id: 'invalid_xml',
      type: 'context',
      isStatic: false,
      render: () => '<system_rule>Some rule</wrong_tag>',
    };

    PromptRenderer.render(invalidXmlNode, { format: 'xml' });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Mismatched XML tag '</wrong_tag>' in node 'invalid_xml'")
    );

    spy.mockRestore();
  });

  it('should render CompositePromptNode trees seamlessly', () => {
    const staticChild: PromptNode = {
      id: 'static_1',
      type: 'core',
      isStatic: true,
      render: () => '<core>Static Core Rules</core>',
    };

    const dynamicChild: PromptNode = {
      id: 'dynamic_1',
      type: 'tenant',
      isStatic: false,
      render: () => '<tenant>Dynamic Brand Context</tenant>',
    };

    const root = new CompositePromptNode('root', [staticChild, dynamicChild]);

    const rendered = PromptRenderer.render(root, { format: 'xml' });

    expect(rendered).toContain('<core>Static Core Rules</core>');
    expect(rendered).toContain('<!-- DYNAMIC CONTEXT & CONSTRAINTS -->');
    expect(rendered).toContain('<tenant>Dynamic Brand Context</tenant>');
  });
});
