import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  StrategistCancelResponseSchema,
  StrategistSseEventSchema,
  StrategistStatusResponseSchema,
  type StrategistSseEvent,
} from '../chat-protocol';
import { mockChatRouter, resetMockChatStateForTests } from '../mock-chat';

interface MockResponse extends Response {
  chunks: string[];
  headers: Record<string, string>;
  jsonBody: unknown;
  statusCode: number;
  isEnded: boolean;
}

function createMockResponse(): MockResponse {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  let isEnded = false;
  let jsonBody: unknown;

  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key.toLowerCase()] = value;
      return res;
    }),
    status: vi.fn((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    }),
    flushHeaders: vi.fn(),
    flush: vi.fn(),
    write: vi.fn((data: string) => {
      chunks.push(data);
      return true;
    }),
    end: vi.fn(() => {
      isEnded = true;
    }),
    destroy: vi.fn(() => {
      res.destroyed = true;
    }),
    json: vi.fn((data: unknown) => {
      jsonBody = data;
      isEnded = true;
      return res;
    }),
    writableEnded: false,
    destroyed: false,
    statusCode: 200,
    chunks,
    headers,
    get jsonBody() {
      return jsonBody;
    },
    get isEnded() {
      return isEnded;
    },
  } as unknown as MockResponse;

  return res;
}

function createRequest(
  body: Record<string, unknown>,
  overrides: Partial<Request> = {}
): Request {
  return {
    body,
    query: { mockSpeed: 'instant' },
    headers: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

type TestHandler = (req: Request, res: Response) => void | Promise<void>;

function findHandler(path: string, method: 'post' | 'get'): TestHandler {
  const layer = mockChatRouter.stack.find((candidate) => {
    const route = candidate.route as
      | { path?: string; methods?: Record<string, boolean> }
      | undefined;
    return route?.path === path && route.methods?.[method] === true;
  });
  const route = layer?.route;
  if (!route) throw new Error(`Route not found for ${method.toUpperCase()} ${path}`);
  return route.stack[route.stack.length - 1].handle as unknown as TestHandler;
}

function parseSseEvents(chunks: string[]): StrategistSseEvent[] {
  return chunks
    .join('')
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as unknown)
    .map((event) => StrategistSseEventSchema.parse(event));
}

async function startDeepResearch() {
  const handler = findHandler('/', 'post');
  const response = createMockResponse();
  await handler(
    createRequest({
      messages: [{ role: 'user', content: 'artificial intelligence' }],
      mode: 'deep',
    }),
    response
  );

  const events = parseSseEvents(response.chunks);
  const started = events.find(
    (event): event is Extract<StrategistSseEvent, { type: 'deep_research_started' }> =>
      event.type === 'deep_research_started'
  );
  if (!started) throw new Error('Missing deep_research_started event');

  return { response, events, started };
}

describe('mock strategist chat production protocol parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOCK_CHAT_SPEED = 'instant';
    process.env.ENABLE_MOCK_CHAT = 'true';
    resetMockChatStateForTests();
  });

  test('rejects the same invalid chat request before opening SSE', async () => {
    const handler = findHandler('/', 'post');
    const response = createMockResponse();

    await handler(createRequest({ messages: [] }), response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toEqual(expect.objectContaining({
      error: 'Invalid chat request',
      issues: expect.any(Array),
    }));
    expect(response.headers['content-type']).toBeUndefined();
  });

  test('emits production-compatible fast-mode events', async () => {
    const handler = findHandler('/', 'post');
    const response = createMockResponse();

    await handler(
      createRequest({
        messages: [{ role: 'user', content: 'AI content strategy' }],
        mode: 'fast',
      }),
      response
    );

    expect(response.headers).toMatchObject({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const events = parseSseEvents(response.chunks);
    expect(events.map((event) => event.type)).toEqual([
      'session_init',
      'thinking',
      'thinking',
      'thinking',
      'replace_text',
      'done',
    ]);
    expect(
      events
        .filter((event) => event.type === 'thinking')
        .every((event) => event.kind === 'reasoning')
    ).toBe(true);
    expect(response.isEnded).toBe(true);
  });

  test('emits sources through the shared production event contract', async () => {
    const handler = findHandler('/', 'post');
    const response = createMockResponse();

    await handler(
      createRequest({
        messages: [{ role: 'user', content: 'AI publishing benchmarks' }],
        mode: 'fast',
        enableSearch: true,
      }),
      response
    );

    const events = parseSseEvents(response.chunks);
    expect(
      events
        .filter((event) => event.type === 'thinking')
        .every((event) => event.kind === 'grounding')
    ).toBe(true);
    expect(events.some((event) => event.type === 'sources')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  test('starts deep research asynchronously and exposes production status shape', async () => {
    const { response, events, started } = await startDeepResearch();

    expect(events.map((event) => event.type)).toEqual([
      'session_init',
      'deep_research_started',
      'done',
    ]);
    expect(response.isEnded).toBe(true);

    const statusHandler = findHandler('/status/:id', 'get');
    const statusResponse = createMockResponse();
    await statusHandler(
      createRequest({}, { params: { id: started.interaction_id } }),
      statusResponse
    );

    const status = StrategistStatusResponseSchema.parse(statusResponse.jsonBody);
    expect(status.state).toBe('COMPLETED');
    expect(status.output).toContain('# Deep Research Report');
  });

  test('validates the deep-research cancel token and returns production shape', async () => {
    const { started } = await startDeepResearch();
    const cancelHandler = findHandler('/status/:id/cancel', 'post');

    const invalidResponse = createMockResponse();
    await cancelHandler(
      createRequest(
        { cancelToken: 'invalid' },
        { params: { id: started.interaction_id } }
      ),
      invalidResponse
    );
    expect(invalidResponse.statusCode).toBe(403);

    const response = createMockResponse();
    await cancelHandler(
      createRequest(
        { cancelToken: started.cancel_token },
        { params: { id: started.interaction_id } }
      ),
      response
    );
    expect(StrategistCancelResponseSchema.parse(response.jsonBody)).toEqual({
      success: true,
    });

    const statusHandler = findHandler('/status/:id', 'get');
    const statusResponse = createMockResponse();
    await statusHandler(
      createRequest({}, { params: { id: started.interaction_id } }),
      statusResponse
    );
    expect(StrategistStatusResponseSchema.parse(statusResponse.jsonBody)).toEqual({
      state: 'CANCELLED',
      output: '',
    });
  });

  test('reassembles a split frame into a valid production event', async () => {
    const handler = findHandler('/', 'post');
    const response = createMockResponse();

    await handler(
      createRequest({
        messages: [{ role: 'user', content: '[split-frame] parser test' }],
        mode: 'fast',
      }),
      response
    );

    const events = parseSseEvents(response.chunks);
    expect(events.some((event) =>
      event.type === 'replace_text' &&
      event.text.includes('SSE Split-Frame Network Test')
    )).toBe(true);
  });
});
