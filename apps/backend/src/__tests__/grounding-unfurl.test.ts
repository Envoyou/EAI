import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  resolveGroundingUrl,
  sanitizeGroundingLeaks,
} from '@/routes/strategist/utils/grounding';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Grounding Redirect Unfurl & Leak Sanitizer', () => {
  it('should return regular URL unmodified', async () => {
    const normalUrl = 'https://www.acceldata.io/blog/test';
    const result = await resolveGroundingUrl(normalUrl);
    expect(result).toBe(normalUrl);
  });

  it('should unfurl Google Vertex grounding redirect link to destination URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://www.acceldata.io/blog/test' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const vertexUrl =
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHzCDbTiq7OkwHB3ZYjQBFBCUcHaywd1_ke8UkAs--OSVzM0cEyF4TLFvG4ep4bDBqfxOyeRuaJty-jY_H6SmP7we13phDyfkqW139LO5FKuL3bBlPLoiYK7yrm5WWLFCOTm0OqrXPkQ8ME8xmcGUEYqM1upUWU5TummDv3L2ONzf-ivD0EG3MJZuSXVH-mIg==';
    const result = await resolveGroundingUrl(vertexUrl);
    expect(result).not.toContain('vertexaisearch.cloud.google.com');
    expect(result).toContain('acceldata.io');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      vertexUrl,
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('should sanitize raw vertexaisearch URLs from text and sources array', () => {
    const payload = {
      sources: [
        'https://example.com',
        'https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123',
      ],
      draft:
        'Read more at [AccelData](https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123) for details.',
    };

    const sanitized = sanitizeGroundingLeaks(payload);
    expect(sanitized.sources).toEqual(['https://example.com']);
    expect(sanitized.draft).toBe('Read more at AccelData for details.');
  });
});
