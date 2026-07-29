import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'src/routes', path), 'utf8');

describe('Content Memory tenant contract', () => {
  it('scopes registry disclosure and duplicate checks to the active workspace', () => {
    const route = readSource('./content-memory.ts');
    expect(route).toContain('organizationId: workspace.organizationId');
    expect(route).toContain(
      'organizationId: workspace.organizationId,\n      input: input.data'
    );
    expect(route).not.toContain('organizationId: req.body');
  });

  it('keeps search documents rebuildable and reservations expiring', () => {
    const schema = readSource('../../prisma/schema.prisma');
    expect(schema).toContain('model ContentArtifact {');
    expect(schema).toContain('model ContentSearchDocument {');
    expect(schema).toContain('model ContentReservation {');
    expect(schema).toContain('expiresAt');
    expect(schema).toContain(
      '@@unique([organizationId, reservationKey])'
    );
  });

  it('backfills tenant drafts and durable Blueprints', () => {
    const migration = readSource(
      '../../prisma/migrations/20260729180000_add_content_memory_registry/migration.sql'
    );
    expect(migration).toContain('FROM "AnalysisLog" AS log');
    expect(migration).toContain('FROM "StrategistPlanRequest" AS request');
    expect(migration).toContain(
      "'STRATEGIST_BLUEPRINT'::\"ContentSourceType\""
    );
  });

  it('adds derived pgvector retrieval without weakening tenant scope', () => {
    const migration = readSource(
      '../../prisma/migrations/20260729210000_add_content_memory_semantic_retrieval/migration.sql'
    );
    const embeddingService = readSource(
      '../lib/content-memory-embedding.ts'
    );
    expect(migration).toContain('vector(768)');
    expect(migration).toContain('vector_cosine_ops');
    expect(embeddingService).toContain(
      'document."organizationId" = ${params.organizationId}'
    );
    expect(embeddingService).toContain(
      'artifact."organizationId" = ${params.organizationId}'
    );
  });
});
