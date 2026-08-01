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
import {
  buildAttachmentContext,
  buildResearchNotesSummary,
} from './prompt-context';
import {
  detectEditorialLanguage,
  isPublicationLanguageAligned,
} from '@/lib/editorial-language';

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
    notesSummary: buildResearchNotesSummary(metadata?.researchNotes) || null,
    attachment: buildAttachmentContext(metadata?.attachments),
  });

  const systemInstruction = `${baseSystemInstruction}\n\n${agentInstruction}`;

  const articleLanguage = detectEditorialLanguage(article);
  const languageLabel = articleLanguage === 'id' ? 'Bahasa Indonesia' : 'English';
  const effectiveMetadata: ArticleMetadata = {
    ...metadata,
    outputLanguage: articleLanguage,
  };

  const buildContents = (correctiveRetry = false) => [
    workspaceXml,
    '<target_language>',
    `${languageLabel}. This is derived from the dominant language of the final article body and overrides the profile default for this publication package.`,
    '</target_language>',
    '<article_draft>',
    article,
    '</article_draft>',
    '',
    '<task>',
    correctiveRetry
      ? `Correct the previous language mismatch. Rewrite every human-readable metadata field in ${languageLabel}, matching the article, and reply only with JSON matching the schema.`
      : `Create SEO metadata in ${languageLabel}, matching the article language, and reply only with JSON matching the schema.`,
    '</task>'
  ].join('\n');

  const aiProvider = getProvider(provider);

  const generateAttempt = async (attempt: number, correctiveRetry = false) => {
    const result = await executeGenerate({
      provider: aiProvider,
      request: {
        signal,
        systemInstruction,
        userContent: buildContents(correctiveRetry),
        model: modelName,
        maxOutputTokens: 400,
        temperature: 0.2,
        thinkingLevel: provider === 'gemini' ? 'minimal' : undefined,
        responseFormat: 'json',
        responseJsonSchema: provider === 'gemini' ? SeoMetadataResponseJsonSchema : undefined,
      },
      telemetry,
      stage: 'seo',
      attempt,
    });
    if (!result.text.trim()) return null;
    try {
      return normalizeSeoMetadata(
        parseJsonResponse(result.text.trim()),
        article,
        effectiveMetadata,
        editorialProfile
      );
    } catch {
      return null;
    }
  };

  const first = await generateAttempt(1);
  if (first && isPublicationLanguageAligned(first, articleLanguage)) return first;

  const corrected = await generateAttempt(2, true);
  if (corrected && isPublicationLanguageAligned(corrected, articleLanguage)) {
    return corrected;
  }

  return buildFallbackSeoMetadata(article, effectiveMetadata, editorialProfile);
};
