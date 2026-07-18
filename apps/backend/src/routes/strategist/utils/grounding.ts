export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<globalThis.Response> {
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

/**
 * Unfurl Google Vertex AI Search grounding redirect URLs to their real destination URL.
 * Uses fast HTTP 302 manual location check first, falling back to GET with follow.
 */
export async function resolveGroundingUrl(url: string): Promise<string> {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
    return url;
  }

  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // Strategy 1: Fast manual redirect check (inspect Location header directly from HTTP 302)
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
  } catch (err) {
    console.warn(
      '[GROUNDING_UNFURL] Strategy 1 manual redirect failed:',
      err instanceof Error ? err.message : err
    );
  }

  // Strategy 2: GET with follow redirects
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
  } catch (err) {
    console.warn(
      '[GROUNDING_UNFURL] Strategy 2 follow redirect failed:',
      err instanceof Error ? err.message : err
    );
  }

  return url;
}

/**
 * Sanitize any raw vertexaisearch.cloud.google.com URLs that leaked into text or JSON structures.
 */
export function sanitizeGroundingLeaks<T>(obj: T): T {
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
