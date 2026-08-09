import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyEditorialChanges,
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
      organization: {
        findUnique: vi.fn().mockResolvedValue({ editorialEvaluationConsent: true }),
      },
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

  it('stores a structured Chat to Blueprint transition beside its model run', async () => {
    vi.stubEnv('EDITORIAL_EVALUATION_CAPTURE', 'true');
    const runUpsert = vi.fn().mockResolvedValue({ id: 'run-1' });
    const transitionUpsert = vi.fn().mockResolvedValue({ id: 'transition-1' });
    const tx = {
      editorialEvaluationRun: { upsert: runUpsert },
      editorialEvaluationTransition: { upsert: transitionUpsert },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ editorialEvaluationConsent: true }),
      },
    } as never;

    await createEvaluationRunForChatMessage(tx, {
      chatMessageId: 'message-1',
      organizationId: 'org-1',
      userId: 'user-1',
      sourceRef: 'request-1',
      input: 'Make a blueprint',
      output: 'Blueprint ready',
      promptVersion: '2.8.0',
      modelName: 'gemini-test',
      transition: {
        type: 'chat_to_blueprint',
        inputSnapshot: { strategistMessages: [{ role: 'user', content: 'Operational SEO' }] },
        outputSnapshot: { blueprint: { angle: 'Practical operations' } },
      },
    });

    expect(transitionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { transitionKey: 'chat_to_blueprint:run-1' },
      create: expect.objectContaining({
        transitionType: 'chat_to_blueprint',
        sourceRef: 'request-1',
        provenance: 'captured',
      }),
      update: {},
    }));
  });

  it('does not capture a tenant that has not opted in', async () => {
    vi.stubEnv('EDITORIAL_EVALUATION_CAPTURE', 'true');
    const runUpsert = vi.fn();
    const tx = {
      editorialEvaluationRun: { upsert: runUpsert },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ editorialEvaluationConsent: false }),
      },
    } as never;

    await createEvaluationRunForChatMessage(tx, {
      chatMessageId: 'message-private',
      organizationId: 'org-private',
      userId: 'user-1',
      input: 'Private tenant input',
      output: 'Private tenant output',
      promptVersion: '2.8.0',
      modelName: 'gemini-test',
    });

    expect(runUpsert).not.toHaveBeenCalled();
  });

  it('derives repeatable human-edit signals without another model call', () => {
    expect(classifyEditorialChanges(
      'Opening sales copy.\n\n## Old heading\nRead https://old.example/a',
      'Direct opening.\n\n## Better heading\nRead https://new.example/b',
    )).toMatchObject({
      openingChanged: true,
      headingsChanged: true,
      sourcesAdded: ['https://new.example/b'],
      sourcesRemoved: ['https://old.example/a'],
    });
  });
});
