import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DraftRevisionAssessment } from '@/lib/draft-revision-impact';

export const DraftChangeOriginSchema = z.enum([
  'initial_analysis',
  'refine',
  'manual_edit',
  'apply_feedback',
  'bulk_feedback',
  'targeted_fix',
  'remove_content',
  'add_source',
  'accept_feedback',
  'legacy',
]);

export type DraftChangeOrigin = z.infer<typeof DraftChangeOriginSchema>;

const ContentBlockTypeSchema = z.enum([
  'heading',
  'paragraph',
  'list',
  'table',
  'blockquote',
  'code',
]);

export type ContentBlockType = z.infer<typeof ContentBlockTypeSchema>;

export const DraftRevisionIdentitySchema = z.object({
  revisionId: z.string().min(1).max(100),
  previousRevisionId: z.string().min(1).max(100).optional(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
});

export type DraftRevisionIdentity = z.infer<typeof DraftRevisionIdentitySchema>;

export const StoredContentBlockSchema = z.object({
  blockId: z.string().min(1).max(100),
  type: ContentBlockTypeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  index: z.number().int().nonnegative(),
});

export type StoredContentBlock = z.infer<typeof StoredContentBlockSchema>;

export type ChangedBlock = {
  blockId: string;
  type: ContentBlockType;
  changeType: 'insert' | 'update' | 'delete';
  beforeContentHash?: string;
  afterContentHash?: string;
  beforeIndex?: number;
  afterIndex?: number;
};

export type DraftChangeSet = DraftRevisionIdentity & DraftRevisionAssessment & {
  origin: DraftChangeOrigin;
  changedBlocks: ChangedBlock[];
};

type ParsedBlock = {
  type: ContentBlockType;
  contentHash: string;
  index: number;
  content: string;
};

export const computeDraftBodyHash = (body: string): string =>
  createHash('sha256')
    .update(body.normalize('NFKC').replace(/\r\n?/gu, '\n'))
    .digest('hex');

const classifyBlock = (value: string): ContentBlockType => {
  const trimmed = value.trim();
  if (/^#{1,6}\s+/u.test(trimmed)) return 'heading';
  if (/^```|^(?:\t| {4})/u.test(trimmed)) return 'code';
  if (/^>\s?/u.test(trimmed)) return 'blockquote';
  if (/^(?:[-+*]\s+|\d+[.)]\s+)/u.test(trimmed)) return 'list';
  if (trimmed.includes('|') && trimmed.includes('\n')) return 'table';
  return 'paragraph';
};

const parseContentBlocks = (body: string): ParsedBlock[] =>
  body
    .replace(/\r\n?/gu, '\n')
    .split(/\n\s*\n/gu)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({
      type: classifyBlock(block),
      contentHash: computeDraftBodyHash(block),
      index,
      content: block,
    }));

const createBlockId = (): string => `blk_${randomUUID()}`;

const createBlocks = (body: string): StoredContentBlock[] =>
  parseContentBlocks(body).map(({ content: _content, ...block }) => ({
    ...block,
    blockId: createBlockId(),
  }));

const normalizeBlockSearchText = (value: string): string =>
  value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();

export const findStoredContentBlockForText = ({
  body,
  storedBlocks,
  targetText,
}: {
  body: string;
  storedBlocks: StoredContentBlock[];
  targetText?: string;
}): StoredContentBlock | undefined => {
  const normalizedTarget = normalizeBlockSearchText(targetText ?? '');
  if (!normalizedTarget) return undefined;
  const parsed = parseContentBlocks(body);
  const aligned = alignPreviousBlocks(body, storedBlocks);
  const match = parsed.find((block) => {
    const normalizedContent = normalizeBlockSearchText(block.content);
    return normalizedContent.includes(normalizedTarget)
      || (normalizedTarget.length >= 24 && normalizedTarget.includes(normalizedContent));
  });
  return match ? aligned[match.index] : undefined;
};

export const readStoredContentBlocks = (
  system: Record<string, unknown>
): StoredContentBlock[] => {
  const parsed = z.array(StoredContentBlockSchema).safeParse(system.contentBlocks);
  return parsed.success ? parsed.data : [];
};

const alignPreviousBlocks = (
  previousBody: string,
  storedBlocks: StoredContentBlock[]
): StoredContentBlock[] => {
  const parsed = parseContentBlocks(previousBody);
  const storedMatches = parsed.length === storedBlocks.length
    && parsed.every((block, index) => {
      const stored = storedBlocks[index];
      return stored?.contentHash === block.contentHash && stored.type === block.type;
    });
  if (storedMatches) return storedBlocks;
  return parsed.map(({ content: _content, ...block }) => ({
    ...block,
    blockId: `legacy_blk_${block.contentHash.slice(0, 20)}_${block.index}`,
  }));
};

const reconcileContentBlocks = ({
  previousBody,
  nextBody,
  storedBlocks,
}: {
  previousBody: string;
  nextBody: string;
  storedBlocks: StoredContentBlock[];
}): { contentBlocks: StoredContentBlock[]; changedBlocks: ChangedBlock[] } => {
  const previousBlocks = alignPreviousBlocks(previousBody, storedBlocks);
  const nextParsed = parseContentBlocks(nextBody);
  const claimedPreviousIds = new Set<string>();
  const exactQueues = new Map<string, StoredContentBlock[]>();

  previousBlocks.forEach((block) => {
    const key = `${block.type}:${block.contentHash}`;
    exactQueues.set(key, [...(exactQueues.get(key) ?? []), block]);
  });

  const assignments: Array<StoredContentBlock | undefined> = nextParsed.map((block) => {
    const key = `${block.type}:${block.contentHash}`;
    const exact = exactQueues.get(key)?.find(
      (candidate) => !claimedPreviousIds.has(candidate.blockId)
    );
    if (exact) {
      claimedPreviousIds.add(exact.blockId);
      return exact;
    }
    return undefined;
  });

  const contentBlocks = nextParsed.map((block, index) => {
    const exact = assignments[index];
    if (exact) {
      const { content: _content, ...storedBlock } = block;
      return { ...storedBlock, blockId: exact.blockId };
    }
    const nearest = previousBlocks
      .filter((candidate) =>
        candidate.type === block.type && !claimedPreviousIds.has(candidate.blockId)
      )
      .sort((left, right) =>
        Math.abs(left.index - block.index) - Math.abs(right.index - block.index)
      )[0];
    if (nearest && Math.abs(nearest.index - block.index) <= 2) {
      claimedPreviousIds.add(nearest.blockId);
      const { content: _content, ...storedBlock } = block;
      return { ...storedBlock, blockId: nearest.blockId };
    }
    const { content: _content, ...storedBlock } = block;
    return { ...storedBlock, blockId: createBlockId() };
  });

  const previousById = new Map(previousBlocks.map((block) => [block.blockId, block]));
  const currentById = new Map(contentBlocks.map((block) => [block.blockId, block]));
  const changedBlocks: ChangedBlock[] = [];

  contentBlocks.forEach((block) => {
    const previous = previousById.get(block.blockId);
    if (!previous) {
      changedBlocks.push({
        blockId: block.blockId,
        type: block.type,
        changeType: 'insert',
        afterContentHash: block.contentHash,
        afterIndex: block.index,
      });
    } else if (previous.contentHash !== block.contentHash) {
      changedBlocks.push({
        blockId: block.blockId,
        type: block.type,
        changeType: 'update',
        beforeContentHash: previous.contentHash,
        afterContentHash: block.contentHash,
        beforeIndex: previous.index,
        afterIndex: block.index,
      });
    }
  });

  previousBlocks.forEach((block) => {
    if (currentById.has(block.blockId)) return;
    changedBlocks.push({
      blockId: block.blockId,
      type: block.type,
      changeType: 'delete',
      beforeContentHash: block.contentHash,
      beforeIndex: block.index,
    });
  });

  return { contentBlocks, changedBlocks };
};

export const readDraftRevisionIdentity = ({
  system,
  body,
  fallbackCreatedAt,
}: {
  system: Record<string, unknown>;
  body: string;
  fallbackCreatedAt?: Date | string;
}): DraftRevisionIdentity => {
  const bodyHash = computeDraftBodyHash(body);
  const parsed = DraftRevisionIdentitySchema.safeParse(system.draftRevision);
  if (parsed.success && parsed.data.bodyHash === bodyHash) return parsed.data;
  return {
    revisionId: `legacy_${bodyHash.slice(0, 32)}`,
    bodyHash,
    createdAt: new Date(fallbackCreatedAt ?? 0).toISOString(),
  };
};

export const readDraftRevisionFromMetadata = ({
  metadata,
  body,
  fallbackCreatedAt,
}: {
  metadata: unknown;
  body: string;
  fallbackCreatedAt?: Date | string;
}): DraftRevisionIdentity => {
  const root = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const system = root._system && typeof root._system === 'object' && !Array.isArray(root._system)
    ? root._system as Record<string, unknown>
    : {};
  return readDraftRevisionIdentity({ system, body, fallbackCreatedAt });
};

export const createInitialDraftRevision = ({
  body,
  origin,
}: {
  body: string;
  origin: Extract<DraftChangeOrigin, 'initial_analysis' | 'refine'>;
}): {
  draftRevision: DraftRevisionIdentity;
  contentBlocks: StoredContentBlock[];
  revisionOrigin: DraftChangeOrigin;
} => ({
  draftRevision: {
    revisionId: `rev_${randomUUID()}`,
    bodyHash: computeDraftBodyHash(body),
    createdAt: new Date().toISOString(),
  },
  contentBlocks: createBlocks(body),
  revisionOrigin: origin,
});

export const createDraftChangeSet = ({
  previousBody,
  nextBody,
  origin,
  assessment,
  system,
  fallbackCreatedAt,
}: {
  previousBody: string;
  nextBody: string;
  origin: DraftChangeOrigin;
  assessment: DraftRevisionAssessment;
  system: Record<string, unknown>;
  fallbackCreatedAt?: Date | string;
}): {
  draftRevision: DraftRevisionIdentity;
  contentBlocks: StoredContentBlock[];
  changeSet: DraftChangeSet;
} => {
  const previousRevision = readDraftRevisionIdentity({
    system,
    body: previousBody,
    fallbackCreatedAt,
  });
  const { contentBlocks, changedBlocks } = reconcileContentBlocks({
    previousBody,
    nextBody,
    storedBlocks: readStoredContentBlocks(system),
  });
  const draftRevision: DraftRevisionIdentity = {
    revisionId: `rev_${randomUUID()}`,
    previousRevisionId: previousRevision.revisionId,
    bodyHash: computeDraftBodyHash(nextBody),
    createdAt: new Date().toISOString(),
  };
  return {
    draftRevision,
    contentBlocks,
    changeSet: {
      ...assessment,
      ...draftRevision,
      origin,
      changedBlocks,
    },
  };
};

export class DraftRevisionMismatchError extends Error {
  constructor() {
    super('The draft changed while validation was running. The outdated result was discarded.');
    this.name = 'DraftRevisionMismatchError';
  }
}

export const assertDraftRevisionMatches = ({
  current,
  expectedRevisionId,
  expectedBodyHash,
}: {
  current: DraftRevisionIdentity;
  expectedRevisionId?: string;
  expectedBodyHash?: string;
}): void => {
  if (
    (expectedRevisionId && current.revisionId !== expectedRevisionId)
    || (expectedBodyHash && current.bodyHash !== expectedBodyHash)
  ) {
    throw new DraftRevisionMismatchError();
  }
};
