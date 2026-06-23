import { getAll, parseConnectionString } from '@vercel/edge-config';
import {
  BILLING_ENABLED,
  DEMO_ENABLED,
  PRICING_ENABLED,
  SIGNUP_ENABLED,
} from './features';

export const FEATURE_FLAG_KEYS = [
  'maintenance_mode',
  'ai_processing_enabled',
  'cms_export_enabled',
  'billing_checkout_enabled',
  'demo_enabled',
  'signup_enabled',
  'pricing_enabled',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  maintenance_mode: false,
  ai_processing_enabled: true,
  cms_export_enabled: true,
  billing_checkout_enabled: BILLING_ENABLED,
  demo_enabled: DEMO_ENABLED,
  signup_enabled: SIGNUP_ENABLED,
  pricing_enabled: PRICING_ENABLED,
};

export const isFeatureFlagKey = (key: string): key is FeatureFlagKey =>
  FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey);

const normalizeFeatureFlags = (
  allItems: Record<string, unknown> | null | undefined
): Record<FeatureFlagKey, boolean> =>
  FEATURE_FLAG_KEYS.reduce<Record<FeatureFlagKey, boolean>>(
    (flags, key) => {
      const value = allItems?.[key];
      flags[key] = typeof value === 'boolean' ? value : DEFAULT_FLAGS[key];
      return flags;
    },
    { ...DEFAULT_FLAGS }
  );

export async function getAllFeatureFlags(): Promise<Record<FeatureFlagKey, boolean>> {
  if (!process.env.EDGE_CONFIG) {
    return { ...DEFAULT_FLAGS };
  }

  try {
    const allItems = await getAll();
    return normalizeFeatureFlags(allItems);
  } catch (error) {
    console.error('Error fetching all feature flags:', error);
    return { ...DEFAULT_FLAGS };
  }
}

export async function getMiddlewareFeatureFlags(
  timeoutMs = 1_000
): Promise<Record<FeatureFlagKey, boolean>> {
  const connectionString = process.env.EDGE_CONFIG;
  if (!connectionString) {
    return { ...DEFAULT_FLAGS };
  }

  const connection = parseConnectionString(connectionString);
  if (!connection) {
    console.error('EDGE_CONFIG is not a valid Edge Config connection string.');
    return { ...DEFAULT_FLAGS };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${connection.baseUrl}/items?version=${connection.version}`,
      {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          ...(process.env.VERCEL_ENV
            ? { 'x-edge-config-vercel-env': process.env.VERCEL_ENV }
            : {}),
        },
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - cache is not in node's RequestInit type but exists in next.js
        cache: 'no-store',
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      console.error('Middleware Edge Config read failed:', response.status);
      return { ...DEFAULT_FLAGS };
    }
    return normalizeFeatureFlags(
      (await response.json()) as Record<string, unknown>
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'unknown error';
    console.error(`Middleware Edge Config read ${reason}. Using defaults.`);
    return { ...DEFAULT_FLAGS };
  } finally {
    clearTimeout(timeout);
  }
}
