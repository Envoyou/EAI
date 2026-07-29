import { describe, expect, it } from 'vitest';
import type { MatchedContentArtifact } from '@eai/shared';
import {
  buildReservationKey,
  classifyContentMatches,
  normalizeContentText,
  tokenSimilarity,
} from '@/lib/content-memory';

const match = (
  overrides: Partial<MatchedContentArtifact> = {}
): MatchedContentArtifact => ({
  id: 'artifact-1',
  title: 'AI untuk Content Marketing',
  topic: 'AI untuk Content Marketing',
  angle: 'Penggunaan AI untuk ide konten',
  status: 'active',
  stage: 'drafting',
  sourceType: 'quick_draft',
  createdAt: '2026-07-29T00:00:00.000Z',
  score: 0.5,
  reasons: [],
  ...overrides,
});

describe('Content Memory deterministic guard', () => {
  it('normalizes punctuation, case, whitespace, and diacritics', () => {
    expect(normalizeContentText('  StratégI—SEO:  UMKM! ')).toBe(
      'strategi seo umkm'
    );
  });

  it('uses a stable tenant reservation fingerprint input', () => {
    const first = buildReservationKey({
      topic: 'AI untuk Content Marketing',
      primaryKeyword: 'AI Content',
      searchIntent: 'Informational',
      audience: 'Marketing Team',
    });
    const second = buildReservationKey({
      topic: ' ai UNTUK content-marketing ',
      primaryKeyword: 'ai content',
      searchIntent: 'informational',
      audience: 'marketing team',
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('measures conceptual token overlap without requiring exact wording', () => {
    expect(
      tokenSimilarity(
        'mengukur ROI AI dalam content marketing',
        'cara mengukur ROI penggunaan AI untuk content marketing'
      )
    ).toBeGreaterThan(0.65);
  });

  it('blocks only deterministic exact duplicates', () => {
    const result = classifyContentMatches([
      match({ score: 1, reasons: ['same_title'] }),
    ]);
    expect(result).toEqual({
      verdict: 'exact_duplicate',
      confidence: 1,
      reasons: ['same_title'],
      recommendedAction: 'block',
    });
  });

  it('keeps high overlap as a repositioning warning', () => {
    const result = classifyContentMatches([
      match({
        score: 0.72,
        reasons: ['same_primary_keyword', 'outline_overlap'],
      }),
    ]);
    expect(result.verdict).toBe('high_overlap');
    expect(result.recommendedAction).toBe('suggest_repositioning');
  });

  it('continues when no relevant candidates exist', () => {
    const result = classifyContentMatches([]);
    expect(result.verdict).toBe('distinct');
    expect(result.recommendedAction).toBe('continue');
  });
});
