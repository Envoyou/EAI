import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVOYOU_EDITORIAL_PROFILE } from '@eai/shared/server';
import { AiTelemetryCollector } from '@/lib/ai-telemetry';

const { executeGenerateMock } = vi.hoisted(() => ({
  executeGenerateMock: vi.fn(),
}));

vi.mock('@/lib/ai/runtime/execute-generate', () => ({
  executeGenerate: executeGenerateMock,
}));

vi.mock('@/lib/ai/providers/registry', () => ({
  getProvider: () => ({ name: 'gemini' }),
}));

import { runSeoStage } from '@/lib/ai/seo-stage';

const indonesianPackage = {
  title: 'Dampak Otomasi AI pada Pasar Tenaga Kerja',
  slug: 'dampak-otomasi-ai-pasar-tenaga-kerja',
  excerpt: 'Artikel ini membahas perubahan yang terjadi dalam pasar tenaga kerja dan strategi untuk perusahaan.',
  metaTitle: 'Dampak Otomasi AI untuk Tenaga Kerja',
  metaDescription: 'Pelajari bagaimana otomasi AI mengubah pekerjaan dan keterampilan yang dibutuhkan oleh perusahaan.',
  coverImageAltText: 'Profesional yang menganalisis perubahan tenaga kerja.',
  tags: ['Otomasi', 'Tenaga Kerja', 'Kecerdasan Buatan'],
};

const englishPackage = {
  title: 'AI Automation and the Labor Market',
  slug: 'ai-automation-labor-market',
  excerpt: 'This article explains how AI automation changes work and the skills required by modern companies.',
  metaTitle: 'AI Automation and Labor Market Change',
  metaDescription: 'Learn how AI automation changes employment, workforce planning, and the skills required by modern companies.',
  coverImageAltText: 'Professionals reviewing labor market data.',
  tags: ['Automation', 'Labor Market', 'Artificial Intelligence'],
};

describe('SEO language correction', () => {
  beforeEach(() => executeGenerateMock.mockReset());

  it('corrects a mismatched SEO package before returning it to the pipeline', async () => {
    executeGenerateMock
      .mockResolvedValueOnce({ text: JSON.stringify(indonesianPackage) })
      .mockResolvedValueOnce({ text: JSON.stringify(englishPackage) });

    const result = await runSeoStage({
      provider: 'gemini',
      modelName: 'test-seo-model',
      article: 'The impact of AI automation is changing the labor market and the skills required for work. Companies are adapting their workforce plans with new training and hiring strategies.',
      metadata: { outputLanguage: 'id' },
      editorialProfile: ENVOYOU_EDITORIAL_PROFILE,
      systemInstruction: 'SEO system instruction',
      telemetry: new AiTelemetryCollector(),
    });

    expect(executeGenerateMock).toHaveBeenCalledTimes(2);
    expect(result.title).toBe(englishPackage.title);
    expect(executeGenerateMock.mock.calls[0]?.[0].request.userContent)
      .toContain('English. This is derived from the dominant language');
    expect(executeGenerateMock.mock.calls[1]?.[0].request.userContent)
      .toContain('Correct the previous language mismatch');
    expect(executeGenerateMock.mock.calls[1]?.[0].attempt).toBe(2);
  });
});
