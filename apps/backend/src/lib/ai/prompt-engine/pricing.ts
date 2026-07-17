export interface ModelPricing {
  inputCostPer1M: number;
  inputCachedCostPer1M?: number;
  outputCostPer1M: number;
}

export const PRICING_CATALOG: Record<string, ModelPricing> = {
  // Gemini 3.5 & 3.1 pricing
  'gemini-3.5-flash': { inputCostPer1M: 0.075, inputCachedCostPer1M: 0.01875, outputCostPer1M: 0.30 },
  'gemini-3.1-flash-lite': { inputCostPer1M: 0.075, inputCachedCostPer1M: 0.01875, outputCostPer1M: 0.30 },
  'gemini-3.5-pro': { inputCostPer1M: 1.25, inputCachedCostPer1M: 0.3125, outputCostPer1M: 5.00 },
  // OpenRouter GPT-4o-mini
  'openai/gpt-4o-mini': { inputCostPer1M: 0.150, outputCostPer1M: 0.60 },
  // Groq Qwen 32B
  'qwen/qwen3-32b': { inputCostPer1M: 0.27, outputCostPer1M: 0.79 },
  'llama-3.1-8b-instant': { inputCostPer1M: 0.05, outputCostPer1M: 0.08 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputLimitTokens: number,
  cachedTokens = 0
): { inputUsd: number; outputUsd: number; totalUsd: number } {
  const price = PRICING_CATALOG[model] || { inputCostPer1M: 0.15, outputCostPer1M: 0.60 };
  
  const regularInputTokens = Math.max(0, inputTokens - cachedTokens);
  const inputCost = (regularInputTokens / 1_000_000) * price.inputCostPer1M;
  
  const cachedCostRate = price.inputCachedCostPer1M ?? (price.inputCostPer1M * 0.25);
  const cachedInputCost = (cachedTokens / 1_000_000) * cachedCostRate;

  const inputUsd = inputCost + cachedInputCost;
  const outputUsd = (outputLimitTokens / 1_000_000) * price.outputCostPer1M;

  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
}
