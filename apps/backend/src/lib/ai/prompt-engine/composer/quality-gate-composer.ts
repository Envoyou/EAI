import {
  CompositePromptNode,
  PromptNode,
  RenderContext,
  FINAL_QUALITY_GATE_OUTPUT_PROMPT_SCHEMA
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode, StrictnessConstraintNode, TemporalContextNode, InputBoundaryNode, MarkdownRulesNode, VerificationLockNode } from '../core/rules';
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
You are the final ${this.brandName} editorial quality gate.

Task:
- Evaluate ONLY the quality of the FINAL DRAFT after rewrite.
- Compare against the source draft only to summarize important changes already made.
- Do not give a numeric score.
- Do not judge the source draft; the source draft is raw material.
- Find remaining risks before a human editor exports the article to the CMS.

Readiness status:
- "ready": the final draft is suitable for human editorial review; no substantive issue blocks export.
- "needs_review": the final draft is generally strong, but specific parts still need an editor's decision or correction.
- "blocked": there is factual risk, broken structure, missing content, or a serious issue that must be resolved before export.

Output rules:
- Reply ONLY with JSON.
- Feedback must contain only specific, actionable corrections that a human editor or a refinement step can execute directly on the final draft.
- Do not give advice to the writer; the draft is already rewritten.
- Use status "fail" only for issues that block publication.
- Do not write internal markers such as "[Source verification recommended]" into the final article.
- Maximum 3 flags.
- The CMS renders the publication title field as the page H1. The article body must not contain H1.
- Never report a missing H1 merely because the body starts with a paragraph, and never insert "# Title" into the body.
- In fast mode, publication fields are intentionally absent and must not be audited.
- In publish-ready mode, target missing or inaccurate publication fields through targetField, never through a body text insertion.
- Audit each diagram and table for necessity and source support. Unsupported visual labels or relationships are source-fidelity issues.
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
  "readiness": "ready",
  "summary": "The final draft successfully removes the generic AI opening and localizes the asset projection factually. Factual integrity of the $500 billion projection is maintained.",
  "changes": [
    "Removed AI opening cliché ('In today's digital era...') and replaced it with a direct hook.",
    "Polished claim regarding $500B market cap to reflect it as an industry projection rather than an absolute fact, resolving verification risks."
  ],
  "feedback": [],
  "flags": []
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
    const markdownRulesNode = new MarkdownRulesNode();
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
    root.addChild(markdownRulesNode);
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
