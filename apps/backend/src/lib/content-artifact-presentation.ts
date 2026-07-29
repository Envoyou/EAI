import { Prisma, type ContentSourceType } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  cleanContentLabel,
  extractArticleTitle,
} from '@/lib/content-labels';

type PresentableArtifact = {
  id: string;
  createdByUserId: string | null;
  sourceType: ContentSourceType;
  sourceId: string | null;
  canonicalArtifactId: string | null;
  title: string | null;
  topic: string | null;
  angle: string | null;
  primaryKeyword: string | null;
  searchIntent: string | null;
  createdBy: { name: string | null } | null;
};

type AnalysisPresentationRow = {
  id: string;
  sourceRef: string | null;
  generatedTitle: string | null;
  workingTitle: string | null;
  systemWorkingTitle: string | null;
  metadataTitle: string | null;
  quickDraftTitle: string | null;
  metadataAngle: string | null;
  quickDraftBrief: string | null;
  metadataKeyword: string | null;
  quickDraftKeyword: string | null;
  metadataSearchIntent: string | null;
  quickDraftSearchIntent: string | null;
  contentExcerpt: string;
  lastExportStatus: string | null;
  lastExportedAt: string | null;
};

export type ContentArtifactPresentation = {
  title: string | null;
  topic: string | null;
  angle: string | null;
  primaryKeyword: string | null;
  searchIntent: string | null;
  sourceId: string | null;
  sourceHref: string | null;
  ownerName: string | null;
  exportStatus: 'not_exported' | 'exported' | 'failed';
  lastExportedAt: string | null;
  canonicalArtifactId: string | null;
  canManage: boolean;
  metadataRepaired: boolean;
};

const normalizePresentationText = (
  value: string | null | undefined
): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const presentationKey = (
  artifact: Pick<PresentableArtifact, 'sourceType' | 'sourceId'>
) => `${artifact.sourceType}:${artifact.sourceId ?? ''}`;

const loadAnalysisPresentationRows = async (
  organizationId: string,
  artifacts: PresentableArtifact[]
): Promise<AnalysisPresentationRow[]> => {
  const directIds = [
    ...new Set(
      artifacts
        .filter(
          (artifact) =>
            artifact.sourceType !== 'STRATEGIST_BLUEPRINT' &&
            artifact.sourceType !== 'CMS_IMPORT'
        )
        .map((artifact) => artifact.sourceId)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const sourceRefs = [
    ...new Set(
      artifacts
        .filter((artifact) => artifact.sourceType === 'ANALYSIS')
        .map((artifact) => artifact.sourceId)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const predicates: Prisma.Sql[] = [];
  if (directIds.length > 0) {
    predicates.push(Prisma.sql`log."id" IN (${Prisma.join(directIds)})`);
  }
  if (sourceRefs.length > 0) {
    predicates.push(
      Prisma.sql`log."metadata"->>'sourceRef' IN (${Prisma.join(sourceRefs)})`
    );
  }
  if (predicates.length === 0) return [];

  return prisma.$queryRaw<AnalysisPresentationRow[]>`
    SELECT
      log."id",
      log."metadata"->>'sourceRef' AS "sourceRef",
      log."metadata"#>>'{generatedMetadata,title}' AS "generatedTitle",
      log."metadata"->>'workingTitle' AS "workingTitle",
      log."metadata"#>>'{_system,workingTitle}' AS "systemWorkingTitle",
      log."metadata"->>'title' AS "metadataTitle",
      log."metadata"#>>'{metadataInput,workingTitle}' AS "quickDraftTitle",
      log."metadata"->>'angle' AS "metadataAngle",
      log."metadata"#>>'{metadataInput,brief}' AS "quickDraftBrief",
      log."metadata"->>'primaryKeyword' AS "metadataKeyword",
      log."metadata"#>>'{metadataInput,primaryKeyword}' AS "quickDraftKeyword",
      log."metadata"->>'searchIntent' AS "metadataSearchIntent",
      log."metadata"#>>'{metadataInput,searchIntent}' AS "quickDraftSearchIntent",
      LEFT(log."content", 2000) AS "contentExcerpt",
      log."metadata"#>>'{exportStatus,lastExportStatus}' AS "lastExportStatus",
      log."metadata"#>>'{exportStatus,lastExportedAt}' AS "lastExportedAt"
    FROM "AnalysisLog" AS log
    WHERE log."organizationId" = ${organizationId}
      AND log."status" = 'success'
      AND (${Prisma.join(predicates, ' OR ')})
    ORDER BY log."createdAt" DESC
    LIMIT 600
  `;
};

export const getContentArtifactPresentations = async (params: {
  organizationId: string;
  artifacts: PresentableArtifact[];
  viewerUserId: string;
  viewerCanManageAll: boolean;
}): Promise<Map<string, ContentArtifactPresentation>> => {
  const rows = await loadAnalysisPresentationRows(
    params.organizationId,
    params.artifacts
  );
  const logById = new Map<string, AnalysisPresentationRow>();
  const latestLogBySourceRef = new Map<string, AnalysisPresentationRow>();
  for (const row of rows) {
    if (!logById.has(row.id)) logById.set(row.id, row);
    if (row.sourceRef && !latestLogBySourceRef.has(row.sourceRef)) {
      latestLogBySourceRef.set(row.sourceRef, row);
    }
  }

  return new Map(
    params.artifacts.map((artifact) => {
      const log =
        (artifact.sourceId ? logById.get(artifact.sourceId) : undefined) ??
        (artifact.sourceId
          ? latestLogBySourceRef.get(artifact.sourceId)
          : undefined);
      const title =
        cleanContentLabel(log?.generatedTitle) ??
        cleanContentLabel(log?.workingTitle) ??
        cleanContentLabel(log?.systemWorkingTitle) ??
        cleanContentLabel(log?.metadataTitle) ??
        cleanContentLabel(log?.quickDraftTitle) ??
        extractArticleTitle(log?.contentExcerpt) ??
        cleanContentLabel(artifact.title) ??
        cleanContentLabel(artifact.topic) ??
        cleanContentLabel(artifact.angle);
      const topic =
        cleanContentLabel(artifact.topic, 2_000) ??
        cleanContentLabel(artifact.primaryKeyword, 300) ??
        title;
      const angle =
        cleanContentLabel(log?.metadataAngle, 2_000) ??
        cleanContentLabel(log?.quickDraftBrief, 2_000) ??
        cleanContentLabel(artifact.angle, 2_000);
      const primaryKeyword =
        cleanContentLabel(log?.metadataKeyword, 300) ??
        cleanContentLabel(log?.quickDraftKeyword, 300) ??
        cleanContentLabel(artifact.primaryKeyword, 300);
      const searchIntent =
        cleanContentLabel(log?.metadataSearchIntent, 1_000) ??
        cleanContentLabel(log?.quickDraftSearchIntent, 1_000) ??
        cleanContentLabel(artifact.searchIntent, 1_000);
      const exportStatus =
        log?.lastExportStatus === 'success'
          ? 'exported'
          : log?.lastExportStatus === 'failed'
            ? 'failed'
            : 'not_exported';
      const sourceId = log?.id ?? artifact.sourceId;
      const sourceHref =
        log && sourceId ? `/workspace?history=${encodeURIComponent(sourceId)}` : null;
      const metadataRepaired =
        normalizePresentationText(title) !==
          normalizePresentationText(artifact.title) ||
        normalizePresentationText(topic) !==
          normalizePresentationText(artifact.topic) ||
        normalizePresentationText(angle) !==
          normalizePresentationText(artifact.angle) ||
        normalizePresentationText(primaryKeyword) !==
          normalizePresentationText(artifact.primaryKeyword);

      return [
        presentationKey(artifact),
        {
          title,
          topic,
          angle,
          primaryKeyword,
          searchIntent,
          sourceId,
          sourceHref,
          ownerName: artifact.createdBy?.name ?? null,
          exportStatus,
          lastExportedAt: log?.lastExportedAt ?? null,
          canonicalArtifactId: artifact.canonicalArtifactId,
          canManage:
            params.viewerCanManageAll ||
            artifact.createdByUserId === params.viewerUserId,
          metadataRepaired,
        },
      ];
    })
  );
};

export const getArtifactPresentation = (
  presentations: Map<string, ContentArtifactPresentation>,
  artifact: Pick<PresentableArtifact, 'sourceType' | 'sourceId'>
) => presentations.get(presentationKey(artifact));
