import { ThinkingLevel } from '@google/genai';
import type { AiTelemetryCollector } from '@/lib/ai-telemetry';
import type { EditorialProfileSnapshot } from '@/lib/editorial-profile';
import type { ArticleMetadata } from '@/types';
import { SeoMetadataResponseJsonSchema, type SeoMetadataOutput } from '@/lib/schema';
import { buildFallbackSeoMetadata, normalizeSeoMetadata } from '@/lib/seo-metadata';
import { parseJsonResponse } from '@/lib/json-stream';
import {
  type AiProvider,
  extractGeminiText,
  gemini,
  getGeminiSamplingConfig,
  groq,
} from './provider-runtime';
import { buildEditorialUserContent } from './prompt-context';

export const runSeoStage = async ({
  provider,
  modelName,
  article,
  metadata,
  editorialProfile,
  systemInstruction,
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
  const contents = buildEditorialUserContent({
    metadata,
    data: { article },
    task: 'Create SEO metadata for the article and reply only with JSON matching the schema.',
  });
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
