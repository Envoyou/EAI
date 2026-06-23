import crypto from 'crypto';

import { prisma } from './db';
import { DokuPaymentGateway } from './payments/doku';
import {
  generateMidtransMockSignature,
  isMidtransSimulatorEnabled,
  MidtransPaymentGateway,
  verifyMidtransSignature,
} from './payments/midtrans';
import type {
  CheckoutResult,
  PaymentGateway,
  PaymentProvider,
} from './payments/types';

export interface PlanDetails {
  id: string;
  name: string;
  priceUsd: number;
  creditsPerMonth: number;
  billingMonths: number;
  isSubscription: boolean;
  description: string;
}

export interface CheckoutDisclosure {
  planName: string;
  priceUsd: number;
  amountIdr: number;
  usdToIdrRate: number;
  creditsGranted: number;
  billingLabel: string;
  creditValidity: string;
  renewalLabel: string;
  taxLabel: string;
}

export const PLANS: Record<string, PlanDetails> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceUsd: 10,
    creditsPerMonth: 50,
    billingMonths: 1,
    isSubscription: true,
    description: 'Suitable for independent journalists and new bloggers.',
  },
  starter_yearly: {
    id: 'starter_yearly',
    name: 'Starter (Yearly)',
    priceUsd: 96,
    creditsPerMonth: 50,
    billingMonths: 12,
    isSubscription: true,
    description: 'Suitable for independent journalists and new bloggers.',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 19,
    creditsPerMonth: 100,
    billingMonths: 1,
    isSubscription: true,
    description: 'Best for professional editors and small content teams.',
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'Pro (Yearly)',
    priceUsd: 182,
    creditsPerMonth: 100,
    billingMonths: 12,
    isSubscription: true,
    description: 'Best for professional editors and small content teams.',
  },
  team: {
    id: 'team',
    name: 'Team',
    priceUsd: 79,
    creditsPerMonth: 300,
    billingMonths: 1,
    isSubscription: true,
    description: 'For large publications, agencies, and collaborative teams.',
  },
  team_yearly: {
    id: 'team_yearly',
    name: 'Team (Yearly)',
    priceUsd: 758,
    creditsPerMonth: 300,
    billingMonths: 12,
    isSubscription: true,
    description: 'For large publications, agencies, and collaborative teams.',
  },
  addon: {
    id: 'addon',
    name: '50-Credit Add-on',
    priceUsd: 8,
    creditsPerMonth: 50,
    billingMonths: 0,
    isSubscription: false,
    description: 'Additional credits that never expire.',
  },
};

const DEFAULT_USD_TO_IDR_RATE = 17779.3;

export const getPaymentUsdToIdrRate = () => {
  const configured = Number(process.env.PAYMENT_USD_TO_IDR_RATE);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_USD_TO_IDR_RATE;
};

export const getPaymentTaxLabel = () =>
  process.env.PAYMENT_TAX_LABEL?.trim() ||
  'Tax is not separately itemized in the displayed checkout amount.';

export const getPlanAmountIdr = (plan: PlanDetails) =>
  Math.round(plan.priceUsd * getPaymentUsdToIdrRate());

export const getPlanCreditsGranted = (plan: PlanDetails) =>
  plan.creditsPerMonth * Math.max(1, plan.billingMonths);

export const getPlanPeriodEnd = (plan: PlanDetails, start: Date) => {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + Math.max(1, plan.billingMonths));
  return end;
};

export const getPlanCheckoutDisclosure = (
  plan: PlanDetails
): CheckoutDisclosure => ({
  planName: plan.name,
  priceUsd: plan.priceUsd,
  amountIdr: getPlanAmountIdr(plan),
  usdToIdrRate: getPaymentUsdToIdrRate(),
  creditsGranted: getPlanCreditsGranted(plan),
  billingLabel:
    plan.billingMonths === 12
      ? '12-month prepaid plan'
      : plan.isSubscription
        ? '1-month prepaid plan'
        : 'One-time credit add-on',
  creditValidity:
    plan.billingMonths === 12
      ? 'Credits expire at the end of the 12-month plan period.'
      : plan.isSubscription
        ? 'Credits expire at the end of the 1-month plan period.'
        : 'Add-on credits do not expire under the current terms.',
  renewalLabel: plan.isSubscription
    ? 'Manual renewal. Automatic recurring billing is not enabled.'
    : 'One-time purchase. No recurring billing.',
  taxLabel: getPaymentTaxLabel(),
});

const gateways: Record<PaymentProvider, PaymentGateway> = {
  doku: new DokuPaymentGateway(),
  midtrans: new MidtransPaymentGateway(),
};

export const getActivePaymentProvider = (): PaymentProvider => {
  const configured = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (!configured || configured === 'doku') return 'doku';
  if (configured === 'midtrans') return 'midtrans';
  throw new Error(`Unsupported payment provider: ${configured}`);
};

export const getPaymentGateway = (provider: PaymentProvider) => gateways[provider];

export const isPaymentSimulatorEnabled = () =>
  getActivePaymentProvider() === 'midtrans' && isMidtransSimulatorEnabled();

export const generateMockSignature = generateMidtransMockSignature;
export { verifyMidtransSignature };

const createOrderId = () =>
  `env${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`.slice(0, 30);

export async function createCheckoutSession(params: {
  planId: string;
  userId: string;
  organizationId: string | null;
  userEmail: string;
  userName: string | null;
  callbackUrl: string;
}): Promise<CheckoutResult> {
  const {
    planId,
    userId,
    organizationId,
    userEmail,
    userName,
    callbackUrl,
  } = params;
  const plan = PLANS[planId];
  if (!plan) throw new Error('Plan not found.');

  const provider = getActivePaymentProvider();
  const amountIdr = getPlanAmountIdr(plan);
  const orderId = createOrderId();

  await prisma.paymentOrder.create({
    data: {
      id: orderId,
      provider,
      userId,
      organizationId,
      planId,
      amountIdr,
    },
  });

  try {
    const trackedCallbackUrl = new URL(callbackUrl);
    trackedCallbackUrl.searchParams.set('payment_order', orderId);
    const checkout = await getPaymentGateway(provider).createCheckout({
      orderId,
      amountIdr,
      planId,
      itemName: `${plan.name} - ${getPlanCreditsGranted(plan)} Editorial Credits`,
      customerId: organizationId || userId,
      customerEmail: userEmail,
      customerName: userName,
      callbackUrl: trackedCallbackUrl.toString(),
    });
    return { ...checkout, orderId };
  } catch (error) {
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { status: 'creation_failed' },
    });
    throw error;
  }
}
