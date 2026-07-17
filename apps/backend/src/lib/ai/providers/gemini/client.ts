/**
 * GoogleGenAI singleton client.
 * Separated from provider-runtime.ts to avoid circular deps when
 * providers/registry.ts needs to lazily construct providers.
 */

import { GoogleGenAI } from '@google/genai';

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || 'empty',
    });
  }
  return _client;
}
