import { ThinkingLevel } from '@google/genai';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { EditorialProfileSnapshot } from '@eai/shared/server';
import type { ArticleMetadata } from '@eai/shared';
import { SeoMetadataResponseJsonSchema, type SeoMetadataOutput } from '@eai/shared';
import { buildFallbackSeoMetadata, normalizeSeoMetadata } from '@eai/shared';
import { parseJsonResponse } from '@eai/shared';
import {
  type AiProvider,
  extractGeminiText,
  extractOpenRouterText,
  extractOpenRouterUsage,
  gemini,
  getGeminiSamplingConfig,
  groq,
  openrouter,
} from './provider-runtime';
import { composeWorkspaceContext } from './workspace-context';

export const runSeoStage = async ({
  provider,
  modelName,
  article,
  metadata,
  editorialProfile,
  systemInstruction: baseSystemInstruction,
  telemetry,
}: {
  provider: AiProvider;
  modelName: string;
  article: string;
  metadata?: ArticleMetadata;
  editorialProfile: EditorialProfileSnapshot;
  systemInstruction: string;
  telemetry: AiTelemetryCollector;
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

  const startedAt = Date.now();

  if (provider === 'groq') {
    const response = await groq.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: contents },
      ],
      stream: false,
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    telemetry.recordGroq({
      stage: 'seo',
      model: modelName,
      usage: response.usage,
      durationMs: Date.now() - startedAt,
    });

    try {
      return normalizeSeoMetadata(
        parseJsonResponse(response.choices[0]?.message?.content?.trim() ?? ''),
        article,
        metadata,
        editorialProfile
      );
    } catch {
      return buildFallbackSeoMetadata(article, metadata, editorialProfile);
    }
  }

  if (provider === 'openrouter') {
    const response = await openrouter.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: contents },
      ],
      stream: false,
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    telemetry.recordOpenRouter({
      stage: 'seo',
      model: modelName,
      usage: extractOpenRouterUsage(response),
      durationMs: Date.now() - startedAt,
    });

    const raw = extractOpenRouterText(response).trim();
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
  }

  const response = await gemini.models.generateContent({
    model: modelName,
    contents,
    config: {
      systemInstruction,
      ...getGeminiSamplingConfig(modelName, 0.2),
      candidateCount: 1,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: 'application/json',
      responseJsonSchema: SeoMetadataResponseJsonSchema,
    },
  });
  telemetry.recordGemini({
    stage: 'seo',
    model: modelName,
    usage: response.usageMetadata,
    durationMs: Date.now() - startedAt,
  });

  const raw = extractGeminiText(response).trim();
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
