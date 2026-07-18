import { parseJsonResponse } from '@eai/shared';

export interface NormalizedStrategistPlan {
  angle: string;
  audience: string;
  hook: string;
  outline: string;
  seoIntent: string;
  sources: string[];
  draft: string;
}

export interface NormalizedStrategistPlanResponse {
  reply: string;
  suggestions: string[];
  plan: NormalizedStrategistPlan;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const extractDraftFromCompositeBlueprint = (value: string): string => {
  const normalized = value.trim();
  const marker = /(?:^|\n)#{1,4}\s*(?:draft|draft preview)\s*\n/i.exec(normalized);
  if (!marker || marker.index === undefined) return normalized;
  const draft = normalized.slice(marker.index + marker[0].length).trim();
  return draft || normalized;
};

const resolvePlanRecord = (root: Record<string, unknown>): Record<string, unknown> | null => {
  let candidate: unknown = root.plan ?? root;
  if (Array.isArray(candidate)) candidate = candidate[0];
  if (typeof candidate === 'string') {
    try {
      candidate = parseJsonResponse(candidate);
    } catch {
      return null;
    }
  }
  return asRecord(candidate);
};

export const normalizeStrategistPlanResponse = (
  value: unknown
): NormalizedStrategistPlanResponse | null => {
  const root = asRecord(value);
  if (!root) return null;
  const plan = resolvePlanRecord(root);
  if (!plan) return null;

  const angle = nonEmptyString(plan.angle);
  const audience = nonEmptyString(plan.audience);
  const hook = nonEmptyString(plan.hook);
  const outline = nonEmptyString(plan.outline);
  const seoIntent = nonEmptyString(plan.seoIntent);
  const draft = nonEmptyString(plan.draft);
  if (!angle || !audience || !hook || !outline || !seoIntent || !draft) return null;

  const sources = Array.isArray(plan.sources)
    ? plan.sources.filter((source): source is string => typeof source === 'string' && Boolean(source.trim()))
    : [];
  const suggestions = Array.isArray(root.suggestions)
    ? root.suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string' && Boolean(suggestion.trim())).slice(0, 3)
    : [];

  return {
    reply: nonEmptyString(root.reply) ?? 'Here is your editorial blueprint and draft.',
    suggestions: suggestions.length === 3
      ? suggestions
      : ['Proceed to Editor', 'Save to Notes', 'Revise Blueprint'],
    plan: {
      angle,
      audience,
      hook,
      outline,
      seoIntent,
      sources,
      draft: extractDraftFromCompositeBlueprint(draft),
    },
  };
};
