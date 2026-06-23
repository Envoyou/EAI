import React from 'react';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getWorkspaceState, toClerkOrganizationContext } from '@/lib/user-workspace';
import { getPlanCheckoutDisclosure, PLANS, type CheckoutDisclosure } from '@eai/shared';
import { ArrowRight, CalendarDays, Coins, CreditCard, Receipt, Zap } from 'lucide-react';
import { SettingSection } from '@/components/SettingsUI';
import PricingCheckoutButton from '@/components/PricingCheckoutButton';
import PaymentStatusBanner from '@/components/PaymentStatusBanner';
import { getAllFeatureFlags } from '@eai/shared/server';
import { getApiUrl } from '@/lib/api-url';

export const dynamic = 'force-dynamic';

export default async function BillingSettingsPage() {
  const featureFlags = await getAllFeatureFlags();
  const billingEnabled = featureFlags.billing_checkout_enabled;
  const authContext = await auth();
  const { userId } = authContext;
  const workspace = userId
    ? await getWorkspaceState(userId, toClerkOrganizationContext(authContext))
    : null;
  const activePlanId = (workspace?.plan.activePlan ?? 'free').replace('org:', '');
  const activePlan = PLANS[activePlanId];
  const activePlanName = activePlan?.name ?? 'Free';
  const addonDisclosure = getPlanCheckoutDisclosure(PLANS.addon) as CheckoutDisclosure;
  interface RecentPayment {
    id: string;
    planId: string;
    amountIdr: number;
    status: string;
    provider: string;
    paidAt?: string | null;
    createdAt: string;
  }
  let recentPayments: RecentPayment[] = [];
  if (userId) {
    try {
      const token = await authContext.getToken();
      const apiUrl = getApiUrl();
      const paymentsRes = await fetch(`${apiUrl}/api/payments/recent`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        next: { revalidate: 0 },
      });
      if (paymentsRes.ok) {
        recentPayments = await paymentsRes.json();
      }
    } catch (err) {
      console.error('Error fetching recent payments:', err);
    }
  }

  const formatUsd = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatIdr = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);

  const formatDate = (value: Date | string) =>
    new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeZone: 'Asia/Jakarta',
    }).format(typeof value === 'string' ? new Date(value) : value);

  return (
    <>
      <PaymentStatusBanner />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="settings-page-intro m-0">
          <span>Workspace Settings</span>
          <h2 className="text-balance">Billing & Plans</h2>
          <p className="text-pretty">Manage your subscription, credits, and invoices via Doku.</p>
        </div>

        {workspace && (
          <div className="bg-white dark:bg-slate-900/50 p-4 rounded-2xl flex items-center gap-4 shadow-sm min-w-[240px]">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Active Credit Balance</p>
              <h3 className="text-xl font-extrabold tracking-tight mt-0.5 text-foreground">
                {workspace.plan.creditsRemaining.toLocaleString()} Credits
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Active Plan: <span className="font-semibold capitalize text-primary">{workspace.plan.activePlan.replace('org:', '').replace('_yearly', '')}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <SettingSection
        id="subscription"
        title="Current Plan"
        description="Review the plan currently attached to this workspace."
      >
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center rounded-xl bg-white/50 p-5 shadow-sm dark:bg-slate-900/50">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-foreground">{activePlanName}</h3>
                <span className={`ui-badge ui-badge-xs ${
                  workspace?.plan.subscriptionStatus === 'active'
                    ? 'ui-badge-success'
                    : 'ui-badge-muted'
                }`}>
                  {workspace?.plan.subscriptionStatus === 'active' ? 'Active' : 'No active subscription'}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {activePlan
                  ? `${activePlan.creditsPerMonth} editorial credits per month. ${activePlan.description}`
                  : 'This workspace is currently using free or trial credits.'}
              </p>
            </div>
          </div>
          <Link href="/pricing" className="ui-btn ui-btn-surface ui-btn-sm no-underline">
            Compare or Change Plan
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SettingSection>

      <SettingSection id="addons" title="Additional Credits" description="Get extra credits whenever you need them. Unused credits never expire.">
        <div className="mt-4 bg-white dark:bg-slate-900/40 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-semibold rounded-full uppercase tracking-wider">
              <Zap className="w-3 h-3" /> Instant Top-up
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Need more credits? Get an add-on
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get extra credits whenever you need them. Unused credits <span className="font-semibold text-foreground">never expire</span> and are automatically consumed when your monthly plan quota is exhausted.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/40 p-6 rounded-2xl w-full md:w-72 text-center space-y-4 shrink-0">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Additional Credits</h3>
              <h4 className="text-2xl font-bold text-foreground mt-1">50 Credits</h4>
              <h5 className="text-xl font-bold text-primary mt-0.5">
                {formatUsd(addonDisclosure.priceUsd)}
              </h5>
              <p className="text-[10px] font-medium text-slate-400 mt-1">Unused credits never expire</p>
            </div>

            <PricingCheckoutButton
              planId="addon"
              label="Buy 50 Credits"
              variant="addon"
              disclosure={addonDisclosure}
              billingEnabled={billingEnabled}
            />
          </div>
        </div>
      </SettingSection>

      <SettingSection id="payments" title="Recent Payments" description="Latest checkout activity for this workspace.">
        <div className="mt-4 overflow-hidden rounded-xl bg-white/50 shadow-sm dark:bg-slate-900/50">
          {recentPayments.length > 0 ? (
            <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {recentPayments.map((payment) => {
                const planName = PLANS[payment.planId]?.name ?? payment.planId;
                const paymentDate = payment.paidAt ?? payment.createdAt;
                const paid = payment.status === 'paid';

                return (
                  <div key={payment.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/30 text-muted-foreground">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">{planName}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {payment.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(paymentDate)}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-xs font-semibold text-foreground">
                        {formatIdr(payment.amountIdr)}
                      </span>
                      <span className={`ui-badge ui-badge-xs ${paid ? 'ui-badge-success' : 'ui-badge-warning'}`}>
                        {paid ? 'Paid' : payment.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-muted-foreground">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No payment records yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Completed and pending checkout records will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </SettingSection>
    </>
  );
}
