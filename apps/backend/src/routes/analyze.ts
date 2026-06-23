import { Router, Request } from 'express';
import { ThinkingLevel } from '@google/genai';
import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@/lib/db';
import {
  getPolishReviewPrompt,
  getPolishedDraftPrompt,
  getPromptForRole,
  getSeoMetadataPrompt,
  getIterativeRefinementPrompt,
  PROMPT_VERSION,
} from '@/lib/prompts';
import { Role, ArticleMetadata, ResponseMode, AnalyzeMode, FeedbackItem, VerificationStatus } from '@eai/shared';
import { FeedbackOutput, PolishDiagnosisOutput, FinalQualityGateOutput } from '@eai/shared';
import { cleanupEscapedMarkdownArtifacts, convertAsciiTablesToMarkdown, stripVerificationMarkers } from '@/lib/final-quality';
import { AiTelemetryCollector, AiTelemetrySnapshot } from '@/lib/ai-telemetry';
import { buildEditorialAuditContext, composeEditorialPrompt, EditorialAuditContext, ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { resolveEditorialProfileForUser } from '@/lib/editorial-profile-server';
import { CmsAdapterError, listPublishedPostsForProfile } from '@/lib/cms-adapter';
import { getWorkspaceState } from '@/lib/user-workspace';
import {
  extractGeminiText,
  gemini,
  getGeminiModelForRole,
  getGeminiSamplingConfig,
  GROQ_MODEL,
  GROQ_SEO_MODEL,
  groq,
} from '@/lib/ai/provider-runtime';
import {
  buildEditorialUserContent,
  withInputBoundaryPolicy,
} from '@/lib/ai/prompt-context';
import { runEditorialReviewStage } from '@/lib/ai/review-stage';
import { runFinalQualityGateSafely } from '@/lib/ai/quality-gate-stage';
import { runTargetedFixStage } from '@/lib/ai/targeted-fix-stage';
import { runSeoStage } from '@/lib/ai/seo-stage';
import { getAllFeatureFlags } from '@eai/shared/server';
import { verifyToken } from '@clerk/backend';

const router = Router();


// Helper delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StructuredFeedbackItem = FeedbackOutput['feedback'][number];
type ReviewOutput = FeedbackOutput | PolishDiagnosisOutput;
type SourceProvenanceLevel = 'none' | 'weak' | 'moderate' | 'strong';
type DraftRiskProfile = 'general' | 'low_stakes_consumer';

const MAX_SUMMARY_LENGTH = 280;
const ACTIVE_PROVIDER = process.env.ACTIVE_AI_PROVIDER || 'gemini';

const buildStoredMetadata = (
  metadata: ArticleMetadata | undefined,
  responseMode: ResponseMode,
  polishedDraft?: string,
  sourceRef?: string,
  generatedMetadata?: Record<string, unknown>,
  analysisSpeed?: 'fast' | 'balanced' | 'deep',
  finalQualityGate?: FinalQualityGateOutput | null,
  telemetry?: AiTelemetrySnapshot,
  editorialAudit?: EditorialAuditContext
) => ({
  ...(metadata ?? {}),
  sourceRef: sourceRef || metadata?.sourceRef,
  generatedMetadata: generatedMetadata || (metadata as Record<string, unknown>)?.generatedMetadata,
  _system: {
    responseMode,
    polishedDraft,
    analysisSpeed,
    readiness: finalQualityGate?.readiness,
    refinementChanges: finalQualityGate?.changes,
    telemetry,
    editorialProfile: editorialAudit,
  },
});

const INTERNAL_LINK_STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'cara',
  'mengapa', 'bagaimana', 'adalah', 'akan', 'lebih', 'terbesar', 'terbaru',
  'analisis', 'panduan', 'strategi', 'masa', 'depan', 'tahun', 'envoyou',
  'tipping', 'point', 'wajib', 'dikuasai', 'modern', 'terkini',
]);

const getInternalLinkTerms = (value: string) =>
  Array.from(new Set(
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 4 && !INTERNAL_LINK_STOPWORDS.has(term)) ?? []
  ));

const INTERNAL_LINK_TOPIC_FAMILIES = {
  ai: ['agi', 'artificial', 'kecerdasan', 'llm', 'machine', 'model', 'openai', 'anthropic', 'algoritma'],
  energy: ['energi', 'energy', 'hidrogen', 'hydrogen', 'shell', 'minyak', 'gas', 'surya', 'baterai'],
  finance: ['investasi', 'keuangan', 'finansial', 'pasar', 'portofolio', 'saham', 'modal', 'fintech'],
  creator: ['kreator', 'creator', 'konten', 'youtube', 'tiktok', 'branding', 'audiens'],
  geopolitics: ['geopolitik', 'perdagangan', 'fragmentasi', 'rantai', 'koridor', 'globalisasi', 'imf'],
} as const;

const getInternalLinkTopicFamilies = (value: string) => {
  const terms = new Set(getInternalLinkTerms(value));
  return new Set(
    Object.entries(INTERNAL_LINK_TOPIC_FAMILIES)
      .filter(([, familyTerms]) => familyTerms.some((term) => terms.has(term)))
      .map(([family]) => family)
  );
};

const selectRelevantPublishedPosts = (
  draft: string,
  posts: { title: string; slug: string }[]
) => {
  const draftTerms = new Set(getInternalLinkTerms(draft));
  const draftTopics = getInternalLinkTopicFamilies(draft);

  return posts
    .map((post) => {
      const slugTerms = getInternalLinkTerms(post.slug.replace(/-/g, ' '));
      const terms = getInternalLinkTerms(`${post.title} ${post.slug.replace(/-/g, ' ')}`);
      const matchedTerms = terms.filter((term) => draftTerms.has(term));
      const postTopics = getInternalLinkTopicFamilies(`${post.title} ${post.slug.replace(/-/g, ' ')}`);
      const hasTopicConflict = postTopics.size > 0
        && draftTopics.size > 0
        && !Array.from(postTopics).some((topic) => draftTopics.has(topic));
      return {
        post,
        score: matchedTerms.length,
        slugTermCount: slugTerms.length,
        hasTopicConflict,
      };
    })
    .filter(({ score, slugTermCount, hasTopicConflict }) =>
      score >= 3 && slugTermCount >= 2 && !hasTopicConflict
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ post }) => post);
};

const FACTUAL_KEYWORDS = [
  'fakta', 'faktual', 'fact', 'fact-check', 'fact checker', 'verifikasi',
  'verification', 'source', 'sumber', 'referensi', 'rujukan', 'angka',
  'statistik', 'valuasi', 'investment', 'investasi', 'pendapatan', 'revenue',
  'arr', 'nominal', 'jumlah', 'tanggal', 'date', 'klaim',
];

const FACTUAL_NUMBER_PATTERN = /[$€£¥]|(?:\b\d[\d.,]*\b(?:\s?(?:miliar|juta|triliun|billion|million|trillion|bn|mn|%))?)/i;
const SENSITIVE_FACTUAL_CONTEXT_PATTERN = /valuasi|investasi|investment|funding|pendanaan|run-rate|pendapatan|revenue|arr|ipo|disclosure|pengungkapan|bloomberg|wall street|google|amazon|anthropic|broadcom|nvidia|trainium|tpu|chip|cloud|gigawatt|\bgw\b|inflasi|qe|quantitative easing|suku bunga|statistik|survei|riset|laporan/i;
const STRONG_SENSITIVE_FACTUAL_CONTEXT_PATTERN = /valuasi|investasi|investment|funding|pendanaan|run-rate|pendapatan|revenue|arr|ipo|disclosure|pengungkapan|bloomberg|wall street|google|amazon|anthropic|broadcom|nvidia|trainium|tpu|chip|cloud|gigawatt|\bgw\b|statistik|survei|riset|laporan/i;
const LOW_STAKES_CONSUMER_PATTERN = /kartu kredit|credit card|cashback|miles|mileage|reward|rewards|poin loyalitas|airline miles|travel|auto-pay|merchant|tagihan|limit kartu|slik ojk|paylater|cicilan|bank lokal|lounge|streaming|e-commerce/i;
const CTA_PATTERN = /baca selengkapnya|read more|pelajari selengkapnya|klik di sini|selengkapnya:/i;
const STRUCTURAL_FEEDBACK_PATTERN = /pembuka|opening|intro|introduction|hook|judul|headline|penutup|closing|so what|alur|flow|struktur|panjang artikel|terlalu formal|generik|gaya penulisan|tone|terasa seperti/i;
const NEUTRAL_FACTUAL_MESSAGE = 'This factual claim involves a sensitive number and should be verified against the cited source before publication.';
const NEUTRAL_FACTUAL_SUGGESTION = 'Verify this against the reference source before publication and consider adding a direct link or more precise attribution for the number.';
const NEUTRAL_FACTUAL_REASON = 'This claim needs stronger citation support, and the final wording should remain neutral until the primary source is verified.';
const NEUTRAL_FACTUAL_SUMMARY = 'This draft contains several sensitive factual claims that need verification against cited sources and more precise attribution before publication.';
const SOURCE_BACKED_FACTUAL_MESSAGE = 'This claim is supported by an external source listed in the draft. Consider verifying it against primary reporting or an official disclosure before publication.';
const SOURCE_BACKED_FACTUAL_SUGGESTION = 'If available, add a direct link to primary reporting, official disclosure, or a more precise source quote to strengthen this claim\'s provenance.';
const SOURCE_BACKED_FACTUAL_REASON = 'This claim has visible external provenance in the draft, but primary-source verification can still strengthen editorial confidence.';
const SOURCE_BACKED_FACTUAL_SUMMARY = 'This draft contains several sensitive factual claims supported by external sources listed in the draft. Consider primary reporting or official disclosure verification before publication.';
const VERIFICATION_NOTES_HEADING = '## Verification Notes';
const VERIFICATION_LOCK_START = '[[VERIFICATION_LOCK_START]]';
const VERIFICATION_LOCK_END = '[[VERIFICATION_LOCK_END]]';
const SOURCE_SECTION_PATTERN = /(?:^|\n)\s{0,3}(?:#{1,6}\s*)?(?:sumber(?:\s+referensi)?|references?|sources?)\s*:?\s*$/im;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;
const WEAK_ATTRIBUTION_PATTERN = /menurut banyak analis|dilaporkan|rumor|kabarnya|beredar kabar|sources say|reportedly|rumored|anonymous sources|unconfirmed/i;

const containsFactualSignal = (value?: string) => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return FACTUAL_KEYWORDS.some((keyword) => normalized.includes(keyword)) || FACTUAL_NUMBER_PATTERN.test(value);
};

const detectDraftRiskProfile = (text: string): DraftRiskProfile => {
  if (LOW_STAKES_CONSUMER_PATTERN.test(text) && !SOURCE_SECTION_PATTERN.test(text)) {
    return 'low_stakes_consumer';
  }
  return 'general';
};

const isEditoriallySensitiveClaimText = (value?: string, draftProfile: DraftRiskProfile = 'general') => {
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

const detectSourceProvenance = (text: string): SourceProvenanceLevel => {
  const hasSourceSection = SOURCE_SECTION_PATTERN.test(text);
  const urls = text.match(URL_PATTERN) ?? [];
  const sourceBulletCount = (text.match(/^\s*-\s+\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gm) ?? []).length;
  const weakAttributionCount = (text.match(WEAK_ATTRIBUTION_PATTERN) ?? []).length;

  if (hasSourceSection && (urls.length >= 2 || sourceBulletCount >= 2)) return 'strong';
  if (hasSourceSection || urls.length > 0 || sourceBulletCount > 0) return 'moderate';
  if (weakAttributionCount > 0) return 'weak';
  return 'none';
};

const isFactualFeedback = (item: FeedbackItem) => [
  item.category,
  item.message,
  item.suggestion,
  item.reason,
  item.targetText,
  item.replacementText,
].some(containsFactualSignal);

const hasWeakAttributionLanguage = (item: FeedbackItem) => [
  item.message,
  item.suggestion,
  item.reason,
  item.targetText,
].some((value) => WEAK_ATTRIBUTION_PATTERN.test(value ?? ''));

const isStructuralFeedback = (item: FeedbackItem) =>
  STRUCTURAL_FEEDBACK_PATTERN.test(
    `${item.category ?? ''} ${item.message ?? ''} ${item.suggestion ?? ''} ${item.reason ?? ''}`.toLowerCase()
  );

const normalizeTargetLookup = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const targetExistsInDraft = (draftText: string, targetText?: string) => {
  const target = targetText?.trim();
  if (!target) return false;
  if (target.includes('...')) return false;
  if (draftText.includes(target)) return true;
  return normalizeTargetLookup(draftText).includes(normalizeTargetLookup(target));
};

const splitIntoSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const findBestFactualTarget = (paragraph: string, draftProfile: DraftRiskProfile) => {
  const sentences = splitIntoSentences(paragraph);
  return sentences.find((sentence) => isEditoriallySensitiveClaimText(sentence, draftProfile))
    ?? sentences.find(containsFactualSignal)
    ?? paragraph;
};

const inferTargetTextFromDraft = (item: FeedbackItem, draftText: string) => {
  const draftProfile = detectDraftRiskProfile(draftText);
  if (targetExistsInDraft(draftText, item.targetText)) return item.targetText!.trim();

  const paragraphs = draftText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (isFactualFeedback(item) && !isStructuralFeedback(item)) {
    const factualParagraph = paragraphs.find((paragraph) =>
      isEditoriallySensitiveClaimText(paragraph, draftProfile)
    );
    if (factualParagraph) return findBestFactualTarget(factualParagraph, draftProfile);
  }

  return undefined;
};

const hasFactualAutoReplaceRisk = (item: FeedbackItem) => {
  if (!item.targetText || !item.replacementText) return false;
  if (item.operation !== 'replace') return false;

  const targetHasSignal = containsFactualSignal(item.targetText);
  const replacementHasSignal = containsFactualSignal(item.replacementText);
  const itemHasSignal = [
    item.category,
    item.message,
    item.suggestion,
    item.reason,
  ].some(containsFactualSignal);

  return targetHasSignal || replacementHasSignal || itemHasSignal;
};

const isSensitiveFactualFeedback = (item: FeedbackItem, draftText: string) => {
  const draftProfile = detectDraftRiskProfile(draftText);
  if (!isFactualFeedback(item)) return false;
  if (!(item.status === 'fail' || item.status === 'warning')) return false;
  if (isStructuralFeedback(item)) return false;

  return [
    item.targetText,
    item.replacementText,
    item.message,
    item.suggestion,
    item.reason,
    item.category,
  ].some((value) => isEditoriallySensitiveClaimText(value, draftProfile));
};

const inferVerificationStatus = (item: FeedbackItem, draftText: string): VerificationStatus | undefined => {
  if (!isSensitiveFactualFeedback(item, draftText)) return item.verificationStatus;
  const provenance = detectSourceProvenance(draftText);
  const weakAttribution = hasWeakAttributionLanguage(item);

  if (provenance === 'strong') {
    return weakAttribution ? 'needs_citation' : 'source_backed';
  }

  if (provenance === 'moderate') {
    return 'needs_citation';
  }

  if (item.status === 'fail' || provenance === 'weak' || provenance === 'none') {
    return 'high_risk_factual_claim';
  }

  if (item.status === 'warning') return 'needs_citation';
  return 'source_backed';
};

const getProtectedVerificationClaims = (feedback: FeedbackItem[] = []) =>
  feedback.filter((item) => item.verificationStatus === 'high_risk_factual_claim' && Boolean(item.targetText?.trim()));

const toStructuredFeedbackItem = (item: FeedbackItem): StructuredFeedbackItem => ({
  category: item.category,
  status: item.status,
  verificationStatus: item.verificationStatus,
  message: item.message,
  suggestion: item.suggestion,
  targetText: item.targetText,
  replacementText: item.replacementText,
  reason: item.reason,
  operation: item.operation ?? 'manual',
});

const sanitizeFactualFeedbackItem = (item: FeedbackItem, draftText: string): StructuredFeedbackItem => {
  let nextItem = item;
  const inferredTargetText = inferTargetTextFromDraft(nextItem, draftText);
  const candidateSensitiveText = inferredTargetText
    ?? nextItem.targetText
    ?? nextItem.message
    ?? nextItem.suggestion
    ?? nextItem.reason;

  if (hasFactualAutoReplaceRisk(nextItem)) {
    nextItem = {
      ...nextItem,
      operation: 'manual',
      suggestion: nextItem.suggestion
        ?? 'Do not change this data automatically. Verify it against the primary source or references listed in the draft.',
      reason: nextItem.reason
        ?? 'A factual change is high-risk if it relies only on model memory and must be manually verified.',
      targetText: undefined,
      replacementText: undefined,
    };
  }

  const nextItemWithTarget = {
    ...nextItem,
    targetText: inferredTargetText ?? nextItem.targetText,
  };
  const draftProfile = detectDraftRiskProfile(draftText);
  const shouldNeutralizeWording = isSensitiveFactualFeedback(nextItemWithTarget, draftText);
  const verificationStatus = inferVerificationStatus(nextItemWithTarget, draftText);

  if (!shouldNeutralizeWording) {
    return toStructuredFeedbackItem({
      ...nextItemWithTarget,
      verificationStatus: isEditoriallySensitiveClaimText(candidateSensitiveText, draftProfile) ? verificationStatus : undefined,
    });
  }

  const neutralCopy = verificationStatus === 'source_backed'
    ? {
        message: SOURCE_BACKED_FACTUAL_MESSAGE,
        suggestion: SOURCE_BACKED_FACTUAL_SUGGESTION,
        reason: SOURCE_BACKED_FACTUAL_REASON,
      }
    : {
        message: NEUTRAL_FACTUAL_MESSAGE,
        suggestion: NEUTRAL_FACTUAL_SUGGESTION,
        reason: NEUTRAL_FACTUAL_REASON,
      };

  return toStructuredFeedbackItem({
    ...nextItemWithTarget,
    operation: 'manual',
    verificationStatus,
    message: neutralCopy.message,
    suggestion: neutralCopy.suggestion,
    reason: neutralCopy.reason,
    replacementText: undefined,
  });
};

const sanitizeSuppressiveFeedbackItem = (item: FeedbackItem, draftText: string): StructuredFeedbackItem => {
  if (!shouldSuppressFeedbackTarget(item)) {
    return sanitizeFactualFeedbackItem(item, draftText);
  }

  const inferredTargetText = inferTargetTextFromDraft(item, draftText);
  return toStructuredFeedbackItem({
    ...item,
    operation: 'manual',
    targetText: inferredTargetText ?? item.targetText,
    replacementText: undefined,
  });
};

const truncateSummary = (summary: string, maxLength: number = MAX_SUMMARY_LENGTH) => {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const suffix = '...';
  const hardLimit = maxLength - suffix.length;
  const clipped = normalized.slice(0, hardLimit).replace(/\s+\S*$/, '').trim();
  return `${clipped || normalized.slice(0, hardLimit).trim()}${suffix}`;
};

const sanitizeFactualSummary = (summary: string, feedback: FeedbackItem[], draftText: string) => {
  const hasFactualFeedback = feedback.some((item) => isSensitiveFactualFeedback(item, draftText));

  if (!hasFactualFeedback) return truncateSummary(summary);
  const provenance = detectSourceProvenance(draftText);
  if (provenance === 'strong' || provenance === 'moderate') {
    return truncateSummary(SOURCE_BACKED_FACTUAL_SUMMARY);
  }
  return truncateSummary(NEUTRAL_FACTUAL_SUMMARY);
};

const getVerificationInlineLabel = (status?: VerificationStatus) => {
  if (status === 'source_backed') return '[Externally sourced claim — verify primary reporting if needed.]';
  if (status === 'high_risk_factual_claim') return '[Source verification recommended]';
  if (status === 'needs_citation') return '[Citation recommended]';
  return null;
};

const cleanupVerificationLocks = (text: string) =>
  text
    .replaceAll(VERIFICATION_LOCK_START, '')
    .replaceAll(VERIFICATION_LOCK_END, '');

const stripGeneratedVerificationNotes = (text: string) =>
  cleanupVerificationLocks(text)
    .replace(new RegExp(`\\n\\n${VERIFICATION_NOTES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*$`), '')
    .trimEnd();

const preparePublicationDraft = (text: string) =>
  removeEmptyHeadings(
    cleanupRewriteArtifacts(
      stripVerificationMarkers(stripGeneratedVerificationNotes(text))
    )
  );

const makeVerificationSnippet = (value?: string) => {
  if (!value) return 'Sensitive claim in this section';
  const compact = value
    .replace(/^>\s*/gm, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
};

const ensureTitleAndOpening = (refinedText: string, sourceText: string) => {
  const cleanedRefined = refinedText.trim();
  if (!cleanedRefined) return refinedText;

  const sourceParagraphs = sourceText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (sourceParagraphs.length === 0) return refinedText;

  const firstSourceParagraph = sourceParagraphs[0] ?? '';
  const hasStandaloneTitle = firstSourceParagraph.length > 0
    && firstSourceParagraph.length <= 140
    && !/[.!?]$/.test(firstSourceParagraph);
  const sourceTitle = hasStandaloneTitle ? firstSourceParagraph : undefined;
  const sourceOpeningParagraphs = sourceParagraphs.slice(sourceTitle ? 1 : 0, sourceTitle ? 3 : 2).filter(Boolean);

  const refinedParagraphs = cleanedRefined.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const hasOpeningParagraphBeforeSection = refinedParagraphs.slice(0, 3).some((paragraph) =>
    !/^(#|---)/.test(paragraph) && !paragraph.includes('|')
  );

  if (hasOpeningParagraphBeforeSection) return refinedText;

  const injectedBlocks: string[] = [];
  if (!hasOpeningParagraphBeforeSection) {
    injectedBlocks.push(...sourceOpeningParagraphs);
  }

  if (injectedBlocks.length === 0) return refinedText;
  return `${injectedBlocks.join('\n\n')}\n\n${cleanedRefined}`.trim();
};

const extractFallbackVerificationSnippetFromFinalText = (item: FeedbackItem, finalText?: string) => {
  const paragraphs = (finalText ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const matchedParagraph = item.targetText?.trim()
    ? paragraphs.find((paragraph) => paragraph.includes(item.targetText!.trim()))
    : undefined;

  if (matchedParagraph) return matchedParagraph;

  const factualParagraph = paragraphs.find((paragraph) =>
    isEditoriallySensitiveClaimText(paragraph, detectDraftRiskProfile(finalText ?? ''))
  );
  if (factualParagraph) return factualParagraph;

  return undefined;
};

const buildVerificationFallbackNote = (item: FeedbackItem, finalText?: string) => {
  const label = getVerificationInlineLabel(item.verificationStatus) ?? '[Source verification recommended]';
  const snippet = extractFallbackVerificationSnippetFromFinalText(item, finalText)
    || (item.targetText?.trim() && finalText?.includes(item.targetText.trim()) ? item.targetText.trim() : undefined)
    || item.message?.trim()
    || (item.verificationStatus === 'needs_citation'
      ? 'Sensitive claim in this article would benefit from a direct citation'
      : 'Sensitive figure or claim in this article requires source verification');
  return `- ${label} ${makeVerificationSnippet(snippet)}.`;
};

const shouldSuppressFeedbackTarget = (item: FeedbackItem) => {
  const combined = `${item.message ?? ''} ${item.suggestion ?? ''}`.toLowerCase();
  return /\b(hapus paragraf|remove paragraph|hilangkan bagian|jangan sertakan)\b/i.test(combined);
};

const removeDisallowedRefineTargets = (text: string, feedback: FeedbackItem[] = []) => {
  const disallowedTargets = feedback
    .filter((item) => shouldSuppressFeedbackTarget(item) && Boolean(item.targetText?.trim()))
    .map((item) => item.targetText!.trim());

  if (disallowedTargets.length === 0) return text;

  const paragraphs = text.split(/\n\s*\n/);
  const filtered = paragraphs.filter((paragraph) =>
    !disallowedTargets.some((target) => paragraph.includes(target))
  );

  return filtered.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
};

const getAnnotatableVerificationCandidates = (feedback: FeedbackItem[] = []) =>
  feedback.filter((item) =>
    Boolean(getVerificationInlineLabel(item.verificationStatus))
    && !shouldSuppressFeedbackTarget(item)
  );

const removeEmptyHeadings = (text: string) => {
  const lines = text.split('\n');
  const cleaned: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const trimmed = currentLine.trim();
    const isHeading = /^(##|###)\s+/.test(trimmed);

    if (!isHeading) {
      cleaned.push(currentLine);
      continue;
    }

    let hasContentAhead = false;
    for (let j = i + 1; j < lines.length; j++) {
      const lookahead = lines[j].trim();
      if (!lookahead) continue;
      if (/^(##|###)\s+/.test(lookahead)) break;
      if (/^---$/.test(lookahead)) break;
      hasContentAhead = true;
      break;
    }

    if (hasContentAhead) {
      cleaned.push(currentLine);
    }
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const cleanupRewriteArtifacts = (text: string) =>
  cleanupEscapedMarkdownArtifacts(convertAsciiTablesToMarkdown(text))
    .replace(/\b(paruh\s+(?:pertama|kedua))\s+\1\b/gi, '$1')
    .replace(/\b(paruh\s+(?:pertama|kedua)\s+\d{4})\s+\1\b/gi, '$1')
    .replace(/\$\s*(\d+)\s*-\s*(miliar|juta|triliun)\b/gi, '$$$1 $2')
    .replace(/\$\s*(\d+)\s*miar\b/gi, '$$$1 miliar')
    .replace(/\$\s*(\d+)\s*miilar\b/gi, '$$$1 miliar')
    .replace(/\bdibenankan\b/gi, 'dibelanjakan')
    .replace(/\bsikit\b/gi, 'sirkuit');

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractFinancialEntities = (text: string) => {
  const patterns = [
    /\$[\d,.]+(?:\s*(?:miliar|juta|triliun|billion|million|trillion|bn|mn))?/gi,
    /\b[\d,.]+\s*(?:GW|MW|TB|PB)\b/gi,
    /\b[\d,.]+\s*Gigawatt(?:\s*\(GW\))?\b/gi,
    /\b[\d,.]+\s*%\b/gi,
  ];
  const matches = patterns.flatMap((pattern) => text.match(pattern) ?? []);
  return Array.from(new Set(matches.map((match) => match.trim()))).sort((a, b) => b.length - a.length);
};

const autoLockFinancialEntities = (text: string) => {
  let nextText = text;

  extractFinancialEntities(text).forEach((entity) => {
    const escapedEntity = escapeRegExp(entity);
    const lockPattern = new RegExp(`${escapeRegExp(VERIFICATION_LOCK_START)}${escapedEntity}${escapeRegExp(VERIFICATION_LOCK_END)}`);
    if (lockPattern.test(nextText)) return;

    nextText = nextText.replace(
      new RegExp(escapedEntity, 'g'),
      `${VERIFICATION_LOCK_START}$&${VERIFICATION_LOCK_END}`
    );
  });

  return nextText;
};

const applyVerificationLocks = (text: string, feedback: FeedbackItem[] = []) => {
  let nextText = autoLockFinancialEntities(text);
  const protectedClaims = getProtectedVerificationClaims(feedback);

  protectedClaims.forEach((item) => {
    const targetText = item.targetText?.trim();
    if (!targetText) return;
    if (nextText.includes(`${VERIFICATION_LOCK_START}${targetText}${VERIFICATION_LOCK_END}`)) return;
    nextText = nextText.replace(targetText, `${VERIFICATION_LOCK_START}${targetText}${VERIFICATION_LOCK_END}`);
  });

  return nextText;
};

const applyVerificationAnnotations = (text: string, feedback: FeedbackItem[] = []) => {
  const sanitizedBaseText = removeDisallowedRefineTargets(stripGeneratedVerificationNotes(text), feedback);
  const candidates = getAnnotatableVerificationCandidates(feedback);

  if (candidates.length === 0) return removeEmptyHeadings(cleanupRewriteArtifacts(sanitizedBaseText));

  let nextText = sanitizedBaseText;
  const unmatchedNotes: string[] = [];

  candidates.forEach((item) => {
    const label = getVerificationInlineLabel(item.verificationStatus);
    const targetText = item.targetText?.trim();
    if (!label) return;
    if (!targetText) {
      unmatchedNotes.push(buildVerificationFallbackNote(item, nextText));
      return;
    }

    const targetIndex = nextText.indexOf(targetText);
    if (targetIndex === -1) {
      unmatchedNotes.push(buildVerificationFallbackNote(item, nextText));
      return;
    }

    const insertionPoint = targetIndex + targetText.length;
    const nearbySlice = nextText.slice(insertionPoint, insertionPoint + 80);
    if (nearbySlice.includes(label)) return;

    nextText = `${nextText.slice(0, insertionPoint)}${label}${nextText.slice(insertionPoint)}`;
  });

  nextText = removeDisallowedRefineTargets(nextText, feedback);
  if (unmatchedNotes.length === 0) return removeEmptyHeadings(cleanupRewriteArtifacts(nextText));

  const dedupedNotes = Array.from(new Set(unmatchedNotes));
  return removeEmptyHeadings(
    cleanupRewriteArtifacts(`${nextText.trimEnd()}\n\n${VERIFICATION_NOTES_HEADING}\n${dedupedNotes.join('\n')}`)
  );
};

const getRewriteOutputTokens = (text: string, isSingleChunk: boolean = false) => {
  if (isSingleChunk) return 8192;
  const estimatedTokens = Math.ceil(text.length / 3.5);
  return Math.min(Math.max(Math.ceil(estimatedTokens * 2.5) + 1000, 2500), 4500);
};

const REWRITE_CHUNK_MAX_CHARS = 6000;

const splitDraftIntoRewriteChunks = (text: string) => {
  const sections = text
    .split(/(?=^##\s)/m)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length <= 1) {
    const paragraphs = text
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let currentChunk = '';

    paragraphs.forEach((paragraph) => {
      const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      if (candidate.length > REWRITE_CHUNK_MAX_CHARS && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        currentChunk = candidate;
      }
    });

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  const chunks: string[] = [];
  let currentChunk = '';

  sections.forEach((section) => {
    const candidate = currentChunk ? `${currentChunk}\n\n${section}` : section;
    if (candidate.length > REWRITE_CHUNK_MAX_CHARS && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = section;
    } else {
      currentChunk = candidate;
    }
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
};

async function createAnalysisLogAndDebitCredit(data: {
  userId: string;
  organizationId: string | null;
  role: Role | 'unknown' | 'refine';
  content: string;
  metadata: unknown;
  promptVersion: string;
  modelName: string;
  score: number | undefined;
  verdict: string;
  summary: string;
  feedback: unknown;
  flags: unknown;
  status: Prisma.AnalysisLogUncheckedCreateInput['status'];
  editorStatus: string;
  editorialProfileVersionId: string | null;
  editorialProfileKey: string | null;
  editorialProfileVersionNo: number | null;
  coreGuardrailsVersion: string | null;
  promptConfigurationHash: string | null;
  telemetrySnapshot: AiTelemetrySnapshot;
}) {
  return await prisma.$transaction(async (tx) => {
    const savedLog = await tx.analysisLog.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        role: data.role,
        content: data.content,
        metadata: data.metadata as Prisma.InputJsonValue,
        promptVersion: data.promptVersion,
        modelName: data.modelName,
        score: data.score,
        verdict: data.verdict,
        summary: data.summary,
        feedback: data.feedback as Prisma.InputJsonValue,
        flags: data.flags as Prisma.InputJsonValue,
        status: data.status,
        editorStatus: data.editorStatus,
        editorialProfileVersionId: data.editorialProfileVersionId,
        editorialProfileKey: data.editorialProfileKey,
        editorialProfileVersionNo: data.editorialProfileVersionNo,
        coreGuardrailsVersion: data.coreGuardrailsVersion,
        promptConfigurationHash: data.promptConfigurationHash,
      },
    });

    const activeSub = await tx.subscription.findFirst({
      where: {
        userId: data.organizationId ? undefined : data.userId,
        organizationId: data.organizationId || undefined,
        status: 'active',
        currentPeriodEnd: { gt: new Date() },
      },
    });

    const transactions = await tx.creditTransaction.groupBy({
      by: ['bucket'],
      where: {
        userId: data.organizationId ? undefined : data.userId,
        organizationId: data.organizationId || undefined,
      },
      _sum: {
        amount: true,
      },
    });

    const trialBalance = transactions.find((t) => t.bucket === 'trial')?._sum.amount ?? 0;
    const subBalance = transactions.find((t) => t.bucket === 'subscription')?._sum.amount ?? 0;
    const addonBalance = transactions.find((t) => t.bucket === 'addon')?._sum.amount ?? 0;

    let chosenBucket: 'trial' | 'subscription' | 'addon';
    if (trialBalance > 0) {
      chosenBucket = 'trial';
    } else if (activeSub && subBalance > 0) {
      chosenBucket = 'subscription';
    } else if (addonBalance > 0) {
      chosenBucket = 'addon';
    } else {
      chosenBucket = activeSub ? 'subscription' : 'addon';
    }

    await tx.creditTransaction.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        type: 'article_refine',
        bucket: chosenBucket,
        amount: -1,
        analysisLogId: savedLog.id,
        idempotencyKey: `usage:${savedLog.id}`,
        description: `Refined draft for article (Log ID: ${savedLog.id})`,
      },
    });

    const inputTokens = data.telemetrySnapshot.inputTokens;
    const outputTokens = data.telemetrySnapshot.outputTokens;
    const costEstimate = (inputTokens * 0.00000015) + (outputTokens * 0.00000060);

    await tx.creditUsage.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        analysisLogId: savedLog.id,
        creditsConsumed: 1,
        costEstimate: Number(costEstimate.toFixed(6)),
      },
    });

    return savedLog;
  });
}

// Manual helper for cookies
const parseCookies = (cookieHeader?: string) => {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    list[parts.shift()!.trim()] = decodeURI(parts.join('='));
  });
  return list;
};

// POST /api/analyze
router.post('/', async (req: Request, res) => {
  // ── PRE-FLIGHT CHECKS (must happen before SSE headers are flushed) ──────────

  const featureFlags = await getAllFeatureFlags();
  if (featureFlags.maintenance_mode || !featureFlags.ai_processing_enabled) {
    res.status(503).json({
      error: featureFlags.maintenance_mode
        ? 'Editorial processing is temporarily paused for maintenance.'
        : 'AI processing is temporarily disabled.',
    });
    return;
  }

  // Auth (optional — guests are allowed for demo)
  let userId: string | null = null;
  let orgId: string | null = null;
  let orgSlug: string | null = null;
  let orgRole: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      userId = payload.sub;
      orgId = (payload.org_id as string) || null;
      orgSlug = (payload.org_slug as string) || null;
      orgRole = (payload.org_role as string) || null;
    } catch (authError) {
      console.warn('[Analyze Auth] Token verification failed:', authError);
    }
  }

  let workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
  let editorialProfile = ENVOYOU_EDITORIAL_PROFILE;

  if (!userId) {
    if (!featureFlags.demo_enabled) {
      res.status(403).json({ error: 'Demo access is currently unavailable. Please log in.' });
      return;
    }

    // Guest / Demo Mode rate limiting — check AND set cookie BEFORE SSE opens
    const cookies = parseCookies(req.headers.cookie);
    const demoCountStr = cookies['eai_demo_count'];
    const demoCount = demoCountStr ? parseInt(demoCountStr, 10) : 0;

    if (demoCount >= 2) {
      res.status(429).json({ error: 'Create a free account to continue. Get 10 free Editorial Credits.' });
      return;
    }

    const nextCount = demoCount + 1;
    // Set cookie BEFORE flushHeaders so the header can still be written
    res.cookie('eai_demo_count', nextCount.toString(), {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });

    workspace = {
      role: 'guest',
      organizationId: null,
      organization: {
        id: 'demo',
        clerkOrganizationId: null,
        slug: 'demo',
        name: 'Demo Workspace',
        publicationName: 'Demo Publication',
        domain: null,
        isActive: true,
        onboardingStatus: 'completed',
        profiles: [],
      },
      isAdmin: false,
      needsOnboarding: false,
      plan: {
        maxTextLength: 5000,
        creditsRemaining: 10,
        activePlan: 'free',
        subscriptionStatus: 'none',
      },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
  } else {
    const fetchedWorkspace = await getWorkspaceState(userId, {
      clerkOrganizationId: orgId,
      clerkOrganizationSlug: orgSlug,
      clerkOrganizationRole: orgRole,
    });
    if (!fetchedWorkspace || fetchedWorkspace.needsOnboarding) {
      res.status(403).json({ error: 'Workspace onboarding must be completed before analysis.' });
      return;
    }
    workspace = fetchedWorkspace;

    if (workspace.plan && typeof workspace.plan.creditsRemaining === 'number' && workspace.plan.creditsRemaining <= 0) {
      res.status(402).json({ error: 'You do not have enough credits. Purchase additional credits or upgrade your plan to continue.' });
      return;
    }

    try {
      editorialProfile = await resolveEditorialProfileForUser(userId, workspace.organizationId);
    } catch (profileError) {
      if (workspace.organization?.slug !== 'envoyou') {
        console.error('[Editorial Profile] Tenant profile resolution failed:', profileError);
        res.status(500).json({ error: 'Active editorial profile could not be resolved.' });
        return;
      }
      console.warn('[Editorial Profile] Falling back to Envoyou v1:', profileError);
    }
  }

  // ── All pre-flight checks passed — now open SSE stream ──────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type: string, data: unknown) => {
    res.write(JSON.stringify({ type, data }) + '\n');
  };

  const composePrompt = (prompt: string) =>
    withInputBoundaryPolicy(composeEditorialPrompt(prompt, editorialProfile));

  const editorialAudit = buildEditorialAuditContext(editorialProfile, PROMPT_VERSION);
  const editorialLogFields = {
    editorialProfileVersionId: editorialAudit.editorialProfileVersionId ?? null,
    editorialProfileKey: editorialAudit.editorialProfileKey ?? null,
    editorialProfileVersionNo: editorialAudit.editorialProfileVersion ?? null,
    coreGuardrailsVersion: editorialAudit.coreGuardrailsVersion ?? null,
    promptConfigurationHash: editorialAudit.promptConfigurationHash ?? null,
  };

  let textToLog: string;
  let roleToLog: Role | 'unknown' | 'refine';
  let metadataToLog: ArticleMetadata | undefined;
  let executedModelName = 'unknown-model';
  const usedModels: string[] = [];
  let responseMode: ResponseMode;
  const telemetry = new AiTelemetryCollector();

  try {
    const {
      text,
      role,
      metadata,
      mode,
      userInstruction,
      previousFeedback,
      provider: bodyProvider,
      analysisSpeed: requestedAnalysisSpeed,
      targetText,
      feedbackMessage,
      instruction,
    } = req.body as {
      text?: string;
      role?: Role;
      metadata?: ArticleMetadata;
      mode?: AnalyzeMode;
      userInstruction?: string;
      previousFeedback?: FeedbackItem[];
      provider?: 'gemini' | 'groq';
      analysisSpeed?: 'fast' | 'balanced' | 'deep';
      targetText?: string;
      feedbackMessage?: string;
      instruction?: string;
    };

    const analysisSpeed = userId ? (requestedAnalysisSpeed ?? 'deep') : 'fast';
    const looksLikeTargetedFix = Boolean(targetText?.trim() && (feedbackMessage?.trim() || instruction?.trim()));
    const effectiveMode: AnalyzeMode = mode ?? (looksLikeTargetedFix ? 'fix_targeted' : 'analyze');
    const effectiveProvider: 'gemini' | 'groq' = bodyProvider || (ACTIVE_PROVIDER === 'gemini' ? 'gemini' : 'groq');

    textToLog = text || '';
    roleToLog = effectiveMode === 'refine' ? 'refine' : (role || 'unknown');
    metadataToLog = metadata;

    // ── TARGETED FIX MODE ──────────────────────────────────
    if (effectiveMode === 'fix_targeted') {
      if (!targetText?.trim()) {
        sendEvent('error', 'targetText is required for fix_targeted mode');
        res.end();
        return;
      }

      const maxLength = workspace?.plan?.maxTextLength ?? 15000;
      if (text && text.length > maxLength) {
        sendEvent('error', `Draft is too long. Maximum ${maxLength} characters.`);
        res.end();
        return;
      }

      sendEvent('status', 'rewriting');
      let replacementText = '';

      try {
        const missingGeminiKey = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'empty' || process.env.GEMINI_API_KEY === 'your-api-key-here';
        const missingGroqKey = !process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'empty' || process.env.GROQ_API_KEY === 'your-groq-api-key';

        if ((effectiveProvider === 'gemini' && missingGeminiKey) || (effectiveProvider === 'groq' && missingGroqKey)) {
          replacementText = targetText.trim();
        } else {
          const targetedResult = await runTargetedFixStage({
            provider: effectiveProvider,
            analysisSpeed,
            article: text ?? '',
            targetText,
            feedback: feedbackMessage || 'Address this editorial issue',
            editorInstruction: instruction || 'Fix and simplify the text',
            metadata,
            editorialProfile,
          });
          usedModels.push(`${targetedResult.modelName}(fix_targeted)`);
          replacementText = targetedResult.replacementText;
        }

        sendEvent('replacement', replacementText);
        sendEvent('complete', {});
      } catch (error) {
        console.error('[FIX_TARGETED_ERROR]', error);
        sendEvent('error', 'Failed to generate targeted repair: ' + (error instanceof Error ? error.message : String(error)));
      }

      res.end();
      return;
    }

    if (!text) {
      sendEvent('error', 'Text is required');
      res.end();
      return;
    }
    if (effectiveMode === 'analyze' && !role) {
      sendEvent('error', 'Role is required for analyze mode');
      res.end();
      return;
    }

    const maxLength = workspace?.plan?.maxTextLength ?? 15000;
    if (text.length > maxLength) {
      sendEvent('error', `Draft is too long. Maximum ${maxLength} characters.`);
      res.end();
      return;
    }

    const isPolishMode = effectiveMode === 'analyze' && role === 'polish';
    const systemPrompt = effectiveMode === 'refine'
      ? ''
      : composePrompt(
          isPolishMode
            ? getPolishReviewPrompt(metadata, editorialProfile.config, {
                includeTextSchema: effectiveProvider !== 'gemini',
              })
            : getPromptForRole(role!, metadata, editorialProfile.config, {
                includeTextSchema: effectiveProvider !== 'gemini',
              })
        );

    // DEV MOCK CHECK
    if (
      (effectiveProvider === 'gemini' && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'empty' || process.env.GEMINI_API_KEY === 'your-api-key-here')) ||
      (effectiveProvider === 'groq' && (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'empty' || process.env.GROQ_API_KEY === 'your-groq-api-key'))
    ) {
      console.warn(`No API Key found for provider ${effectiveProvider}, using mock data stream.`);
      
      sendEvent('status', 'evaluating');
      await delay(800);
      
      const mockScore = role === 'editor' ? 55 : 78;
      const mockVerdict = role === 'editor' ? 'reject' : 'revise';
      const mockSummary = "[DEV MODE] This article appears to use generic AI patterns and offers limited insight.";
      
      if (!isPolishMode) {
        sendEvent('score', mockScore);
        sendEvent('verdict', mockVerdict);
        sendEvent('summary', mockSummary);
      }

      const mockFeedback = [
        {
          category: "Tone & Language",
          status: "fail",
          message: "Too many generic phrases, such as 'In today's digital era'.",
          suggestion: "Open with a specific fact or surprising statistic instead of a broad statement.",
          operation: "manual"
        },
        {
          category: "Structure & Hook",
          status: "warning",
          message: "The hook does not create enough pull.",
          suggestion: "Turn the first sentence into a more provocative question or sharper claim.",
          operation: "manual"
        }
      ];

      for (let i = 0; i < mockFeedback.length; i++) {
        await delay(600);
        if (!isPolishMode) sendEvent('feedback_item', { item: mockFeedback[i], index: i });
      }

      if (role === 'editor') {
        await delay(400);
        sendEvent('flags', ['AI Spam Pattern Detected', 'Lack of Core Insight']);
      }

      let mockPolishedDraft = '';
      if (role === 'polish') {
        await delay(600);
        sendEvent('status', 'rewriting');
        
        const fullMockDraft = `# Sample ${editorialProfile.config.brandName} Title\n\nA short excerpt that gets straight to the point.\n\n${text}`;
        const words = fullMockDraft.split(' ');
        const chunkSize = 8;
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
          mockPolishedDraft += chunk;
          sendEvent('draft_chunk', chunk);
          await delay(70);
        }
        sendEvent('draft_final', mockPolishedDraft);
        sendEvent('status', 'quality_gate');
        sendEvent('readiness', 'needs_review');
        sendEvent('summary', '[DEV MODE] The final draft has been polished and still needs editorial review in a few areas.');
        sendEvent('changes', ['The hook was made more direct.', 'The article structure was tightened for mobile reading.']);
        for (let i = 0; i < mockFeedback.length; i++) {
          sendEvent('feedback_item', { item: mockFeedback[i], index: i });
        }
      }

      const mockSeo = {
        title: 'Mock Title',
        metaDescription: 'Mock Description',
        slug: 'mock-slug',
        tags: ['mock', 'test', 'seo'],
      };

      if (analysisSpeed !== 'fast') {
        sendEvent('seo_metadata', mockSeo);
      }

      let savedLogId: string | undefined;
      if (userId) {
        try {
          const savedLog = await createAnalysisLogAndDebitCredit({
            userId,
            organizationId: workspace.organizationId,
            role: roleToLog,
            content: textToLog,
            metadata: JSON.parse(JSON.stringify(buildStoredMetadata(metadataToLog, 'standard', mockPolishedDraft || undefined, undefined, mockSeo, analysisSpeed, undefined, telemetry.snapshot(), editorialAudit))),
            promptVersion: PROMPT_VERSION,
            modelName: 'dev-mock-model',
            score: isPolishMode ? undefined : mockScore,
            verdict: isPolishMode ? 'needs_review' : mockVerdict,
            summary: mockSummary,
            feedback: mockFeedback,
            flags: role === 'editor' ? ['AI Spam Pattern Detected', 'Lack of Core Insight'] : [],
            status: 'success',
            editorStatus: (roleToLog === 'polish' || roleToLog === 'refine') ? 'refined' : 'draft',
            ...editorialLogFields,
            telemetrySnapshot: telemetry.snapshot(),
          });
          savedLogId = savedLog.id;
        } catch (dbError) {
          console.error('Failed to log success to database:', dbError);
        }
      }

      sendEvent('complete', { analysisLogId: savedLogId, sourceRef: 'mock-ref' });
      res.end();
      return;
    }

    // ── REFINE MODE ────────────────────────────────────────
    if (effectiveMode === 'refine') {
      if (!userInstruction?.trim()) {
        sendEvent('error', 'userInstruction is required for refine mode');
        res.end();
        return;
      }

      const normalizedPreviousFeedback = (previousFeedback ?? []).map((item) => sanitizeSuppressiveFeedbackItem(item, text));
      const protectedFeedback = getProtectedVerificationClaims(normalizedPreviousFeedback);

      sendEvent('status', 'rewriting');

      const refinePrompt = composePrompt(getIterativeRefinementPrompt({
        metadata,
        profile: editorialProfile.config,
      }));

      let refinedText = '';
      const lockedRefineInput = applyVerificationLocks(text, protectedFeedback);

      if (effectiveProvider === 'groq') {
        usedModels.push(`${GROQ_MODEL}(refine)`);
        const startedAt = Date.now();
        let refineUsage: Parameters<AiTelemetryCollector['recordGroq']>[0]['usage'];
        const groqRefineStream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: refinePrompt },
            {
              role: 'user',
              content: buildEditorialUserContent({
                metadata,
                data: {
                  editorInstruction: userInstruction,
                  previousFeedback: normalizedPreviousFeedback.slice(0, 5),
                  article: lockedRefineInput,
                },
                task: 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
              }),
            },
          ],
          stream: true,
          max_tokens: getRewriteOutputTokens(text, true),
          temperature: 0.35,
        });

        for await (const chunk of groqRefineStream) {
          refineUsage = chunk.x_groq?.usage ?? refineUsage;
          const partText = chunk.choices[0]?.delta?.content ?? '';
          refinedText += partText;
          sendEvent('draft_chunk', partText);
        }
        telemetry.recordGroq({
          stage: 'refine',
          model: GROQ_MODEL,
          usage: refineUsage,
          durationMs: Date.now() - startedAt,
        });
      } else {
        const refineModelName = analysisSpeed === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash';
        usedModels.push(`${refineModelName}(refine)`);
        const startedAt = Date.now();
        let refineUsage: Parameters<AiTelemetryCollector['recordGemini']>[0]['usage'];
        const refineStream = await gemini.models.generateContentStream({
          model: refineModelName,
          contents: buildEditorialUserContent({
            metadata,
            data: {
              editorInstruction: userInstruction,
              previousFeedback: normalizedPreviousFeedback.slice(0, 5),
              article: lockedRefineInput,
            },
            task: 'Refine the article according to editorInstruction. Use previousFeedback as operational constraints and output only the final article.',
          }),
          config: {
            systemInstruction: refinePrompt,
            ...getGeminiSamplingConfig(refineModelName, 0.35),
            candidateCount: 1,
            maxOutputTokens: getRewriteOutputTokens(text, true),
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });

        for await (const chunk of refineStream) {
          refineUsage = chunk.usageMetadata ?? refineUsage;
          const partText = extractGeminiText(chunk);
          refinedText += partText;
          sendEvent('draft_chunk', partText);
        }
        telemetry.recordGemini({
          stage: 'refine',
          model: refineModelName,
          usage: refineUsage,
          durationMs: Date.now() - startedAt,
        });
      }

      refinedText = ensureTitleAndOpening(refinedText, text);
      refinedText = removeDisallowedRefineTargets(refinedText, normalizedPreviousFeedback);
      const refineQualityGateDraft = applyVerificationAnnotations(refinedText, normalizedPreviousFeedback);
      refinedText = preparePublicationDraft(refineQualityGateDraft);
      sendEvent('draft_final', refinedText);

      sendEvent('status', 'quality_gate');
      const refineQualityGateResponse = await runFinalQualityGateSafely({
        provider: effectiveProvider,
        originalDraft: text,
        finalDraft: refinedText,
        metadata,
        analysisSpeed,
        trustedInternalDomains: editorialProfile.config.internalLinkDomains,
        telemetry,
        editorialProfile,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
      });
      const refineQualityGate = refineQualityGateResponse.result;
      usedModels.push(`${refineQualityGateResponse.modelName}(quality-gate)`);
      sendEvent('feedback_reset', null);
      sendEvent('readiness', refineQualityGate.readiness);
      sendEvent('summary', refineQualityGate.summary);
      sendEvent('changes', refineQualityGate.changes);
      refineQualityGate.feedback.forEach((item, index) => {
        sendEvent('feedback_item', { item, index });
      });
      sendEvent('flags', refineQualityGate.flags);

      // Generate SEO metadata
      sendEvent('status', 'generating_seo');
      let refineSeo: Record<string, unknown> | null = null;

      if (analysisSpeed !== 'fast') {
        const seoModelName = effectiveProvider === 'groq'
          ? GROQ_SEO_MODEL
          : getGeminiModelForRole('seo', analysisSpeed);
        usedModels.push(`${seoModelName}(seo)`);
        refineSeo = (await runSeoStage({
          provider: effectiveProvider,
          modelName: seoModelName,
          article: refinedText,
          metadata,
          editorialProfile,
          systemInstruction: composePrompt(getSeoMetadataPrompt(
            metadata,
            editorialProfile.config,
            { includeTextSchema: effectiveProvider !== 'gemini' }
          )),
          telemetry,
        })) as Record<string, unknown>;
        sendEvent('seo_metadata', refineSeo);
      }

      let sourceRef = metadataToLog?.sourceRef;
      if (!sourceRef) {
        sourceRef = `eai_${randomUUID()}`;
      }

      let refineLogId: string | undefined;
      if (userId) {
        try {
          const savedLog = await createAnalysisLogAndDebitCredit({
            userId,
            organizationId: workspace.organizationId,
            role: 'refine' as unknown as Role,
            content: text,
            metadata: JSON.parse(JSON.stringify(buildStoredMetadata(metadataToLog, 'standard', refinedText, sourceRef, refineSeo ?? undefined, analysisSpeed, refineQualityGate, telemetry.snapshot(), editorialAudit))),
            promptVersion: PROMPT_VERSION,
            modelName: usedModels.length > 0 ? usedModels.join(' + ') : executedModelName,
            score: undefined,
            verdict: refineQualityGate.readiness,
            summary: refineQualityGate.summary,
            feedback: refineQualityGate.feedback,
            flags: refineQualityGate.flags,
            status: 'success',
            editorStatus: 'refined',
            ...editorialLogFields,
            telemetrySnapshot: telemetry.snapshot(),
          });
          refineLogId = savedLog.id;
        } catch (dbErr) {
          console.error('[Refine] Failed to save to DB:', dbErr);
        }
      }

      sendEvent('complete', { analysisLogId: refineLogId, sourceRef });
      res.end();
      return;
    }

    // Real API Mode per Provider (Gemini / Groq)
    if (effectiveProvider === 'gemini') {
      executedModelName = getGeminiModelForRole(role!, analysisSpeed);
      const reviewModelName = executedModelName;
      usedModels.push(`${reviewModelName}(review)`);
      const reviewPrompt = isPolishMode
        ? composePrompt(getPolishReviewPrompt(metadata, editorialProfile.config, {
            includeTextSchema: false,
          }))
        : systemPrompt;
      const reviewResult = await runEditorialReviewStage({
        provider: 'gemini',
        modelName: reviewModelName,
        role: role!,
        metadata,
        draftText: text,
        reviewPrompt,
        telemetry,
        sendEvent,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
      });
      responseMode = reviewResult.responseMode;
      const validatedData: ReviewOutput = reviewResult.data;

      let finalQualityGate: FinalQualityGateOutput | null = null;
      let publishedPosts: { title: string; slug: string }[] = [];
      let qualityGateDraft = '';

      let polishedText = '';
      if (role === 'polish') {
        sendEvent('status', 'rewriting');

        if (analysisSpeed !== 'fast') {
          try {
            publishedPosts = await listPublishedPostsForProfile(editorialProfile, 20);
            publishedPosts = selectRelevantPublishedPosts(text, publishedPosts);
            if (!editorialProfile.config.internalLinkBaseUrl) {
              publishedPosts = [];
            }
            console.log(
              `[Internal Linking] Selected ${publishedPosts.length} posts for profile ${editorialProfile.profileKey}.`
            );
          } catch (fetchError) {
            const message = fetchError instanceof CmsAdapterError
              ? `${fetchError.code}: ${fetchError.message}`
              : fetchError instanceof Error ? fetchError.message : String(fetchError);
            console.warn(
              `[Internal Linking] Catalog unavailable for profile ${editorialProfile.profileKey}. Continuing without suggestions. ${message}`
            );
          }
        }

        const rewriteNotes = [
          `DIAGNOSIS TRANSFORMASI DRAFT:`,
          `Arah transformasi: ${validatedData.summary}`,
          ``,
          `Prioritas rewrite:`,
          ...(validatedData.feedback ?? []).slice(0, 3).map(
            (item: FeedbackItem, i: number) => `${i + 1}. [${item.category}] ${item.message}${item.suggestion ? `\n   -> Suggested fix: ${item.suggestion}` : ''}`
          ),
          ``,
          `Ensure the final article does NOT contain the issues above.`,
        ];

        if (publishedPosts.length > 0) {
          const formattedPosts = publishedPosts
            .map((post) => `- [${post.title}](${editorialProfile.config.internalLinkBaseUrl}/${post.slug})`)
            .join('\n');
          rewriteNotes.push(
            ``,
            `LINKING INTERNAL TEPERCAYA (Sertakan 1-3 link relevan secara natural):`,
            formattedPosts
          );
        }

        const chunks = splitDraftIntoRewriteChunks(text);
        const isSingleChunk = chunks.length === 1;
        const protectedClaims = getProtectedVerificationClaims(validatedData.feedback);

        const rewriteSystemInstruction = composePrompt(
          getPolishedDraftPrompt(metadata, !isSingleChunk, publishedPosts, editorialProfile.config)
        );

        const rewriteModelName = getGeminiModelForRole('rewrite' as Role, analysisSpeed);
        usedModels.push(`${rewriteModelName}(rewrite)`);

        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const startedAt = Date.now();
          let rewriteUsage: Parameters<AiTelemetryCollector['recordGemini']>[0]['usage'];
          
          const draftLabel = isSingleChunk ? "Raw article draft:" : `Article draft (Part ${i + 1}):`;
          const protectedClaimsNotes = protectedClaims.length > 0
            ? [
                '',
                'SENSITIVE FACTUAL CLAIMS THAT MUST BE PRESERVED VERBATIM:',
                ...protectedClaims.map((item, idx) => `${idx + 1}. ${item.targetText}`),
              ].join('\n')
            : '';

          const rewriteStream = await gemini.models.generateContentStream({
            model: rewriteModelName,
            contents: buildEditorialUserContent({
              metadata,
              data: {
                chunkLabel: draftLabel,
                article: applyVerificationLocks(chunkText, protectedClaims),
                editorNotes: rewriteNotes.join('\n'),
                protectedClaimsNotes,
                sectionContext: isSingleChunk
                  ? undefined
                  : `Ini adalah segmen ${i + 1} dari ${chunks.length}. Tulis ulang segmen ini saja. Hubungkan alurnya dengan draf sebelumnya.`,
              },
              task: 'Polish only the provided article. Apply editorNotes and preserve protectedClaimsNotes.',
            }),
            config: {
              systemInstruction: rewriteSystemInstruction,
              ...getGeminiSamplingConfig(rewriteModelName, 0.35),
              candidateCount: 1,
              maxOutputTokens: getRewriteOutputTokens(chunkText, isSingleChunk),
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            },
          });

          for await (const chunk of rewriteStream) {
            rewriteUsage = chunk.usageMetadata ?? rewriteUsage;
            const partText = extractGeminiText(chunk);
            polishedText += partText;
            sendEvent('draft_chunk', partText);
          }
          telemetry.recordGemini({
            stage: `rewrite_chunk_${i}`,
            model: rewriteModelName,
            usage: rewriteUsage,
            durationMs: Date.now() - startedAt,
          });
        }

        polishedText = ensureTitleAndOpening(polishedText, text);
        polishedText = removeDisallowedRefineTargets(polishedText, validatedData.feedback);
        const lockedPolishedText = applyVerificationLocks(polishedText, protectedClaims);
        
        sendEvent('draft_final', preparePublicationDraft(lockedPolishedText));
        sendEvent('status', 'quality_gate');

        const qualityGateResponse = await runFinalQualityGateSafely({
          provider: 'gemini',
          originalDraft: text,
          finalDraft: preparePublicationDraft(lockedPolishedText),
          metadata,
          analysisSpeed,
          trustedInternalDomains: editorialProfile.config.internalLinkDomains,
          telemetry,
          editorialProfile,
          sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
          sanitizeSummary: sanitizeFactualSummary,
        });
        finalQualityGate = qualityGateResponse.result;
        usedModels.push(`${qualityGateResponse.modelName}(quality-gate)`);
        
        qualityGateDraft = applyVerificationAnnotations(lockedPolishedText, finalQualityGate.feedback);
        const publicationPolishedDraft = preparePublicationDraft(qualityGateDraft);
        
        sendEvent('draft_final', publicationPolishedDraft);
        sendEvent('feedback_reset', null);
        sendEvent('readiness', finalQualityGate.readiness);
        sendEvent('summary', finalQualityGate.summary);
        sendEvent('changes', finalQualityGate.changes);
        finalQualityGate.feedback.forEach((item, index) => {
          sendEvent('feedback_item', { item, index });
        });
        sendEvent('flags', finalQualityGate.flags);
      }

      // Generate SEO metadata
      let seo: unknown = null;
      if (analysisSpeed !== 'fast') {
        sendEvent('status', 'generating_seo');
        const seoModelName = getGeminiModelForRole('seo', analysisSpeed);
        usedModels.push(`${seoModelName}(seo)`);
        seo = (await runSeoStage({
          provider: 'gemini',
          modelName: seoModelName,
          article: polishedText || text,
          metadata,
          editorialProfile,
          systemInstruction: composePrompt(getSeoMetadataPrompt(
            metadata,
            editorialProfile.config,
            { includeTextSchema: false }
          )),
          telemetry,
        })) as Record<string, unknown>;
        sendEvent('seo_metadata', seo);
      }

      let sourceRef = metadataToLog?.sourceRef;
      if (!sourceRef) {
        sourceRef = `eai_${randomUUID()}`;
      }

      let savedLogId: string | undefined;
      if (userId) {
        try {
          const finalPolishedDraftLog = polishedText ? preparePublicationDraft(qualityGateDraft) : undefined;
          const savedLog = await createAnalysisLogAndDebitCredit({
            userId,
            organizationId: workspace.organizationId,
            role: roleToLog,
            content: text,
            metadata: JSON.parse(JSON.stringify(buildStoredMetadata(metadataToLog, responseMode, finalPolishedDraftLog, sourceRef, (seo as Record<string, unknown>) ?? undefined, analysisSpeed, finalQualityGate, telemetry.snapshot(), editorialAudit))),
            promptVersion: PROMPT_VERSION,
            modelName: usedModels.length > 0 ? usedModels.join(' + ') : executedModelName,
            score: isPolishMode ? undefined : (validatedData as Record<string, unknown>).score as number | undefined,
            verdict: isPolishMode ? (finalQualityGate?.readiness ?? 'needs_review') : (validatedData as Record<string, unknown>).verdict as string,
            summary: isPolishMode ? (finalQualityGate?.summary ?? validatedData.summary) : validatedData.summary,
            feedback: isPolishMode ? (finalQualityGate?.feedback ?? validatedData.feedback) : validatedData.feedback,
            flags: isPolishMode ? (finalQualityGate?.flags ?? validatedData.flags) : validatedData.flags,
            status: 'success',
            editorStatus: (roleToLog === 'polish' || roleToLog === 'refine') ? 'refined' : 'draft',
            ...editorialLogFields,
            telemetrySnapshot: telemetry.snapshot(),
          });
          savedLogId = savedLog.id;
        } catch (dbError) {
          console.error('[Gemini] Failed to save success log to database:', dbError);
        }
      }

      sendEvent('complete', { analysisLogId: savedLogId, sourceRef });
    } else {
      // ── Groq API Mode ──────────────────────────────────────────
      executedModelName = GROQ_MODEL;
      const reviewModelName = executedModelName;
      usedModels.push(`${reviewModelName}(review)`);
      const reviewPrompt = isPolishMode
        ? composePrompt(getPolishReviewPrompt(metadata, editorialProfile.config, {
            includeTextSchema: true,
          }))
        : systemPrompt;
      
      const reviewResult = await runEditorialReviewStage({
        provider: 'groq',
        modelName: reviewModelName,
        role: role!,
        metadata,
        draftText: text,
        reviewPrompt,
        telemetry,
        sendEvent,
        sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
        sanitizeSummary: sanitizeFactualSummary,
      });
      responseMode = reviewResult.responseMode;
      const validatedData: ReviewOutput = reviewResult.data;

      let finalQualityGate: FinalQualityGateOutput | null = null;
      let publishedPosts: { title: string; slug: string }[] = [];
      let qualityGateDraft = '';

      let polishedText = '';
      if (role === 'polish') {
        sendEvent('status', 'rewriting');

        if (analysisSpeed !== 'fast') {
          try {
            publishedPosts = await listPublishedPostsForProfile(editorialProfile, 20);
            publishedPosts = selectRelevantPublishedPosts(text, publishedPosts);
            if (!editorialProfile.config.internalLinkBaseUrl) {
              publishedPosts = [];
            }
          } catch (_fetchError) {
            console.warn('[Internal Linking] Catalog unavailable on Groq path.');
          }
        }

        const rewriteNotes = [
          `DIAGNOSIS TRANSFORMASI DRAFT:`,
          `Arah transformasi: ${validatedData.summary}`,
          ``,
          `Prioritas rewrite:`,
          ...(validatedData.feedback ?? []).slice(0, 3).map(
            (item: FeedbackItem, i: number) => `${i + 1}. [${item.category}] ${item.message}${item.suggestion ? `\n   -> Suggested fix: ${item.suggestion}` : ''}`
          ),
          ``,
          `Ensure the final article does NOT contain the issues above.`,
        ];

        if (publishedPosts.length > 0) {
          const formattedPosts = publishedPosts
            .map((post) => `- [${post.title}](${editorialProfile.config.internalLinkBaseUrl}/${post.slug})`)
            .join('\n');
          rewriteNotes.push(
            ``,
            `LINKING INTERNAL TEPERCAYA (Sertakan 1-3 link relevan secara natural):`,
            formattedPosts
          );
        }

        const chunks = splitDraftIntoRewriteChunks(text);
        const isSingleChunk = chunks.length === 1;
        const protectedClaims = getProtectedVerificationClaims(validatedData.feedback);

        const rewriteSystemInstruction = composePrompt(
          getPolishedDraftPrompt(metadata, !isSingleChunk, publishedPosts, editorialProfile.config)
        );

        const rewriteModelName = GROQ_MODEL;
        usedModels.push(`${rewriteModelName}(rewrite)`);

        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const startedAt = Date.now();
          let rewriteUsage: Parameters<AiTelemetryCollector['recordGroq']>[0]['usage'];

          const groqRewriteStream = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
              { role: 'system', content: rewriteSystemInstruction },
              {
                role: 'user',
                content: buildEditorialUserContent({
                  metadata,
                  data: {
                    chunkLabel: isSingleChunk ? "Raw article draft:" : `Article draft (Part ${i + 1}):`,
                    article: applyVerificationLocks(chunkText, protectedClaims),
                    editorNotes: rewriteNotes.join('\n'),
                    protectedClaimsNotes: protectedClaims.length > 0
                      ? [
                          '',
                          'SENSITIVE FACTUAL CLAIMS THAT MUST BE PRESERVED VERBATIM:',
                          ...protectedClaims.map((item, idx) => `${idx + 1}. ${item.targetText}`),
                        ].join('\n')
                      : '',
                    sectionContext: isSingleChunk
                      ? undefined
                      : `Ini adalah segmen ${i + 1} dari ${chunks.length}. Tulis ulang segmen ini saja. Hubungkan alurnya dengan draf sebelumnya.`,
                  },
                  task: 'Polish only the provided article. Apply editorNotes and preserve protectedClaimsNotes.',
                }),
              },
            ],
            stream: true,
            max_tokens: getRewriteOutputTokens(chunkText, isSingleChunk),
            temperature: 0.35,
          });

          for await (const chunk of groqRewriteStream) {
            rewriteUsage = chunk.x_groq?.usage ?? rewriteUsage;
            const partText = chunk.choices[0]?.delta?.content ?? '';
            polishedText += partText;
            sendEvent('draft_chunk', partText);
          }
          telemetry.recordGroq({
            stage: `rewrite_chunk_${i}`,
            model: GROQ_MODEL,
            usage: rewriteUsage,
            durationMs: Date.now() - startedAt,
          });
        }

        polishedText = ensureTitleAndOpening(polishedText, text);
        polishedText = removeDisallowedRefineTargets(polishedText, validatedData.feedback);
        const lockedPolishedText = applyVerificationLocks(polishedText, protectedClaims);

        sendEvent('draft_final', preparePublicationDraft(lockedPolishedText));
        sendEvent('status', 'quality_gate');

        const qualityGateResponse = await runFinalQualityGateSafely({
          provider: 'groq',
          originalDraft: text,
          finalDraft: preparePublicationDraft(lockedPolishedText),
          metadata,
          analysisSpeed,
          trustedInternalDomains: editorialProfile.config.internalLinkDomains,
          telemetry,
          editorialProfile,
          sanitizeFeedback: sanitizeSuppressiveFeedbackItem,
          sanitizeSummary: sanitizeFactualSummary,
        });
        finalQualityGate = qualityGateResponse.result;
        usedModels.push(`${qualityGateResponse.modelName}(quality-gate)`);

        qualityGateDraft = applyVerificationAnnotations(lockedPolishedText, finalQualityGate.feedback);
        const publicationPolishedDraft = preparePublicationDraft(qualityGateDraft);

        sendEvent('draft_final', publicationPolishedDraft);
        sendEvent('feedback_reset', null);
        sendEvent('readiness', finalQualityGate.readiness);
        sendEvent('summary', finalQualityGate.summary);
        sendEvent('changes', finalQualityGate.changes);
        finalQualityGate.feedback.forEach((item, index) => {
          sendEvent('feedback_item', { item, index });
        });
        sendEvent('flags', finalQualityGate.flags);
      }

      // Generate SEO metadata
      let seo: unknown = null;
      if (analysisSpeed !== 'fast') {
        sendEvent('status', 'generating_seo');
        const seoModelName = GROQ_SEO_MODEL;
        usedModels.push(`${seoModelName}(seo)`);
        seo = (await runSeoStage({
          provider: 'groq',
          modelName: seoModelName,
          article: polishedText || text,
          metadata,
          editorialProfile,
          systemInstruction: composePrompt(getSeoMetadataPrompt(
            metadata,
            editorialProfile.config,
            { includeTextSchema: true }
          )),
          telemetry,
        })) as Record<string, unknown>;
        sendEvent('seo_metadata', seo);
      }

      let sourceRef = metadataToLog?.sourceRef;
      if (!sourceRef) {
        sourceRef = `eai_${randomUUID()}`;
      }

      let savedLogId: string | undefined;
      if (userId) {
        try {
          const finalPolishedDraftLog = polishedText ? preparePublicationDraft(qualityGateDraft) : undefined;
          const savedLog = await createAnalysisLogAndDebitCredit({
            userId,
            organizationId: workspace.organizationId,
            role: roleToLog,
            content: text,
            metadata: JSON.parse(JSON.stringify(buildStoredMetadata(metadataToLog, responseMode, finalPolishedDraftLog, sourceRef, (seo as Record<string, unknown>) ?? undefined, analysisSpeed, finalQualityGate, telemetry.snapshot(), editorialAudit))),
            promptVersion: PROMPT_VERSION,
            modelName: usedModels.length > 0 ? usedModels.join(' + ') : executedModelName,
            score: isPolishMode ? undefined : (validatedData as Record<string, unknown>).score as number | undefined,
            verdict: isPolishMode ? (finalQualityGate?.readiness ?? 'needs_review') : (validatedData as Record<string, unknown>).verdict as string,
            summary: isPolishMode ? (finalQualityGate?.summary ?? validatedData.summary) : validatedData.summary,
            feedback: isPolishMode ? (finalQualityGate?.feedback ?? validatedData.feedback) : validatedData.feedback,
            flags: isPolishMode ? (finalQualityGate?.flags ?? validatedData.flags) : validatedData.flags,
            status: 'success',
            editorStatus: (roleToLog === 'polish' || roleToLog === 'refine') ? 'refined' : 'draft',
            ...editorialLogFields,
            telemetrySnapshot: telemetry.snapshot(),
          });
          savedLogId = savedLog.id;
        } catch (dbError) {
          console.error('[Groq] Failed to save success log to database:', dbError);
        }
      }

      sendEvent('complete', { analysisLogId: savedLogId, sourceRef });
    }
  } catch (error: unknown) {
    console.error('[ANALYZE_POST_ERROR]', error);
    sendEvent('error', error instanceof Error ? error.message : 'An unexpected error occurred during analysis.');
  } finally {
    res.end();
  }
});

export default router;
