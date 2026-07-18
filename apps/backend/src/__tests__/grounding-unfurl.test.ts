import { describe, it, expect } from 'vitest';

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 3000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

async function resolveGroundingUrl(url: string): Promise<string> {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
    return url;
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': userAgent },
      timeout: 3000,
    });
    const location = res.headers.get('location');
    if (location && location.startsWith('http')) {
      return location;
    }
  } catch (_err) {
    // Strategy 1 failed
  }

  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': userAgent },
      timeout: 4000,
    });
    if (res.url && !res.url.includes('vertexaisearch.cloud.google.com')) {
      return res.url;
    }
  } catch (_err) {
    // Strategy 2 failed
  }

  return url;
}

function sanitizeGroundingLeaks<T>(obj: T): T {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    let cleaned = obj.replace(
      /\[([^\]]+)\]\(https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^)]+\)/g,
      '$1'
    );
    cleaned = cleaned.replace(
      /https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s)]+/g,
      ''
    );
    return cleaned as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj
      .map(sanitizeGroundingLeaks)
      .filter(
        (item) =>
          typeof item !== 'string' ||
          (item.trim().length > 0 && !item.includes('vertexaisearch.cloud.google.com'))
      ) as unknown as T;
  }
  if (typeof obj === 'object') {
    const copy = { ...obj } as Record<string, unknown>;
    for (const key of Object.keys(copy)) {
      copy[key] = sanitizeGroundingLeaks(copy[key]);
    }
    return copy as T;
  }
  return obj;
}

describe('Grounding Redirect Unfurl & Leak Sanitizer', () => {
  it('should return regular URL unmodified', async () => {
    const normalUrl = 'https://www.acceldata.io/blog/test';
    const result = await resolveGroundingUrl(normalUrl);
    expect(result).toBe(normalUrl);
  });

  it('should unfurl Google Vertex grounding redirect link to destination URL', async () => {
    const vertexUrl =
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHzCDbTiq7OkwHB3ZYjQBFBCUcHaywd1_ke8UkAs--OSVzM0cEyF4TLFvG4ep4bDBqfxOyeRuaJty-jY_H6SmP7we13phDyfkqW139LO5FKuL3bBlPLoiYK7yrm5WWLFCOTm0OqrXPkQ8ME8xmcGUEYqM1upUWU5TummDv3L2ONzf-ivD0EG3MJZuSXVH-mIg==';
    const result = await resolveGroundingUrl(vertexUrl);
    expect(result).not.toContain('vertexaisearch.cloud.google.com');
    expect(result).toContain('acceldata.io');
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
