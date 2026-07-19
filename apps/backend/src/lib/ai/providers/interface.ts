/**
 * Unified AIProvider interface.
 * All provider implementations must satisfy this contract.
 * Extracted from provider-runtime.ts during Sprint 3 provider abstraction.
 */

import type { Role, ResponseMode } from '@eai/shared';
import type { AnalysisSpeed } from '@/lib/ai/provider-runtime';
import type { GeminiServiceTier } from '@/lib/ai/gemini-request-policy';

// ── Usage Metadata ────────────────────────────────────────────────────────────

export interface UsageMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}

// ── Stream ─────────────────────────────────────────────────────────────────────

/**
 * A normalized chunk from any provider.
 * Only `text` is guaranteed present on every chunk.
 * `finishReason` and `usage` appear on the final chunk for most providers.
 */
export interface StreamChunk {
  text: string;
  finishReason?: string;
  usage?: UsageMetadata;
}

export interface StreamRequest {
  /** System instruction / system prompt to send to the model. */
  systemInstruction: string;
  /** User content — plain string or multi-part object depending on provider. */
  userContent: string | object;
  /** Resolved model name (from ModelRouter). */
  model: string;
  /** Maximum number of output tokens. Defaults to provider default if omitted. */
  maxOutputTokens?: number;
  /**
   * Thinking level for models that support it (Gemini 2.5+).
   * Ignored silently if provider does not support thinking.
   */
  thinkingLevel?: 'none' | 'minimal' | 'low' | 'medium';
  /**
   * Sampling temperature.
   * Ignored silently if provider does not support it (e.g. Gemini native).
   */
  temperature?: number;
  /**
   * Whether to request structured JSON output from the model.
   * Falls back to text if provider does not support structured output.
   */
  responseFormat?: 'text' | 'json';
  /**
   * JSON schema for providers that support schema-constrained structured output.
   * OpenAI-compatible providers currently use responseFormat: 'json' as a
   * json_object constraint and may ignore this schema.
   */
  responseJsonSchema?: unknown;
  /** Gemini inference tier. Defaults to GEMINI_SERVICE_TIER, then Standard. */
  serviceTier?: GeminiServiceTier;
}

export interface GenerateResult {
  text: string;
  usage?: UsageMetadata;
}

export interface ProviderCachePolicy {
  /** The minimum token size of static prefix to activate caching */
  minimumPrefixTokens: number;
  /** Whether the provider only supports caching on prefix (top of the prompt) */
  prefixOnly: boolean;
}

export interface ProviderCapabilities {
  /** Whether the provider supports structured JSON output via response_format. */
  structuredOutput: boolean;
  /** Whether the provider supports Google Search grounding. */
  grounding: boolean;
  /** Whether the provider supports native thinking / extended reasoning. */
  thinking: boolean;
  /** Whether the provider supports context caching for repeated prompts. */
  caching: boolean;
  /** Caching policy configuration for CachePlanner and CacheOptimizer */
  cachePolicy?: ProviderCachePolicy;
}

// ── Provider Interface ────────────────────────────────────────────────────────

export interface AIProvider {
  /** Identifier matching AiProvider union type. */
  readonly name: 'gemini' | 'groq' | 'openrouter';

  /**
   * Opens a streaming generation request.
   * Returns an AsyncIterable of normalized StreamChunk objects.
   * The final chunk will contain `finishReason` and `usage`.
   */
  stream(request: StreamRequest): Promise<AsyncIterable<StreamChunk>>;

  /**
   * Performs a non-streaming (single-shot) generation request.
   * Use for short tasks like SEO metadata or targeted fixes.
   */
  generate(request: StreamRequest): Promise<GenerateResult>;

  /**
   * Returns a static capabilities descriptor for this provider.
   * This reflects the provider's intrinsic capabilities, not the selected model.
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Online token-counting method.
   * Returns precise token count of text for a given model.
   */
  countTokens?(model: string, text: string): Promise<number>;
}

// ── Re-export helpers ─────────────────────────────────────────────────────────

export type { AnalysisSpeed, Role, ResponseMode };
