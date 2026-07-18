/**
 * GeminiProvider — implements the AIProvider interface using @google/genai SDK.
 * Wraps generateContentStream and generateContent behind the normalized contract.
 */

import { ThinkingLevel } from '@google/genai';
import type { AIProvider, ProviderCapabilities, StreamChunk, StreamRequest, GenerateResult } from '../interface';
import { getGeminiClient } from './client';
import { normalizeGeminiChunk, extractGeminiText, normalizeGeminiUsage } from './mapper';

const THINKING_LEVEL_MAP: Record<NonNullable<StreamRequest['thinkingLevel']>, ThinkingLevel> = {
  none: ThinkingLevel.THINKING_LEVEL_UNSPECIFIED,
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
};

const getStructuredOutputConfig = (request: StreamRequest) =>
  request.responseFormat === 'json'
    ? {
        responseMimeType: 'application/json',
        ...(request.responseJsonSchema
          ? { responseJsonSchema: request.responseJsonSchema }
          : {}),
      }
    : {};

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;

  async stream(request: StreamRequest): Promise<AsyncIterable<StreamChunk>> {
    const client = getGeminiClient();

    const thinkingLevel = request.thinkingLevel
      ? THINKING_LEVEL_MAP[request.thinkingLevel]
      : undefined;

    const sdkStream = await client.models.generateContentStream({
      model: request.model,
      contents: request.userContent as string | object,
      config: {
        systemInstruction: request.systemInstruction,
        candidateCount: 1,
        ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
        ...(thinkingLevel !== undefined ? { thinkingConfig: { thinkingLevel } } : {}),
        ...getStructuredOutputConfig(request),
        // temperature is intentionally excluded — Gemini 3.x ignores it when thinkingConfig is set
      },
    });

    // Wrap SDK iterator in a generator that yields normalized StreamChunk
    async function* normalize(): AsyncIterable<StreamChunk> {
      for await (const raw of sdkStream) {
        yield normalizeGeminiChunk(raw);
      }
    }

    return normalize();
  }

  async generate(request: StreamRequest): Promise<GenerateResult> {
    const client = getGeminiClient();

    const thinkingLevel = request.thinkingLevel
      ? THINKING_LEVEL_MAP[request.thinkingLevel]
      : undefined;

    const response = await client.models.generateContent({
      model: request.model,
      contents: request.userContent as string | object,
      config: {
        systemInstruction: request.systemInstruction,
        candidateCount: 1,
        ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
        ...(thinkingLevel !== undefined ? { thinkingConfig: { thinkingLevel } } : {}),
        ...getStructuredOutputConfig(request),
      },
    });

    return {
      text: extractGeminiText(response),
      usage: (response as { usageMetadata?: Parameters<typeof normalizeGeminiUsage>[0] }).usageMetadata
        ? normalizeGeminiUsage(
            (response as { usageMetadata: Parameters<typeof normalizeGeminiUsage>[0] }).usageMetadata
          )
        : undefined,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      structuredOutput: false, // Gemini uses schema in config, not response_format
      grounding: true,
      thinking: true,
      caching: true,
      cachePolicy: {
        minimumPrefixTokens: 32768,
        prefixOnly: true,
      },
    };
  }

  async countTokens(model: string, text: string): Promise<number> {
    const client = getGeminiClient();
    const result = await client.models.countTokens({
      model,
      contents: text,
    });
    return result.totalTokens ?? 0;
  }
}
