import type { CacheAnalysisReport, PromptNodeStats } from './cache-planner';
import type { ProviderCachePolicy } from '../providers/interface';

export class PromptCacheOptimizer {
  /**
   * Generates caching and hierarchy recommendations based on plan results.
   */
  static optimize(
    report: CacheAnalysisReport,
    cachePolicy?: ProviderCachePolicy
  ): { recommendations: string[]; optimized: boolean } {
    const recommendations: string[] = [];

    if (report.hasOrderViolation) {
      recommendations.push(
        'CRITICAL: One or more static nodes are placed after dynamic nodes in the AST tree. This breaks prefix caching. Ensure all static (core) nodes are sorted at the top.'
      );
    }

    if (cachePolicy) {
      if (report.cacheableTokens > 0 && report.cacheableTokens < cachePolicy.minimumPrefixTokens) {
        recommendations.push(
          `WARNING: Static prefix (${report.cacheableTokens.toLocaleString()} tokens) is below the minimum threshold required for this provider (${cachePolicy.minimumPrefixTokens.toLocaleString()} tokens). Caching will not trigger.`
        );
      }
    }

    // Detect duplicate nodes recursively
    const duplicateIds = new Set<string>();
    const scanDuplicates = (stats: PromptNodeStats[]) => {
      for (const node of stats) {
        if (duplicateIds.has(node.id)) {
          recommendations.push(
            `SUGGESTION: Duplicate node ID "${node.id}" detected in prompt AST tree. Consider consolidating instructions to reduce token waste.`
          );
        }
        duplicateIds.add(node.id);
        if (node.children) {
          scanDuplicates(node.children);
        }
      }
    };
    scanDuplicates(report.nodeStats);

    return {
      recommendations,
      optimized: recommendations.length === 0,
    };
  }
}
