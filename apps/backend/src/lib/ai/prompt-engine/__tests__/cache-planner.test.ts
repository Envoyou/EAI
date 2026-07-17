import { describe, test, expect } from 'vitest';
import { PromptCachePlanner } from '../cache-planner';
import { CompositePromptNode, PromptNode, RenderContext } from '@eai/shared';

class FakeStaticNode implements PromptNode {
  id = 'static_node';
  type = 'core' as const;
  isStatic = true;
  render() {
    return 'Static prefix instructions content here.';
  }
}

class FakeDynamicNode implements PromptNode {
  id = 'dynamic_node';
  type = 'tenant' as const;
  isStatic = false;
  render() {
    return 'Dynamic variable data content.';
  }
}

describe('PromptCachePlanner', () => {
  test('should plan static vs dynamic segments and check ordering', () => {
    const parent = new CompositePromptNode('test_parent');
    parent.addChild(new FakeStaticNode());
    parent.addChild(new FakeDynamicNode());

    const context: RenderContext = { format: 'xml' };
    const report = PromptCachePlanner.plan(parent, context);

    expect(report.totalTokens).toBe(18); // 10 static + 8 dynamic
    expect(report.cacheableTokens).toBe(10);
    expect(report.dynamicTokens).toBe(8);
    expect(report.efficiency).toBe(56); // 10 / 18 ≈ 56%
    expect(report.hasOrderViolation).toBe(false);
  });

  test('should detect order violations if static node is placed after dynamic', () => {
    const parent = new CompositePromptNode('violated_parent');
    parent.addChild(new FakeDynamicNode());
    parent.addChild(new FakeStaticNode()); // Static node after dynamic node!

    const context: RenderContext = { format: 'xml' };
    const report = PromptCachePlanner.plan(parent, context);

    expect(report.hasOrderViolation).toBe(true);
  });
});
