import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontend = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Content Intelligence UI contract', () => {
  it('loads the authenticated intelligence endpoint in a bounded panel', () => {
    const page = readFrontend(
      'src/app/[locale]/dashboard/content-map/page.tsx'
    );
    const panel = readFrontend(
      'src/app/[locale]/dashboard/content-map/ContentIntelligencePanel.tsx'
    );
    expect(page).toContain('<ContentIntelligencePanel />');
    expect(page).toContain("aria-pressed={activeView === 'intelligence'}");
    expect(panel).toContain("'/api/content-memory/intelligence'");
    expect(panel).toContain('snapshot.clusters.map');
    expect(panel).toContain('snapshot.cannibalizationRisks.map');
    expect(panel).toContain('snapshot.internalLinkOpportunities.map');
    expect(panel).toContain(
      "'/api/content-memory/intelligence/actions'"
    );
    expect(panel).toContain('buildContentIntelligenceCsv(snapshot)');
    expect(panel).toContain('<ContentArtifactPreviewDrawer');
    expect(panel).toContain('setPreviewArtifact(artifact)');
    expect(panel).not.toContain('router.push(localizeHref(artifact.sourceHref))');
  });

  it('keeps all Phase 6 interface copy localized', () => {
    const english = JSON.parse(
      readFrontend('messages/en.json')
    ) as Record<string, Record<string, unknown>>;
    const indonesian = JSON.parse(
      readFrontend('messages/id.json')
    ) as Record<string, Record<string, unknown>>;
    expect(english.ContentMap.intelligence).toBeTruthy();
    expect(indonesian.ContentMap.intelligence).toBeTruthy();
    expect(english.ContentMap.dialogs).toBeTruthy();
    expect(indonesian.ContentMap.actions).toBeTruthy();
  });
});
