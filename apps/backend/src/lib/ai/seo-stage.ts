import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import type { ArticleMetadata } from '@eai/shared';
import { SeoMetadataResponseJsonSchema, type SeoMetadataOutput } from '@eai/shared';
import { buildFallbackSeoMetadata, normalizeSeoMetadata } from '@eai/shared';
import { parseJsonResponse } from '@eai/shared';
import type { AiProvider } from './provider-runtime';
import { getProvider } from './providers/registry';
import { executeGenerate } from './runtime/execute-generate';
import { composeWorkspaceContext } from './workspace-context';

export const runSeoStage = async ({
  provider,
  modelName,
  article,
  metadata,
  editorialProfile,
  systemInstruction: baseSystemInstruction,
  telemetry,
  signal,
}: {
  provider: AiProvider;
  modelName: string;
  article: string;
  metadata?: ArticleMetadata;
  editorialProfile: EditorialProfileSnapshot;
  systemInstruction: string;
  telemetry: AiTelemetryCollector;
  signal?: AbortSignal;
}): Promise<SeoMetadataOutput> => {
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

  const systemInstruction = `${baseSystemInstruction}\n\n${agentInstruction}`;

  const contents = [
    workspaceXml,
    '<article_draft>',
    article,
    '</article_draft>',
    '',
    '<task>',
    'Create SEO metadata for the article and reply only with JSON matching the schema.',
    '</task>'
  ].join('\n');

  const aiProvider = getProvider(provider);

  const result = await executeGenerate({
    provider: aiProvider,
    request: {
      signal,
      systemInstruction,
      userContent: contents,
      model: modelName,
      maxOutputTokens: 400,
      temperature: 0.2,
      thinkingLevel: provider === 'gemini' ? 'minimal' : undefined,
      responseFormat: 'json',
      responseJsonSchema: provider === 'gemini' ? SeoMetadataResponseJsonSchema : undefined,
    },
    telemetry,
    stage: 'seo',
  });

  const raw = result.text.trim();
  if (!raw) return buildFallbackSeoMetadata(article, metadata, editorialProfile);

  try {
    return normalizeSeoMetadata(
      parseJsonResponse(raw),
      article,
      metadata,
      editorialProfile
    );
  } catch {
    return buildFallbackSeoMetadata(article, metadata, editorialProfile);
  }
};
