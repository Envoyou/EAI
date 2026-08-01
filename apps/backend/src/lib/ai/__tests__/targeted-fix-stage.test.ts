import { describe, expect, it } from 'vitest';
import { buildDeterministicSourceNeutralization } from '@/lib/ai/targeted-fix-stage';

describe('targeted source neutralization', () => {
  it('removes an unsupported parenthetical identity without a model rewrite', () => {
    const replacement = buildDeterministicSourceNeutralization({
      targetText: 'Traditional robotic process automation (RPA) follows strict rules.',
      feedback: 'The draft adds an entity not found in the source draft: "RPA".',
      editorInstruction: 'Remove or neutralize the unsupported detail.',
    });

    expect(replacement).toBe('Traditional robotic process automation follows strict rules.');
  });

  it('does not guess when the requested action is not removal', () => {
    const replacement = buildDeterministicSourceNeutralization({
      targetText: 'Traditional robotic process automation (RPA) follows strict rules.',
      feedback: 'The draft adds an entity not found in the source draft: "RPA".',
      editorInstruction: 'Add a supporting source.',
    });

    expect(replacement).toBeNull();
  });
});
