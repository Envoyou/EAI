'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock3, Loader2, TriangleAlert, X } from 'lucide-react';

type PaymentStatus = {
  id: string;
  planName: string;
  amountIdr: number;
  status: string;
  creditsGranted: number | null;
};

const FINAL_FAILURE_STATUSES = new Set([
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'DENIED',
  'creation_failed',
]);

export default function PaymentStatusBanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('payment_order');
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(orderId));

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    let attempts = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const checkStatus = async () => {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/payments/status?orderId=${encodeURIComponent(orderId)}`,
          { cache: 'no-store' }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to check payment status.');
        }
        if (cancelled) return;

        setPayment(payload.order);
        setError(null);
        const status = String(payload.order.status);
        if (status === 'paid') {
          setChecking(false);
          router.refresh();
          return;
        }
        if (FINAL_FAILURE_STATUSES.has(status)) {
          setChecking(false);
          return;
        }
        if (attempts < 20) {
          timeout = setTimeout(checkStatus, 3000);
        } else {
          setChecking(false);
        }
      } catch (statusError) {
        if (cancelled) return;
        setError(
          statusError instanceof Error
            ? statusError.message
            : 'Unable to check payment status.'
        );
        setChecking(false);
      }
    };

    void checkStatus();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [orderId, router]);

  if (!orderId) return null;

  const status = payment?.status || 'pending';
  const isPaid = status === 'paid';
  const isFailed = FINAL_FAILURE_STATUSES.has(status);
  const Icon = isPaid
    ? CheckCircle2
    : isFailed || error
      ? TriangleAlert
      : checking
        ? Loader2
        : Clock3;

  const dismiss = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment_order');
    router.replace(params.size ? `/pricing?${params.toString()}` : '/pricing');
  };

  return (
    <section
      className={`rounded-2xl border p-5 ${
        isPaid
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : isFailed || error
            ? 'border-rose-500/30 bg-rose-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
      }`}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            checking ? 'animate-spin' : ''
          }`}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">
            {isPaid
              ? 'Payment confirmed'
              : isFailed
                ? 'Payment was not completed'
                : error
                  ? 'Payment status unavailable'
                  : checking
                    ? 'Confirming your payment'
                    : 'Waiting for payment notification'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {isPaid
              ? `${payment?.creditsGranted ?? ''} credits have been allocated for ${payment?.planName}.`
              : isFailed
                ? `DOKU reported status ${status}. No credits were allocated.`
                : error
                  ? error
                  : checking
                    ? 'DOKU may take a few moments to notify EAI. This page checks the order automatically.'
                    : 'The order is still pending in EAI. Ask an administrator to check or retry the Notification URL in DOKU Sandbox.'}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-500">
            Order: {orderId}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss payment status"
          className="rounded-full p-1 text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
