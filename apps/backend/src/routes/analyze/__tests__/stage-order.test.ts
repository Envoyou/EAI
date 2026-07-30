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

  it('rechecks the complete publication package after standalone SEO generation', () => {
    const source = readHandler('publication.ts');
    const seoEvent = source.indexOf("ctx.sendEvent('seo_metadata', seo)");
    const packageQualityGate = source.indexOf("publicationMode: 'publish_ready'", seoEvent);

    expect(seoEvent).toBeGreaterThan(-1);
    expect(packageQualityGate).toBeGreaterThan(seoEvent);
    expect(source).toContain('publicationPackage: seo');
    expect(source).toContain('verdict: qualityGate.readiness');
    expect(source).toContain('readiness: qualityGate.readiness');
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

  it('supplies workspace profile and research context to both rewrite paths', () => {
    const analyze = readHandler('analyze.ts');
    const refine = readHandler('refine.ts');

    for (const source of [analyze, refine]) {
      expect(source).toContain('composeWorkspaceContext({');
      expect(source).toContain('buildResearchNotesSummary(');
      expect(source).toContain('agentInstruction:');
      expect(source).toMatch(/userContent: `\\?\$\{.*WorkspaceXml\}/);
    }
  });

  it('supplies workspace profile and research context to the review stage', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/ai/review-stage.ts'),
      'utf8'
    );

    expect(source).toContain('composeWorkspaceContext({');
    expect(source).toContain('buildResearchNotesSummary(metadata?.researchNotes)');
    expect(source).toContain('workspaceContextXml');
    expect(source).toContain('agentInstruction');
  });

  it('guards authenticated analyze requests against duplicate execution and debit', () => {
    const controller = readFileSync(
      resolve(process.cwd(), 'src/routes/analyze/controller.ts'),
      'utf8'
    );
    const service = readFileSync(
      resolve(process.cwd(), 'src/lib/services/analysis-log.service.ts'),
      'utf8'
    );

    expect(controller).toContain("acquireRequestLease(");
    expect(controller).toContain("where: { userId, requestId }");
    expect(service).toContain('`analysis:${data.userId}:${data.requestId}`');
  });

  it('persists the canonical prompt version and forwards cancellation into Gemini retry', () => {
    const analyze = readHandler('analyze.ts');
    const refine = readHandler('refine.ts');
    const geminiProvider = readFileSync(
      resolve(process.cwd(), 'src/lib/ai/providers/gemini/provider.ts'),
      'utf8'
    );

    expect(analyze).toContain('promptVersion: PROMPT_VERSION');
    expect(refine).toContain('promptVersion: PROMPT_VERSION');
    expect(geminiProvider.match(/signal: request\.signal/g)).toHaveLength(2);
  });
});
