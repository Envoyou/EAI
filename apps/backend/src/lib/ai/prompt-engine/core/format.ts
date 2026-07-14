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
