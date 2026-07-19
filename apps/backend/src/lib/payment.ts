import crypto from 'crypto';
import { fetchWithTimeout } from './fetch-with-timeout';

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

const DEFAULT_USD_TO_IDR_RATE = 18000;
let cachedRate = DEFAULT_USD_TO_IDR_RATE;
let lastFetched = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function revalidateRate() {
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('API response not OK');
    const data = (await res.json()) as { rates?: { IDR?: number } };
    const idrRate = data?.rates?.IDR;
    if (typeof idrRate === 'number' && idrRate > 0) {
      cachedRate = idrRate;
    }
  } catch {
    // Fail silently in background
  }
}

export const getPaymentUsdToIdrRate = () => {
  if (Date.now() - lastFetched > CACHE_TTL) {
    lastFetched = Date.now();
    revalidateRate();
  }

  const configured = Number(process.env.PAYMENT_USD_TO_IDR_RATE);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : cachedRate;
};

export const getPaymentTaxLabel = () =>
  process.env.PAYMENT_TAX_LABEL?.trim() ||
  'Excludes 11% VAT (PPN), which is added to the final checkout amount. A detailed tax invoice will be issued upon successful payment.';

export const getPlanAmountIdr = (plan: PlanDetails) =>
  Math.round(plan.priceUsd * getPaymentUsdToIdrRate() * 1.11);

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
  const calc = await calculateCheckoutDetails({
    planId,
    userId,
    organizationId,
  });
  const amountIdr = calc.finalAmountIdr;
  const orderId = createOrderId();

  await prisma.paymentOrder.create({
    data: {
      id: orderId,
      provider,
      userId,
      organizationId,
      planId,
      amountIdr,
      discountIdr: calc.useProratedRefund,
      useAccountBalance: calc.useAccountBalance,
      balanceRemaining: calc.balanceRemaining,
    },
  });

  if (amountIdr === 0) {
    const successUrl = new URL(callbackUrl);
    successUrl.searchParams.set('payment_order', orderId);
    successUrl.searchParams.set('success', 'true');
    return {
      orderId,
      provider,
      redirectUrl: successUrl.toString(),
      isSimulated: false,
      isPaid: true,
    };
  }

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

export const getFriendlyInvoiceNumber = (orderId: string, createdAt: Date | string) => {
  const year = new Date(createdAt).getFullYear();
  const suffix = orderId.length >= 6 ? orderId.slice(-6).toUpperCase() : orderId.toUpperCase();
  return `EAI-${year}-${suffix}`;
};

export async function calculateCheckoutDetails(params: {
  planId: string;
  userId: string;
  organizationId: string | null;
}) {
  const { planId, userId, organizationId } = params;
  const plan = PLANS[planId];
  if (!plan) throw new Error('Plan not found.');

  const originalAmountIdr = getPlanAmountIdr(plan);

  // 1. Find active subscription
  const activeSub = await prisma.subscription.findFirst({
    where: {
      userId: organizationId ? undefined : userId,
      organizationId: organizationId || undefined,
      status: { in: ['active', 'cancels_at_period_end'] },
      currentPeriodEnd: { gt: new Date() },
    },
  });

  let proratedRefundIdr = 0;
  let oldSubId: string | null = null;

  if (activeSub) {
    oldSubId = activeSub.id;
    // Find original payment order to get actual paid amount
    const originalOrder = await prisma.paymentOrder.findUnique({
      where: { id: activeSub.id },
    });
    const originalCost = originalOrder ? originalOrder.amountIdr : getPlanAmountIdr(PLANS[activeSub.plan]);

    const now = new Date();
    const totalDuration = activeSub.currentPeriodEnd.getTime() - activeSub.currentPeriodStart.getTime();
    const remainingDuration = activeSub.currentPeriodEnd.getTime() - now.getTime();
    const unusedRatio = Math.max(0, Math.min(1, remainingDuration / totalDuration));
    proratedRefundIdr = Math.round(originalCost * unusedRatio);
  }

  // 2. Fetch current account balance
  const owner = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId } })
    : await prisma.user.findUnique({ where: { id: userId } });

  const currentBalanceIdr = owner?.balanceIdr || 0;

  // 3. Compute final amount and remaining balance
  const totalAvailableCredit = proratedRefundIdr + currentBalanceIdr;
  const finalAmountIdr = Math.max(0, originalAmountIdr - totalAvailableCredit);

  const useProratedRefund = proratedRefundIdr >= originalAmountIdr
    ? originalAmountIdr
    : proratedRefundIdr;

  const useAccountBalance = proratedRefundIdr >= originalAmountIdr
    ? 0
    : Math.min(currentBalanceIdr, originalAmountIdr - proratedRefundIdr);

  const balanceRemaining = totalAvailableCredit - (useProratedRefund + useAccountBalance);

  return {
    originalAmountIdr,
    proratedRefundIdr,
    currentBalanceIdr,
    useProratedRefund,
    useAccountBalance,
    finalAmountIdr,
    balanceRemaining,
    oldSubPlanId: activeSub?.plan || null,
    oldSubId,
    oldSubPeriodEnd: activeSub?.currentPeriodEnd || null,
    usdToIdrRate: getPaymentUsdToIdrRate(),
  };
}
