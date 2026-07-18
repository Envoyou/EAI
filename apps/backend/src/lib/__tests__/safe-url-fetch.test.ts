import { afterEach, describe, expect, test } from 'vitest';
import { validatePublicHttpUrl } from '../safe-url-fetch';

describe('validatePublicHttpUrl', () => {
  afterEach(() => {
    delete process.env.OUTBOUND_HTTP_ALLOWED_HOSTS;
    delete process.env.OUTBOUND_HTTP_BLOCKED_HOSTS;
    delete process.env.OUTBOUND_HTTP_ALLOWED_PORTS;
  });

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

  test('enforces outbound port and hostname policy', async () => {
    await expect(validatePublicHttpUrl('https://93.184.216.34:8443/')).rejects.toThrow(
      'Outbound port 8443 is not allowed'
    );

    process.env.OUTBOUND_HTTP_ALLOWED_HOSTS = 'example.com';
    await expect(validatePublicHttpUrl('https://93.184.216.34/')).rejects.toThrow(
      'Outbound hostname is not allowed by policy'
    );

    delete process.env.OUTBOUND_HTTP_ALLOWED_HOSTS;
    process.env.OUTBOUND_HTTP_BLOCKED_HOSTS = '93.184.216.34';
    await expect(validatePublicHttpUrl('https://93.184.216.34/')).rejects.toThrow(
      'Outbound hostname is blocked by policy'
    );
  });
});
