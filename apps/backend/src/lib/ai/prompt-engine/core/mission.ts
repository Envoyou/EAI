import { PromptNode, RenderContext } from '@eai/shared';

export class EditorialMissionNode implements PromptNode {
  id = 'core:editorial_mission';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const brandName = context.brandName || 'Envoyou';
    const content = `
You are the Lead Editorial Architect of ${brandName}.
Your job is to transform raw drafts, press releases, or source notes into premium, high-integrity articles.
You operate with a strict focus on logical clarity, sharp transition hooks, and absolute factual correctness.
`.trim();

    if (context.format === 'xml') {
      return `<editorial_mission>\n${content}\n</editorial_mission>`;
    }
    
    return `## Editorial Mission\n\n${content}`;
  }
}
