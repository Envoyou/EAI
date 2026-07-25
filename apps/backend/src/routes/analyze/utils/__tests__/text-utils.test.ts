import { describe, expect, it } from 'vitest';
import {
  buildCanonicalInternalPostUrl,
  normalizeUrl,
  joinRewrittenChunks,
} from '../text';

describe('text-utils helpers', () => {
  describe('buildCanonicalInternalPostUrl', () => {
    it('constructs clean canonical internal post URL from base URL and slug', () => {
      const url = buildCanonicalInternalPostUrl(
        'https://blog.envoyou.com/posts/',
        '/lean-resilient-global-supply-chain-volatility/'
      );
      expect(url).toBe('https://blog.envoyou.com/posts/lean-resilient-global-supply-chain-volatility');
    });

    it('throws error when slug is empty', () => {
      expect(() => buildCanonicalInternalPostUrl('https://blog.envoyou.com/posts', '')).toThrow();
    });
  });

  describe('normalizeUrl', () => {
    it('normalizes protocol, hostname case, default ports, and trailing slashes', () => {
      const url = normalizeUrl('HTTPS://BLOG.ENVOYOU.COM:443/posts/some-slug/#anchor');
      expect(url).toBe('https://blog.envoyou.com/posts/some-slug');
    });

    it('handles root domain gracefully', () => {
      const url = normalizeUrl('https://envoyou.com/');
      expect(url).toBe('https://envoyou.com');
    });
  });

  describe('joinRewrittenChunks', () => {
    it('preserves paragraph boundaries between rewritten chunks ending with sentence punctuation', () => {
      const result = joinRewrittenChunks([
        'The first conclusion ends here.',
        'The next paragraph begins here.',
      ]);
      expect(result).toBe('The first conclusion ends here.\n\nThe next paragraph begins here.');
    });

    it('handles markdown block boundaries properly', () => {
      const result = joinRewrittenChunks([
        'Introduction text.',
        '## References\n\n- Source 1',
      ]);
      expect(result).toBe('Introduction text.\n\n## References\n\n- Source 1');
    });
  });
});
