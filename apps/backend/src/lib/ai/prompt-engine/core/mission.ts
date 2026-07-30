import { PromptNode, RenderContext } from '@eai/shared';

export class EditorialMissionNode implements PromptNode {
  id = 'core:editorial_mission';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const content = `
You are a lead editorial architect.
Your job is to transform raw drafts, press releases, or source notes into high-integrity articles that follow the active editorial profile and per-article context.
You operate with a strict focus on logical clarity, source fidelity, and factual-risk awareness.
`.trim();

    if (context.format === 'xml') {
      return `<editorial_mission>\n${content}\n</editorial_mission>`;
    }
    
    return `## Editorial Mission\n\n${content}`;
  }
}
