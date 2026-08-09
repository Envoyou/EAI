import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../analytics.ts'), 'utf8');

describe('editorial evaluation export contract', () => {
  it('registers the owner-only export before the dynamic detail route', () => {
    const exportRoute = source.indexOf("router.get('/editorial-evaluations/export'");
    const detailRoute = source.indexOf("router.get('/editorial-evaluations/:id'");

    expect(exportRoute).toBeGreaterThan(-1);
    expect(detailRoute).toBeGreaterThan(exportRoute);
    expect(source.slice(exportRoute, detailRoute)).toContain('isOwnerUser(userId)');
    expect(source.slice(exportRoute, detailRoute)).toContain("res.status(403).json({ error: 'Forbidden' })");
  });

  it('streams filtered JSONL without user or revision actor identifiers', () => {
    const exportRoute = source.indexOf("router.get('/editorial-evaluations/export'");
    const detailRoute = source.indexOf("router.get('/editorial-evaluations/:id'");
    const contract = source.slice(exportRoute, detailRoute);

    expect(contract).toContain("Content-Type', 'application/x-ndjson; charset=utf-8'");
    expect(contract).toContain("Cache-Control', 'private, no-store, max-age=0'");
    expect(contract).toContain('userId: undefined');
    expect(contract).toContain('actorUserId: undefined');
    expect(contract).toContain('incomingTransitions');
    expect(contract).toContain('take: 100');
    expect(contract).toContain('organization: { editorialEvaluationConsent: true }');
  });
});
