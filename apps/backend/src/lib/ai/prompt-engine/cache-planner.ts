import type { PromptNode, RenderContext } from '@eai/shared';
import { PromptTokenEstimator } from './token-estimator';

export interface PromptNodeStats {
  id: string;
  type: string;
  isStatic: boolean;
  estimatedTokens: number;
  children?: PromptNodeStats[];
}

export interface CacheAnalysisReport {
  totalTokens: number;
  cacheableTokens: number;
  dynamicTokens: number;
  efficiency: number;
  hasOrderViolation: boolean;
  nodeStats: PromptNodeStats[];
}

export class PromptCachePlanner {
  /**
   * Runs context caching prefix analysis on a PromptNode.
   * Maps out node hierarchy, calculates token weights, and detects order violations.
   */
  static plan(node: PromptNode, context: RenderContext): CacheAnalysisReport {
    let totalTokens = 0;
    let cacheableTokens = 0;
    let dynamicTokens = 0;
    let hasOrderViolation = false;

    const nodeStats: PromptNodeStats[] = [];

    const traverse = (n: PromptNode, parentList?: PromptNodeStats[]) => {
      const rendered = n.render(context);
      const tokens = PromptTokenEstimator.estimateOffline(rendered);
      
      const stats: PromptNodeStats = {
        id: n.id,
        type: n.type,
        isStatic: n.isStatic,
        estimatedTokens: tokens,
      };

      if (parentList) {
        parentList.push(stats);
      } else {
        nodeStats.push(stats);
      }

      interface CompositeNodeLike {
        getChildren(): PromptNode[];
      }
      if (n.type === 'composite' || typeof (n as unknown as CompositeNodeLike).getChildren === 'function') {
        stats.children = [];
        const children = (n as unknown as CompositeNodeLike).getChildren();
        
        let dynamicFound = false;
        for (const child of children) {
          if (!child.isStatic) {
            dynamicFound = true;
          } else if (child.isStatic && dynamicFound) {
            hasOrderViolation = true;
          }
          traverse(child, stats.children);
        }
      } else {
        totalTokens += tokens;
        if (n.isStatic) {
          cacheableTokens += tokens;
        } else {
          dynamicTokens += tokens;
        }
      }
    };

    traverse(node);

    const efficiency = totalTokens > 0 ? Math.round((cacheableTokens / totalTokens) * 100) : 0;

    return {
      totalTokens,
      cacheableTokens,
      dynamicTokens,
      efficiency,
      hasOrderViolation,
      nodeStats,
    };
  }
}
