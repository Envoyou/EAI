'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import PricingCheckoutButton from './PricingCheckoutButton';
import type { CheckoutDisclosure } from '@/lib/payment';

interface PricingGridProps {
  workspace: { plan?: { activePlan?: string } } | null;
  disclosures: Record<string, CheckoutDisclosure>;
  billingEnabled: boolean;
}

export default function PricingGrid({ workspace, disclosures, billingEnabled }: PricingGridProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Normalize the active subscription to a base tier (strips `org:` prefix and `_yearly` suffix).
  const activeTier = (workspace?.plan?.activePlan ?? 'free')
    .replace('org:', '')
    .replace('_yearly', '');

  const formatUsd = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPriceSection = (monthlyPlanId: string, yearlyPlanId: string) => {
    const monthlyPrice = disclosures[monthlyPlanId].priceUsd;
    const yearlyPrice = disclosures[yearlyPlanId].priceUsd;
    const displayedMonthlyPrice =
      billingCycle === 'yearly' ? yearlyPrice / 12 : monthlyPrice;

    return (
      <div className="space-y-1">
        <h3 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          {formatUsd(displayedMonthlyPrice)}
          <span className="text-sm font-normal text-slate-500">/month</span>
        </h3>
        {billingCycle === 'yearly' ? (
          <p className="text-[11px] text-emerald-500 font-semibold">
            Billed annually ({formatUsd(yearlyPrice)}/year)
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            Billed monthly
          </p>
        )}
      </div>
    );
  };

  const currentBadge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
      <Check className="h-3 w-3" /> Current
    </span>
  );

  return (
    <div className="space-y-8">
      {/* Billing Cycle Toggle */}
      <div className="flex justify-center items-center gap-4">
        <span className={`text-xs font-semibold ${billingCycle === 'monthly' ? 'text-slate-900 dark:text-slate-50' : 'text-slate-400'}`}>
          Monthly
        </span>
        <button
          onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-200 transition-colors duration-200 ease-in-out dark:bg-slate-800 focus:outline-none"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              billingCycle === 'yearly' ? 'translate-x-5 bg-primary' : 'translate-x-0'
            }`}
          />
        </button>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${billingCycle === 'yearly' ? 'text-slate-900 dark:text-slate-50' : 'text-slate-400'}`}>
            Annually
          </span>
          <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/50 rounded-full">
            Save 20%
          </span>
        </div>
      </div>

      {/* Pricing Cards Comparison */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 md:items-stretch">
        {/* Starter Card */}
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors duration-200">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Starter</span>
              {activeTier === 'starter' && currentBadge}
            </div>
            <div className="mt-4 mb-6">
              {getPriceSection('starter', 'starter_yearly')}
            </div>
            <ul className="space-y-3 text-[13px] text-slate-600 dark:text-slate-300 mb-8">
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> 50 Publication-Ready Articles / Month</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> SEO Editor Integration</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Custom Brand Voice</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Aggregate Analysis History</li>
            </ul>
          </div>
          <PricingCheckoutButton
            planId={billingCycle === 'monthly' ? 'starter' : 'starter_yearly'}
            label={billingCycle === 'monthly' ? 'Get Starter' : 'Get Starter (Annual)'}
            variant="secondary"
            current={activeTier === 'starter'}
            disclosure={disclosures[billingCycle === 'monthly' ? 'starter' : 'starter_yearly']}
            billingEnabled={billingEnabled}
          />
        </div>

        {/* Pro Card (Highlighted with Primary Brand Blue) */}
        <div className="relative bg-white dark:bg-slate-900/60 border border-primary rounded-2xl p-7 flex flex-col justify-between shadow-lg shadow-primary/5 ring-1 ring-primary/20 md:-my-2">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-[10px] font-semibold uppercase rounded-full tracking-wider shadow-sm">
            Most Popular
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Pro</span>
              {activeTier === 'pro' && currentBadge}
            </div>
            <div className="mt-4 mb-6">
              {getPriceSection('pro', 'pro_yearly')}
            </div>
            <ul className="space-y-3 text-[13px] text-slate-600 dark:text-slate-300 mb-8">
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> 100 Publication-Ready Articles / Month</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Advanced Fact Checking</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> CMS Connection (Ghost/WordPress)</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Dynamic SEO Content Generation</li>
            </ul>
          </div>
          <PricingCheckoutButton
            planId={billingCycle === 'monthly' ? 'pro' : 'pro_yearly'}
            label={billingCycle === 'monthly' ? 'Get Pro' : 'Get Pro (Annual)'}
            variant="primary"
            current={activeTier === 'pro'}
            disclosure={disclosures[billingCycle === 'monthly' ? 'pro' : 'pro_yearly']}
            billingEnabled={billingEnabled}
          />
        </div>

        {/* Team Card */}
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors duration-200">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Team</span>
              {activeTier === 'team' && currentBadge}
            </div>
            <div className="mt-4 mb-6">
              {getPriceSection('team', 'team_yearly')}
            </div>
            <ul className="space-y-3 text-[13px] text-slate-600 dark:text-slate-300 mb-8">
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> 300 Publication-Ready Articles / Month</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Multi-user (Up to 10 seats)</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Shared Workspace Collaboration</li>
              <li className="flex items-start gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Centralized Team Analytics</li>
            </ul>
          </div>
          <PricingCheckoutButton
            planId={billingCycle === 'monthly' ? 'team' : 'team_yearly'}
            label={billingCycle === 'monthly' ? 'Get Team' : 'Get Team (Annual)'}
            variant="secondary"
            current={activeTier === 'team'}
            disclosure={disclosures[billingCycle === 'monthly' ? 'team' : 'team_yearly']}
            billingEnabled={billingEnabled}
          />
        </div>
      </section>
    </div>
  );
}
