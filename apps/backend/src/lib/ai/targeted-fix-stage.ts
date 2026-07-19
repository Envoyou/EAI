import type { ArticleMetadata } from '@eai/shared';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import { RefinementPromptComposer } from './prompt-engine/composer/refinement-composer';
import type { AiProvider, AnalysisSpeed } from './provider-runtime';
import { getProvider } from './providers/registry';
import { resolveModel } from './model-router';
import { executeGenerate } from './runtime/execute-generate';
import { composeWorkspaceContext } from './workspace-context';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';

export const runTargetedFixStage = async ({
  provider,
  analysisSpeed,
  article,
  targetText,
  feedback,
  editorInstruction,
  metadata: _metadata,
  editorialProfile,
  signal,
}: {
  provider: AiProvider;
  analysisSpeed?: AnalysisSpeed;
  article: string;
  targetText: string;
  feedback: string;
  editorInstruction: string;
  metadata?: ArticleMetadata;
  editorialProfile: EditorialProfileSnapshot;
  signal?: AbortSignal;
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

  const aiProvider = getProvider(provider);
  const modelName = resolveModel(provider, 'editor', analysisSpeed ?? 'balanced');

  const result = await executeGenerate({
    provider: aiProvider,
    request: {
      signal,
      systemInstruction,
      userContent: contents,
      model: modelName,
      maxOutputTokens: 800,
      temperature: 0.2,
      thinkingLevel: provider === 'gemini' ? 'medium' : undefined,
    },
    telemetry: new AiTelemetryCollector(),
    stage: 'targeted_fix',
  });

  return {
    modelName,
    replacementText: result.text.replace(/^["']|["']$/g, '').trim(),
  };
};
