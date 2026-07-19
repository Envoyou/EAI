/**
 * GroqProvider — implements AIProvider using the Groq SDK.
 * Groq is OpenAI-compatible but uses a dedicated SDK client and different models/limits.
 */

import Groq from 'groq-sdk';
import type { AIProvider, ProviderCapabilities, StreamChunk, StreamRequest, GenerateResult } from '../interface';
import {
  normalizeGroqChunk,
  normalizeGroqUsage,
  extractGroqResponseText,
  type OpenAiCompatibleStreamChunk,
  type OpenAiCompatibleResponse,
} from './mapper';

let _client: Groq | null = null;

function getClient(): Groq {
  if (!_client) {
    _client = new Groq({
      apiKey: process.env.GROQ_API_KEY || 'empty',
    });
  }
  return _client;
}

export class GroqProvider implements AIProvider {
  readonly name = 'groq' as const;

  async stream(request: StreamRequest): Promise<AsyncIterable<StreamChunk>> {
    const client = getClient();

    const sdkStream = await (client.chat.completions as unknown as {
      create(
        params: Record<string, unknown>,
        options?: { signal?: AbortSignal }
      ): Promise<AsyncIterable<OpenAiCompatibleStreamChunk>>;
    }).create({
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
        ? { response_format: { type: 'json_object' } }
        : {}),
    }, { signal: request.signal });

    async function* normalize(): AsyncIterable<StreamChunk> {
      for await (const raw of sdkStream) {
        yield normalizeGroqChunk(raw);
      }
    }

    return normalize();
  }

  async generate(request: StreamRequest): Promise<GenerateResult> {
    const client = getClient();

    const response = await (client.chat.completions as unknown as {
      create(
        params: Record<string, unknown>,
        options?: { signal?: AbortSignal }
      ): Promise<OpenAiCompatibleResponse>;
    }).create({
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
        ? { response_format: { type: 'json_object' } }
        : {}),
    }, { signal: request.signal });

    return {
      text: extractGroqResponseText(response),
      usage: normalizeGroqUsage(response) ?? undefined,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      structuredOutput: true,
      grounding: false,
      thinking: false,
      caching: false,
    };
  }
}
