import { describe, expect, test } from 'vitest';
import { normalizeSeoMetadata, type FinalQualityGateOutput } from '@eai/shared';
import { applyDeterministicQualityChecks, detectSourceFidelitySignals, hasIncompleteMetadataEnding } from '@/lib/final-quality';
import { VisualFormatSelectionPolicyNode } from '@/lib/ai/prompt-engine/core/format';
import { SeoPromptComposer } from '@/lib/ai/prompt-engine/composer/seo-composer';
import { RewritePromptComposer } from '@/lib/ai/prompt-engine/composer/rewrite-composer';
import { ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { preparePublicationDraft, resolvePublicationPackageStatus } from '@/routes/analyze/utils/text';
import { sanitizeSuppressiveFeedbackItem } from '@/routes/analyze/utils/factual';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const missingH1Result = (): FinalQualityGateOutput => ({
  readiness: 'needs_review',
  summary: 'The body needs a title.',
  changes: ['Improved the opening.'],
  feedback: [{
    category: 'No H1 Title',
    status: 'warning',
    message: 'The draft lacks a primary H1 title.',
    suggestion: 'Insert # A New Title before the opening paragraph.',
    operation: 'insert_before',
    targetText: 'Opening paragraph.',
    replacementText: '# A New Title\n\nOpening paragraph.',
  }],
  flags: ['No H1 Title'],
});

describe('publication title contract', () => {
  test('publication preparation removes a rogue leading H1 deterministically', () => {
    expect(preparePublicationDraft('# Working Title\n\nOpening paragraph.'))
      .toBe('Opening paragraph.');
  });

  test('publication preparation promotes orphaned H3 headings without touching Mermaid', () => {
    expect(preparePublicationDraft([
      'Opening paragraph.',
      '',
      '### First section',
      '',
      '```mermaid',
      '### diagram label',
      '```',
    ].join('\n'))).toContain('## First section\n\n```mermaid\n### diagram label');
  });

  test('body mutations invalidate a current publication package', () => {
    expect(resolvePublicationPackageStatus({
      storedStatus: 'current',
      hasPackage: true,
      bodyChanged: true,
    })).toBe('stale');
    expect(resolvePublicationPackageStatus({
      storedStatus: 'current',
      hasPackage: true,
      bodyChanged: false,
    })).toBe('current');
  });

  test('Fast mode never requires publication fields or an H1 in the body', () => {
    const result = applyDeterministicQualityChecks(
      missingH1Result(),
      'Opening paragraph.\n\n## Section\n\nBody.',
      'Opening paragraph.',
      { publicationMode: 'fast', language: 'en' }
    );

    expect(result.feedback).toHaveLength(0);
    expect(result.flags).not.toContain('No H1 Title');
    expect(result.readiness).toBe('ready');
  });

  test('Publish Ready treats the package title as the page H1', () => {
    const result = applyDeterministicQualityChecks(
      missingH1Result(),
      'Opening paragraph.\n\n## Section\n\nBody.',
      'Opening paragraph.',
      {
        publicationMode: 'publish_ready',
        documentTitle: 'Canonical CMS Article Title',
        language: 'en',
      }
    );

    expect(result.feedback).toHaveLength(0);
    expect(result.flags).not.toContain('No H1 Title');
  });

  test('Publish Ready cannot be ready with a dangling metadata ending', () => {
    const article = Array.from(
      { length: 300 },
      (_, index) => `word${index + 1}`
    ).join(' ');
    const result = applyDeterministicQualityChecks(
      { ...missingH1Result(), readiness: 'ready', feedback: [], flags: [] },
      article,
      article,
      {
        publicationMode: 'publish_ready',
        documentTitle: 'Canonical CMS Article Title',
        language: 'en',
        seoRules: ENVOYOU_EDITORIAL_PROFILE.config.seoRules,
        publicationPackage: {
          title: 'Canonical CMS Article Title',
          slug: 'canonical-cms-article-title',
          excerpt: 'A complete excerpt that summarizes the article for CMS readers.',
          metaTitle: 'A Complete Search Title for Editorial Teams',
          metaDescription: 'Learn how teams improve publication metadata through',
          tags: ['Editorial', 'SEO', 'Publishing'],
        },
      }
    );

    expect(result.readiness).toBe('blocked');
    expect(result.feedback[0]?.targetField).toBe('publication.metaDescription');
  });

  test('audits the Blog Admin publication recommendations deterministically', () => {
    const result = applyDeterministicQualityChecks(
      { ...missingH1Result(), readiness: 'ready', feedback: [], flags: [] },
      'Short article body.',
      'Different source body.',
      {
        publicationMode: 'publish_ready',
        documentTitle: 'Canonical CMS Article Title',
        language: 'en',
        seoRules: ENVOYOU_EDITORIAL_PROFILE.config.seoRules,
        publicationPackage: {
          title: 'Canonical CMS Article Title',
          slug: 'an-overly-long-slug-for-the-current-cms-article',
          excerpt: 'Too short.',
          metaTitle: 'Short search title',
          metaDescription: 'A complete meta description that accurately summarizes the current article.',
          tags: ['Editorial', 'SEO', 'Publishing'],
        },
      }
    );

    expect(result.readiness).toBe('blocked');
    expect(result.feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'fail',
        targetField: 'publication.excerpt',
      }),
      expect.objectContaining({
        status: 'warning',
        targetField: 'publication.metaTitle',
      }),
      expect.objectContaining({
        status: 'warning',
        targetField: 'publication.slug',
      }),
      expect.objectContaining({
        status: 'warning',
        targetField: 'body',
      }),
    ]));
  });

  test('publication-field feedback cannot become a body text operation', () => {
    const item = sanitizeSuppressiveFeedbackItem({
      category: 'Publication Title',
      status: 'warning',
      message: 'The publication title is too vague.',
      suggestion: 'Rewrite the title field.',
      operation: 'insert_before',
      targetField: 'publication.title',
      targetText: 'Opening paragraph.',
      replacementText: '# Replacement title',
    }, 'Opening paragraph.');

    expect(item.operation).toBe('manual');
    expect(item.targetField).toBe('publication.title');
    expect(item.targetText).toBeUndefined();
    expect(item.replacementText).toBeUndefined();
  });

  test('does not praise an unsafe visual that is flagged for source fidelity', () => {
    const input: FinalQualityGateOutput = {
      readiness: 'needs_review',
      summary: 'One visual needs review.',
      changes: [
        'Added a clean Mermaid workflow diagram.',
        'Improved the opening hook.',
      ],
      feedback: [{
        category: 'Source Fidelity',
        status: 'warning',
        verificationStatus: 'needs_citation',
        message: 'The Mermaid diagram contains unsupported workflow stages.',
        suggestion: 'Remove unsupported nodes from the diagram.',
        operation: 'manual',
        targetField: 'body',
      }],
      flags: ['Unsupported Visual Claim'],
    };

    const result = applyDeterministicQualityChecks(
      input,
      'Opening paragraph.',
      'Opening paragraph.',
      { publicationMode: 'fast', language: 'en' }
    );

    expect(result.changes).toEqual([]);
  });
});

describe('publication readiness reconciliation', () => {
  test('supports an explicit persisted confirmation for a stale publication package', () => {
    const historyRoute = readFileSync(
      resolve(process.cwd(), 'src/routes/history.ts'),
      'utf8'
    );

    expect(historyRoute).toContain("action: z.literal('confirm_publication_package')");
    expect(historyRoute).toContain("publicationPackageStatus: 'current'");
    expect(historyRoute).toContain('seoConfirmedAt: confirmedAt');
    expect(historyRoute).toContain(
      'Generate and save publication metadata before confirming it.'
    );
  });

  test('a fail always produces blocked readiness', () => {
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: 'A serious issue remains.',
        changes: ['Reviewed the draft.'],
        feedback: [{
          category: 'Source Fidelity',
          status: 'fail',
          message: 'The draft contains an unsupported factual claim.',
          operation: 'manual',
        }],
        flags: [],
      },
      'Opening paragraph.',
      'Opening paragraph.',
      { publicationMode: 'fast', language: 'en' }
    );

    expect(result.readiness).toBe('blocked');
  });

  test('post-processing can retain more than the provider batch of five findings', () => {
    const feedback = Array.from({ length: 8 }, (_, index) => ({
      category: `Editorial check ${index + 1}`,
      status: 'warning' as const,
      message: `Resolve editorial issue ${index + 1}.`,
      operation: 'manual' as const,
    }));
    const result = applyDeterministicQualityChecks(
      {
        readiness: 'needs_review',
        summary: 'Several issues remain.',
        changes: ['Reviewed the draft.'],
        feedback,
        flags: [],
      },
      'Opening paragraph.',
      'Opening paragraph.',
      { publicationMode: 'fast', language: 'en' }
    );

    expect(result.feedback).toHaveLength(8);
  });
});

describe('publication internal-link exceptions', () => {
  const readyResult = (): FinalQualityGateOutput => ({
    readiness: 'ready',
    summary: 'The draft is ready.',
    changes: [],
    feedback: [],
    flags: [],
  });

  test('does not flag an exact internal URL that the editor confirmed', () => {
    const confirmedUrl = 'https://blog.envoyou.com/posts/confirmed-article';
    const result = applyDeterministicQualityChecks(
      readyResult(),
      `Read [the confirmed article](${confirmedUrl}).`,
      'Read the confirmed article.',
      {
        language: 'en',
        publicationMode: 'fast',
        trustedInternalDomains: ['blog.envoyou.com'],
        trustedInternalUrls: [confirmedUrl],
      }
    );

    expect(result.feedback).toHaveLength(0);
    expect(result.flags).not.toContain('Internal Link Review');
    expect(result.readiness).toBe('ready');
  });

  test('still flags a different unconfirmed URL on the same internal domain', () => {
    const confirmedUrl = 'https://blog.envoyou.com/posts/confirmed-article';
    const unconfirmedUrl = 'https://blog.envoyou.com/posts/unconfirmed-article';
    const result = applyDeterministicQualityChecks(
      readyResult(),
      [
        `[Confirmed](${confirmedUrl}).`,
        `[Unconfirmed](${unconfirmedUrl}).`,
      ].join('\n'),
      'Read the related articles.',
      {
        language: 'en',
        publicationMode: 'fast',
        trustedInternalDomains: ['blog.envoyou.com'],
        trustedInternalUrls: [confirmedUrl],
      }
    );

    expect(result.feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'Internal Linking',
        message: expect.stringContaining(unconfirmedUrl),
      }),
    ]));
    expect(result.flags).toContain('Internal Link Review');
    expect(result.readiness).toBe('needs_review');
  });
});

describe('visual and acronym policy', () => {
  test('defaults to prose and makes visual elements optional', () => {
    const prompt = new VisualFormatSelectionPolicyNode().render({ format: 'xml' });
    expect(prompt).toContain('Visual elements are optional, not mandatory');
    expect(prompt).toContain('Default to prose');
    expect(prompt).toContain('Do not invent operational stages, KPIs, integrations, APIs');
  });

  test('Fast rewrite prompt activates the strict source boundary', () => {
    const prompt = new RewritePromptComposer(ENVOYOU_EDITORIAL_PROFILE.config, {
      sourceOnly: true,
    }).compose('xml');
    expect(prompt).toContain('<fast_source_fidelity>');
    expect(prompt).toContain('Do not add examples, entities, products, platforms, metrics');
  });

  test('generic API and KPI abbreviations are not treated as novel entities', () => {
    const signals = detectSourceFidelitySignals(
      'The team measures operational performance.',
      'The team uses API integration and KPI tracking for operational performance.'
    );
    expect(signals.novelEntities).not.toContain('API');
    expect(signals.novelEntities).not.toContain('KPI');
  });
});

describe('SEO metadata boundaries', () => {
  test('normalizes long metadata without cutting words or sentences', () => {
    const metadata = normalizeSeoMetadata({
      title: 'Generative Engine Optimization for Sustainable AI Citation Authority',
      slug: 'generative-engine-optimization',
      excerpt: 'A complete excerpt for editorial readers.',
      metaTitle: 'Generative Engine Optimization (GEO): The Future of AI Citation Authority',
      metaDescription: 'Discover why traditional SEO is shifting to Generative Engine Optimization. Learn how to secure your brand authority through entity signals and structured data.',
      coverImageAltText: 'A digital visualization of connected entities and citation authority signals',
      tags: ['SEO', 'Artificial Intelligence', 'Publishing'],
    }, 'Opening paragraph.\n\nA sufficiently long article description for fallback metadata generation.');

    expect(metadata.metaTitle).toBe('Generative Engine Optimization (GEO): The Future of AI Citation');
    expect(metadata.metaTitle).not.toContain('Authority');
    expect(metadata.metaDescription).toBe('Discover why traditional SEO is shifting to Generative Engine Optimization. Learn how to secure your brand authority through entity signals and structured data.');
  });

  test('repairs a long single-sentence description instead of emitting an ellipsis', () => {
    const metadata = normalizeSeoMetadata({
      title: 'Disciplined Adaptability for Modern Enterprise Leadership',
      slug: 'disciplined-adaptability-modern-enterprise-leadership',
      excerpt: 'A complete summary of disciplined adaptability for modern enterprise leadership teams.',
      metaTitle: 'Disciplined Adaptability in Modern Enterprise Leadership',
      metaDescription: 'Learn how modern organizations balance technological integration, stewardship, and disciplined adaptability to navigate operational complexity and improve resilient leadership execution across distributed enterprise teams',
      coverImageAltText: 'Enterprise leaders reviewing an adaptive operating strategy.',
      tags: ['Leadership', 'Enterprise', 'Artificial Intelligence'],
    }, 'Opening paragraph.\n\nA sufficiently long article description for fallback metadata generation.');

    expect(metadata.metaDescription.length).toBeLessThanOrEqual(160);
    expect(metadata.metaDescription).toMatch(/\.$/);
    expect(metadata.metaDescription).not.toContain('\u2026');
    expect(metadata.metaDescription).not.toMatch(/\band improve\.$/);
    expect(metadata.metaDescription).toContain('navigate operational complexity.');
    expect(hasIncompleteMetadataEnding(metadata.metaDescription)).toBe(false);
  });

  test('publishes active tenant limits in the SEO prompt', () => {
    const prompt = new SeoPromptComposer(ENVOYOU_EDITORIAL_PROFILE.config).compose('xml');
    expect(prompt).toContain('metaTitle: aim for 30-70 characters');
    expect(prompt).toContain('metaDescription: 50-160 characters');
    expect(prompt).toContain('excerpt: 50-300 characters');
    expect(prompt).toContain('6 words or fewer is ideal');
    expect(prompt).toContain('at least 300 words');
    expect(prompt).toContain('never cut a word');
    expect(prompt).toContain('never use an ellipsis');
  });

  test('detects dangling metadata connectors', () => {
    expect(hasIncompleteMetadataEnding('Learn how teams publish with')).toBe(true);
    expect(hasIncompleteMetadataEnding('Learn how teams publish with confidence\u2026')).toBe(true);
    expect(hasIncompleteMetadataEnding('Learn how teams publish with confidence.')).toBe(false);
    expect(hasIncompleteMetadataEnding('The Future of AI')).toBe(false);
  });
});
