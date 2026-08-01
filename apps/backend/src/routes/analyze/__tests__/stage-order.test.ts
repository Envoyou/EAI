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

  it('validates and remediates the Refine body before generating final SEO', () => {
    const source = readHandler('refine.ts');
    const bodyGate = source.indexOf("runQualityGate(refinedText, 'fast', null)");
    const seo = source.indexOf('let refineSeo = await runFinalSeo(refinedText)');
    const publishReadyGate = source.indexOf("'publish_ready'", seo);

    expect(bodyGate).toBeGreaterThan(-1);
    expect(seo).toBeGreaterThan(bodyGate);
    expect(publishReadyGate).toBeGreaterThan(seo);
    expect(source).toContain('automaticRounds < 2');
    expect(source).toContain('applyAutomaticDeterministicRemediations');
    expect(source).toContain('runTargetedFixStage');
    expect(source).toContain('deterministicOriginalDraft: qualitySourceCorpus');
    expect(source.indexOf("sendEvent('draft_final', refinedText)")).toBeGreaterThan(publishReadyGate);
    expect(source).toContain('await runRefineAttempt(1, false, false)');
  });

  it('retries an unchanged refinement once and refuses to persist a second no-op', () => {
    const source = readHandler('refine.ts');
    const retry = source.indexOf('await runRefineAttempt(2, true, false)');
    const noOpError = source.indexOf('Refinement did not change the draft after one corrective retry');
    const persistence = source.indexOf('const savedLog = await createAnalysisLogAndDebitCredit');

    expect(source).toContain('<corrective_retry>');
    expect(retry).toBeGreaterThan(-1);
    expect(noOpError).toBeGreaterThan(retry);
    expect(persistence).toBeGreaterThan(noOpError);
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

  it('limits partial SEO refresh to safe fields and preserves protected fields', () => {
    const source = readHandler('publication.ts');
    const start = source.indexOf('export async function handleRefreshSeoFields');
    const partialHandler = source.slice(start);

    expect(start).toBeGreaterThan(-1);
    expect(partialHandler).toContain('SAFE_AUTO_REFRESH_SEO_FIELDS.includes(field)');
    expect(partialHandler).toContain('const merged: PublicationPackage = { ...storedPackage.data }');
    expect(partialHandler).toContain("publicationMode: 'publish_ready'");
    expect(partialHandler).toContain('hasUnsupportedNumbers(field)');
    expect(partialHandler).not.toContain('merged.title = candidate.title');
    expect(partialHandler).not.toContain('merged.metaTitle = candidate.metaTitle');
    expect(partialHandler).not.toContain('merged.slug = candidate.slug');
  });

  it('binds standalone publication results to the exact saved revision', () => {
    const publication = readHandler('publication.ts');
    const controller = readFileSync(
      resolve(process.cwd(), 'src/routes/analyze/controller.ts'),
      'utf8'
    );
    const history = readFileSync(
      resolve(process.cwd(), 'src/routes/history.ts'),
      'utf8'
    );

    expect(controller).toContain("bodyHash: z.string().regex(/^[a-f0-9]{64}$/u).optional()");
    expect(publication).toContain('assertDraftRevisionMatches({');
    expect(publication).toContain('updatePublicationIfRevisionCurrent');
    expect(publication).toContain('runSerializableTransaction(async (tx) =>');
    expect(publication).toContain("ctx.sendEvent('revision_identity', draftRevision)");
    expect(history).toContain('updateAnalysisLogIfRevisionCurrent');
    expect(history).toContain("code: 'DRAFT_REVISION_MISMATCH'");
  });

  it('reuses saved editorial decisions and research context in standalone Quality Gate', () => {
    const source = readHandler('publication.ts');

    expect(source).toContain('readQualityResolutions(system)');
    expect(source).toContain('resolvedQualityFindings');
    expect(source).toContain('trustedSourceUrls');
    expect(source).toContain('ResearchNotesArraySchema.safeParse(metadata.researchNotes)');
  });

  it('versions cached validation results so legacy false-ready results are not reused', () => {
    const source = readHandler('publication.ts');

    expect(source).toContain('policyVersion: VALIDATION_POLICY_VERSION');
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
      expect(source).toMatch(/\$\{(?:rewrite|refine)WorkspaceXml\}/);
      expect(source).toContain('buildEditorialUserContent({');
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

  it('routes automatic revision validation through dependency scope with bounded escalation', () => {
    const controller = readFileSync(
      resolve(process.cwd(), 'src/routes/analyze/controller.ts'),
      'utf8'
    );
    const publication = readHandler('publication.ts');

    expect(controller).toContain("mode === 'validate_revision'");
    expect(controller).toContain('await handleValidateRevision(publicationContext)');
    expect(publication).toContain('const scope = buildValidationScope');
    expect(publication).toContain("scope.validationMode === 'full'");
    expect(publication).toContain('await handleQualityGateOnly(ctx, scope)');
    expect(publication).toContain('deterministicDraft: finalDraft');
    expect(publication).toContain('automatedRounds: 1');
  });
});
