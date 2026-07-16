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

export class SeoExamplesNode implements PromptNode {
  id = 'core:seo_examples';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const examples = `
=== SEO METADATA GENERATION DEMONSTRATION ===
[INPUT ARTICLE EXCERPT]
"The wealthtech landscape is shifting rapidly. With the rise of Agentic OS, traditional asset management firms are facing disruption. Mass-affluent young investors are moving to autonomous platforms that promise institutional-grade financial plans for a fraction of the cost."

[POLISHED SEO METADATA OUTPUT]
{
  "title": "The WealthTech Paradigm Shift: How Agentic OS is Democratizing Elite Asset Management",
  "slug": "wealthtech-paradigm-shift-agentic-os-democratization",
  "excerpt": "Traditional asset management is facing a radical disruption. Autonomous Agentic OS platforms are democratizing elite wealth planning for a new generation of investors.",
  "metaTitle": "The WealthTech Paradigm Shift: How Agentic OS Changes Asset Management",
  "metaDescription": "Explore the rise of autonomous financial planners (Agentic OS) and how they democratize elite asset management for young mass-affluent investors.",
  "coverImageAltText": "A conceptual illustration of interconnected digital nodes forming a modern network on a sleek dark interface representing financial assets.",
  "tags": ["Technology & AI", "WealthTech", "Asset Management"]
}
`.trim();

    if (context.format === 'xml') {
      return `<seo_metadata_examples>\n${examples}\n</seo_metadata_examples>`;
    }
    return examples;
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
    const seoExamplesNode = new SeoExamplesNode();

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
    root.addChild(seoExamplesNode);


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
