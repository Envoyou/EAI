import type { EditorialProfileConfig } from '@eai/shared/server';

export interface WorkspaceContextInput {
  today: string;
  timezone: string;
  profileConfig: EditorialProfileConfig | null;
  notesSummary?: string | null;
  attachment?: {
    filename: string;
    contentType: string;
    content: string;
  } | null;
  scrapedUrl?: {
    url: string;
    content: string;
  } | null;
  history?: {
    role: string;
    text: string;
  }[];
}

export interface WorkspaceContextObject {
  metadata: {
    today: string;
    timezone: string;
  };
  editorialProfile: {
    status: 'Loaded' | 'Not Configured';
    brandName?: string;
    positioning?: string;
    audience?: string;
    tone?: string[];
    categories?: string[];
    website?: string;
    primaryGoal?: string;
    defaultLanguage?: string;
    customInstructions?: string;
  };
  notes: string | null;
  attachment: {
    filename: string;
    contentType: string;
    content: string;
  } | null;
  scrapedUrl: {
    url: string;
    content: string;
  } | null;
  history: {
    role: string;
    text: string;
  }[];
}

export interface ComposeWorkspaceContextResult {
  contextObj: WorkspaceContextObject;
  xml: string;
  agentInstruction: string;
}

/**
 * Returns a standardized agent instruction block based on whether the brand profile is loaded.
 */
export function getWorkspaceAgentInstruction(status: 'Loaded' | 'Not Configured'): string {
  return [
    '<agent_instruction>',
    '1. Treat the editorial profile inside <workspace_context> as the default working context.',
    status === 'Loaded'
      ? '2. Since the Editorial Profile status is "Loaded", you MUST align all content generation, recommendations, structures, tone, and guidelines with it. Only ignore or deviate from it if the user explicitly requests a different branding or style in their query.'
      : '2. Since the Editorial Profile status is "Not Configured", fallback to general high-quality, professional, and SEO-optimized content strategy guidelines.',
    '3. Ground all factual assertions. Do not hallucinate or deviate from the source materials provided in the workspace context.',
    '</agent_instruction>'
  ].join('\n');
}

/**
 * Composes a structured workspaceContext object and its serialized XML format along with compliance instructions.
 */
export function composeWorkspaceContext(input: WorkspaceContextInput): ComposeWorkspaceContextResult {
  const contextObj: WorkspaceContextObject = {
    metadata: {
      today: input.today,
      timezone: input.timezone,
    },
    editorialProfile: input.profileConfig ? {
      status: 'Loaded',
      brandName: input.profileConfig.brandName,
      positioning: input.profileConfig.positioning,
      audience: input.profileConfig.audience,
      tone: input.profileConfig.tone,
      categories: input.profileConfig.categories,
      website: input.profileConfig.internalLinkBaseUrl,
      primaryGoal: input.profileConfig.primaryGoal,
      defaultLanguage: input.profileConfig.defaultLanguage,
      customInstructions: input.profileConfig.customInstructions,
    } : {
      status: 'Not Configured'
    },
    notes: input.notesSummary || null,
    attachment: input.attachment || null,
    scrapedUrl: input.scrapedUrl || null,
    history: input.history || []
  };

  let xml = `<workspace_context>\n`;
  xml += `<current_date>\n`;
  xml += `Today's Date: ${contextObj.metadata.today} (${contextObj.metadata.timezone})\n`;
  xml += `</current_date>\n\n`;

  // Editorial Profile
  xml += `<editorial_profile>\n`;
  xml += `Status: ${contextObj.editorialProfile.status}\n`;
  if (contextObj.editorialProfile.status === 'Loaded') {
    const ep = contextObj.editorialProfile;
    xml += `Brand Name: ${ep.brandName || 'Envoyou'}\n`;
    if (ep.positioning) xml += `Positioning: ${ep.positioning}\n`;
    if (ep.audience) xml += `Target Audience: ${ep.audience}\n`;
    if (ep.categories && ep.categories.length > 0) xml += `Content Categories: ${ep.categories.join(', ')}\n`;
    if (ep.tone && ep.tone.length > 0) xml += `Tone of Voice: ${ep.tone.join(', ')}\n`;
    if (ep.website) xml += `Website Base URL: ${ep.website}\n`;
    if (ep.primaryGoal) xml += `Primary Goal: ${ep.primaryGoal}\n`;
    if (ep.defaultLanguage) xml += `Preferred Language: ${ep.defaultLanguage}\n`;
    if (ep.customInstructions) xml += `Custom Brand Guidelines: ${ep.customInstructions}\n`;
  }
  xml += `</editorial_profile>\n\n`;

  // Notes
  if (contextObj.notes) {
    xml += `<session_notes>\n`;
    xml += `${contextObj.notes}\n`;
    xml += `</session_notes>\n\n`;
  }

  // Attachment
  if (contextObj.attachment) {
    const att = contextObj.attachment;
    const textLimit = 15000;
    const truncatedText = att.content.slice(0, textLimit);
    const truncationNotice = att.content.length > textLimit ? '\n[... content truncated at 15,000 characters ...]' : '';

    xml += `<attached_file>\n`;
    xml += `<filename>${att.filename}</filename>\n`;
    xml += `<type>${att.contentType}</type>\n`;
    xml += `<content>\n${truncatedText}${truncationNotice}\n</content>\n`;
    xml += `</attached_file>\n\n`;
  }

  // Scraped Url
  if (contextObj.scrapedUrl) {
    xml += `<scraped_url_content url="${contextObj.scrapedUrl.url}">\n`;
    xml += `${contextObj.scrapedUrl.content}\n`;
    xml += `</scraped_url_content>\n\n`;
  }

  // History
  if (contextObj.history.length > 0) {
    xml += `<chat_history>\n`;
    xml += contextObj.history.map((m: { role: string; text: string }) => `${m.role}: ${m.text}`).join('\n') + `\n`;
    xml += `</chat_history>\n`;
  }

  xml += `</workspace_context>\n`;

  const agentInstruction = getWorkspaceAgentInstruction(contextObj.editorialProfile.status);

  return { contextObj, xml, agentInstruction };
}
