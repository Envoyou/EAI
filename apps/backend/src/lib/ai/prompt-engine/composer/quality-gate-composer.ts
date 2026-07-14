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
import { OutputSchemaNode, OutputSchemaNodeOptions } from '../core/format';
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

Before deciding the readiness, summary, feedback, or flags, you MUST output a structured step-by-step reasoning trace in the "thinking" field. Use this structure:
1. AUDIT DRAFT CHANGES: Compare the final draft to the source draft and summarize differences.
2. FIDELITY VERIFICATION: Verify that numbers, names, quotes, and facts from the source draft were not distorted, deleted, or fabricated.
3. RESOLUTION: Determine the readiness status, compile feedback, and set flags if needed.

Output rules:
- Reply ONLY with JSON.
- Feedback must contain only specific, actionable corrections that a human editor or a refinement step can execute directly on the final draft.
- Do not give advice to the writer; the draft is already rewritten.
- Use status "fail" only for issues that block publication.
- Do not write internal markers such as "[Source verification recommended]" into the final article.
- Maximum 3 flags.
`.trim();

    if (context.format === 'xml') {
      return `<quality_gate_role_instructions brand="${this.brandName}">\n${roleInstructions}\n</quality_gate_role_instructions>`;
    }
    return `## Quality Gate Role Instructions\n${roleInstructions}`;
  }
}

// ─── QUALITY GATE PROMPT COMPOSER ──────────────────────────────────────────
export class QualityGatePromptComposer {
  constructor(
    private profile?: EditorialProfileConfig,
    private options?: OutputSchemaNodeOptions
  ) {}

  compose(format: 'xml' | 'markdown' | 'text' = 'xml'): string {
    const brandName = this.profile?.brandName || 'Envoyou';

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

    // Quality Gate Role Node & Output Format
    const roleNode = new QualityGateRoleNode(brandName);
    const schemaNode = new OutputSchemaNode(FINAL_QUALITY_GATE_OUTPUT_PROMPT_SCHEMA, this.options);

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
    root.addChild(verifLockNode);
    root.addChild(schemaNode);

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
