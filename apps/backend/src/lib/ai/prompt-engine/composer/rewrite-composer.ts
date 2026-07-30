import {
  CompositePromptNode,
  PromptNode,
  RenderContext
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode, StrictnessConstraintNode, TemporalContextNode, InputBoundaryNode, MarkdownRulesNode, VerificationLockNode } from '../core/rules';
import { FactualGuardrailNode, FastSourceFidelityNode, SourcePolicyNode } from '../core/facts';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';
import { VisualFormatSelectionPolicyNode } from '../core/format';

// ─── REWRITE ROLE Node ────────────────────────────────────────────────────
export class RewriteRoleNode implements PromptNode {
  id = 'core:rewrite_role';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const instructions = `
You are a senior editorial rewrite specialist responsible for transforming article drafts into publication-quality article bodies.

Task:
- Rewrite the draft according to the active editorial profile and the explicit per-article context.
- Treat the editorial profile as the default for positioning, tone, structure, and audience.
- If articleContext.targetAudience is present, treat it as the explicit audience for this article; otherwise use the profile audience.
- Match the opening, headings, paragraph rhythm, and conclusion to the article type, editorial brief, and publication primary goal instead of forcing a single magazine or marketing style.
- Preserve important data, facts, claims, uncertainty, and source attribution accurately.
- Avoid copied-news phrasing, SEO spam, generic AI filler, and empty clickbait.
`.trim();

    if (context.format === 'xml') {
      return `<rewrite_role_instructions>\n${instructions}\n</rewrite_role_instructions>`;
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
"In today's rapidly changing environment, the survey found that 62% of respondents review the report every week. This result is very important for the team."

[POLISHED ARTICLE OUTPUT]
"The survey found that **62% of respondents review the report every week**. That recurring use makes the finding directly relevant to the team's next decision."
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

  render(context: RenderContext): string {
    const content = `
REWRITE PRIORITIES (highest first):
1. Data and factual integrity - never compromised.
2. Opening and closing quality - improve them in a way that fits the article type and editorial brief.
3. Argument clarity per section - fix weak, repetitive, or context-jumping sections.
4. Density - reduce redundancies and wordiness only when it does not compromise priorities 1-3.

Mandatory Editorial Guardrails:
- Establish one main thesis from the original draft. Every heading and section must reinforce that same thesis.
- DO NOT jump to a new topic without a clear cause-and-effect transition from the previous paragraph.
- Use the voice defined by the active editorial profile and per-article context.
- Avoid hyperbolic, sensational, or excessive metaphors such as "brutal", "doomsday", "black hole", "kiamat", or "lubang hitam" unless factually necessary.
- Track numbers, statistics, and important entities already mentioned. DO NOT repeat the same data within 3 paragraphs unless adding a clearly new implication.
- The conclusion must serve the article's purpose and publication primary goal. Avoid a generic summary or unrelated call to action.
- DO NOT change numbers, entity names, quotes, or factual claims from the draft except to fix obviously wrong formatting.
- The editorial date may be used only as neutral time orientation when truly needed. DO NOT automatically insert months, quarters, semesters, beginning/mid/end-of-year framing, or other calendar phases into the opening.
- DO NOT use the editorial date to create new trend status, outcomes, developments, or data absent from the draft, for example claiming 2026 sales increased or a prediction has been proven merely because the current year is 2026.
- Sentences like "the reality of 2026 shows...", "the 2026 landscape has confirmed...", or "this year has made the trend clearer" are not neutral time orientation; they are new factual claims and may appear only if the substance exists in the source draft.
- DO NOT guess or invent expansions of abbreviations. If the draft only uses abbreviations such as GDP, FDI, ROI, PDB, or other technical terms without explicit expansions, preserve the abbreviation.
- DO NOT invent motives, personal interests, or psychological reasons for people/organizations that sources DO NOT state.
- DO NOT increase source certainty. Wording such as "may", "estimated", or probability language must not become "almost certainly", "certainly", or a new certainty claim.
- DO NOT add country, region, market, regulatory, or geographic audience context unless requested by the draft, brief, or target audience.
- If geographic implications are requested, label analysis not present in sources as editorial analysis, not as fact or a source conclusion.
- Preserve as much of the draft's logical structure and core facts as possible. Rewrite only as needed to improve cohesion, tone, clarity, and argument quality.
- Each section must have one main function: build context, show evidence, explain implications, or draw strategic consequences.
- Connect business or career impact to a specific geography only if that context already exists in the draft, brief, or target audience; DO NOT localize automatically.
- DO NOT write internal markers such as "[Source verification recommended]", "[Citation recommended]", or editor instruction notes into the final article. SYSTEM handles verification needs in the refinement report.
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
DO NOT use stiff, mechanical, or generic CTA phrases such as "read more", "click here", "related article", "baca selengkapnya", "klik di sini", or "baca juga".
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
- DO NOT create a new narrative bridge solely to insert a link. No internal link is better than a weakly relevant link.
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
- Heading rule: DO NOT write the article title at the top of the output. The output must begin directly with the first paragraph (Hook). Use H2 (##) for every primary section. Use H3 (###) only beneath a preceding H2, never as the first or only heading. Never use H1 (#) inside the article body.
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
  sourceOnly?: boolean;
}

export class RewritePromptComposer {
  constructor(
    private profile?: EditorialProfileConfig,
    private options?: RewriteComposerOptions
  ) {}

  compile(_format: 'xml' | 'markdown' | 'text' = 'xml'): CompositePromptNode {
    // Inisialisasi Core Nodes (Static)
    const missionNode = new EditorialMissionNode();
    const langPolicyNode = new LanguagePolicyNode();
    const strictnessNode = new StrictnessConstraintNode();
    const inputBoundaryNode = new InputBoundaryNode();
    const temporalContextNode = new TemporalContextNode();
    const factualNode = new FactualGuardrailNode();
    const markdownRulesNode = new MarkdownRulesNode();
    const visualFormatNode = new VisualFormatSelectionPolicyNode();
    const verifLockNode = new VerificationLockNode();

    // Source Policy Node
    const sourcePolicyNode = new SourcePolicyNode(this.profile?.sourcePolicy);

    // Rewrite-Specific Static Nodes
    const roleNode = new RewriteRoleNode();
    const fewShotNode = new RewriteFewShotDemoNode();
    const prioritiesNode = new RewritePrioritiesNode();
    const fastSourceFidelityNode = this.options?.sourceOnly
      ? new FastSourceFidelityNode()
      : null;
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
    if (fastSourceFidelityNode) root.addChild(fastSourceFidelityNode);
    root.addChild(fewShotNode);
    root.addChild(markdownRulesNode);
    root.addChild(visualFormatNode);
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

    return root;
  }

  compose(format: 'xml' | 'markdown' | 'text' = 'xml'): string {
    const brandName = this.profile?.brandName || 'Envoyou';
    const root = this.compile(format);
    const context: RenderContext = {
      format,
      brandName
    };
    return root.render(context);
  }
}
