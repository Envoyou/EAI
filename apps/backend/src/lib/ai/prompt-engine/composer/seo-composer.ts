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
  "metaTitle": "Agentic OS Is Reshaping WealthTech",
  "metaDescription": "Explore how autonomous financial planners are reshaping wealth management and widening access for a new generation of investors.",
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

export class SeoLengthContractNode implements PromptNode {
  id = 'tenant:seo_length_contract';
  type = 'tenant' as const;
  isStatic = false;

  constructor(private profile: EditorialProfileConfig) {}

  render(context: RenderContext): string {
    const { seoRules } = this.profile;
    const contract = `
Active publication limits for this tenant:
- title: maximum ${seoRules.titleMaxLength} characters.
- metaTitle: maximum ${seoRules.metaTitleMaxLength} characters.
- metaDescription: ${Math.min(50, seoRules.metaDescriptionMaxLength)}-${seoRules.metaDescriptionMaxLength} characters.
- excerpt: maximum 300 characters.
- coverImageAltText: maximum 120 characters.
- tags: ${seoRules.tagCountMin}-${seoRules.tagCountMax} items.

Write every field as a complete phrase or sentence inside its active limit. Shorten and rephrase before returning JSON. Never rely on downstream truncation, never cut a word, and never end a description with a dangling conjunction or preposition.
`.trim();

    if (context.format === 'xml') {
      return `<seo_length_contract>\n${contract}\n</seo_length_contract>`;
    }
    return `## SEO Length Contract\n${contract}`;
  }
}

export class SeoPromptComposer {
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
    const schemaNode = new OutputSchemaNode(SEO_METADATA_OUTPUT_PROMPT_SCHEMA, this.options);
    const seoRoleNode = new SeoRoleNode(brandName);
    const seoExamplesNode = new SeoExamplesNode();
    const lengthContractNode = this.profile
      ? new SeoLengthContractNode(this.profile)
      : null;

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

    if (lengthContractNode) {
      root.addChild(lengthContractNode);
    }
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
