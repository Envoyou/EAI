import type {
  ArticleMetadata,
  ResponseMode,
  EditorialReadiness,
  FeedbackItem,
  ResearchNote,
  EditorialProcessStage,
} from '@eai/shared';
import { findTargetMatch } from '@eai/shared';

export const extractArticleMetadata = (metadata: unknown): ArticleMetadata => {
  if (!metadata || typeof metadata !== 'object') return {};
  const source = metadata as Record<string, unknown>;
  return {
    category: typeof source.category === 'string' ? source.category : undefined,
    type: typeof source.type === 'string' ? source.type : undefined,
    targetAudience: typeof source.targetAudience === 'string' ? source.targetAudience : undefined,
    targetLength: typeof source.targetLength === 'string' ? source.targetLength : undefined,
    strictness: source.strictness === 'strict' || source.strictness === 'balanced' ? source.strictness : undefined,
    outputLanguage: source.outputLanguage === 'id' || source.outputLanguage === 'en' || source.outputLanguage === 'follow_draft' ? source.outputLanguage : undefined,
    sourceRef: typeof source.sourceRef === 'string' ? source.sourceRef : undefined,
    exportStatus: source.exportStatus as ArticleMetadata['exportStatus'],
  };
};

export const extractResponseMode = (metadata: unknown): ResponseMode | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return undefined;
  const responseMode = (system as Record<string, unknown>).responseMode;
  if (responseMode === 'standard' || responseMode === 'compact' || responseMode === 'manual_fallback') return responseMode;
  return undefined;
};

export const extractPolishedDraft = (metadata: unknown): string | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return undefined;
  const polishedDraft = (system as Record<string, unknown>).polishedDraft;
  return typeof polishedDraft === 'string' ? polishedDraft : undefined;
};

export const extractGeneratedMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  return (metadata as Record<string, unknown>).generatedMetadata as Record<string, unknown> | undefined;
};

export const extractPublicationState = (metadata: unknown): {
  workingTitle?: string;
  publicationPackageStatus?: import('@eai/shared').PublicationPackageStatus;
} => {
  if (!metadata || typeof metadata !== 'object') return {};
  const source = metadata as Record<string, unknown>;
  const system = source._system && typeof source._system === 'object'
    ? source._system as Record<string, unknown>
    : {};
  const rawStatus = source.publicationPackageStatus ?? system.publicationPackageStatus;
  const publicationPackageStatus = rawStatus === 'current' || rawStatus === 'stale' || rawStatus === 'not_generated'
    ? rawStatus
    : source.generatedMetadata
      ? 'current'
      : 'not_generated';
  const rawTitle = source.workingTitle ?? system.workingTitle;
  return {
    workingTitle: typeof rawTitle === 'string' ? rawTitle : undefined,
    publicationPackageStatus,
  };
};

export const extractQualityGate = (metadata: unknown): {
  readiness?: EditorialReadiness;
  changes?: string[];
} => {
  if (!metadata || typeof metadata !== 'object') return {};
  const system = (metadata as Record<string, unknown>)._system;
  if (!system || typeof system !== 'object') return {};
  const source = system as Record<string, unknown>;
  const readiness: EditorialReadiness | undefined =
    source.readiness === 'ready' || source.readiness === 'needs_review' || source.readiness === 'blocked'
      ? source.readiness
      : undefined;
  return {
    readiness,
    changes: Array.isArray(source.refinementChanges)
      ? source.refinementChanges.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
};

export const editorStatusBadgeVariant = (status?: string) => {
  if (status === 'exported') return 'success' as const;
  if (status === 'refined') return 'primary' as const;
  return 'muted' as const;
};

export const normalizeProcessStage = (status: unknown): EditorialProcessStage | null => {
  if (status === 'evaluating') return 'reviewing';
  if (status === 'rewriting') return 'rewriting';
  if (status === 'quality_gate') return 'quality_gate';
  if (status === 'generating_seo') return 'seo';
  return null;
};

export const getApiErrorMessage = async (response: Response, fallback: string) => {
  const result = await response.json().catch(() => null);
  return typeof result?.error === 'string' ? result.error : fallback;
};

export const isFeedbackResolved = (item: FeedbackItem): boolean =>
  item.status === 'pass'
  || Boolean(item.isApplied)
  || Boolean(item.isAccepted)
  || Boolean(item.isVerified);

export const markFeedbackApplied = (
  feedback: FeedbackItem[],
  index: number
): FeedbackItem[] => feedback.map((item, itemIndex) =>
  itemIndex === index
    ? {
        ...item,
        isApplied: true,
        isAccepted: false,
        isVerified: false,
      }
    : item
);

export const calculateReadiness = (feedback: FeedbackItem[], originalReadiness?: EditorialReadiness): EditorialReadiness => {
  const unresolved = (feedback || []).filter(
    (item) => !isFeedbackResolved(item)
  );

  if (unresolved.length === 0) {
    return 'ready';
  }

  const hasUnresolvedFail = unresolved.some((item) => item.status === 'fail');
  if (hasUnresolvedFail) {
    return originalReadiness === 'blocked' ? 'blocked' : 'needs_review';
  }

  return 'needs_review';
};

export const normalizeHttpSourceUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().replaceAll('(', '%28').replaceAll(')', '%29');
  } catch {
    return null;
  }
};

export const addSourceLinkToDraft = (
  draft: string,
  targetText: string,
  sourceUrl: string
): { nextDraft: string; linked: boolean } => {
  const match = findTargetMatch(draft, targetText);
  if (!match) return { nextDraft: draft, linked: false };

  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const linkMatch of draft.matchAll(markdownLinkPattern)) {
    const start = linkMatch.index ?? -1;
    const end = start + linkMatch[0].length;
    if (start <= match.start && end >= match.end) {
      return {
        nextDraft: `${draft.slice(0, start)}[${linkMatch[1]}](${sourceUrl})${draft.slice(end)}`,
        linked: true,
      };
    }
  }

  const label = match.text.replace(/([\[\]])/g, '\\$1');
  return {
    nextDraft: `${draft.slice(0, match.start)}[${label}](${sourceUrl})${draft.slice(match.end)}`,
    linked: true,
  };
};

export const checkMissingSources = (draftText: string, notes: ResearchNote[]) => {
  if (!draftText) return [];
  const missing: { url: string; domain: string }[] = [];
  notes.forEach((note) => {
    if (note.sources && Array.isArray(note.sources)) {
      note.sources.forEach((src) => {
        if (src.url && src.domain) {
          const urlInDraft = draftText.includes(src.url);
          if (!urlInDraft) {
            if (!missing.some((m) => m.url === src.url)) {
              missing.push({ url: src.url, domain: src.domain });
            }
          }
        }
      });
    }
  });
  return missing;
};
