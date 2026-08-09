import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEvaluationRunForChatMessage,
  isEditorialEvaluationCaptureEnabled,
  resolveEvaluationEnvironment,
} from '@/lib/editorial-evaluation';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('editorial evaluation capture policy', () => {
  it('captures staging by default but requires explicit opt-in for production', () => {
    vi.stubEnv('EDITORIAL_EVALUATION_ENVIRONMENT', 'staging');
    vi.stubEnv('EDITORIAL_EVALUATION_CAPTURE', '');
    expect(resolveEvaluationEnvironment()).toBe('staging');
    expect(isEditorialEvaluationCaptureEnabled()).toBe(true);

    vi.stubEnv('EDITORIAL_EVALUATION_ENVIRONMENT', 'production');
    expect(isEditorialEvaluationCaptureEnabled()).toBe(false);

    vi.stubEnv('EDITORIAL_EVALUATION_CAPTURE', 'true');
    expect(isEditorialEvaluationCaptureEnabled()).toBe(true);
  });

  it('stores a chat input, exact system prompt, model, and output as one immutable run', async () => {
    vi.stubEnv('EDITORIAL_EVALUATION_ENVIRONMENT', 'testing');
    vi.stubEnv('EDITORIAL_EVALUATION_CAPTURE', 'true');
    const upsert = vi.fn().mockResolvedValue({});
    const tx = {
      editorialEvaluationRun: { upsert },
    } as never;

    await createEvaluationRunForChatMessage(tx, {
      chatMessageId: 'message-1',
      requestId: 'request-1',
      organizationId: 'org-1',
      userId: 'user-1',
      input: 'Help me choose an article angle.',
      output: 'Use a practical operational angle.',
      promptVersion: '2.8.0',
      renderedPrompt: '<system>Strategist</system>',
      provider: 'gemini',
      modelName: 'gemini-test',
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { chatMessageId: 'message-1' },
      create: {
        environment: 'testing',
        provenance: 'captured',
        workflow: 'chat',
        stage: 'strategist_chat',
        input: 'Help me choose an article angle.',
        renderedPrompt: '<system>Strategist</system>',
        modelName: 'gemini-test',
        output: 'Use a practical operational angle.',
      },
      update: {},
    });
  });
});
