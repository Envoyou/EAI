import { describe, expect, it } from 'vitest';
import {
  detectEditorialLanguage,
  isPublicationLanguageAligned,
} from '@/lib/editorial-language';

describe('editorial language alignment', () => {
  it('detects the dominant language of an English final body', () => {
    expect(detectEditorialLanguage(
      'The impact of AI automation is changing the labor market and the skills required for work.'
    )).toBe('en');
  });

  it('rejects Indonesian SEO prose for an English final body', () => {
    expect(isPublicationLanguageAligned({
      title: 'Dampak Otomasi AI pada Pasar Tenaga Kerja',
      slug: 'dampak-otomasi-ai-pasar-tenaga-kerja',
      excerpt: 'Artikel ini membahas perubahan yang terjadi dalam pasar tenaga kerja dan strategi untuk perusahaan.',
      metaTitle: 'Dampak Otomasi AI untuk Tenaga Kerja',
      metaDescription: 'Pelajari bagaimana otomasi AI mengubah pekerjaan dan keterampilan yang dibutuhkan oleh perusahaan.',
      coverImageAltText: 'Profesional yang menganalisis perubahan tenaga kerja.',
      tags: ['Otomasi', 'Tenaga Kerja'],
    }, 'en')).toBe(false);
  });

  it('accepts English SEO prose for an English final body', () => {
    expect(isPublicationLanguageAligned({
      title: 'AI Automation and the Labor Market',
      slug: 'ai-automation-labor-market',
      excerpt: 'This article explains how AI automation changes work and the skills required by modern companies.',
      metaTitle: 'AI Automation and Labor Market Change',
      metaDescription: 'Learn how AI automation changes employment, workforce planning, and the skills required by modern companies.',
      coverImageAltText: 'Professionals reviewing labor market data.',
      tags: ['Automation', 'Labor Market'],
    }, 'en')).toBe(true);
  });
});
