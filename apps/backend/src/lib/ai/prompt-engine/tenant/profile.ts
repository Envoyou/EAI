import { PromptNode, RenderContext } from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';

export class BrandIdentityNode implements PromptNode {
  id = 'tenant:brand_identity';
  type = 'tenant' as const;
  isStatic = false; // Dinamis berdasarkan data tenant

  constructor(private config: EditorialProfileConfig) {}

  render(context: RenderContext): string {
    const structureList = this.config.articleStructure
      ? this.config.articleStructure.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
      : '';

    const categoriesList = this.config.categories
      ? this.config.categories.join(', ')
      : '';

    const prohibitedList = this.config.additionalProhibitedPatterns
      ? this.config.additionalProhibitedPatterns.map((p) => `- "${p}"`).join('\n')
      : '';

    const customInstructionsText = this.config.customInstructions
      ? this.config.customInstructions.trim()
      : 'No additional custom instructions.';
    const primaryGoal = this.config.primaryGoal || 'not specified';
    const defaultLanguage = this.config.defaultLanguage || 'auto';

    if (context.format === 'xml') {
      return `
<brand_identity>
  <brand_name>${this.config.brandName || 'Envoyou'}</brand_name>
  <positioning>${this.config.positioning || ''}</positioning>
  <target_audience>${this.config.audience || ''}</target_audience>
  <categories>${categoriesList}</categories>
  <primary_goal>${primaryGoal}</primary_goal>
  <default_language>${defaultLanguage}</default_language>
  <required_article_structure>
${structureList}
  </required_article_structure>
  <prohibited_phrases>
${prohibitedList}
  </prohibited_phrases>
  <custom_instructions>
${customInstructionsText}
  </custom_instructions>
</brand_identity>
`.trim();
    }

    return `
## Brand Identity
*   **Brand Name**: ${this.config.brandName || 'Envoyou'}
*   **Positioning**: ${this.config.positioning || ''}
*   **Target Audience**: ${this.config.audience || ''}
*   **Categories**: ${categoriesList}
*   **Primary Goal**: ${primaryGoal}
*   **Default Language**: ${defaultLanguage}

### Required Article Structure
${structureList}

### Prohibited Phrases/Patterns
${prohibitedList}

### Custom Instructions
${customInstructionsText}
`.trim();
  }
}
