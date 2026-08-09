import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('history bulk delete contract', () => {
  const historyRoute = readFileSync(
    resolve(process.cwd(), 'src/routes/history.ts'),
    'utf8'
  );

  it('validates bounded IDs and resolves families from metadata', () => {
    expect(historyRoute).toContain('const BulkDeleteHistorySchema');
    expect(historyRoute).toContain('.min(1).max(100)');
    expect(historyRoute).toContain('readHistorySourceRef(log.metadata) ?? log.id');
    expect(historyRoute).not.toContain('select: { id: true, sourceRef: true');
  });

  it('keeps lookup and deletion inside the active organization', () => {
    expect(historyRoute).toContain('id: { in: ids },\n        organizationId,');
    expect(historyRoute).toContain('WHERE log."organizationId" = ${organizationId}');
    expect(historyRoute).toContain('id: { in: deletionIds },\n          organizationId,');
  });

  it('marks canonical artifacts deleted in the same transaction', () => {
    expect(historyRoute).toContain('runSerializableTransaction(async (tx) => {');
    expect(historyRoute).toContain('tx.contentArtifact.updateMany');
    expect(historyRoute).toContain('status: ContentArtifactStatus.DELETED');
    expect(historyRoute).toContain('deletedArtifactCount: artifactUpdate.count');
  });
});
