import { describe, it, expect } from 'vitest';
import { CompositePromptNode, PromptNode } from '@eai/shared';
import { PromptPruningOptimizer } from '../pruning-optimizer';

describe('PromptPruningOptimizer', () => {
  it('should not prune anything if total tokens are within budget', () => {
    const mandatory: PromptNode = {
      id: 'mandatory_1',
      type: 'core',
      isStatic: true,
      priority: 1,
      render: () => 'Short core instruction.',
    };

    const optional: PromptNode = {
      id: 'optional_5',
      type: 'context',
      isStatic: false,
      priority: 5,
      render: () => 'Extra background context.',
    };

    const root = new CompositePromptNode('root', [mandatory, optional]);
    const context = { format: 'text' as const };

    const result = PromptPruningOptimizer.optimize(root, context, 1000);

    expect(result.wasPruned).toBe(false);
    expect(result.prunedNodeIds).toHaveLength(0);
    expect(result.prunedNode.render(context)).toContain('Extra background context.');
  });

  it('should prune priority 5 nodes first when budget is tight', () => {
    const coreRule: PromptNode = {
      id: 'core_rule',
      type: 'core',
      isStatic: true,
      priority: 1,
      render: () => 'CRITICAL MANDATORY CORE INSTRUCTION. MUST OBEY.',
    };

    const mediumContext: PromptNode = {
      id: 'medium_ctx',
      type: 'context',
      isStatic: false,
      priority: 3,
      render: () => 'Important reference documentation and style guidelines.',
    };

    const optionalExamples: PromptNode = {
      id: 'optional_examples',
      type: 'context',
      isStatic: false,
      priority: 5,
      render: () =>
        'Here is a long list of optional few-shot examples that take up a huge number of tokens. ' +
        'Example 1: ... Example 2: ... Example 3: ... Example 4: ... Example 5: ...',
    };

    const root = new CompositePromptNode('root', [
      coreRule,
      mediumContext,
      optionalExamples,
    ]);
    const context = { format: 'text' as const };

    // Set token budget lower than total (e.g. 25 tokens)
    const result = PromptPruningOptimizer.optimize(root, context, 25);

    expect(result.wasPruned).toBe(true);
    expect(result.prunedNodeIds).toContain('optional_examples');
    expect(result.prunedNode.render(context)).not.toContain('optional_examples');
    expect(result.prunedNode.render(context)).toContain('CRITICAL MANDATORY CORE INSTRUCTION');
  });

  it('never prunes priority 1 mandatory nodes even if budget is 0', () => {
    const mandatoryNode: PromptNode = {
      id: 'mandatory_rule',
      type: 'core',
      isStatic: true,
      priority: 1,
      render: () => 'MANDATORY NODE CONTENT',
    };

    const pruneableNode: PromptNode = {
      id: 'pruneable_rule',
      type: 'context',
      isStatic: false,
      priority: 2,
      render: () => 'PRUNEABLE NODE CONTENT',
    };

    const root = new CompositePromptNode('root', [mandatoryNode, pruneableNode]);
    const context = { format: 'text' as const };

    const result = PromptPruningOptimizer.optimize(root, context, 1);

    expect(result.prunedNodeIds).toContain('pruneable_rule');
    expect(result.prunedNodeIds).not.toContain('mandatory_rule');
    expect(result.prunedNode.render(context)).toContain('MANDATORY NODE CONTENT');
  });
});
