import {
  CompositePromptNode,
  PromptNode,
  RenderContext,
  FINAL_QUALITY_GATE_OUTPUT_PROMPT_SCHEMA
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode, StrictnessConstraintNode, TemporalContextNode, InputBoundaryNode, VerificationLockNode } from '../core/rules';
import { FactualGuardrailNode, SourcePolicyNode } from '../core/facts';
import { OutputSchemaNode, OutputSchemaNodeOptions, VisualFormatSelectionPolicyNode } from '../core/format';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';

// ─── QUALITY GATE ROLE Node ────────────────────────────────────────────────
export class QualityGateRoleNode implements PromptNode {
  id = 'core:quality_gate_role';
  type = 'core' as const;
  isStatic = true;

  constructor(private brandName: string) {}

  render(context: RenderContext): string {
    const roleInstructions = `
You are the editorial quality gate for ${this.brandName} 

Structural integrity checks:
- Detect malformed paragraph boundaries, including missing whitespace or
  concatenated sentences introduced during rewrite.
- Detect duplicated conclusions, repeated closing arguments, or multiple
  competing endings.
- Detect new article content placed after the references section.
- Detect unnecessary appended paragraphs that repeat the existing conclusion
  without adding source-supported information.
- Confirm that the references section, when present, remains the final article
  section.
- Treat these as structural issues, not optional style preferences.

Task:
- Evaluate ONLY the quality of the FINAL DRAFT after rewrite.
- Compare against the source draft only to summarize important changes already made to identify any remaining issues.
- Audit each existing diagram and table for necessity, clarity, and source support.
- Audit for prohibited hyperbole (e.g., "brutal", "kiamat") introduced during rewrite.
- Audit for ungrounded temporal claims (e.g., inventing 2026 trends) that are absent from the source.
- Audit for hallucinated acronym expansions not present in the source.
- Audit for unsupported labels, values, categories, or relationships, and classify them as source-fidelity issues.
- DO NOT flag optional stylistic preferences.
- DO NOT propose a new diagram or table unless a missing representation creates a substantive comprehension problem.
- DO NOT give a numeric score.
- DO NOT judge the source draft; the source draft is raw material.

Change-summary rules:
- Report only material changes introduced by the rewrite.
- Describe what changed without praising it or claiming factual verification unless the supplied sources establish that verification.
- Do not duplicate unresolved issues from feedback inside changes.

Final-draft format checks:
- Confirm that the article body uses valid Markdown structure.
- The body must not contain an H1.
- Flag broken tables, malformed links, raw HTML artifacts, or invalid heading hierarchy only when they remain in the final draft.
- Flag tone or brand-alignment issues only when they are material and remain clearly inconsistent with the editorial profile.

Readiness status:
- "ready": the final draft can be exported to the CMS without any required correction. A human editor may still make optional stylistic edits before publication.
- "needs_review": the final draft can be exported, but one or more identified issues require an explicit human editorial decision or correction before publication.
- "blocked": the final draft must not be exported because it contains a serious factual, structural, completeness, or source-fidelity failure.

Output rules:
- Reply ONLY with JSON.
- Feedback must contain only specific, actionable corrections that a human editor or a refinement step can execute directly on the final draft.
- Every feedback item must include a concise "suggestion" that states the editor's next action.
- For structural issues, include a short exact "targetText" from the affected passage whenever one can be identified. If the issue spans multiple sections and no unique target is safe, use operation "manual" but still provide the required suggestion.
- DO NOT give advice to the writer; the draft is already rewritten.
- Use status "fail" only for issues serious enough to block CMS draft export.
- DO NOT write internal markers such as "[Source verification recommended]" into the final article.
- Maximum 3 flags. If more than 3 issues exist, strictly prioritize factual hallucinations, source-fidelity failures, and structural blocking issues over formatting or tone issues.
- The CMS renders the publication title field as the page H1. The article body must not contain H1.
- Never report a missing H1 merely because the body starts with a paragraph, and never insert "# Title" into the body.
- In fast mode, publication fields are intentionally absent and must not be audited.
- In publish-ready mode, target missing or inaccurate publication fields through targetField, never through a body text insertion.
- Audit each diagram and table for necessity and source support. Unsupported visual labels or relationships are source-fidelity issues.
- URLs listed in trusted_source_urls were explicitly verified by an editor. Do not flag the presence of those exact URLs again.
- A trusted URL does not automatically verify every surrounding claim; continue to flag a materially unsupported claim when the supplied source context does not support it.

Consistency rules:
- If any feedback item has status "fail", readiness must be "blocked".
- If readiness is "ready", feedback must be empty.
- If readiness is "needs_review", feedback may contain only "warning" items.
- DO NOT return a "pass" feedback item; omit resolved or acceptable areas entirely.
`.trim();

    if (context.format === 'xml') {
      return `<quality_gate_role_instructions brand="${this.brandName}">\n${roleInstructions}\n</quality_gate_role_instructions>`;
    }
    return `## Quality Gate Role Instructions\n${roleInstructions}`;
  }
}

export class QualityGateExamplesNode implements PromptNode {
  id = 'core:quality_gate_examples';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const examples = `
=== QUALITY GATE EVALUATION DEMONSTRATION ===
[INPUT SOURCE DRAFT]
"In today's digital era, AI technology is extremely important. Companies are spending billions to adopt AI advisors. Valuations are hitting all-time highs of $500 billion, which many experts say is the future."

[INPUT FINAL POLISHED DRAFT]
"The race for artificial intelligence has shifted from experimental features to institutional deployment. Corporate investments in autonomous agents (Agentic OS) are climbing rapidly. The market projection for this integration now approaches $500 billion, driven by the need for process automation."

[POLISHED QUALITY GATE OUTPUT]
{
  "readiness": "needs_review",
  "summary": "The final draft removes the generic opening and reframes the $500 billion statement as a market projection. The projection still lacks clear attribution and requires editorial verification before publication.",
  "changes": [
    "Replaced the generic opening with a direct description of institutional AI deployment.",
    "Reframed the $500 billion statement from an absolute market claim into a projection."
  ],
  "feedback": [
    {
      "category": "Source Fidelity",
      "status": "warning",
      "message": "Verify and attribute the $500 billion market projection to a specific source.",
      "suggestion": "Check the projection against a primary source, then add precise attribution or remove the unsupported figure.",
      "operation": "manual",
      "targetText": "The market projection for this integration now approaches $500 billion",
      "reason": "The rewrite improves claim precision but does not establish the source or scope of the projection.",
      "verificationStatus": "needs_citation"
    }
  ],
  "flags": [
    "The $500 billion market projection requires source verification."
  ]
}
`.trim();

    if (context.format === 'xml') {
      return `<quality_gate_examples>\n${examples}\n</quality_gate_examples>`;
    }
    return examples;
  }
}

// ─── QUALITY GATE PROMPT COMPOSER ──────────────────────────────────────────
export class QualityGatePromptComposer {
  constructor(
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
    const visualFormatNode = new VisualFormatSelectionPolicyNode();
    const verifLockNode = new VerificationLockNode();

    // Source Policy Node
    const sourcePolicyNode = new SourcePolicyNode(this.profile?.sourcePolicy);

    // Quality Gate Role Node & Output Format
    const roleNode = new QualityGateRoleNode(brandName);
    const schemaNode = new OutputSchemaNode(FINAL_QUALITY_GATE_OUTPUT_PROMPT_SCHEMA, this.options);
    const qgExamplesNode = new QualityGateExamplesNode();

    // Inisialisasi Tenant Nodes (Dynamic/Tenant specific)
    const brandNode = this.profile
      ? new BrandIdentityNode(this.profile)
      : null;
    const toneNode = this.profile
      ? new ToneCalibrationNode(this.profile)
      : null;

    // Susun semua node ke Composite Node
    const root = new CompositePromptNode('quality_gate_prompt_composer');
    root.addChild(missionNode);
    root.addChild(roleNode);
    root.addChild(langPolicyNode);
    root.addChild(strictnessNode);
    root.addChild(inputBoundaryNode);
    root.addChild(temporalContextNode);
    root.addChild(factualNode);
    root.addChild(sourcePolicyNode);
    root.addChild(visualFormatNode);
    root.addChild(verifLockNode);
    root.addChild(schemaNode);
    root.addChild(qgExamplesNode);

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
