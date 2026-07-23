import { describe, expect, test } from 'vitest';
import {
  mergeConfirmedInternalUrls,
  readConfirmedInternalUrls,
} from '@/lib/confirmed-internal-links';

describe('confirmed internal-link decisions', () => {
  test('persists the exact URL from an accepted Internal Linking finding', () => {
    const url = 'https://blog.envoyou.com/posts/generative-engine-optimization-geo-strategy';

    expect(mergeConfirmedInternalUrls([], [{
      category: 'Internal Linking',
      isAccepted: true,
      targetText: `Read [the GEO guide](${url}) before publishing.`,
      message: `The internal URL "${url}" is not in the verified catalog.`,
    }])).toEqual([url]);
  });

  test('does not trust unresolved findings or unrelated feedback categories', () => {
    expect(mergeConfirmedInternalUrls([], [
      {
        category: 'Internal Linking',
        isAccepted: false,
        targetText: '[Unconfirmed](https://blog.envoyou.com/posts/unconfirmed)',
      },
      {
        category: 'Source Fidelity',
        isAccepted: true,
        targetText: '[External](https://example.com/source)',
      },
    ])).toEqual([]);
  });

  test('merges stored decisions safely without duplicating URLs', () => {
    const url = 'https://blog.envoyou.com/posts/confirmed';
    const existing = readConfirmedInternalUrls({
      confirmedInternalUrls: [url, 42, 'javascript:alert(1)'],
    });

    expect(mergeConfirmedInternalUrls(existing, [{
      category: ' internal linking ',
      isAccepted: true,
      targetText: `[Confirmed](${url})`,
    }])).toEqual([url]);
  });

  test('backfills a decision from persisted feedback without trusting malformed data', () => {
    const url = 'https://blog.envoyou.com/posts/legacy-confirmation';

    expect(mergeConfirmedInternalUrls([], [
      null,
      'invalid',
      {
        category: 'Internal Linking',
        isAccepted: true,
        message: `Previously confirmed: "${url}".`,
      },
    ])).toEqual([url]);
  });
});
