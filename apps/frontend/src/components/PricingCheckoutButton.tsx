'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, ArrowRight, Check, X } from 'lucide-react';
import type { CheckoutDisclosure } from '@eai/shared';

interface PricingCheckoutButtonProps {
  planId: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'addon';
  label?: string;
  /** Marks the plan the user is already on — renders a non-clickable "Current Plan" state. */
  current?: boolean;
  disclosure: CheckoutDisclosure;
  billingEnabled: boolean;
}

export default function PricingCheckoutButton({
  planId,
  className = '',
  variant = 'secondary',
  label = 'Get Started',
  current = false,
  disclosure,
  billingEnabled,
}: PricingCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const createCheckout = async () => {
    if (current) return;
    setLoading(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: planId,
          quotedAmountIdr: disclosure.amountIdr,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login?redirect_url=/pricing';
          return;
        }
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
          ? await response.json()
          : null;
        throw new Error(
          data?.error ||
            `Failed to initiate checkout (HTTP ${response.status}).`
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The checkout server returned an invalid response.');
      }
      const data = await response.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('Checkout URL not found');
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred while connecting to the payment server.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = () => {
    if (!current) setConfirming(true);
  };

  const getButtonStyles = () => {
    if (!billingEnabled) {
      return 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-800 cursor-not-allowed';
    }
    if (current) {
      return 'bg-transparent text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-800 cursor-default';
    }
    if (variant === 'primary') {
      return 'bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/10';
    }
    if (variant === 'addon') {
      return 'bg-primary/10 hover:bg-primary/20 text-primary dark:bg-primary/5 dark:hover:bg-primary/10 dark:text-primary-300 font-semibold border border-primary/20';
    }
    return 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-800';
  };

  const formatUsd = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);

  const formatIdr = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);

  const formatIdrRate = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <>
      <button
        onClick={handleCheckout}
        disabled={loading || current || !billingEnabled}
        aria-disabled={current || !billingEnabled}
        className={`w-full py-3 px-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 text-sm active:scale-98 disabled:cursor-not-allowed ${current ? '' : 'cursor-pointer disabled:opacity-75'} ${getButtonStyles()} ${className}`}
      >
        {!billingEnabled ? (
          <span>Coming Soon</span>
        ) : loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Processing...</span>
          </>
        ) : current ? (
          <>
            <Check className="w-4 h-4" />
            <span>Current Plan</span>
          </>
        ) : (
          <>
            <span>{label}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) setConfirming(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`checkout-title-${planId}`}
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Before checkout
                </p>
                <h2 id={`checkout-title-${planId}`} className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  Confirm your prepaid purchase
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                aria-label="Close checkout confirmation"
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <li className="flex items-center justify-between gap-4">
                <span>Product</span>
                <strong className="text-right text-slate-900 dark:text-white">{disclosure.planName}</strong>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>Listed price</span>
                <strong className="text-right text-slate-900 dark:text-white">{formatUsd(disclosure.priceUsd)}</strong>
              </li>
              <li className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <span>Final checkout amount</span>
                <strong className="text-right text-base text-primary">{formatIdr(disclosure.amountIdr)}</strong>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span>Editorial Credits</span>
                <strong className="text-right text-slate-900 dark:text-white">{disclosure.creditsGranted}</strong>
              </li>
            </ul>

            <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
              <p>{disclosure.billingLabel}</p>
              <p>{disclosure.creditValidity}</p>
              <p>{disclosure.renewalLabel}</p>
              <p>{disclosure.taxLabel}</p>
              <p>
                Conversion reference: USD 1 = IDR {formatIdrRate(disclosure.usdToIdrRate)}.
                The IDR amount above is fixed when this order is created.
              </p>
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-500">
              By continuing, you agree to the{' '}
              <Link href="https://envoyou.com/terms" target="_blank" className="font-semibold text-primary hover:underline">
                Terms of Service
              </Link>
              ,{' '}
              <Link href="https://envoyou.com/privacy" target="_blank" className="font-semibold text-primary hover:underline">
                Privacy Notice
              </Link>
              , and{' '}
              <Link href="https://envoyou.com/refund" target="_blank" className="font-semibold text-primary hover:underline">
                Refund Policy
              </Link>
              .
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createCheckout}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-70"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue to payment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
