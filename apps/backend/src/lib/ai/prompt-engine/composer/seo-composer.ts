import {
  CompositePromptNode,
  PromptNode,
  RenderContext,
  SEO_METADATA_OUTPUT_PROMPT_SCHEMA
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode, StrictnessConstraintNode, InputBoundaryNode } from '../core/rules';
import { OutputSchemaNode, OutputSchemaNodeOptions } from '../core/format';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';

export class SeoRoleNode implements PromptNode {
  id = 'core:seo_role';
  type = 'core' as const;
  isStatic = true;

  constructor(private brandName: string) {}

  render(context: RenderContext): string {
    const roleContent = `
You are the ${this.brandName} SEO Specialist.
Create optimal, production-ready SEO metadata for the editorial dashboard.
`.trim();

    if (context.format === 'xml') {
      return `<seo_specialist_role>\n${roleContent}\n</seo_specialist_role>`;
    }

    return `## SEO Specialist Role\n${roleContent}`;
  }
}

export class SeoPromptComposer {
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
    const schemaNode = new OutputSchemaNode(SEO_METADATA_OUTPUT_PROMPT_SCHEMA, this.options);
    const seoRoleNode = new SeoRoleNode(brandName);

    // Inisialisasi Tenant Nodes (Dynamic/Tenant specific)
    const brandNode = this.profile
      ? new BrandIdentityNode(this.profile)
      : null;
    const toneNode = this.profile
      ? new ToneCalibrationNode(this.profile)
      : null;

    // Susun semua node ke Composite Node
    const root = new CompositePromptNode('seo_prompt_composer');
    root.addChild(missionNode);
    root.addChild(seoRoleNode);
    root.addChild(langPolicyNode);
    root.addChild(strictnessNode);
    root.addChild(inputBoundaryNode);
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
