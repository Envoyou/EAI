import type { AnalyzeMode } from '@eai/shared';

/** Only new full article analysis/refinement consumes an editorial credit. */
export const isBillableAnalyzeMode = (mode: AnalyzeMode): boolean =>
  mode === 'analyze' || mode === 'refine';
