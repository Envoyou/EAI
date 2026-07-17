import { describe, test, expect } from 'vitest';
import { PromptCacheOptimizer } from '../cache-optimizer';
import type { CacheAnalysisReport } from '../cache-planner';

describe('PromptCacheOptimizer', () => {
  test('should generate order violation warning', () => {
    const report: CacheAnalysisReport = {
      totalTokens: 100,
      cacheableTokens: 50,
      dynamicTokens: 50,
      efficiency: 50,
      hasOrderViolation: true,
      nodeStats: [],
    };

    const opt = PromptCacheOptimizer.optimize(report);
    expect(opt.optimized).toBe(false);
    expect(opt.recommendations[0]).toContain('CRITICAL: One or more static nodes are placed after dynamic nodes');
  });

  test('should generate threshold warning when static prefix is below policy minimum', () => {
    const report: CacheAnalysisReport = {
      totalTokens: 50000,
      cacheableTokens: 20000, // below 32,768
      dynamicTokens: 30000,
      efficiency: 40,
      hasOrderViolation: false,
      nodeStats: [],
    };

    const policy = {
      minimumPrefixTokens: 32768,
      prefixOnly: true,
    };

    const opt = PromptCacheOptimizer.optimize(report, policy);
    expect(opt.optimized).toBe(false);
    expect(opt.recommendations[0]).toContain('WARNING: Static prefix');
    expect(opt.recommendations[0]).toContain('below the minimum threshold required');
  });

  test('should report optimized if everything matches expectations', () => {
    const report: CacheAnalysisReport = {
      totalTokens: 50000,
      cacheableTokens: 40000, // above 32,768
      dynamicTokens: 10000,
      efficiency: 80,
      hasOrderViolation: false,
      nodeStats: [],
    };

    const policy = {
      minimumPrefixTokens: 32768,
      prefixOnly: true,
    };

    const opt = PromptCacheOptimizer.optimize(report, policy);
    expect(opt.optimized).toBe(true);
    expect(opt.recommendations).toHaveLength(0);
  });
});
