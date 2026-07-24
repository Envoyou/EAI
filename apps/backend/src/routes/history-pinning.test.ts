import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('history pinning contract', () => {
  const route = readSource('./history.ts');
  const schema = readSource('../../prisma/schema.prisma');
  const migration = readSource(
    '../../prisma/migrations/20260724043000_add_analysis_log_pinning/migration.sql'
  );

  it('persists and returns pin state with pinned drafts ordered first', () => {
    expect(schema).toContain('isPinned      Boolean');
    expect(schema).toContain('@@index([organizationId, isPinned, createdAt])');
    expect(route).toContain('isPinned: z.boolean().optional()');
    expect(route).toContain("{ isPinned: 'desc' }");
    expect(route).toContain('...(isPinned !== undefined ? { isPinned } : {})');
    expect(migration).toContain(
      'ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false'
    );
  });
});
