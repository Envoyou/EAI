import crypto from 'crypto';

import type {
  CheckoutInput,
  CheckoutResult,
  PaymentEvent,
  PaymentGateway,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: Record<string, unknown>, key: string) => {
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
};

const getServerKey = () => {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY is not configured.');
  return serverKey;
};

const isProduction = () => process.env.MIDTRANS_IS_PRODUCTION === 'true';

export const isMidtransSimulatorEnabled = () =>
  process.env.MIDTRANS_ENABLE_SIMULATOR === 'true' &&
  process.env.NODE_ENV !== 'production' &&
  !isProduction() &&
  !process.env.MIDTRANS_SERVER_KEY;

const getSigningKey = () => {
  if (process.env.MIDTRANS_SERVER_KEY?.trim()) return getServerKey();
  if (isMidtransSimulatorEnabled() && process.env.MIDTRANS_SIMULATOR_SECRET?.trim()) {
    return process.env.MIDTRANS_SIMULATOR_SECRET.trim();
  }
  throw new Error('The Midtrans verification key is not configured.');
};

const apiBaseUrl = () =>
  isProduction() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';

const snapUrl = () =>
  isProduction()
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

export const verifyMidtransSignature = (
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string
) => {
  let expected: string;
  try {
    expected = crypto
      .createHash('sha512')
      .update(orderId + statusCode + grossAmount + getSigningKey())
      .digest('hex');
  } catch {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureKey);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

export const generateMidtransMockSignature = (
  orderId: string,
  statusCode: string,
  grossAmount: string
) => {
  if (!isMidtransSimulatorEnabled()) {
    throw new Error('The Midtrans payment simulator is disabled.');
  }
  return crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + getSigningKey())
    .digest('hex');
};

const parseEvent = (value: unknown, verifySignature: boolean): PaymentEvent => {
  if (!isRecord(value)) throw new Error('Midtrans returned an invalid payment payload.');
  const orderId = readString(value, 'order_id');
  const statusCode = readString(value, 'status_code');
  const grossAmount = readString(value, 'gross_amount');
  const status = readString(value, 'transaction_status');
  const signature = readString(value, 'signature_key');
  if (!orderId || !grossAmount || !status || (verifySignature && (!statusCode || !signature))) {
    throw new Error('Midtrans payment payload is missing required fields.');
  }
  if (
    verifySignature &&
    !verifyMidtransSignature(orderId, statusCode as string, grossAmount, signature as string)
  ) {
    throw new Error('Invalid Midtrans notification signature.');
  }
  const fraudStatus = readString(value, 'fraud_status');
  return {
    provider: 'midtrans',
    orderId,
    amountIdr: Number(grossAmount),
    status,
    isPaid: status === 'settlement' || (status === 'capture' && fraudStatus === 'accept'),
    transactionId: readString(value, 'transaction_id'),
    paymentType: readString(value, 'payment_type'),
  };
};

export class MidtransPaymentGateway implements PaymentGateway {
  provider = 'midtrans' as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (isMidtransSimulatorEnabled()) {
      const searchParams = new URLSearchParams({
        orderId: input.orderId,
        plan: input.planId,
        amount: String(input.amountIdr),
      });
      return {
        provider: 'midtrans',
        token: `mock_token_${input.orderId}`,
        redirectUrl: `/checkout/simulate?${searchParams.toString()}`,
        isSimulated: true,
      };
    }
    const authHeader = Buffer.from(`${getServerKey()}:`).toString('base64');
    const response = await fetch(snapUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amountIdr,
        },
        credit_card: { secure: true },
        customer_details: {
          first_name: input.customerName || 'Customer',
          email: input.customerEmail,
        },
        item_details: [
          {
            id: input.planId,
            price: input.amountIdr,
            quantity: 1,
            name: input.itemName,
          },
        ],
      }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !isRecord(payload) ||
      typeof payload.redirect_url !== 'string'
    ) {
      throw new Error(`Failed to create the Midtrans checkout: HTTP ${response.status}`);
    }
    return {
      provider: 'midtrans',
      token: typeof payload.token === 'string' ? payload.token : undefined,
      redirectUrl: payload.redirect_url,
      isSimulated: false,
    };
  }

  async parseWebhook(request: Request): Promise<PaymentEvent> {
    return parseEvent(await request.json(), true);
  }

  async getPaymentStatus(orderId: string): Promise<PaymentEvent | null> {
    if (isMidtransSimulatorEnabled()) return null;
    const authHeader = Buffer.from(`${getServerKey()}:`).toString('base64');
    const response = await fetch(
      `${apiBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`,
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${authHeader}`,
        },
        cache: 'no-store',
      } as RequestInit
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Failed to verify the Midtrans payment status: HTTP ${response.status}`);
    }
    return parseEvent(payload, false);
  }
}
