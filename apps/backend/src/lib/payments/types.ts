export type PaymentProvider = 'doku' | 'midtrans';

export type CheckoutInput = {
  orderId: string;
  amountIdr: number;
  planId: string;
  itemName: string;
  customerId: string;
  customerEmail: string;
  customerName: string | null;
  callbackUrl: string;
};

export type CheckoutResult = {
  orderId?: string;
  provider: PaymentProvider;
  token?: string;
  redirectUrl: string;
  isSimulated: boolean;
};

export type PaymentEvent = {
  provider: PaymentProvider;
  orderId: string;
  amountIdr: number;
  status: string;
  isPaid: boolean;
  transactionId?: string;
  paymentType?: string;
};

export interface PaymentGateway {
  provider: PaymentProvider;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  parseWebhook(request: Request): Promise<PaymentEvent>;
  getPaymentStatus(orderId: string): Promise<PaymentEvent | null>;
}
