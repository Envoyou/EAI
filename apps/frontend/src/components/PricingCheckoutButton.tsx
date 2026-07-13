'use client';

import { useState, useEffect, useCallback } from 'react';
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
  autoCheckout?: boolean;
  hasQueuedDowngrade?: boolean;
}

export default function PricingCheckoutButton({
  planId,
  className = '',
  variant = 'secondary',
  label = 'Get Started',
  current = false,
  disclosure,
  billingEnabled,
  autoCheckout = false,
  hasQueuedDowngrade = false,
}: PricingCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(autoCheckout);
  const [preview, setPreview] = useState<{
    originalAmountIdr: number;
    proratedRefundIdr: number;
    currentBalanceIdr: number;
    useProratedRefund: number;
    useAccountBalance: number;
    finalAmountIdr: number;
    balanceRemaining: number;
    oldSubPlanId: string | null;
    oldSubPeriodEnd: string | null;
    usdToIdrRate: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleCheckout = useCallback(async () => {
    if (current) return;
    setConfirming(true);
    if (!billingEnabled) return;

    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/checkout/preview?plan=${planId}`);
      if (response.ok) {
        const data = await response.json();
        setPreview(data);
      }
    } catch (error) {
      console.error('Failed to load checkout preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  }, [current, billingEnabled, planId]);

  const handleCancel = () => {
    setConfirming(false);
    setPreview(null);
  };

  useEffect(() => {
    if (autoCheckout && !current) {
      const timer = setTimeout(() => {
        void handleCheckout();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [autoCheckout, current, handleCheckout]);

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
          quotedAmountIdr: preview ? preview.finalAmountIdr : disclosure.amountIdr,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = `/login?redirect_url=/pricing?plan=${planId}`;
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

  const isYearly = planId.endsWith('_yearly') || planId.includes('yearly');
  const isBlockedByQueued = hasQueuedDowngrade && isYearly;

  const getButtonStyles = () => {
    if (!billingEnabled || isBlockedByQueued) {
      return 'bg-[var(--surface-2)] text-muted-foreground font-semibold border border-[var(--border)] cursor-not-allowed opacity-60';
    }
    if (current) {
      return 'bg-transparent text-muted-foreground font-semibold border border-[var(--border)] cursor-default';
    }
    if (variant === 'primary') {
      return 'bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/10';
    }
    if (variant === 'addon') {
      return 'bg-primary/10 hover:bg-primary/20 text-primary font-semibold border border-primary/20';
    }
    return 'bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-foreground font-semibold border border-[var(--border)]';
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
        disabled={loading || current || !billingEnabled || isBlockedByQueued}
        aria-disabled={current || !billingEnabled || isBlockedByQueued}
        className={`w-full py-3 px-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 text-sm active:scale-98 disabled:cursor-not-allowed ${current ? '' : 'cursor-pointer disabled:opacity-75'} ${getButtonStyles()} ${className}`}
      >
        {!billingEnabled ? (
          <span>Coming Soon</span>
        ) : isBlockedByQueued ? (
          <span>Downgrade Pending</span>
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
      {isBlockedByQueued && (
        <p className="mt-2 text-[10px] text-amber-500 font-semibold text-center leading-normal">
          Downgrade pending. Cancel it in settings to buy yearly.
        </p>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) handleCancel();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`checkout-title-${planId}`}
            className="w-full max-w-md surface-card surface-card-xl p-6 text-left shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Define isDelayedDowngrade logic */}
            {(() => {
              const isDelayedDowngrade =
                preview &&
                (preview.oldSubPlanId?.includes('yearly') || preview.oldSubPlanId?.endsWith('_yearly')) &&
                !(planId.includes('yearly') || planId.endsWith('_yearly'));

              return (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                        {isDelayedDowngrade ? 'Delayed Downgrade' : 'Before checkout'}
                      </p>
                      <h2 id={`checkout-title-${planId}`} className="mt-1 text-xl font-bold text-foreground">
                        {isDelayedDowngrade ? 'Confirm plan downgrade' : 'Confirm your prepaid purchase'}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={loading}
                      aria-label="Close checkout confirmation"
                      className="rounded-full p-1.5 text-muted-foreground transition hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-sm text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span>Calculating prorata discounts and balance...</span>
                    </div>
                  ) : isDelayedDowngrade ? (
                    <div className="mt-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm leading-relaxed space-y-3 font-semibold">
                      <p>
                        You are downgrading from a Yearly plan to the <strong>{disclosure.planName}</strong> monthly plan.
                      </p>
                      <p>
                        Your current yearly plan will remain fully active until{' '}
                        <strong>
                          {preview?.oldSubPeriodEnd ? new Date(preview.oldSubPeriodEnd).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }) : 'the end of its term'}
                        </strong>
                        .
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">
                        The {disclosure.planName} monthly plan will activate automatically on that date. No immediate payment will be charged today.
                      </p>
                    </div>
                  ) : (
                    <>
                      <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
                        <li className="flex items-center justify-between gap-4">
                          <span>Product</span>
                          <strong className="text-right text-foreground">{disclosure.planName}</strong>
                        </li>
                        <li className="flex items-center justify-between gap-4">
                          <span>Listed price</span>
                          <strong className="text-right text-foreground">{formatUsd(disclosure.priceUsd)}</strong>
                        </li>
                        <li className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
                          <span>Original price (fixed IDR)</span>
                          <strong className="text-right text-foreground">{formatIdr(preview ? preview.originalAmountIdr : disclosure.amountIdr)}</strong>
                        </li>
                        {preview && preview.useProratedRefund > 0 && (
                          <li className="flex items-center justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                            <span>Prorated credit (previous plan)</span>
                            <strong className="text-right font-semibold">-{formatIdr(preview.useProratedRefund)}</strong>
                          </li>
                        )}
                        {preview && preview.useAccountBalance > 0 && (
                          <li className="flex items-center justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                            <span>Account balance applied</span>
                            <strong className="text-right font-semibold">-{formatIdr(preview.useAccountBalance)}</strong>
                          </li>
                        )}
                        <li className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-3">
                          <span>Final checkout amount</span>
                          <strong className="text-right text-base text-primary font-bold">
                            {formatIdr(preview ? preview.finalAmountIdr : disclosure.amountIdr)}
                          </strong>
                        </li>
                        <li className="flex items-center justify-between gap-4">
                          <span>Editorial Credits</span>
                          <strong className="text-right text-foreground">{disclosure.creditsGranted}</strong>
                        </li>
                      </ul>

                      {preview && preview.balanceRemaining > 0 && (
                        <div className="mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs leading-5 font-semibold">
                          Leftover balance saved to account: <strong>{formatIdr(preview.balanceRemaining)}</strong>. It will automatically apply as a discount on your next checkout.
                        </div>
                      )}
                    </>
                  )}

                  {!isDelayedDowngrade && (
                    <div className="mt-5 space-y-2 rounded-2xl bg-[var(--surface-2)] p-4 text-xs leading-5 text-muted-foreground">
                      <p>{disclosure.billingLabel}</p>
                      <p>{disclosure.creditValidity}</p>
                      <p>{disclosure.renewalLabel}</p>
                      <p>{disclosure.taxLabel}</p>
                      <p>
                        Conversion reference: USD 1 = IDR {formatIdrRate(preview ? preview.usdToIdrRate : disclosure.usdToIdrRate)}.
                        The IDR amount above is fixed when this order is created.
                      </p>
                    </div>
                  )}

                  <p className="mt-5 text-xs leading-5 text-muted-foreground">
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
                      onClick={handleCancel}
                      disabled={loading || previewLoading}
                      className="ui-btn ui-btn-outline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createCheckout}
                      disabled={loading || previewLoading}
                      className="ui-btn ui-btn-primary"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isDelayedDowngrade ? 'Confirm Downgrade' : (preview && preview.finalAmountIdr === 0 ? 'Confirm & Activate' : 'Continue to payment')}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
