import {
  CompositePromptNode,
  PromptNode,
  RenderContext,
  ArticleMetadata
} from '@eai/shared';
import type { EditorialProfileConfig } from '@eai/shared/server';
import { EditorialMissionNode } from '../core/mission';
import { LanguagePolicyNode } from '../core/rules';
import { BrandIdentityNode } from '../tenant/profile';
import { ToneCalibrationNode } from '../tenant/tone';

// ─── STRATEGIST ROLE Node ──────────────────────────────────────────────────
export class StrategistRoleNode implements PromptNode {
  id = 'core:strategist_role';
  type = 'core' as const;
  isStatic = true;

  constructor(
    private typeRole: 'draft' | 'outline',
    private brandName: string
  ) {}

  render(context: RenderContext): string {
    let content: string;
    if (this.typeRole === 'draft') {
      content = `
You are a writing co-pilot for ${this.brandName}.
Your goal is to generate a structured, rough article draft that is ready to be edited and refined.
DO NOT write a finished, publication-ready polished article. Write a solid rough draft.
`.trim();
    } else {
      content = `
You are a writing co-pilot for ${this.brandName}.
Your goal is to generate a structured, comprehensive article outline based on a topic.
The outline should act as a blueprint for the final article.
`.trim();
    }

    if (context.format === 'xml') {
      return `<strategist_role_instructions type="${this.typeRole}">\n${content}\n</strategist_role_instructions>`;
    }
    return `## Role\n${content}`;
  }
}

// ─── STRATEGIST CONFIG Node ────────────────────────────────────────────────
export class StrategistConfigNode implements PromptNode {
  id = 'core:strategist_config';
  type = 'core' as const;
  isStatic = false; // Dinamik tergantung metadata artikel

  constructor(
    private metadata?: ArticleMetadata,
    private defaultAudience?: string,
    private tone?: string[]
  ) {}

  render(context: RenderContext): string {
    const category = this.metadata?.category || 'General';
    const type = this.metadata?.type || 'Standard';
    const audience = this.metadata?.targetAudience || this.defaultAudience || 'General';
    const length = this.metadata?.targetLength || '800 words';

    let content = `
EDITORIAL CONFIGURATION:
- Category: ${category}
- Article Type: ${type}
- Target Audience: ${audience}
- Target Length: ${length}
`.trim();

    if (this.tone && this.tone.length > 0) {
      content += `\n- Tone: ${this.tone.join(', ')}`;
    }

    if (context.format === 'xml') {
      return `<editorial_configuration>\n${content}\n</editorial_configuration>`;
    }
    return content;
  }
}

// ─── PRESS RELEASE RULES Node ──────────────────────────────────────────────
export class PressReleaseRulesNode implements PromptNode {
  id = 'core:press_release_rules';
  type = 'core' as const;
  isStatic = true;

  render(context: RenderContext): string {
    const rules = `
PRESS RELEASE TRANSFORMATION RULES (CRITICAL):
- The source input is a promotional corporate press release or announcement.
- Your primary task is to strip away all marketing hype, corporate self-praise, excessive adjectives, and promotional bias.
- Translate the promotional story into an objective, neutral, and readable news draft or analysis.
- Do not repeat empty buzzwords or unsubstantiated corporate self-congratulation (e.g., "leading provider", "revolutionary product", "industry-first").
- Maintain journalistic distance: attribute claims made by the company/representatives as claims (e.g., "The company claims that...", "According to the announcement...", "CEO [Name] stated that...").
- Keep the writing clear, concise, and professional.
`.trim();

    if (context.format === 'xml') {
      return `<press_release_rules>\n${rules}\n</press_release_rules>`;
    }
    return rules;
  }
}

// ─── STRATEGIST INSTRUCTIONS Node ──────────────────────────────────────────
export class StrategistInstructionNode implements PromptNode {
  id = 'core:strategist_instruction';
  type = 'core' as const;
  isStatic = true;

  constructor(private typeRole: 'draft' | 'outline') {}

  render(context: RenderContext): string {
    let content: string;

    if (this.typeRole === 'draft') {
      content = `
DRAFTING INSTRUCTIONS:
- Generate a draft that strictly follows the specified category, article type, target audience, and target length.
- Use H2 (##) or H3 (###) headers to structure the article. DO NOT use H1 (#) inside the body.
- If the user provides reference notes, only rely on the facts, numbers, and data present in those reference notes. DO NOT hallucinate or claim facts, dates, numbers, or organizations outside the provided reference notes.
- If references are not provided or are incomplete, write in general terms. Avoid inventing specific dates, numbers, names, or statistical figures.
- Ensure the article has a clear intro, logical body paragraphs, and a conclusion.
- Keep paragraphs relatively short (2-4 sentences) so they are easy to read and edit.
- DO NOT generate SEO metadata (such as titles, meta descriptions, or tags) in this response.
- DO NOT add comments, introduction notes, prefaces (like "Here is the rough draft:"), or code blocks wrapping the draft. Output raw article draft text only.
- Output MUST be a "rough draft" suitable for editing, leaving room for further refinement by our editorial check system.
`.trim();
    } else {
      content = `
OUTLINE GENERATION INSTRUCTIONS:
- Generate a structured outline using Markdown H2 (##) and H3 (###) headers.
- For each section heading, add 2-3 brief bullet points explaining the core points, key arguments, or facts to be discussed.
- Ensure the outline flows logically: Hook/Introduction -> Contextual background -> Main body points (structured by headings) -> Strategic closing/implications.
- DO NOT write the article draft itself. ONLY generate the outline structure.
- DO NOT wrap the output in Markdown code blocks.
- DO NOT add comments, introduction notes, or prefaces. Start directly with the outline.
`.trim();
    }

    if (context.format === 'xml') {
      return `<instructions>\n${content}\n</instructions>`;
    }
    return content;
  }
}

// ─── STRATEGIST PROMPT COMPOSER ────────────────────────────────────────────
export interface StrategistComposerOptions {
  draftMode?: 'topic' | 'outline' | 'reference' | 'press_release';
}

export class StrategistPromptComposer {
  constructor(
    private typeRole: 'draft' | 'outline',
    private metadata?: ArticleMetadata,
    private profile?: EditorialProfileConfig,
    private options?: StrategistComposerOptions
  ) {}

  compose(format: 'xml' | 'markdown' | 'text' = 'xml'): string {
    const brandName = this.profile?.brandName || 'Envoyou';
    const audience = this.profile?.audience;
    const tone = this.profile?.tone;

    // Inisialisasi Core Nodes (Static)
    const missionNode = new EditorialMissionNode();
    const langPolicyNode = new LanguagePolicyNode();

    // Strategist Specific Nodes
    const roleNode = new StrategistRoleNode(this.typeRole, brandName);
    const configNode = new StrategistConfigNode(this.metadata, audience, tone);
    const instructionNode = new StrategistInstructionNode(this.typeRole);

    const root = new CompositePromptNode(`strategist_prompt_composer_${this.typeRole}`);
    root.addChild(missionNode);
    root.addChild(roleNode);
    root.addChild(langPolicyNode);
    root.addChild(configNode);
    root.addChild(instructionNode);

    // Tambah aturan press release jika modenya press_release
    if (this.typeRole === 'draft' && this.options?.draftMode === 'press_release') {
      root.addChild(new PressReleaseRulesNode());
    }

    // Inisialisasi Tenant Nodes (Dynamic/Tenant specific)
    const brandNode = this.profile
      ? new BrandIdentityNode(this.profile)
      : null;
    const toneNode = this.profile
      ? new ToneCalibrationNode(this.profile)
      : null;

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
