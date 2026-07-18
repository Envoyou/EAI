import { describe, expect, test } from 'vitest';
import { validatePublicHttpUrl } from '../safe-url-fetch';

describe('validatePublicHttpUrl', () => {
  test.each([
    'http://127.0.0.1/admin',
    'http://10.0.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.1.10/',
    'http://[::1]/',
  ])('blocks private or local address %s', async (url) => {
    await expect(validatePublicHttpUrl(url)).rejects.toThrow(
      'Private network URLs are not allowed'
    );
  });

  test('allows a public HTTP address', async () => {
    await expect(validatePublicHttpUrl('https://93.184.216.34/article')).resolves.toBeInstanceOf(
      URL
    );
  });

  test('blocks credentials and unsupported protocols', async () => {
    await expect(validatePublicHttpUrl('https://user:pass@93.184.216.34/')).rejects.toThrow(
      'credentials'
    );
    await expect(validatePublicHttpUrl('file:///etc/passwd')).rejects.toThrow(
      'Only HTTP and HTTPS'
    );
  });
});
