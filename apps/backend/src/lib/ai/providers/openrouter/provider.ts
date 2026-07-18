/**
 * OpenRouterProvider — implements AIProvider using the OpenAI-compatible SDK
 * pointed at https://openrouter.ai/api/v1.
 */

import OpenAI from 'openai';
import type { AIProvider, ProviderCapabilities, StreamChunk, StreamRequest, GenerateResult } from '../interface';
import {
  normalizeOpenAiChunk,
  normalizeOpenAiUsage,
  extractOpenAiResponseText,
  type OpenAiCompatibleStreamChunk,
  type OpenAiCompatibleResponse,
} from './mapper';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || 'empty',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://envoyou.com',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'Envoyou AI',
      },
    });
  }
  return _client;
}

export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter' as const;

  async stream(request: StreamRequest): Promise<AsyncIterable<StreamChunk>> {
    const client = getClient();

    const sdkStream = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemInstruction },
        {
          role: 'user',
          content: typeof request.userContent === 'string'
            ? request.userContent
            : JSON.stringify(request.userContent),
        },
      ],
      stream: true,
      ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    async function* normalize(): AsyncIterable<StreamChunk> {
      for await (const raw of sdkStream) {
        yield normalizeOpenAiChunk(raw as OpenAiCompatibleStreamChunk);
      }
    }

    return normalize();
  }

  async generate(request: StreamRequest): Promise<GenerateResult> {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemInstruction },
        {
          role: 'user',
          content: typeof request.userContent === 'string'
            ? request.userContent
            : JSON.stringify(request.userContent),
        },
      ],
      stream: false,
      ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    return {
      text: extractOpenAiResponseText(response as OpenAiCompatibleResponse),
      usage: normalizeOpenAiUsage(response as OpenAiCompatibleResponse) ?? undefined,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      structuredOutput: true, // Depends on model, but OpenRouter surface supports response_format
      grounding: false,
      thinking: false, // Depends on model; can be extended later
      caching: false,
    };
  }
}
