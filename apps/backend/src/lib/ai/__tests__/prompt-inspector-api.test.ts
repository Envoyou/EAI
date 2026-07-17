import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { handleInspect, handleDiff } from '../../../routes/prompt-inspector';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

interface MockResponseResult {
  status: number;
  body: Record<string, unknown>;
}

describe('Prompt Inspector API Route Handlers direct call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('handleInspect should analyze prompt correctly', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

    const mockReq = {
      body: {
        composer: 'seo',
        provider: 'gemini',
        analysisSpeed: 'balanced',
        options: {
          format: 'xml',
        },
      },
    } as unknown as Request;

    const responsePromise = new Promise<MockResponseResult>((resolve) => {
      const mockResObj = {
        statusCode: 200,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: Record<string, unknown>) {
          resolve({ status: this.statusCode, body: data });
          return this;
        },
      };

      const mockRes = mockResObj as unknown as Response;

      void handleInspect(mockReq, mockRes);
    });

    const result = await responsePromise;
    expect(result.status).toBe(200);
    expect(result.body.provider).toBe('gemini');
    expect(result.body.model).toBeDefined();
    expect(typeof result.body.renderedPrompt).toBe('string');
    expect(result.body.tree).toBeDefined();
    expect(result.body.cacheAnalysis).toBeDefined();
    expect(result.body.estimatedCost).toBeDefined();
  });

  test('handleDiff should compare two prompts', async () => {
    const mockReq = {
      body: {
        source: {
          composer: 'seo',
          provider: 'gemini',
        },
        target: {
          composer: 'quality-gate',
          provider: 'gemini',
        },
      },
    } as unknown as Request;

    const responsePromise = new Promise<MockResponseResult>((resolve) => {
      const mockResObj = {
        statusCode: 200,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: Record<string, unknown>) {
          resolve({ status: this.statusCode, body: data });
          return this;
        },
      };

      const mockRes = mockResObj as unknown as Response;

      void handleDiff(mockReq, mockRes);
    });

    const result = await responsePromise;
    expect(result.status).toBe(200);
    expect(result.body.totalTokenDiff).toBeDefined();
    expect(result.body.cacheableTokenDiff).toBeDefined();
    expect(result.body.nodeDiffs).toBeDefined();
  });
});
