import {
  CompositePromptNode,
  PromptNode,
  RenderContext,
  FEEDBACK_OUTPUT_PROMPT_SCHEMA,
  POLISH_DIAGNOSIS_OUTPUT_PROMPT_SCHEMA,
  Role
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode, StrictnessConstraintNode, TemporalContextNode, InputBoundaryNode } from '../core/rules';
import { FactualGuardrailNode, SourcePolicyNode } from '../core/facts';
import { OutputSchemaNode, OutputSchemaNodeOptions } from '../core/format';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';

// ─── SCORING RUBRIC Node ──────────────────────────────────────────────────
export class ScoringRubricNode implements PromptNode {
  id = 'core:scoring_rubric';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const rubric = `
Scoring Rubric (0-100):
- 90-100: Publish-ready with no revision. Sharp insight, excellent tone, solid structure.
- 75-89: Minor revision. 1-2 weak areas, but the foundation is strong.
- 60-74: Major revision required. The content has potential but the execution is weak.
- 40-59: Mostly rewrite. The idea may exist, but the implementation fails.
- 0-39: Reject. Generic AI content, no insight, or violates editorial guidelines.

Mandatory FAIL indicators (score must be below 50):
- Opening with "In today's digital era..." / "Amid rapid developments..." / "Dalam era..." / "Di tengah perkembangan..."
- More than 3 passive sentences in a row
- Claims using "many", "some", "experts say", "banyak", "beberapa", or "para ahli" without specific sourcing
- School-essay structure: Definition -> Benefits -> Conclusion / Pengertian -> Manfaat -> Kesimpulan
`.trim();

    if (context.format === 'xml') {
      return `<scoring_rubric>\n${rubric}\n</scoring_rubric>`;
    }
    return `## Scoring Rubric\n${rubric}`;
  }
}

// ─── 1-CLICK APPLY RULE Node ──────────────────────────────────────────────
export class OneClickApplyRuleNode implements PromptNode {
  id = 'core:one_click_apply_rule';
  type = 'core' as const;
  isStatic = true;

  constructor(private brandName: string) {}

  render(context: RenderContext): string {
    const rules = `
1-CLICK APPLY RULE (OPERATION BASED):
You must set the 'operation' field for every revision suggestion:
1. 'replace': Use this when a specific flawed text span should be swapped. You must fill 'targetText' (100% identical to the draft text) and 'replacementText' (the new text).
2. 'insert_before': Use this when an element is missing (for example, a headline) and must be inserted before existing text. Fill 'targetText' with the first 5-10 words of an existing sentence in the draft, then put the new element in 'replacementText' using Markdown when useful, for example '# Headline\\n\\n'.
3. 'insert_after': Use this when you want to add clarification after specific text.
4. 'manual': Use this only for abstract or general editorial judgment.
If status is 'warning' or 'fail', prefer 'replace', 'insert_before', or 'insert_after' whenever possible. Avoid 'manual' unless a direct operation would be unsafe.

MANDATORY FACTUAL SAFEGUARDS:
- Never use 'replace' to change numbers, valuations, funding amounts, dates, entity names, quotes, or factual claims only because you "remember" different data.
- If there is a potential factual issue, data conflict, or questionable reference, use 'manual' or at most 'insert_after' to request verification or citation clarification.
- The only safe condition for 'replace' on factual data is fixing an obvious typo or formatting error without changing the substance of the claim.
- For sensitive factual claims, even when using 'manual', try to fill 'targetText' with a short unique excerpt from the claim that needs verification.

MANDATORY OUTPUT LIMITS:
- Never rewrite or copy the entire article.
- Never repeat article paragraphs outside fields where excerpts are required.
- 'replacementText' must be as short as possible and contain only the needed revision, not a full rewritten article.
- If a revision is too large for one operation, split it into multiple feedback items.
- Maximum 6 feedback items.
- 'targetText' should be a short unique excerpt from the draft, ideally 5-20 words.
- 'replacementText' must be at most one short paragraph or one compact heading+excerpt block.

Example 'insert_before':
{
  "category": "Structure",
  "status": "fail",
  "message": "The article is missing a headline and excerpt.",
  "operation": "insert_before",
  "targetText": "Over the past decade, AI technology",
  "replacementText": "# The Hidden AI Shift\\n\\nAI is no longer just a search tool. It is becoming a decision layer.\\n\\n",
  "reason": "Articles must follow the required editorial structure."
}

Example 'replace':
{
  "category": "Tone",
  "status": "warning",
  "message": "Avoid using passive voice to sound more authoritative.",
  "operation": "replace",
  "targetText": "The report was published by the team.",
  "replacementText": "The team published the report.",
  "reason": "Active voice fits the brand tone guidelines better."
}

Example 'insert_after':
{
  "category": "Factual Accuracy",
  "status": "warning",
  "message": "Add a citation to clarify the source of the market cap number.",
  "operation": "insert_after",
  "targetText": "reaches a valuation of $10 billion",
  "replacementText": " [according to the latest Gartner report](https://gartner.com/report-123)",
  "reason": "Sensitive financial claims require direct source attributions."
}
`.trim();

    if (context.format === 'xml') {
      return `<one_click_apply_rules brand="${this.brandName}">\n${rules}\n</one_click_apply_rules>`;
    }
    return `## 1-Click Apply Rules\n${rules}`;
  }
}

// ─── ROLE INSTRUCTIONS Nodes ──────────────────────────────────────────────
export class ReviewRoleNode implements PromptNode {
  id = 'core:review_role';
  type = 'core' as const;
  isStatic = true;

  constructor(
    private role: Role | 'polish',
    private brandName: string
  ) {}

  render(context: RenderContext): string {
    let content = '';

    if (this.role === 'author') {
      content = `
YOUR ROLE: Writing Co-Pilot - supportive, constructive, and focused on helping the writer improve.
GOAL: Help the writer improve the draft before it moves to the editor stage.

Focus on:
- Is the opening strong enough to pull readers in?
- Does the article deliver the insight promised by the headline?
- Are there sentences or paragraphs that can be cut without losing meaning?
- Does the tone match ${this.brandName}'s standards?

Note: the "verdict" for the author role must always be "approve" or "revise" (never "reject").
Include at least 4 feedback categories. Include "suggestion" on every item with status "fail" or "warning".
`.trim();
    } else if (this.role === 'editor') {
      content = `
YOUR ROLE: Senior Editor & Gatekeeper - strict, objective, and uncompromising on quality.
GOAL: Make the final editorial call: publishable, needs revision, or reject.

WORKING PRINCIPLES:
- You are not the final source of factual truth. You are an editorial and factual risk detector.
- Your task is not to determine "the correct number" from memory, but to identify risky, weakly attributed, odd, ambiguous, or verification-dependent sections.
- If a source seems questionable, critique attribution quality, context clarity, or the need for primary-source verification; do not counter the claim using outside knowledge that is absent from the draft.

Actively detect:
- AI-spam patterns: generic phrasing, rigid structure, filler sentences
- Claims without substance or data
- "Obvious" insights that add little beyond common knowledge
- Tone inconsistency with ${this.brandName}'s standards
- Potential factual risks that should be flagged based on draft evidence, not model memory

ROLE-SPECIFIC FACTUAL RULES:
- Do not offer replacement numbers, valuations, or funding amounts unless the draft itself contains an explicit internal inconsistency.
- If reference sources are listed, evaluate adequacy, attribution clarity, and internal consistency.
- If a claim feels odd, frame it as requiring additional verification, not as a final factual correction.
- Do not cite comparison numbers from memory to show that a claim is "too high", "too low", or "unrealistic".
- For sensitive factual claims, use only neutral language around source verification, citation needs, and attribution clarity.
- For sensitive factual feedback, set "verificationStatus" to one of:
  "source_backed" = the claim appears supported by a clear source,
  "needs_citation" = attribution is imprecise or needs a direct link/citation,
  "high_risk_factual_claim" = the sensitive claim is high-risk and must be verified before publication.
- For sensitive factual feedback with operation "manual", still fill "targetText" when possible so the system can attach a verification annotation to the final draft.

Note: Use all three verdict options when appropriate ("approve" / "revise" / "reject").
Scores below 60 must include at least 1 item in "flags".
Include at least 5 feedback categories.
`.trim();
    } else if (this.role === 'seo') {
      content = `
YOUR ROLE: SEO Specialist - analytical, search-oriented, and focused on article visibility.
GOAL: Evaluate the article's organic search potential and give optimization suggestions without weakening editorial quality.
Production-ready SEO metadata is generated in a separate step. In this step, output SEO evaluation and feedback only.

Focus on:
- Search intent: does the content actually answer what people are searching for?
- Natural keyword density and placement, especially in the headline, H2s, and first paragraph
- Readability and content hierarchy: are H2/H3 headings clear and easy to skim?
- Internal/external linking opportunities: are there specific recommendations?

Note: the "verdict" for the SEO role can be "approve" or "revise".
Include at least 4 SEO-specific feedback categories. Include "suggestion" on every item with status "fail" or "warning".
`.trim();
    } else if (this.role === 'fact-checker') {
      content = `
YOUR ROLE: Fact-Checker & Skeptic - critical, precise, and focused on data accuracy and logical coherence.
GOAL: Identify unsupported claims, unsourced statistics, internal conflicts between claims, and logical fallacies in the article.

Focus on:
- Numbers, percentages, and statistics: is the source clearly identified?
- Names of institutions, studies, or public figures: are they valid and verifiable?
- Superlative claims, for example "largest", "first", "only", "terbesar", "pertama", "satu-satunya", when unsupported by data.
- Logical flaws, for example correlation treated as causation or excessive generalization.

ROLE-SPECIFIC FACTUAL RULES:
- For sensitive factual claims, use only neutral language around source verification, citation needs, and attribution clarity.
- For sensitive factual feedback, set "verificationStatus" to one of:
  "source_backed" = the claim appears supported by a clear source,
  "needs_citation" = attribution is imprecise or needs a direct link/citation,
  "high_risk_factual_claim" = the sensitive claim is high-risk and must be verified before publication.
- For sensitive factual feedback with operation "manual", still fill "targetText" when possible so the system can attach a verification annotation to the final draft.

Note: the "verdict" for the fact-checker role can be "approve", "revise", or "reject".
Scores below 60 must include at least 1 item in "flags".
Include at least 4 fact-checking-specific feedback categories. Include "suggestion" on every item with status "fail" or "warning".
`.trim();
    } else if (this.role === 'polish') {
      content = `
YOUR ROLE: Draft Transformation Editor.

Task:
- Read the raw draft as working material that is not expected to be publish-ready yet.
- Diagnose at most 3 transformation priorities that will be most useful for the rewrite process.
- Identify parts that need sharpening without judging the writer's ability or the raw draft's publishability.
- Protect numbers, names, quotes, dates, and factual claims that must not change during rewrite.

Output rules:
- Do not give a score, verdict, approval, rejection, or pass/fail judgment on the raw draft.
- The summary must be neutral and describe the transformation direction, not judge the writer or raw article.
- Feedback must contain only specific transformation priorities that can be applied during rewrite.
- Use status "warning" for polishing needs and "fail" only for factual/format risks that must be protected or corrected.
- Use the appropriate operation ('replace', 'insert_before', etc.) when there is a specific flawed text span.
- Use 'targetText' and 'replacementText' when needed to point to a concrete sentence issue (limit replacementText to max 50 words).
- Maximum 3 flags.
- Do not rewrite the article.
`.trim();
    }

    if (context.format === 'xml') {
      return `<role_instructions>\n${content}\n</role_instructions>`;
    }
    return `## Role Instructions\n${content}`;
  }
}

// ─── REVIEW PROMPT COMPOSER ───────────────────────────────────────────────
export class ReviewPromptComposer {
  constructor(
    private role: Role | 'polish',
    private profile?: EditorialProfileConfig,
    private options?: OutputSchemaNodeOptions
  ) {}

  compile(_format: 'xml' | 'markdown' | 'text' = 'xml'): CompositePromptNode {
    const brandName = this.profile?.brandName || 'Envoyou';

    // Inisialisasi Core Nodes (Static)
    const missionNode = new EditorialMissionNode();
    const langPolicyNode = new LanguagePolicyNode();
    const strictnessNode = new StrictnessConstraintNode();
    const inputBoundaryNode = new InputBoundaryNode();
    const temporalContextNode = new TemporalContextNode();
    const factualNode = new FactualGuardrailNode();

    // Source Policy Node
    const sourcePolicyNode = new SourcePolicyNode(this.profile?.sourcePolicy);

    // Scoring Rubric & 1-Click Apply
    const scoringRubricNode = new ScoringRubricNode();
    const oneClickNode = new OneClickApplyRuleNode(brandName);

    // Role-specific Node
    const roleNode = new ReviewRoleNode(this.role, brandName);

    // Output Schema Contract Node
    const targetSchema = this.role === 'polish'
      ? POLISH_DIAGNOSIS_OUTPUT_PROMPT_SCHEMA
      : FEEDBACK_OUTPUT_PROMPT_SCHEMA;
    const schemaNode = new OutputSchemaNode(targetSchema, this.options);

    // Inisialisasi Tenant Nodes (Dynamic/Tenant specific)
    const brandNode = this.profile
      ? new BrandIdentityNode(this.profile)
      : null;
    const toneNode = this.profile
      ? new ToneCalibrationNode(this.profile)
      : null;

    // Susun semua node ke Composite Node
    const root = new CompositePromptNode(`review_prompt_composer_${this.role}`);
    root.addChild(missionNode);
    root.addChild(roleNode);
    root.addChild(langPolicyNode);
    root.addChild(strictnessNode);
    root.addChild(inputBoundaryNode);

    // Hanya role tertentu yang membutuhkan Faktual & Temporal context
    if (this.role !== 'seo') {
      root.addChild(temporalContextNode);
      root.addChild(factualNode);
      root.addChild(sourcePolicyNode);
    }

    if (this.role === 'editor') {
      root.addChild(scoringRubricNode);
    }

    if (this.role !== 'polish') {
      root.addChild(oneClickNode);
    }

    root.addChild(schemaNode);

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
