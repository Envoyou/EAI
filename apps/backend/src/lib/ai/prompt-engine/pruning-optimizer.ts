import type { PromptNode, RenderContext } from '@eai/shared';
import { CompositePromptNode } from '@eai/shared';
import { PromptTokenEstimator } from './token-estimator';

export interface PruningOptimizationResult {
  prunedNode: PromptNode;
  prunedNodeIds: string[];
  finalTokenEstimate: number;
  originalTokenEstimate: number;
  wasPruned: boolean;
}

export class PromptPruningOptimizer {
  /**
   * Clones and prunes an AST tree recursively so that the rendered prompt fits within tokenBudget.
   * Prunes nodes with priority level 5 first, then 4, 3, 2, until budget is satisfied.
   * Node priority 1 (Mandatory) is NEVER pruned.
   */
  static optimize(
    node: PromptNode,
    context: RenderContext,
    tokenBudget: number
  ): PruningOptimizationResult {
    const currentTree = this.deepCloneNode(node);
    const originalTokenEstimate = PromptTokenEstimator.estimateOffline(
      currentTree.render(context)
    );
    let currentTokens = originalTokenEstimate;
    const prunedNodeIds: string[] = [];

    if (currentTokens <= tokenBudget) {
      return {
        prunedNode: currentTree,
        prunedNodeIds,
        finalTokenEstimate: currentTokens,
        originalTokenEstimate,
        wasPruned: false,
      };
    }

    // Try pruning levels starting from 5 (most optional) down to 2
    for (let currentPruneLevel = 5; currentPruneLevel >= 2; currentPruneLevel--) {
      const successfullyPruned = this.pruneLevelRecursive(
        currentTree,
        currentPruneLevel,
        prunedNodeIds
      );

      if (successfullyPruned) {
        currentTokens = PromptTokenEstimator.estimateOffline(
          currentTree.render(context)
        );
        if (currentTokens <= tokenBudget) {
          break;
        }
      }
    }

    return {
      prunedNode: currentTree,
      prunedNodeIds,
      finalTokenEstimate: currentTokens,
      originalTokenEstimate,
      wasPruned: prunedNodeIds.length > 0,
    };
  }

  private static deepCloneNode(node: PromptNode): PromptNode {
    if (
      node.type === 'composite' ||
      typeof (node as unknown as { getChildren?: () => PromptNode[] }).getChildren === 'function'
    ) {
      const originalChildren = (
        node as unknown as { getChildren: () => PromptNode[] }
      ).getChildren();
      const clone = new CompositePromptNode(
        node.id,
        originalChildren.map((child) => this.deepCloneNode(child)),
        node.priority ?? 1
      );
      return clone;
    }

    return {
      id: node.id,
      type: node.type,
      isStatic: node.isStatic,
      priority: node.priority ?? 1,
      render: (ctx: RenderContext) => node.render(ctx),
    };
  }

  private static pruneLevelRecursive(
    parent: PromptNode,
    level: number,
    prunedIds: string[]
  ): boolean {
    if (
      parent.type !== 'composite' &&
      typeof (parent as unknown as { getChildren?: () => PromptNode[] }).getChildren !== 'function'
    ) {
      return false;
    }

    const composite = parent as CompositePromptNode;
    const children = composite.getChildren();
    const newChildren: PromptNode[] = [];
    let modified = false;

    for (const child of children) {
      if ((child.priority ?? 1) === level) {
        prunedIds.push(child.id);
        modified = true;
      } else {
        if (
          child.type === 'composite' ||
          typeof (child as unknown as { getChildren?: () => PromptNode[] }).getChildren === 'function'
        ) {
          const childModified = this.pruneLevelRecursive(child, level, prunedIds);
          if (childModified) modified = true;
        }
        newChildren.push(child);
      }
    }

    if (modified) {
      // Access private children property to update children list
      (composite as unknown as { children: PromptNode[] }).children = newChildren;
      composite.isStatic = newChildren.every((c) => c.isStatic);
    }

    return modified;
  }
}
