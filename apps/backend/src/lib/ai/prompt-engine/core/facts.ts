import { PromptNode, RenderContext } from '@eai/shared';

export class FactualGuardrailNode implements PromptNode {
  id = 'core:factual_guardrail';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const content = `
1. Do not change numbers, entity names, quotes, dates, valuations, funding amounts, percentages, or factual claims except to fix an obvious typo or formatting issue.
2. Do not turn factual framing into prediction, rumor, or scenario language if the draft presents it as an event that already happened or is ongoing.
3. If there is a verification lock block, preserve everything inside it 100% verbatim.
4. If an editor instruction conflicts with data integrity, prioritize data integrity and apply style/structure changes only where safe.
`.trim();

    if (context.format === 'xml') {
      return `<factual_guardrails>\n${content}\n</factual_guardrails>`;
    }

    return `## Factual Guardrails\n${content}`;
  }
}

export class FastSourceFidelityNode implements PromptNode {
  id = 'core:fast_source_fidelity';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const content = `
FAST MODE SOURCE BOUNDARY:
- Improve wording and organization using only information already present in the draft, brief, research notes, or cited sources supplied in context.
- Do not add examples, entities, products, platforms, metrics, dates, causal relationships, implementation steps, or technical capabilities from model memory.
- Do not turn a general source statement into a specific operational workflow or diagram.
- If support for a detail is uncertain, omit the detail. A shorter source-faithful article is preferable to a richer speculative article.
`.trim();

    if (context.format === 'xml') {
      return `<fast_source_fidelity>\n${content}\n</fast_source_fidelity>`;
    }
    return `## Fast Mode Source Boundary\n${content}`;
  }
}

export class SourcePolicyNode implements PromptNode {
  id = 'core:source_policy';
  type = 'core' as const;
  isStatic = false; // Dinamis berdasarkan sourcePolicy pada profile tenant

  constructor(private sourcePolicy?: 'strict' | 'standard') {}

  render(context: RenderContext): string {
    const policy = this.sourcePolicy || 'standard';
    let content: string;

    if (policy === 'strict') {
      content = `
SOURCE POLICY: STRICT
- Sensitive factual claims, numbers, entities, attributions, URLs, dates, and causal relationships must be traceable to the source draft or cited sources.
- If provenance is unclear, use verificationStatus "needs_citation" or "high_risk_factual_claim"; do not mark it ready merely because the article reads well.
- Do not use model memory to approve, replace, or reject sensitive numbers.
- The quality gate must not be "ready" if sensitive claims still lack clear source support or attribution.
`.trim();
    } else {
      content = `
SOURCE POLICY: STANDARD
- Preserve source fidelity for numbers, entities, dates, URLs, and concrete claims.
- Flag sensitive claims that need citations, but distinguish substantive risk from style changes, neutral time orientation, or editorial framing that does not add new facts.
- Do not replace facts using model memory; if uncertain, ask the editor to verify.
`.trim();
    }

    if (context.format === 'xml') {
      return `<source_policy>\n${content}\n</source_policy>`;
    }

    return `## Source Policy\n${content}`;
  }
}
