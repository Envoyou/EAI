import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FeedbackItem, ResearchNote } from '@eai/shared';
import {
  findStoredContentBlockForText,
  readDraftRevisionIdentity,
  readStoredContentBlocks,
} from '@/lib/draft-revision';

const IdentityTokenSchema = z.string().min(1).max(100);

const CanonicalSourceSchema = z.object({
  sourceId: IdentityTokenSchema,
  kind: z.enum(['url', 'research_note']),
  locatorHash: z.string().regex(/^[a-f0-9]{64}$/u),
  url: z.string().url().optional(),
  researchNoteId: z.string().min(1).max(200).optional(),
});

const CanonicalClaimSchema = z.object({
  claimId: IdentityTokenSchema,
  ruleId: IdentityTokenSchema,
  blockId: IdentityTokenSchema.optional(),
  targetHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceIds: z.array(IdentityTokenSchema).max(20),
  lastSeenRevisionId: IdentityTokenSchema,
});

export const EditorialIdentityStateSchema = z.object({
  version: z.literal(1),
  sources: z.array(CanonicalSourceSchema).max(500),
  claims: z.array(CanonicalClaimSchema).max(500),
});

export type EditorialIdentityState = z.infer<typeof EditorialIdentityStateSchema>;

const normalizeText = (value: string | undefined): string =>
  (value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();

const digest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const identity = (prefix: string, value: string): string =>
  `${prefix}_${digest(value).slice(0, 32)}`;

const canonicalizeUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (/^(?:utm_.+|gclid|fbclid)$/iu.test(key)) parsed.searchParams.delete(key);
    });
    parsed.searchParams.sort();
    if ((parsed.protocol === 'https:' && parsed.port === '443')
      || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    return parsed.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
};

const readIdentityState = (system: Record<string, unknown>): EditorialIdentityState => {
  const parsed = EditorialIdentityStateSchema.safeParse(system.editorialIdentities);
  return parsed.success ? parsed.data : { version: 1, sources: [], claims: [] };
};

const buildCanonicalSources = (
  researchNotes: ResearchNote[],
  existing: EditorialIdentityState['sources']
): EditorialIdentityState['sources'] => {
  const byId = new Map(existing.map((source) => [source.sourceId, source]));
  researchNotes.forEach((note) => {
    if (note.sources.length === 0) {
      const locatorHash = digest(`research_note:${note.id}`);
      const sourceId = identity('src', locatorHash);
      byId.set(sourceId, {
        sourceId,
        kind: 'research_note',
        locatorHash,
        researchNoteId: note.id,
      });
      return;
    }
    note.sources.forEach((source) => {
      const url = canonicalizeUrl(source.url);
      if (!url) return;
      const locatorHash = digest(`url:${url}`);
      const sourceId = identity('src', locatorHash);
      byId.set(sourceId, {
        sourceId,
        kind: 'url',
        locatorHash,
        url,
        researchNoteId: note.id,
      });
    });
  });
  return Array.from(byId.values()).slice(-500);
};

const findingRuleId = (item: FeedbackItem): string => {
  const basis = [
    normalizeText(item.category),
    item.targetField ?? 'body',
    item.verificationStatus ?? 'editorial',
  ].join('::');
  return identity('rule', basis);
};

const isClaimFinding = (item: FeedbackItem): boolean => Boolean(
  item.verificationStatus
  || /source|citation|factual|claim|evidence|provenance|sumber|sitasi|fakta|klaim|bukti|provenans/iu
    .test(`${item.category} ${item.message} ${item.reason ?? ''}`)
);

export const assignPersistentEditorialIdentities = <T extends FeedbackItem>({
  feedback,
  finalDraft,
  system,
  researchNotes = [],
  fallbackCreatedAt,
}: {
  feedback: T[];
  finalDraft: string;
  system: Record<string, unknown>;
  researchNotes?: ResearchNote[];
  fallbackCreatedAt?: Date | string;
}): { feedback: T[]; editorialIdentities: EditorialIdentityState } => {
  const previous = readIdentityState(system);
  const sources = buildCanonicalSources(researchNotes, previous.sources);
  const sourceIdByUrl = new Map(
    sources.flatMap((source) => source.url ? [[source.url, source.sourceId] as const] : [])
  );
  const storedBlocks = readStoredContentBlocks(system);
  const revision = readDraftRevisionIdentity({ system, body: finalDraft, fallbackCreatedAt });
  const claimsById = new Map(previous.claims.map((claim) => [claim.claimId, claim]));

  const identified = feedback.map((item) => {
    const {
      feedbackId: _feedbackId,
      ruleId: _ruleId,
      claimId: _claimId,
      blockId: _blockId,
      sourceIds: _sourceIds,
      ...finding
    } = item;
    const ruleId = findingRuleId(item);
    const block = findStoredContentBlockForText({
      body: finalDraft,
      storedBlocks,
      targetText: item.targetText,
    });
    const targetFingerprint = normalizeText(item.targetText)
      || normalizeText(item.message);
    const targetHash = digest(targetFingerprint);
    const verifiedUrl = canonicalizeUrl(item.verifiedSource);
    let sourceIds: string[] = [];
    if (verifiedUrl) {
      let sourceId = sourceIdByUrl.get(verifiedUrl);
      if (!sourceId) {
        const locatorHash = digest(`url:${verifiedUrl}`);
        sourceId = identity('src', locatorHash);
        sourceIdByUrl.set(verifiedUrl, sourceId);
        sources.push({ sourceId, kind: 'url', locatorHash, url: verifiedUrl });
      }
      sourceIds = [sourceId];
    }
    const claimId = isClaimFinding(item)
      ? identity('claim', `${block?.blockId ?? item.targetField ?? 'body'}::${targetHash}`)
      : undefined;
    if (claimId) {
      claimsById.set(claimId, {
        claimId,
        ruleId,
        ...(block ? { blockId: block.blockId } : {}),
        targetHash,
        sourceIds,
        lastSeenRevisionId: revision.revisionId,
      });
    }
    const findingTarget = claimId ?? block?.blockId ?? `${item.targetField ?? 'body'}:${targetHash}`;
    const feedbackId = identity('feedback', `${ruleId}::${findingTarget}`);
    return {
      ...finding,
      feedbackId,
      ruleId,
      ...(claimId ? { claimId } : {}),
      ...(block ? { blockId: block.blockId } : {}),
      ...(sourceIds.length > 0 ? { sourceIds } : {}),
    } as T;
  });

  return {
    feedback: identified,
    editorialIdentities: {
      version: 1,
      sources: sources.slice(-500),
      claims: Array.from(claimsById.values()).slice(-500),
    },
  };
};

const legacyFindingKey = (item: FeedbackItem): string => [
  normalizeText(item.category),
  normalizeText(item.targetText) || normalizeText(item.message),
].join('::');

/** Restore IDs only from server-persisted findings; client-provided identity fields are discarded. */
export const restoreTrustedFeedbackIdentities = ({
  submitted,
  stored,
}: {
  submitted: FeedbackItem[];
  stored: FeedbackItem[];
}): { feedback: FeedbackItem[]; trustedResolutions: FeedbackItem[] } => {
  const storedByKey = new Map(stored.map((item) => [legacyFindingKey(item), item]));
  const trustedResolutions: FeedbackItem[] = [];
  const feedback = submitted.map((item) => {
    const { feedbackId: _feedbackId, ruleId: _ruleId, claimId: _claimId,
      blockId: _blockId, sourceIds: _sourceIds, ...clientFields } = item;
    const canonical = storedByKey.get(legacyFindingKey(item));
    const restored = canonical
      ? {
          ...clientFields,
          ...(canonical.feedbackId ? { feedbackId: canonical.feedbackId } : {}),
          ...(canonical.ruleId ? { ruleId: canonical.ruleId } : {}),
          ...(canonical.claimId ? { claimId: canonical.claimId } : {}),
          ...(canonical.blockId ? { blockId: canonical.blockId } : {}),
          ...(canonical.sourceIds ? { sourceIds: canonical.sourceIds } : {}),
        }
      : clientFields;
    if (canonical && (restored.isAccepted || restored.isApplied || restored.isVerified)) {
      trustedResolutions.push(restored);
    }
    return restored;
  });
  return { feedback, trustedResolutions };
};
