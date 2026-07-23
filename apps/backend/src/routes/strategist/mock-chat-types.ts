export const MOCK_SCENARIOS = [
  'default',
  'grounding',
  'long-thinking',
  'blueprint',
  'deep',
  'sources',
  'table',
  'code',
  'long',
  'error-before-text',
  'error-after-text',
  'abrupt-close',
  'malformed-event',
  'split-frame',
  'duplicate-done',
  'replace-text',
  'slow-first-byte',
  'heartbeat-only',
  'no-session',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === 'string' &&
    (MOCK_SCENARIOS as readonly string[]).includes(value);
}

export type MockSpeed = 'instant' | 'normal' | 'slow' | 'timeout';

export interface MockTiming {
  initialDelayMs: number;
  thinkingChunkDelayMs: number;
  textChunkDelayMs: number;
  finalDelayMs: number;
}

export const MOCK_TIMING_PRESETS: Record<MockSpeed, MockTiming> = {
  instant: { initialDelayMs: 0,     thinkingChunkDelayMs: 0,   textChunkDelayMs: 0,  finalDelayMs: 0   },
  normal:  { initialDelayMs: 400,   thinkingChunkDelayMs: 450, textChunkDelayMs: 65, finalDelayMs: 250 },
  slow:    { initialDelayMs: 1000,  thinkingChunkDelayMs: 800, textChunkDelayMs: 150, finalDelayMs: 500 },
  timeout: { initialDelayMs: 35000, thinkingChunkDelayMs: 0,   textChunkDelayMs: 0,  finalDelayMs: 0   },
};
