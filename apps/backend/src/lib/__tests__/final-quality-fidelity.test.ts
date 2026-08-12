import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyDeterministicQualityChecks,
  collectDomainEntityAliases,
  detectSourceFidelitySignals,
} from '../final-quality';

describe('Final Quality Deterministic Fidelity Checks', () => {
  it('targets an acronym token instead of matching it inside enterprises', () => {
    const finalDraft = [
      'While most enterprises remain in experimental pilots, operational efficiency is improving.',
      'The integration connects ERP and CRM workflows across business units.',
    ].join('\n\n');
    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      finalDraft,
      'Most organizations remain in experimental pilots.'
    );
    const finding = result.feedback.find((item) =>
      item.category === 'Source Fidelity' && item.message.includes('"ERP"')
    );

    expect(finding?.targetText).toBe(
      'The integration connects ERP and CRM workflows across business units.'
    );
  });

  it('does not flag a year promoted from source URL into reference anchor text', () => {
    const original = `- [bi.go.id](https://www.bi.go.id/en/iru/presentation/Documents/Republic%20of%20Indonesia%20Presentation%20Book%20-%20Green%20Policy%20Q3-2025.pdf)`;
    const final = `* [Bank Indonesia Presentation Book – Green Policy Q3-2025](https://www.bi.go.id/en/iru/presentation/Documents/Republic%20of%20Indonesia%20Presentation%20Book%20-%20Green%20Policy%20Q3-2025.pdf)`;

    const signals = detectSourceFidelitySignals(original, final);
    expect(signals.novelNumbers).not.toContain('2025');
  });

  it('recognizes an acronym derived from an official source domain', () => {
    const original = `- [gggi.org](https://gggi.org/report)\n- [undp.org](https://undp.org/report)`;
    const final = `* [Global Green Growth Institute (GGGI)](https://gggi.org/report)\n* [UNDP](https://undp.org/report)`;

    const aliases = collectDomainEntityAliases([
      'https://gggi.org/report',
      'https://undp.org/report',
    ]);
    expect(aliases.has('GGGI')).toBe(true);
    expect(aliases.has('UNDP')).toBe(true);

    const signals = detectSourceFidelitySignals(original, final);
    expect(signals.novelEntities).not.toContain('GGGI');
    expect(signals.novelEntities).not.toContain('UNDP');
  });

  it('does not treat a clearly hypothetical percentage as an article fact', () => {
    const finalDraft = [
      'Consider a hypothetical scenario where an unverified claim is introduced.',
      'For example, if a draft includes a statement such as "AI search reduced publisher traffic by 40%", a passive tool merely flags the sentence.',
    ].join(' ');

    const signals = detectSourceFidelitySignals('', finalDraft, { trustedEntities: ['EAI'] });

    expect(signals.novelNumbers).not.toContain('40%');

    const checked = applyDeterministicQualityChecks(
      {
        readiness: 'blocked',
        summary: '',
        changes: [],
        feedback: [{
          category: 'Source Fidelity',
          status: 'fail',
          verificationStatus: 'needs_citation',
          message: 'The final draft adds numbers not found in the source draft: "40%".',
          suggestion: 'Verify or remove the number.',
          targetText: finalDraft,
          operation: 'manual',
        }],
        flags: [],
      },
      finalDraft,
      '',
      { trustedEntities: ['EAI'] }
    );
    expect(checked.feedback).toEqual([]);
    expect(checked.readiness).toBe('ready');
  });

  it('still flags a percentage asserted as a real result', () => {
    const finalDraft = 'AI search reduced publisher traffic by 40% according to the latest results.';

    const signals = detectSourceFidelitySignals('', finalDraft, { trustedEntities: ['EAI'] });

    expect(signals.novelNumbers).toContain('40%');
  });

  it('does not let a nearby hypothetical example hide a separate factual assertion', () => {
    const finalDraft = [
      'For example, if a draft contains a hypothetical claim that traffic fell by 40%, the editor should inspect it.',
      'This discussion then continues with enough neutral context to separate the example from the reported outcome.',
      'The organization reported that conversion increased by 40% after deployment.',
    ].join(' ');

    const signals = detectSourceFidelitySignals('', finalDraft);

    expect(signals.novelNumbers).toContain('40%');
  });

  it('does not classify generic URL terminology as an identity entity', () => {
    const finalDraft = 'EAI postpones metadata generation such as SEO titles, descriptions, and URL slugs.';

    const signals = detectSourceFidelitySignals('', finalDraft);

    expect(signals.novelEntities).not.toContain('URL');
    expect(signals.novelEntities).not.toContain('SEO');

    const checked = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: '',
        changes: [],
        feedback: [{
          category: 'Source Fidelity',
          status: 'warning',
          verificationStatus: 'needs_citation',
          message: 'The final draft adds entities or identity attributes not found in the source draft: "URL".',
          suggestion: 'Verify this identity attribute.',
          targetText: finalDraft,
          operation: 'manual',
        }],
        flags: [],
      },
      finalDraft,
      '',
      { trustedEntities: ['EAI'] }
    );
    expect(checked.feedback).toEqual([]);
  });

  it('accepts an internal URL supplied to the rewrite stage', () => {
    const trustedInternalUrls = [
      'https://blog.envoyou.com/posts/lean-resilient-global-supply-chain-volatility',
    ];
    const finalDraft = `[navigating global supply chain volatility](https://blog.envoyou.com/posts/lean-resilient-global-supply-chain-volatility)`;

    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      finalDraft,
      '',
      { trustedInternalUrls, trustedInternalDomains: ['blog.envoyou.com'] }
    );

    expect(result.flags).not.toContain('Internal Link Review');
  });

  it('flags an internal URL absent from the supplied catalog', () => {
    const trustedInternalUrls = [
      'https://blog.envoyou.com/posts/known-post',
    ];
    const finalDraft = `[Unverified link](https://blog.envoyou.com/posts/invented-post)`;

    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      finalDraft,
      '',
      { trustedInternalUrls, trustedInternalDomains: ['blog.envoyou.com'] }
    );

    expect(result.flags).toContain('Internal Link Review');
  });

  it('verifies blended finance real-world fixture regression', () => {
    const sourceFixture = readFileSync(
      resolve(__dirname, './fixtures/blended-finance-source.md'),
      'utf-8'
    );
    const polishedFixture = readFileSync(
      resolve(__dirname, './fixtures/blended-finance-polished.md'),
      'utf-8'
    );

    const trustedInternalUrls = [
      'https://blog.envoyou.com/posts/lean-resilient-global-supply-chain-volatility',
    ];
    const result = applyDeterministicQualityChecks(
      { readiness: 'ready', summary: '', changes: [], feedback: [], flags: [] },
      polishedFixture,
      sourceFixture,
      { trustedInternalUrls, trustedInternalDomains: ['blog.envoyou.com'] }
    );

    expect(result.flags).not.toContain('Unsupported Quantitative Claim');
    expect(result.flags).not.toContain('Unsupported Entity Detail');
    expect(result.flags).not.toContain('Internal Link Review');
    expect(result.readiness).not.toBe('blocked');
  });
});
