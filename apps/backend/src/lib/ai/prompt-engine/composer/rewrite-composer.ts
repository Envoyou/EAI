import {
  CompositePromptNode,
  PromptNode,
  RenderContext
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode, StrictnessConstraintNode, TemporalContextNode, InputBoundaryNode, MarkdownRulesNode, VerificationLockNode } from '../core/rules';
import { FactualGuardrailNode, SourcePolicyNode } from '../core/facts';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';

// ─── REWRITE ROLE Node ────────────────────────────────────────────────────
export class RewriteRoleNode implements PromptNode {
  id = 'core:rewrite_role';
  type = 'core' as const;
  isStatic = true;

  constructor(
    private brandName: string,
    private positioning: string,
    private tone: string[],
    private audience: string
  ) {}

  render(context: RenderContext): string {
    const instructions = `
You are a senior ${this.brandName} editor responsible for rewriting article drafts into publish-ready articles.

${this.brandName} Editorial Positioning:
"${this.positioning}"
Every article must provide insight, have a clear perspective, remain accessible to a broad professional audience, and still feel premium. Articles must not read like copied news, SEO spam, generic AI content, or empty clickbait.

Task:
Polish the article so it reflects the editorial positioning above and ${this.brandName}'s identity.

${this.brandName} Standards:
- Tone: ${this.tone.join(', ')}.
- Audience: ${this.audience}.
- Short paragraphs, 2-4 sentences each, for comfortable mobile reading.
- Avoid stale introductions and generic AI styling.
- If the draft contains important data, facts, or claims, preserve their substance accurately.
- Strengthen the opening hook so it immediately targets reader curiosity or urgency.
- Make headings insight-driven, not generic noun labels.
`.trim();

    if (context.format === 'xml') {
      return `<rewrite_role_instructions brand="${this.brandName}">\n${instructions}\n</rewrite_role_instructions>`;
    }
    return `## Rewrite Role Instructions\n${instructions}`;
  }
}

// ─── FEW-SHOT DEMONSTRATION Node ──────────────────────────────────────────
export class RewriteFewShotDemoNode implements PromptNode {
  id = 'core:rewrite_few_shot_demo';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const demo = `
=== REWRITE DEMONSTRATION ===
[INPUT DRAFT]
"In today's rapidly evolving digital era, artificial intelligence technology like ChatGPT is widely used by the general public. Many people consider this technology to be very helpful for their daily work."

[REASONING]
1. Input Analysis: The opening uses a strictly prohibited AI cliché ("In today's rapidly evolving digital era..."). The text is too generic ("general public", "very helpful") and lacks a sharp, strategic perspective.
2. Tone Calibration: Shift to a more conversational yet insightful tone suitable for a professional and decision-maker audience.
3. Refinement: Remove fluff and academic jargon. Shift the focus from AI merely being a "helpful tool" to a "fundamental shift in workflow and productivity."

[POLISHED CMS-READY OUTPUT]
"The question is no longer how advanced AI is today, but how quickly it integrates into existing workflows. AI has transitioned from a sandbox experiment to the primary driver of productivity across sectors."
`.trim();

    if (context.format === 'xml') {
      return `<rewrite_few_shot_demonstration>\n${demo}\n</rewrite_few_shot_demonstration>`;
    }
    return demo;
  }
}

// ─── REWRITE PRIORITIES Node ──────────────────────────────────────────────
export class RewritePrioritiesNode implements PromptNode {
  id = 'core:rewrite_priorities';
  type = 'core' as const;
  isStatic = true;

  constructor(private audience: string, private brandName: string) {}

  render(context: RenderContext): string {
    const content = `
REWRITE PRIORITIES (highest first):
1. Data and factual integrity - never compromised.
2. Hook and closing quality - always strengthened without changing factual substance.
3. Argument clarity per section - fix weak, repetitive, or context-jumping sections.
4. Density - reduce redundancies and wordiness only when it does not compromise priorities 1-3.

Mandatory Editorial Guardrails:
- Establish one main thesis from the original draft. Every heading and section must reinforce that same thesis.
- Do not jump to a new topic without a clear cause-and-effect transition from the previous paragraph.
- Use a sharp, objective, rational editorial voice.
- Avoid hyperbolic, sensational, or excessive metaphors such as "brutal", "doomsday", "black hole", "kiamat", or "lubang hitam" unless factually necessary.
- Write for this audience: ${this.audience}.
- Track numbers, statistics, and important entities already mentioned. Do not repeat the same data within 3 paragraphs unless adding a clearly new implication.
- The conclusion must not be a summary or generic call to action. End with 1-2 strategic implications or asymmetric projections that make readers rethink their strategy.
- Do not change numbers, entity names, quotes, or factual claims from the draft except to fix obviously wrong formatting.
- The editorial date may be used only as neutral time orientation when truly needed. Do not automatically insert months, quarters, semesters, beginning/mid/end-of-year framing, or other calendar phases into the opening.
- Do not use the editorial date to create new trend status, outcomes, developments, or data absent from the draft, for example claiming 2026 sales increased or a prediction has been proven merely because the current year is 2026.
- Sentences like "the reality of 2026 shows...", "the 2026 landscape has confirmed...", or "this year has made the trend clearer" are not neutral time orientation; they are new factual claims and may appear only if the substance exists in the source draft.
- Do not guess or invent expansions of abbreviations. If the draft only uses abbreviations such as GDP, FDI, ROI, PDB, or other technical terms without explicit expansions, preserve the abbreviation.
- Do not invent motives, personal interests, or psychological reasons for people/organizations that sources do not state.
- Do not increase source certainty. Wording such as "may", "estimated", or probability language must not become "almost certainly", "certainly", or a new certainty claim.
- Do not add country, region, market, regulatory, or geographic audience context unless requested by the draft, brief, or target audience.
- If geographic implications are requested, frame analysis not present in sources as ${this.brandName} editorial analysis, not as fact or source conclusion.
- Preserve as much of the draft's logical structure and core facts as possible. Rewrite only as needed to improve cohesion, tone, clarity, and argument quality.
- Each section must have one main function: build context, show evidence, explain implications, or draw strategic consequences.
- Connect business or career impact to a specific geography only if that context already exists in the draft, brief, or target audience; do not localize automatically.
- Do not write internal markers such as "[Source verification recommended]", "[Citation recommended]", or editor instruction notes into the final article. EAI handles verification needs in the refinement report.
`.trim();

    if (context.format === 'xml') {
      return `<rewrite_priorities_and_guardrails>\n${content}\n</rewrite_priorities_and_guardrails>`;
    }
    return `## Rewrite Priorities and Guardrails\n${content}`;
  }
}

// ─── SMART INTERNAL LINKING Node ──────────────────────────────────────────
export class RewriteInternalLinkingNode implements PromptNode {
  id = 'core:rewrite_internal_linking';
  type = 'core' as const;
  isStatic = false; // Dinamis berdasarkan list publishedPosts

  constructor(
    private publishedPosts?: { title: string; slug: string }[],
    private baseUrl?: string
  ) {}

  render(context: RenderContext): string {
    if (!this.publishedPosts || this.publishedPosts.length === 0 || !this.baseUrl) {
      return '';
    }

    const postsList = this.publishedPosts
      .map(p => `- "${p.title}" (slug: ${p.slug})`)
      .join('\n');

    const linksSection = `
=== INTERNAL LINKING RULES (SMART INTERNAL LINKING) ===
Here is the list of already-published internal articles:
${postsList}

ADDITIONAL TASK:
If relevant, insert contextual references to related internal articles naturally in the article body using Markdown format: [Anchor Text](${this.baseUrl}/slug).
Do not use stiff, mechanical, or generic CTA phrases such as "read more", "click here", "related article", "baca selengkapnya", "klik di sini", or "baca juga".
Internal links must feel integrated into the sentence flow and should provide extra insight, supporting context, or a deeper exploration path.

GOOD example:
- "This shift aligns with our earlier analysis of [a related topic](${this.baseUrl}/relevant-slug)."

BAD examples (DO NOT USE):
- "Read more about this [here](${this.baseUrl}/slug)."
- "Click here to learn more about [topic](${this.baseUrl}/slug)."
- "Baca juga artikel kami [di sini](${this.baseUrl}/slug)."

Additional link rules:
- Insert at most 1-2 internal references, and only when genuinely relevant to the discussion.
- Judge relevance from the destination article title and slug. If the topic relationship is doubtful or only shares generic words, do not insert the link.
- Anchor text and destination article must meaningfully expand the paragraph's idea, not merely relate loosely to the article category.
- Do not create a new narrative bridge solely to insert a link. No internal link is better than a weakly relevant link.
- Prioritize narrative flow over SEO density.
- Avoid forcing links into unrelated paragraphs.
`.trim();

    if (context.format === 'xml') {
      return `<internal_linking_rules>\n${linksSection}\n</internal_linking_rules>`;
    }
    return linksSection;
  }
}

// ─── OUTPUT RULES Node ─────────────────────────────────────────────────────
export class RewriteOutputFormatNode implements PromptNode {
  id = 'core:rewrite_output_format';
  type = 'core' as const;
  isStatic = true;

  constructor(private isChunkMode: boolean) {}

  render(context: RenderContext): string {
    const chunkRules = this.isChunkMode 
      ? '- Output must process ONLY content from this input chunk\n- Do not complete article sections that are not present in this input chunk'
      : '- Output must be a complete polished article';

    const rules = `
Output rules:
- Reply ONLY with the final article text.
- Preserve and use rich Markdown formatting (headings, list bullets, bold **, etc.) so the article is CMS-ready.
- Heading rule: do not write the article title at the top of the output. The output must begin directly with the first paragraph (Hook). Use H2 (##) or H3 (###) for subheadings. Never use H1 (#) inside the article body.
- Use **bold** for important terms and bullet points (-) for long lists.
- Do not output JSON.
- Do not add an opening or closing explanation.
- Do not wrap the response in a Markdown code block such as \`\`\`markdown ... \`\`\`. Output raw article text only.
${chunkRules}
- Before finalizing, double-check argument cohesion, hyperbole, repeated numbers, closing quality, and Markdown integrity.
`.trim();

    if (context.format === 'xml') {
      return `<output_format_rules>\n${rules}\n</output_format_rules>`;
    }
    return `## Output Format Rules\n${rules}`;
  }
}

// ─── REWRITE PROMPT COMPOSER ──────────────────────────────────────────────
export interface RewriteComposerOptions {
  isChunkMode?: boolean;
  publishedPosts?: { title: string; slug: string }[];
}

export class RewritePromptComposer {
  constructor(
    private profile?: EditorialProfileConfig,
    private options?: RewriteComposerOptions
  ) {}

  compose(format: 'xml' | 'markdown' | 'text' = 'xml'): string {
    const brandName = this.profile?.brandName || 'Envoyou';
    const positioning = this.profile?.positioning || 'Modern tech editorial.';
    const tone = this.profile?.tone || ['professional', 'insightful'];
    const audience = this.profile?.audience || 'professionals';

    // Inisialisasi Core Nodes (Static)
    const missionNode = new EditorialMissionNode();
    const langPolicyNode = new LanguagePolicyNode();
    const strictnessNode = new StrictnessConstraintNode();
    const inputBoundaryNode = new InputBoundaryNode();
    const temporalContextNode = new TemporalContextNode();
    const factualNode = new FactualGuardrailNode();
    const markdownRulesNode = new MarkdownRulesNode();
    const verifLockNode = new VerificationLockNode();

    // Source Policy Node
    const sourcePolicyNode = new SourcePolicyNode(this.profile?.sourcePolicy);

    // Rewrite-Specific Static Nodes
    const roleNode = new RewriteRoleNode(brandName, positioning, tone, audience);
    const fewShotNode = new RewriteFewShotDemoNode();
    const prioritiesNode = new RewritePrioritiesNode(audience, brandName);
    const outputFormatNode = new RewriteOutputFormatNode(!!this.options?.isChunkMode);

    // Rewrite-Specific Dynamic Nodes (Internal Linking)
    const linkingNode = new RewriteInternalLinkingNode(
      this.options?.publishedPosts,
      this.profile?.internalLinkBaseUrl
    );

    // Inisialisasi Tenant Nodes (Dynamic/Tenant specific)
    const brandNode = this.profile
      ? new BrandIdentityNode(this.profile)
      : null;
    const toneNode = this.profile
      ? new ToneCalibrationNode(this.profile)
      : null;

    // Susun semua node ke Composite Node
    const root = new CompositePromptNode('rewrite_prompt_composer');
    root.addChild(missionNode);
    root.addChild(roleNode);
    root.addChild(langPolicyNode);
    root.addChild(strictnessNode);
    root.addChild(inputBoundaryNode);
    root.addChild(temporalContextNode);
    root.addChild(factualNode);
    root.addChild(sourcePolicyNode);
    root.addChild(prioritiesNode);
    root.addChild(fewShotNode);
    root.addChild(markdownRulesNode);
    root.addChild(verifLockNode);
    root.addChild(outputFormatNode);

    // Dynamic nodes
    root.addChild(linkingNode);
    if (brandNode) {
      root.addChild(brandNode);
    }
    if (toneNode) {
      root.addChild(toneNode);
    }

    // Render dengan format sasaran
    const context: RenderContext = {
      format,
      brandName
    };

    return root.render(context);
  }
}
