import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('article family lineage contract', () => {
  const planHandler = readSource('src/routes/strategist/handlers/plan.ts');
  const quickDraftRoute = readSource('src/routes/strategist/quick-draft.ts');
  const notesRoute = readSource(
    'src/routes/strategist/handlers/draft-from-notes.ts'
  );
  const analysisService = readSource('src/lib/services/analysis-log.service.ts');
  const presentationService = readSource(
    'src/lib/content-artifact-presentation.ts'
  );

  it('commits a durable sourceRef with every Strategist article origin', () => {
    expect(planHandler).toContain('sourceRef: requestId');
    expect(quickDraftRoute).toContain(
      'metadata?.sourceRef?.trim() || contentGuardRequestId'
    );
    expect(notesRoute).toContain(
      'metadata?.sourceRef?.trim() || contentGuardRequestId'
    );
    expect(quickDraftRoute).toContain('sourceId: lifecycleSourceRef');
    expect(notesRoute).toContain('sourceId: lifecycleSourceRef');
  });

  it('links analyzed derivatives to the tenant-scoped origin artifact', () => {
    expect(analysisService).toContain('resolveLifecycleRootArtifactId({');
    expect(analysisService).toContain('organizationId: data.organizationId');
    expect(analysisService).toContain('rootArtifactId,');
  });

  it('sends completion only after Draft from Notes persistence', () => {
    const createPosition = notesRoute.indexOf('prisma.analysisLog.create');
    const donePosition = notesRoute.indexOf("type: 'done'", createPosition);

    expect(createPosition).toBeGreaterThan(-1);
    expect(donePosition).toBeGreaterThan(createPosition);
    expect(notesRoute.slice(donePosition)).toContain(
      'sourceRef: lifecycleSourceRef'
    );
  });

  it('resolves current and legacy presentation records', () => {
    expect(presentationService).toContain(
      "artifact.sourceType !== 'STRATEGIST_BLUEPRINT'"
    );
    expect(presentationService).toContain(
      `log."metadata"->>'sourceRef' IN`
    );
    expect(presentationService).toContain('log."id" IN');
  });
});
