import { ThinkingLevel } from '@google/genai';
import type { ArticleMetadata } from '@eai/shared';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import { composeEditorialPrompt } from '@eai/shared/server';
import { getTargetedFixPrompt } from '@/lib/prompts';
import {
  type AiProvider,
  type AnalysisSpeed,
  extractGeminiText,
  extractOpenRouterText,
  gemini,
  getGeminiSamplingConfig,
  getOpenRouterModelForRole,
  GROQ_MODEL,
  groq,
  openrouter,
} from './provider-runtime';
import {
  buildEditorialUserContent,
  withInputBoundaryPolicy,
} from './prompt-context';

export const runTargetedFixStage = async ({
  provider,
  analysisSpeed,
  article,
  targetText,
  feedback,
  editorInstruction,
  metadata,
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
  const systemInstruction = withInputBoundaryPolicy(composeEditorialPrompt(
    getTargetedFixPrompt(metadata, editorialProfile.config),
    editorialProfile
  ));
  const contents = buildEditorialUserContent({
    metadata,
    data: {
      article,
      targetText,
      feedback,
      editorInstruction,
    },
    task: 'Based on the preceding article context, return only a concise replacement for targetText that resolves the feedback and follows editorInstruction.',
  });

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
    modelName = analysisSpeed === 'fast'
      ? 'gemini-3.1-flash-lite'
      : 'gemini-3.5-flash';
    const response = await gemini.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        ...getGeminiSamplingConfig(modelName, 0.2),
        candidateCount: 1,
        maxOutputTokens: 800,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    replacementText = extractGeminiText(response).trim();
  }

  return {
    modelName,
    replacementText: replacementText.replace(/^["']|["']$/g, '').trim(),
  };
};
