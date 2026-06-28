type AiProvider = 'gemini' | 'groq' | 'openrouter';

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type AiStageTelemetry = TokenUsage & {
  stage: string;
  provider: AiProvider;
  model: string;
  attempt: number;
  durationMs: number;
  status: 'success' | 'error';
  estimatedCostUsd: number;
  estimatedCostIdr: number;
};

export type AiTelemetrySnapshot = TokenUsage & {
  pricingVersion: string;
  usdToIdrRate: number;
  durationMs: number;
  retryCount: number;
  fallbackCount: number;
  failedCallCount: number;
  estimatedCostUsd: number;
  estimatedCostIdr: number;
  stages: AiStageTelemetry[];
};

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

type GroqUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  } | null;
};

type OpenRouterUsage = GroqUsage;

type ModelPrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
};

const DEFAULT_USD_TO_IDR_RATE = 17912.30;
const PRICING_VERSION = '2026-06-12';

// Token prices are estimates based on published provider list prices. They can
// be overridden without a deploy through AI_MODEL_PRICING_JSON.
const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  'gemini-3.5-flash': {
    inputUsdPerMillion: 1.50,
    outputUsdPerMillion: 9.00,
    cachedInputUsdPerMillion: 0.15,
  },
  'gemini-3.1-flash-lite': {
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 1.50,
    cachedInputUsdPerMillion: 0.025,
  },
  'qwen/qwen3-32b': {
    inputUsdPerMillion: 0.29,
    outputUsdPerMillion: 0.59,
  },
  'llama-3.1-8b-instant': {
    inputUsdPerMillion: 0.05,
    outputUsdPerMillion: 0.08,
  },
  'openai/gpt-4.1-mini': {
    inputUsdPerMillion: 0.40,
    outputUsdPerMillion: 1.60,
  },
  'openai/gpt-4.1': {
    inputUsdPerMillion: 2.00,
    outputUsdPerMillion: 8.00,
  },
  'anthropic/claude-3.5-sonnet': {
    inputUsdPerMillion: 3.00,
    outputUsdPerMillion: 15.00,
  },
  'anthropic/claude-3.5-haiku': {
    inputUsdPerMillion: 0.80,
    outputUsdPerMillion: 4.00,
  },
  'google/gemini-2.5-flash-preview': {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.60,
  },
};

const asNonNegativeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

const roundMoney = (value: number, decimals: number) => {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
};

const getUsdToIdrRate = () => {
  const configured = Number(process.env.AI_COST_USD_TO_IDR);
  return configured > 0 ? configured : DEFAULT_USD_TO_IDR_RATE;
};

const getModelPrices = () => {
  const configured = process.env.AI_MODEL_PRICING_JSON;
  if (!configured) return DEFAULT_MODEL_PRICES;

  try {
    const parsed = JSON.parse(configured) as Record<string, Partial<ModelPrice>>;
    const merged: Record<string, ModelPrice> = { ...DEFAULT_MODEL_PRICES };

    for (const [model, override] of Object.entries(parsed)) {
      const fallback = merged[model];
      merged[model] = {
        inputUsdPerMillion:
          asNonNegativeNumber(override?.inputUsdPerMillion) ||
          fallback?.inputUsdPerMillion ||
          0,
        outputUsdPerMillion:
          asNonNegativeNumber(override?.outputUsdPerMillion) ||
          fallback?.outputUsdPerMillion ||
          0,
        cachedInputUsdPerMillion:
          asNonNegativeNumber(override?.cachedInputUsdPerMillion) ||
          fallback?.cachedInputUsdPerMillion,
      };
    }

    return merged;
  } catch (error) {
    console.warn('[AI Telemetry] Invalid AI_MODEL_PRICING_JSON, using defaults:', error);
    return DEFAULT_MODEL_PRICES;
  }
};

const calculateCost = (model: string, usage: TokenUsage) => {
  const price = getModelPrices()[model];
  const usdToIdrRate = getUsdToIdrRate();
  if (!price) {
    return { estimatedCostUsd: 0, estimatedCostIdr: 0 };
  }

  const uncachedInputTokens = Math.max(usage.inputTokens - usage.cachedTokens, 0);
  const inputCost =
    (uncachedInputTokens / 1_000_000) * price.inputUsdPerMillion +
    (usage.cachedTokens / 1_000_000) *
      (price.cachedInputUsdPerMillion ?? price.inputUsdPerMillion);
  const outputCost = (usage.outputTokens / 1_000_000) * price.outputUsdPerMillion;
  const estimatedCostUsd = roundMoney(inputCost + outputCost, 8);

  return {
    estimatedCostUsd,
    estimatedCostIdr: roundMoney(estimatedCostUsd * usdToIdrRate, 2),
  };
};

const normalizeGeminiUsage = (usage?: GeminiUsage): TokenUsage => {
  const inputTokens = asNonNegativeNumber(usage?.promptTokenCount);
  const candidateTokens = asNonNegativeNumber(usage?.candidatesTokenCount);
  const reasoningTokens = asNonNegativeNumber(usage?.thoughtsTokenCount);
  const totalTokens = asNonNegativeNumber(usage?.totalTokenCount);
  const outputFromTotal = Math.max(totalTokens - inputTokens, 0);
  const outputTokens = Math.max(candidateTokens + reasoningTokens, outputFromTotal);

  return {
    inputTokens,
    outputTokens,
    cachedTokens: asNonNegativeNumber(usage?.cachedContentTokenCount),
    reasoningTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
  };
};

const normalizeGroqUsage = (usage?: GroqUsage | null): TokenUsage => {
  const inputTokens = asNonNegativeNumber(usage?.prompt_tokens);
  const outputTokens = asNonNegativeNumber(usage?.completion_tokens);

  return {
    inputTokens,
    outputTokens,
    cachedTokens: asNonNegativeNumber(usage?.prompt_tokens_details?.cached_tokens),
    reasoningTokens: asNonNegativeNumber(
      usage?.completion_tokens_details?.reasoning_tokens
    ),
    totalTokens:
      asNonNegativeNumber(usage?.total_tokens) || inputTokens + outputTokens,
  };
};

export class AiTelemetryCollector {
  private readonly startedAt = Date.now();
  private readonly stages: AiStageTelemetry[] = [];
  private fallbackCount = 0;

  recordGemini(input: {
    stage: string;
    model: string;
    usage?: GeminiUsage;
    durationMs: number;
    attempt?: number;
    status?: 'success' | 'error';
  }) {
    this.record({
      ...input,
      provider: 'gemini',
      usage: normalizeGeminiUsage(input.usage),
    });
  }

  recordGroq(input: {
    stage: string;
    model: string;
    usage?: GroqUsage | null;
    durationMs: number;
    attempt?: number;
    status?: 'success' | 'error';
  }) {
    this.record({
      ...input,
      provider: 'groq',
      usage: normalizeGroqUsage(input.usage),
    });
  }

  recordOpenRouter(input: {
    stage: string;
    model: string;
    usage?: OpenRouterUsage | null;
    durationMs: number;
    attempt?: number;
    status?: 'success' | 'error';
  }) {
    this.record({
      ...input,
      provider: 'openrouter',
      usage: normalizeGroqUsage(input.usage),
    });
  }

  markFallback() {
    this.fallbackCount += 1;
  }

  snapshot(): AiTelemetrySnapshot {
    const totals = this.stages.reduce<TokenUsage>(
      (sum, stage) => ({
        inputTokens: sum.inputTokens + stage.inputTokens,
        outputTokens: sum.outputTokens + stage.outputTokens,
        cachedTokens: sum.cachedTokens + stage.cachedTokens,
        reasoningTokens: sum.reasoningTokens + stage.reasoningTokens,
        totalTokens: sum.totalTokens + stage.totalTokens,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      }
    );

    return {
      ...totals,
      pricingVersion: PRICING_VERSION,
      usdToIdrRate: getUsdToIdrRate(),
      durationMs: Date.now() - this.startedAt,
      retryCount: this.stages.filter((stage) => stage.attempt > 1).length,
      fallbackCount: this.fallbackCount,
      failedCallCount: this.stages.filter((stage) => stage.status === 'error').length,
      estimatedCostUsd: roundMoney(
        this.stages.reduce((sum, stage) => sum + stage.estimatedCostUsd, 0),
        8
      ),
      estimatedCostIdr: roundMoney(
        this.stages.reduce((sum, stage) => sum + stage.estimatedCostIdr, 0),
        2
      ),
      stages: [...this.stages],
    };
  }

  private record(input: {
    stage: string;
    provider: AiProvider;
    model: string;
    usage: TokenUsage;
    durationMs: number;
    attempt?: number;
    status?: 'success' | 'error';
  }) {
    const cost = calculateCost(input.model, input.usage);
    this.stages.push({
      stage: input.stage,
      provider: input.provider,
      model: input.model,
      attempt: input.attempt ?? 1,
      durationMs: Math.max(Math.round(input.durationMs), 0),
      status: input.status ?? 'success',
      ...input.usage,
      ...cost,
    });
  }
}
