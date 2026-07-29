import type {
  ContentIntelligenceArtifact,
  ContentIntelligenceSnapshot,
} from '@eai/shared';

type CsvValue = string | number | boolean | null | undefined;

const csvCell = (value: CsvValue): string => {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const csvDocument = (rows: CsvValue[][]): string =>
  `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

const dateStamp = (value = new Date()): string =>
  value.toISOString().slice(0, 10);

export const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const artifactValues = (
  artifact: ContentIntelligenceArtifact
): CsvValue[] => [
  artifact.id,
  artifact.title,
  artifact.topic,
  artifact.angle,
  artifact.primaryKeyword,
  artifact.searchIntent,
  artifact.stage,
  artifact.status,
  artifact.sourceType,
  artifact.ownerName,
  artifact.exportStatus,
  artifact.lastExportedAt,
  artifact.updatedAt,
];

const artifactHeaders = [
  'Artifact ID',
  'Article title',
  'Topic',
  'Angle',
  'Primary keyword',
  'Search intent',
  'Editorial stage',
  'Registry status',
  'Source',
  'Owner',
  'Export status',
  'Last exported at',
  'Updated at',
];

export const buildContentInventoryCsv = (
  artifacts: ContentIntelligenceArtifact[]
): string =>
  csvDocument([
    artifactHeaders,
    ...artifacts.map((artifact) => artifactValues(artifact)),
  ]);

export const contentInventoryFilename = (now = new Date()) =>
  `eai_content_inventory_${dateStamp(now)}.csv`;

export const buildContentIntelligenceCsv = (
  snapshot: ContentIntelligenceSnapshot
): string => {
  const rows: CsvValue[][] = [
    [
      'Section',
      'Record ID',
      ...artifactHeaders.slice(1),
      'Related article',
      'Metric',
      'Recommendation or rationale',
    ],
    [
      'summary',
      'generated_at',
      snapshot.generatedAt,
      ...Array(artifactHeaders.length - 2).fill(''),
      '',
      snapshot.analyzedArtifactCount,
      `semantic_coverage=${snapshot.semanticCoverage}`,
    ],
  ];

  for (const cluster of snapshot.clusters) {
    for (const artifact of cluster.artifacts) {
      rows.push([
        'topic_cluster',
        cluster.id,
        ...artifactValues(artifact).slice(1),
        '',
        cluster.coverage,
        `cluster=${cluster.label}; artifacts=${cluster.artifactCount}; published=${cluster.publishedCount}`,
      ]);
    }
  }
  for (const risk of snapshot.cannibalizationRisks) {
    rows.push([
      'cannibalization_risk',
      risk.id,
      ...artifactValues(risk.left).slice(1),
      risk.right.title ?? risk.right.topic,
      risk.score,
      `${risk.severity}; ${risk.recommendation}; ${risk.reasons.join('|')}`,
    ]);
  }
  for (const gap of snapshot.gaps) {
    rows.push([
      'content_gap',
      gap.id,
      gap.suggestedAngle,
      gap.topic,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      gap.relatedArtifacts
        .map((artifact) => artifact.title ?? artifact.topic)
        .filter(Boolean)
        .join(' | '),
      gap.source,
      gap.rationale,
    ]);
  }
  for (const recommendation of snapshot.updateRecommendations) {
    rows.push([
      'update_recommendation',
      recommendation.id,
      ...artifactValues(recommendation.artifact).slice(1),
      recommendation.relatedArtifact?.title ??
        recommendation.relatedArtifact?.topic,
      recommendation.priority,
      `${recommendation.reason}; age_days=${recommendation.ageDays}`,
    ]);
  }
  for (const opportunity of snapshot.internalLinkOpportunities) {
    rows.push([
      'internal_link',
      opportunity.id,
      ...artifactValues(opportunity.from).slice(1),
      opportunity.to.title ?? opportunity.to.topic,
      opportunity.score,
      opportunity.reason,
    ]);
  }
  return csvDocument(rows);
};

export const contentIntelligenceFilename = (now = new Date()) =>
  `eai_content_intelligence_${dateStamp(now)}.csv`;
