/**
 * Text manipulation, chunking, internal link selection, and metadata helpers.
 * Depends on verification.ts and markdown.ts.
 * Extracted from analyze.ts L48–83, L85–147, L457–507, L693–751, L924–932 (zero logic change).
 */

import type { ArticleMetadata, PublicationPackage, PublicationPackageStatus, ResponseMode } from '@eai/shared';
import type { FinalQualityGateOutput } from '@eai/shared';
import type { AiTelemetrySnapshot } from '@/lib/ai-telemetry';
import type { EditorialAuditContext } from '@eai/shared/server';
import { normalizeMarkdownHeadingHierarchy, stripLeadingExcerpt, stripLeadingH1 } from '@/lib/text-utils';
import { stripVerificationMarkers } from '@/lib/final-quality';
import { stripGeneratedVerificationNotes } from './verification';
import { cleanupRewriteArtifacts, removeEmptyHeadings } from './markdown';

// ── Async helpers ─────────────────────────────────────────────────────────────

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const resolvePublicationPackageStatus = ({
  storedStatus,
  hasPackage,
  bodyChanged = false,
}: {
  storedStatus: unknown;
  hasPackage: boolean;
  bodyChanged?: boolean;
}): PublicationPackageStatus => {
  const previousStatus: PublicationPackageStatus =
    storedStatus === 'current' || storedStatus === 'stale' || storedStatus === 'not_generated'
      ? storedStatus
      : hasPackage
        ? 'current'
        : 'not_generated';
  return bodyChanged && previousStatus === 'current' ? 'stale' : previousStatus;
};

// ── Metadata builder ──────────────────────────────────────────────────────────

export const buildStoredMetadata = (
  metadata: ArticleMetadata | undefined,
  responseMode: ResponseMode,
  polishedDraft?: string,
  sourceRef?: string,
  generatedMetadata?: PublicationPackage,
  analysisSpeed?: 'fast' | 'balanced' | 'deep',
  finalQualityGate?: FinalQualityGateOutput | null,
  telemetry?: AiTelemetrySnapshot,
  editorialAudit?: EditorialAuditContext,
  workingTitle?: string,
  publicationPackageStatus?: PublicationPackageStatus
) => ({
  ...(metadata ?? {}),
  sourceRef: sourceRef || metadata?.sourceRef,
  generatedMetadata: generatedMetadata || (metadata as Record<string, unknown>)?.generatedMetadata,
  workingTitle: workingTitle || metadata?.workingTitle,
  publicationPackageStatus: publicationPackageStatus
    || metadata?.publicationPackageStatus
    || (generatedMetadata ? 'current' : 'not_generated'),
  _system: {
    responseMode,
    polishedDraft,
    analysisSpeed,
    readiness: finalQualityGate?.readiness,
    refinementChanges: finalQualityGate?.changes,
    telemetry,
    editorialProfile: editorialAudit,
    workingTitle: workingTitle || metadata?.workingTitle,
    publicationPackageStatus: publicationPackageStatus
      || metadata?.publicationPackageStatus
      || (generatedMetadata ? 'current' : 'not_generated'),
  },
});

// ── Internal link selection ───────────────────────────────────────────────────

export const INTERNAL_LINK_STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'cara',
  'mengapa', 'bagaimana', 'adalah', 'akan', 'lebih', 'terbesar', 'terbaru',
  'analisis', 'panduan', 'strategi', 'masa', 'depan', 'tahun', 'envoyou',
  'tipping', 'point', 'wajib', 'dikuasai', 'modern', 'terkini',
]);

export const getInternalLinkTerms = (value: string): string[] =>
  Array.from(new Set(
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 4 && !INTERNAL_LINK_STOPWORDS.has(term)) ?? []
  ));

export const INTERNAL_LINK_TOPIC_FAMILIES = {
  ai: ['agi', 'artificial', 'kecerdasan', 'llm', 'machine', 'model', 'openai', 'anthropic', 'algoritma'],
  energy: ['energi', 'energy', 'hidrogen', 'hydrogen', 'shell', 'minyak', 'gas', 'surya', 'baterai'],
  finance: ['investasi', 'keuangan', 'finansial', 'pasar', 'portofolio', 'saham', 'modal', 'fintech'],
  creator: ['kreator', 'creator', 'konten', 'youtube', 'tiktok', 'branding', 'audiens'],
  geopolitics: ['geopolitik', 'perdagangan', 'fragmentasi', 'rantai', 'koridor', 'globalisasi', 'imf'],
} as const;

export const getInternalLinkTopicFamilies = (value: string): Set<string> => {
  const terms = new Set(getInternalLinkTerms(value));
  return new Set(
    Object.entries(INTERNAL_LINK_TOPIC_FAMILIES)
      .filter(([, familyTerms]) => familyTerms.some((term) => terms.has(term)))
      .map(([family]) => family)
  );
};

export const selectRelevantPublishedPosts = (
  draft: string,
  posts: { title: string; slug: string }[]
): { title: string; slug: string }[] => {
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

// ── Draft preparation ─────────────────────────────────────────────────────────

export const preparePublicationDraft = (text: string): string =>
  normalizeMarkdownHeadingHierarchy(
    removeEmptyHeadings(
      cleanupRewriteArtifacts(
        stripVerificationMarkers(
          stripLeadingExcerpt(stripGeneratedVerificationNotes(stripLeadingH1(text).body))
        )
      )
    )
  );

// ── Title/opening guard ───────────────────────────────────────────────────────

export const ensureTitleAndOpening = (refinedText: string, sourceText: string): string => {
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

// ── Rewrite chunking ──────────────────────────────────────────────────────────

export const getRewriteOutputTokens = (text: string, isSingleChunk: boolean = false): number => {
  if (isSingleChunk) return 8192;
  const estimatedTokens = Math.ceil(text.length / 3.5);
  return Math.min(Math.max(Math.ceil(estimatedTokens * 2.5) + 1000, 2500), 4500);
};

export const REWRITE_CHUNK_MAX_CHARS = 6000;

export const splitDraftIntoRewriteChunks = (text: string): string[] => {
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

// ── Cookie parser ─────────────────────────────────────────────────────────────

export const parseCookies = (cookieHeader?: string): Record<string, string> => {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    list[parts.shift()!.trim()] = decodeURI(parts.join('='));
  });
  return list;
};
