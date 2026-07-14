import { ThinkingLevel } from '@google/genai';
import type { ArticleMetadata } from '@eai/shared';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import { RefinementPromptComposer } from './prompt-engine/composer/refinement-composer';
import {
  type AiProvider,
  type AnalysisSpeed,
  extractGeminiText,
  extractOpenRouterText,
  gemini,
  getNativeGeminiConfig,
  getOpenRouterModelForRole,
  GROQ_MODEL,
  groq,
  openrouter,
} from './provider-runtime';
import { composeWorkspaceContext } from './workspace-context';

export const runTargetedFixStage = async ({
  provider,
  analysisSpeed,
  article,
  targetText,
  feedback,
  editorInstruction,
  metadata: _metadata,
  editorialProfile,
}: {
  provider: AiProvider;
  analysisSpeed?: AnalysisSpeed;
  article: string;
  targetText: string;
  feedback: string;
  editorInstruction: string;
  metadata?: ArticleMetadata;
  editorialProfile: EditorialProfileSnapshot;
}): Promise<{ replacementText: string; modelName: string }> => {
  const timezone = editorialProfile.config.timezone || 'Asia/Jakarta';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const currentYear = parts.find((part) => part.type === 'year')?.value || new Date().getFullYear().toString();
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  const currentDate = `${currentYear}-${month}-${day}`;

  const { xml: workspaceXml, agentInstruction } = composeWorkspaceContext({
    today: currentDate,
    timezone,
    profileConfig: editorialProfile.config,
  });

  const systemInstruction = `${new RefinementPromptComposer(
    'targeted_fix',
    editorialProfile.config
  ).compose('xml')}\n\n${agentInstruction}`;

  const contents = [
    workspaceXml,
    '<article_draft>',
    article,
    '</article_draft>',
    '',
    '<target_text>',
    targetText,
    '</target_text>',
    '',
    '<feedback>',
    feedback,
    '</feedback>',
    '',
    '<editor_instruction>',
    editorInstruction,
    '</editor_instruction>',
    '',
    '<task>',
    'Based on the preceding article context, return only a concise replacement for targetText that resolves the feedback and follows editorInstruction.',
    '</task>'
  ].join('\n');

  let replacementText: string;
  let modelName: string;

  if (provider === 'groq') {
    modelName = GROQ_MODEL;
    const response = await groq.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: contents },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });
    replacementText = response.choices[0]?.message?.content?.trim() || '';
  } else if (provider === 'openrouter') {
    modelName = getOpenRouterModelForRole('editor', analysisSpeed);
    const response = await openrouter.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: contents },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });
    replacementText = extractOpenRouterText(response).trim();
  } else {
    modelName = process.env.GEMINI_MODEL || (analysisSpeed === 'fast'
      ? 'gemini-3.1-flash-lite'
      : 'gemini-3.5-flash');
    const response = await gemini.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        ...getNativeGeminiConfig(),
        candidateCount: 1,
        maxOutputTokens: 800,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    replacementText = extractGeminiText(response).trim();
  }

  return {
    modelName,
    replacementText: replacementText.replace(/^["']|["']$/g, '').trim(),
  };
};
