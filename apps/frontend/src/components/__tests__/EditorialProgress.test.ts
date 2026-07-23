import { describe, expect, it } from 'vitest';
import {
  getVisibleProcessSteps,
  PROCESS_STEPS,
} from '@/components/EditorialProgress';

describe('EditorialProgress stage order', () => {
  it('matches the publish-ready backend workflow', () => {
    expect(PROCESS_STEPS.map((step) => step.stage)).toEqual([
      'reviewing',
      'rewriting',
      'seo',
      'quality_gate',
      'finalizing',
    ]);
  });

  it('omits SEO when fast mode skips metadata generation', () => {
    expect(getVisibleProcessSteps(false).map((step) => step.stage)).toEqual([
      'reviewing',
      'rewriting',
      'quality_gate',
      'finalizing',
    ]);
  });
});
