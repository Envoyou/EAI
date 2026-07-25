import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readHandler = (filename: string) =>
  readFileSync(resolve(process.cwd(), 'src/routes/analyze/handlers', filename), 'utf8');

const expectSeoBeforeQualityGate = (source: string) => {
  const seoStatus = source.indexOf("sendEvent('status', 'generating_seo')");
  const qualityGateStatus = source.indexOf("sendEvent('status', 'quality_gate')");

  expect(seoStatus).toBeGreaterThan(-1);
  expect(qualityGateStatus).toBeGreaterThan(seoStatus);
};

describe('analyze pipeline stage order', () => {
  it('runs SEO before Quality Gate for analyze', () => {
    expectSeoBeforeQualityGate(readHandler('analyze.ts'));
  });

  it('runs SEO before Quality Gate for refine', () => {
    expectSeoBeforeQualityGate(readHandler('refine.ts'));
  });

  it('keeps the dev mock aligned with draft-producing production modes', () => {
    const source = readHandler('dev-mock.ts');

    expect(source).toContain("const producesDraft = isPolishMode || mode === 'refine'");
    expectSeoBeforeQualityGate(source);
  });

  it('exposes standalone publication stages without invoking rewrite', () => {
    const source = readHandler('publication.ts');

    expect(source).toContain('handleQualityGateOnly');
    expect(source).toContain('handleGenerateSeo');
    expect(source).toContain("ctx.sendEvent('status', 'quality_gate')");
    expect(source).toContain("ctx.sendEvent('status', 'generating_seo')");
    expect(source).not.toContain("ctx.sendEvent('status', 'rewriting')");
  });

  it('reuses saved editorial decisions and research context in standalone Quality Gate', () => {
    const source = readHandler('publication.ts');

    expect(source).toContain('readQualityResolutions(system)');
    expect(source).toContain('resolvedQualityFindings');
    expect(source).toContain('trustedSourceUrls');
    expect(source).toContain('ResearchNotesArraySchema.safeParse(metadata.researchNotes)');
  });

  it('validates targeted replacements against source fidelity before returning them', () => {
    const source = readHandler('fix-targeted.ts');
    const stage = readFileSync(
      resolve(process.cwd(), 'src/lib/ai/targeted-fix-stage.ts'),
      'utf8'
    );

    expect(source).toContain('originalDraft: originalDraft || text ||');
    expect(stage).toContain('<source_draft>');
    expect(stage).toContain('detectSourceFidelitySignals');
    expect(stage).toContain('<retry_correction>');
  });
});
