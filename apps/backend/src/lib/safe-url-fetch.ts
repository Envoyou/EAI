import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;
const DEFAULT_ALLOWED_PORTS = new Set([80, 443]);
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

interface PinnedTarget {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;

  if (normalized.startsWith('::ffff:')) {
    const embeddedIpv4 = normalized.slice('::ffff:'.length);
    return isIP(embeddedIpv4) !== 4 || isPrivateIpv4(embeddedIpv4);
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('2001:db8:')
  );
}

const parseCsv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const matchesHostRule = (hostname: string, rule: string) =>
  rule.startsWith('*.')
    ? hostname.endsWith(rule.slice(1)) && hostname !== rule.slice(2)
    : hostname === rule;

function enforceOutboundPolicy(url: URL, hostname: string): void {
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const configuredPorts = parseCsv(process.env.OUTBOUND_HTTP_ALLOWED_PORTS)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 65_535);
  const allowedPorts = configuredPorts.length > 0
    ? new Set(configuredPorts)
    : DEFAULT_ALLOWED_PORTS;
  if (!allowedPorts.has(port)) {
    throw new Error(`Outbound port ${port} is not allowed`);
  }

  const blockedHosts = parseCsv(process.env.OUTBOUND_HTTP_BLOCKED_HOSTS);
  if (blockedHosts.some((rule) => matchesHostRule(hostname, rule))) {
    throw new Error('Outbound hostname is blocked by policy');
  }

  const allowedHosts = parseCsv(process.env.OUTBOUND_HTTP_ALLOWED_HOSTS);
  if (
    allowedHosts.length > 0 &&
    !allowedHosts.some((rule) => matchesHostRule(hostname, rule))
  ) {
    throw new Error('Outbound hostname is not allowed by policy');
  }
}

async function resolvePinnedTarget(input: string): Promise<PinnedTarget> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }
  if (url.username || url.password) {
    throw new Error('URLs containing credentials are not supported');
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Private network URLs are not allowed');
  }
  enforceOutboundPolicy(url, hostname);

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Private network URLs are not allowed');
  }

  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) {
    throw new Error('Unsupported DNS address family');
  }
  return {
    url,
    hostname,
    address: selected.address,
    family: selected.family,
  };
}

export async function validatePublicHttpUrl(input: string): Promise<URL> {
  return (await resolvePinnedTarget(input)).url;
}

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requestPinnedTarget(target: PinnedTarget, init: RequestInit): Promise<Response> {
  if (init.body) throw new Error('Outbound request bodies are not supported');

  const maxResponseBytes = getPositiveInteger(
    process.env.OUTBOUND_HTTP_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES
  );
  const timeoutMs = getPositiveInteger(
    process.env.OUTBOUND_HTTP_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const headers = new Headers(init.headers);
  headers.set('accept-encoding', 'identity');
  const requestHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });

  return new Promise<Response>((resolve, reject) => {
    const requestFn = target.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = requestFn(
      {
        protocol: target.url.protocol,
        hostname: target.hostname,
        port: target.url.port || undefined,
        path: `${target.url.pathname}${target.url.search}`,
        method: init.method || 'GET',
        headers: requestHeaders,
        servername: target.url.protocol === 'https:' ? target.hostname : undefined,
        lookup: (_hostname, _options, callback) => {
          callback(null, target.address, target.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;
          if (totalBytes > maxResponseBytes) {
            request.destroy(new Error('Outbound response exceeds size limit'));
            return;
          }
          chunks.push(buffer);
        });
        response.on('end', () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              value.forEach((item) => responseHeaders.append(key, item));
            } else if (value !== undefined) {
              responseHeaders.set(key, String(value));
            }
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
              statusText: response.statusMessage,
              headers: responseHeaders,
            })
          );
        });
        response.on('error', reject);
      }
    );

    const abortRequest = () => request.destroy(new DOMException('Request aborted', 'AbortError'));
    if (init.signal?.aborted) {
      abortRequest();
    } else {
      init.signal?.addEventListener('abort', abortRequest, { once: true });
    }
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Outbound request timed out')));
    request.on('error', reject);
    request.on('close', () => init.signal?.removeEventListener('abort', abortRequest));
    request.end();
  });
}

export async function fetchPublicUrl(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  let currentInput = input;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const target = await resolvePinnedTarget(currentInput);
    const response = await requestPinnedTarget(target, init);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');
    currentInput = new URL(location, target.url).toString();
  }

  throw new Error('Too many redirects');
}
