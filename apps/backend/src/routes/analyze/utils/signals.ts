/**
 * Factual signal detection utilities.
 * Pure functions — no side effects, no external I/O.
 * Extracted from analyze.ts L149–233 (zero logic change).
 */

import type { FeedbackItem } from '@eai/shared';
import type { DraftRiskProfile } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

export const FACTUAL_KEYWORDS = [
  'fakta', 'faktual', 'fact', 'fact-check', 'fact checker', 'verifikasi',
  'verification', 'source', 'sumber', 'referensi', 'rujukan', 'angka',
  'statistik', 'valuasi', 'investment', 'investasi', 'pendapatan', 'revenue',
  'arr', 'nominal', 'jumlah', 'tanggal', 'date', 'klaim',
];

export const FACTUAL_NUMBER_PATTERN = /[$€£¥]|(?:\b\d[\d.,]*\b(?:\s?(?:miliar|juta|triliun|billion|million|trillion|bn|mn|%))?)/i;
export const SENSITIVE_FACTUAL_CONTEXT_PATTERN = /valuasi|investasi|investment|funding|pendanaan|run-rate|pendapatan|revenue|arr|ipo|disclosure|pengungkapan|bloomberg|wall street|google|amazon|anthropic|broadcom|nvidia|trainium|tpu|chip|cloud|gigawatt|\bgw\b|inflasi|qe|quantitative easing|suku bunga|statistik|survei|riset|laporan/i;
export const STRONG_SENSITIVE_FACTUAL_CONTEXT_PATTERN = /valuasi|investasi|investment|funding|pendanaan|run-rate|pendapatan|revenue|arr|ipo|disclosure|pengungkapan|bloomberg|wall street|google|amazon|anthropic|broadcom|nvidia|trainium|tpu|chip|cloud|gigawatt|\bgw\b|statistik|survei|riset|laporan/i;
export const LOW_STAKES_CONSUMER_PATTERN = /kartu kredit|credit card|cashback|miles|mileage|reward|rewards|poin loyalitas|airline miles|travel|auto-pay|merchant|tagihan|limit kartu|slik ojk|paylater|cicilan|bank lokal|lounge|streaming|e-commerce/i;
export const CTA_PATTERN = /baca selengkapnya|read more|pelajari selengkapnya|klik di sini|selengkapnya:/i;
export const STRUCTURAL_FEEDBACK_PATTERN = /pembuka|opening|intro|introduction|hook|judul|headline|penutup|closing|so what|alur|flow|struktur|panjang artikel|terlalu formal|generik|gaya penulisan|tone|terasa seperti/i;
export const SOURCE_SECTION_PATTERN = /(?:^|\n)\s{0,3}(?:#{1,6}\s*)?(?:sumber(?:\s+referensi)?|references?|sources?)\s*:?\s*$/im;
export const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;
export const WEAK_ATTRIBUTION_PATTERN = /menurut banyak analis|dilaporkan|rumor|kabarnya|beredar kabar|sources say|reportedly|rumored|anonymous sources|unconfirmed/i;

// ── Signal detection ──────────────────────────────────────────────────────────

export const containsFactualSignal = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return FACTUAL_KEYWORDS.some((keyword) => normalized.includes(keyword)) || FACTUAL_NUMBER_PATTERN.test(value);
};

export const detectDraftRiskProfile = (text: string): DraftRiskProfile => {
  if (LOW_STAKES_CONSUMER_PATTERN.test(text) && !SOURCE_SECTION_PATTERN.test(text)) {
    return 'low_stakes_consumer';
  }
  return 'general';
};

export const isEditoriallySensitiveClaimText = (value?: string, draftProfile: DraftRiskProfile = 'general'): boolean => {
  if (!value) return false;
  if (CTA_PATTERN.test(value)) return false;
  const sensitivityPattern = draftProfile === 'low_stakes_consumer'
    ? STRONG_SENSITIVE_FACTUAL_CONTEXT_PATTERN
    : SENSITIVE_FACTUAL_CONTEXT_PATTERN;
  const hasSensitiveContext = sensitivityPattern.test(value);
  const hasFactualNumber = FACTUAL_NUMBER_PATTERN.test(value);
  const hasWeakAttribution = WEAK_ATTRIBUTION_PATTERN.test(value);
  return hasSensitiveContext && (hasFactualNumber || hasWeakAttribution);
};

export const detectSourceProvenance = (text: string) => {
  const hasSourceSection = SOURCE_SECTION_PATTERN.test(text);
  const urls = text.match(URL_PATTERN) ?? [];
  const sourceBulletCount = (text.match(/^\s*-\s+\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gm) ?? []).length;
  const weakAttributionCount = (text.match(WEAK_ATTRIBUTION_PATTERN) ?? []).length;

  if (hasSourceSection && (urls.length >= 2 || sourceBulletCount >= 2)) return 'strong' as const;
  if (hasSourceSection || urls.length > 0 || sourceBulletCount > 0) return 'moderate' as const;
  if (weakAttributionCount > 0) return 'weak' as const;
  return 'none' as const;
};

export const isFactualFeedback = (item: FeedbackItem): boolean => [
  item.category,
  item.message,
  item.suggestion,
  item.reason,
  item.targetText,
  item.replacementText,
].some(containsFactualSignal);

export const hasWeakAttributionLanguage = (item: FeedbackItem): boolean => [
  item.message,
  item.suggestion,
  item.reason,
  item.targetText,
].some((value) => WEAK_ATTRIBUTION_PATTERN.test(value ?? ''));

export const isStructuralFeedback = (item: FeedbackItem): boolean =>
  STRUCTURAL_FEEDBACK_PATTERN.test(
    `${item.category ?? ''} ${item.message ?? ''} ${item.suggestion ?? ''} ${item.reason ?? ''}`.toLowerCase()
  );
