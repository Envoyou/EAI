import crypto from 'crypto';

import type {
  CheckoutInput,
  CheckoutResult,
  PaymentEvent,
  PaymentGateway,
} from './types';

const CHECKOUT_TARGET = '/checkout/v1/payment';
const STATUS_TARGET = '/orders/v1/status';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readRecord = (value: Record<string, unknown>, key: string) => {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
};

const readString = (value: Record<string, unknown> | null, key: string) => {
  const field = value?.[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
};

const readNumber = (value: Record<string, unknown> | null, key: string) => {
  const field = value?.[key];
  return typeof field === 'number'
    ? field
    : typeof field === 'string' && field.trim() !== ''
      ? Number(field)
      : undefined;
};

const getDokuConfig = () => {
  const clientId = process.env.DOKU_CLIENT_ID?.trim();
  const secretKey = process.env.DOKU_SECRET_KEY?.trim();
  const hasPlaceholder =
    clientId?.includes('your-sandbox-client-id') ||
    clientId === 'MCH-client-id-sandbox' ||
    secretKey?.includes('your-sandbox-secret-key') ||
    secretKey === 'secret-key-sandbox';
  if (!clientId || !secretKey || hasPlaceholder) {
    throw new Error(
      'Valid DOKU Sandbox Client ID and Secret Key must be configured.'
    );
  }
  return { clientId, secretKey };
};

const getDokuBaseUrl = () =>
  process.env.DOKU_IS_PRODUCTION === 'true'
    ? 'https://api.doku.com'
    : 'https://api-sandbox.doku.com';

const createRequestId = () => crypto.randomUUID();
const createTimestamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const createDigest = (body: string) =>
  crypto.createHash('sha256').update(body).digest('base64');

export const createDokuSignature = (input: {
  clientId: string;
  requestId: string;
  requestTimestamp: string;
  requestTarget: string;
  secretKey: string;
  body?: string;
}) => {
  const components = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.requestTimestamp}`,
    `Request-Target:${input.requestTarget}`,
  ];
  if (input.body !== undefined) {
    components.push(`Digest:${createDigest(input.body)}`);
  }
  const signature = crypto
    .createHmac('sha256', input.secretKey)
    .update(components.join('\n'))
    .digest('base64');
  return `HMACSHA256=${signature}`;
};

const timingSafeEqualText = (expected: string, received: string) => {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

const parseDokuEvent = (value: unknown): PaymentEvent => {
  if (!isRecord(value)) {
    throw new Error('DOKU returned an invalid payment payload.');
  }
  const order = readRecord(value, 'order');
  const transaction = readRecord(value, 'transaction');
  const service = readRecord(value, 'service');
  const channel = readRecord(value, 'channel');
  const orderId = readString(order, 'invoice_number');
  const amountIdr = readNumber(order, 'amount');
  const status = readString(transaction, 'status');
  if (!orderId || !Number.isFinite(amountIdr) || !status) {
    throw new Error('DOKU payment payload is missing required fields.');
  }
  return {
    provider: 'doku',
    orderId,
    amountIdr: amountIdr as number,
    status,
    isPaid: status === 'SUCCESS',
    transactionId:
      readString(transaction, 'original_request_id') ||
      readString(transaction, 'request_id'),
    paymentType: readString(channel, 'id') || readString(service, 'id'),
  };
};

const createSignedHeaders = (
  requestTarget: string,
  body?: string
): Record<string, string> => {
  const { clientId, secretKey } = getDokuConfig();
  const requestId = createRequestId();
  const requestTimestamp = createTimestamp();
  return {
    'Client-Id': clientId,
    'Request-Id': requestId,
    'Request-Timestamp': requestTimestamp,
    Signature: createDokuSignature({
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      secretKey,
      body,
    }),
  };
};

export class DokuPaymentGateway implements PaymentGateway {
  provider = 'doku' as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const body = JSON.stringify({
      order: {
        amount: input.amountIdr,
        invoice_number: input.orderId,
        currency: 'IDR',
        callback_url: input.callbackUrl,
        callback_url_result: input.callbackUrl,
        auto_redirect: true,
        line_items: [
          {
            id: input.planId,
            name: input.itemName,
            price: input.amountIdr,
            quantity: 1,
          },
        ],
      },
      payment: {
        payment_due_date: 60,
      },
      customer: {
        id: input.customerId.slice(0, 50),
        name: input.customerName || 'Customer',
        email: input.customerEmail,
      },
    });
    const response = await fetch(`${getDokuBaseUrl()}${CHECKOUT_TARGET}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...createSignedHeaders(CHECKOUT_TARGET, body),
      },
      body,
      cache: 'no-store',
    } as any);
    const payload: unknown = await response.json().catch(() => null);
    const root = isRecord(payload) ? payload : null;
    const responseData = root ? readRecord(root, 'response') : null;
    const payment = responseData ? readRecord(responseData, 'payment') : null;
    const redirectUrl = readString(payment, 'url');
    const token = readString(payment, 'token_id');
    if (!response.ok || !redirectUrl) {
      const messages = root?.message;
      throw new Error(
        `Failed to create the DOKU checkout: ${
          Array.isArray(messages) ? messages.join(', ') : `HTTP ${response.status}`
        }`
      );
    }
    return {
      provider: 'doku',
      token,
      redirectUrl,
      isSimulated: false,
    };
  }

  async parseWebhook(request: Request): Promise<PaymentEvent> {
    const body = await request.text();
    const clientId = request.headers.get('client-id') || '';
    const requestId = request.headers.get('request-id') || '';
    const requestTimestamp = request.headers.get('request-timestamp') || '';
    const signature = request.headers.get('signature') || '';
    const expectedClientId = getDokuConfig().clientId;
    const requestTarget = new URL(request.url).pathname;
    const expectedSignature = createDokuSignature({
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      secretKey: getDokuConfig().secretKey,
      body,
    });
    if (
      clientId !== expectedClientId ||
      !requestId ||
      !requestTimestamp ||
      !signature ||
      !timingSafeEqualText(expectedSignature, signature)
    ) {
      throw new Error('Invalid DOKU notification signature.');
    }
    return parseDokuEvent(JSON.parse(body));
  }

  async getPaymentStatus(orderId: string): Promise<PaymentEvent | null> {
    const requestTarget = `${STATUS_TARGET}/${encodeURIComponent(orderId)}`;
    const response = await fetch(`${getDokuBaseUrl()}${requestTarget}`, {
      headers: {
        Accept: 'application/json',
        ...createSignedHeaders(requestTarget),
      },
      cache: 'no-store',
    } as any);
    if (response.status === 404) return null;

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `Failed to verify the DOKU payment status: HTTP ${response.status}`
      );
    }
    return parseDokuEvent(payload);
  }
}
