import type {
  ArticleMetadata,
  ResponseMode,
  EditorialReadiness,
  FeedbackItem,
  ResearchNote,
  EditorialProcessStage,
} from '@eai/shared';

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

export const editorStatusBadgeClass = (status?: string) => {
  if (status === 'exported') return 'ui-badge-success';
  if (status === 'refined') return 'ui-badge-primary';
  return 'ui-badge-muted';
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

export const calculateReadiness = (feedback: FeedbackItem[], originalReadiness?: EditorialReadiness): EditorialReadiness => {
  const unresolved = (feedback || []).filter(
    (item) => item.status !== 'pass' && !item.isAccepted && !item.isVerified
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
