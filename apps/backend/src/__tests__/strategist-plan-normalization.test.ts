import { describe, expect, test } from 'vitest';
import {
  extractDraftFromCompositeBlueprint,
  normalizeStrategistPlanResponse,
} from '@/routes/strategist/utils/plan';

describe('strategist plan normalization', () => {
  test('extracts only the article from a composite blueprint draft', () => {
    const composite = [
      '# Blueprint: A focused angle',
      '## Outline',
      '- Opening',
      '## Draft',
      '# Article Title',
      '',
      'Opening paragraph.',
    ].join('\n');

    expect(extractDraftFromCompositeBlueprint(composite))
      .toBe('# Article Title\n\nOpening paragraph.');
  });

  test('normalizes a stringified nested plan and canonical suggestions', () => {
    const result = normalizeStrategistPlanResponse({
      reply: 'Blueprint ready.',
      suggestions: ['Only one'],
      plan: JSON.stringify({
        angle: 'Focused angle',
        audience: 'Editors',
        hook: 'A direct hook.',
        outline: '## Context',
        seoIntent: 'informational',
        sources: ['https://example.com/report'],
        draft: '# Article Title\n\nOpening paragraph.',
      }),
    });

    expect(result?.suggestions).toEqual([
      'Proceed to Editor',
      'Save to Notes',
      'Revise Blueprint',
    ]);
    expect(result?.plan.angle).toBe('Focused angle');
  });

  test('rejects placeholder-quality incomplete plans', () => {
    expect(normalizeStrategistPlanResponse({ plan: { angle: 'Only angle' } })).toBeNull();
  });
});
