import { PromptNode, RenderContext } from '@eai/shared';

export interface OutputSchemaNodeOptions {
  includeTextSchema?: boolean;
}

export class OutputSchemaNode implements PromptNode {
  id = 'core:output_schema';
  type = 'core' as const;
  isStatic = true;

  constructor(
    private schema: string,
    private options?: OutputSchemaNodeOptions
  ) {}

  render(context: RenderContext): string {
    const contract = this.options?.includeTextSchema === false
      ? 'Return ONLY JSON matching the configured response schema. Do not include text outside the JSON object.'
      : `Return ONLY JSON in the following format (no text outside JSON):\n${this.schema}`;

    if (context.format === 'xml') {
      return `<output_format_contract>\n${contract}\n</output_format_contract>`;
    }

    return `## Output Format Contract\n${contract}`;
  }
}

/** Chooses structure from the information itself instead of treating visuals as decoration. */
export class VisualFormatSelectionPolicyNode implements PromptNode {
  id = 'core:visual_format_selection_policy';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const policy = `
Visual elements are optional, not mandatory. Default to prose unless another format materially improves comprehension.

- Use Mermaid only for genuine workflows, sequences, dependencies, architectures, timelines, or decision trees.
- Use a table only for comparisons whose items share consistent dimensions.
- Use a numbered list for sequential steps that do not need branching.
- Use bullet points for unordered collections of concise items.
- Use ordinary prose for narrative, explanation, argument, or context.
- Do not add a visual merely to decorate the article. Prefer no visual over a weak, redundant, or speculative visual.
- Do not convert an existing prose explanation or list into Mermaid unless the source contains a real relationship that becomes materially clearer as a diagram.
- When a comparison, sequence, or collection is already clear in fewer than five concise items, prefer the simplest suitable table or list instead of Mermaid.
- Every node, step, label, metric, entity, and relationship in a visual must be supported by the source material or explicitly supplied context.
- Do not invent operational stages, KPIs, integrations, APIs, financial processes, or organizational entities to complete a diagram or table.
- Use no more than one primary visual unless the editorial brief explicitly requires additional visuals.
`.trim();

    if (context.format === 'xml') {
      return `<visual_format_policy>\n${policy}\n</visual_format_policy>`;
    }
    return `## Visual Format Policy\n${policy}`;
  }
}
