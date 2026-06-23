'use strict';
'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, QrCode, Building2, CheckCircle, XCircle, Copy, Loader2 } from 'lucide-react';
import { BILLING_ENABLED } from '@/lib/features';

function SimulatorContent() {
  if (!BILLING_ENABLED) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-bold">Billing Coming Soon</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            The payment simulator is unavailable while billing is disabled.
          </p>
        </div>
      </main>
    );
  }

  return <BillingSimulatorContent />;
}

function BillingSimulatorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = searchParams.get('orderId') || '';
  const plan = searchParams.get('plan') || '';
  const amountStr = searchParams.get('amount') || '0';
  const amount = parseInt(amountStr, 10);
  
  const usdAmountStr = searchParams.get('usdAmount') || '0';
  const usdAmount = parseFloat(usdAmountStr);

  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'va'>('qris');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>('pending');

  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatUsd = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulatePayment = async (success: boolean) => {
    setLoading(true);
    try {
      const statusCode = success ? '200' : '400';
      const transactionStatus = success ? 'settlement' : 'deny';
      const grossAmount = `${amount}.00`;

      // 1. Get mock signature from backend
      const signResponse = await fetch('/api/checkout/sign-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          statusCode,
          grossAmount,
        }),
      });

      if (!signResponse.ok) {
        throw new Error('Failed to sign webhook signature');
      }

      const { signature } = await signResponse.json();

      // 2. Send simulated webhook to backend
      const webhookResponse = await fetch('/api/webhooks/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          status_code: statusCode,
          gross_amount: grossAmount,
          signature_key: signature,
          transaction_status: transactionStatus,
          payment_type: paymentMethod === 'qris' ? 'qris' : 'bank_transfer',
          fraud_status: 'accept',
        }),
      });

      if (!webhookResponse.ok) {
        throw new Error('Failed to send payment notification');
      }

      setStatus(success ? 'success' : 'failed');
    } catch (error: unknown) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : 'An error occurred during payment simulation'
      );
    } finally {
      setLoading(false);
    }
  };

  if (status === 'success') {
    return (
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-serif">Payment Successful!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your transaction has been processed instantly by the Envoyou credit ledger.
          </p>
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 text-left text-xs space-y-2">
          <div className="flex justify-between"><span className="text-slate-400">Order ID:</span> <span className="font-mono text-slate-700 dark:text-slate-300">{orderId}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Plan:</span> <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">{plan.replace('_', ' ')}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Amount:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{formatUsd(usdAmount)}</span></div>
        </div>

        <button
          onClick={() => router.push('/workspace')}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-2xl transition-all shadow-lg hover:shadow-emerald-500/10 active:scale-98 cursor-pointer"
        >
          Enter Workspace
        </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center">
          <XCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-serif">Payment Failed</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your simulated payment was cancelled or declined.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setStatus('pending')}
            className="flex-1 py-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl transition-colors cursor-pointer"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/pricing')}
            className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-semibold rounded-2xl transition-colors cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col md:flex-row gap-8 relative overflow-hidden animate-in fade-in duration-300">
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-wider">
            <Shield className="w-3 h-3" /> Payment Simulator
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-serif">
            Payment Invoice
          </h2>
          <p className="text-xs text-slate-400">Complete your payment securely.</p>
        </div>

        {/* Total Amount */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Amount</p>
          <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 mt-1">
            {formatUsd(usdAmount)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Equivalent to <span className="font-semibold text-slate-600 dark:text-slate-300">{formatRupiah(amount)}</span>
          </p>
          <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex justify-between items-center text-[11px]">
            <span className="text-slate-400 font-mono select-all">ID: {orderId.slice(0, 20)}...</span>
            <span className="text-primary font-semibold uppercase">{plan.replace('_', ' ')}</span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500">Payment Method</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPaymentMethod('qris')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                paymentMethod === 'qris'
                  ? 'border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-400'
              }`}
            >
              <QrCode className="w-6 h-6" />
              <span className="text-xs font-semibold">QRIS</span>
            </button>
            <button
              onClick={() => setPaymentMethod('va')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                paymentMethod === 'va'
                  ? 'border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-400'
              }`}
            >
              <Building2 className="w-6 h-6" />
              <span className="text-xs font-semibold">Virtual Account</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => handleSimulatePayment(true)}
            disabled={loading}
            className="w-full py-3.5 bg-primary hover:bg-primary/95 text-white font-bold rounded-2xl transition-all shadow-md shadow-primary/10 active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Simulate Success'
            )}
          </button>
          <button
            onClick={() => handleSimulatePayment(false)}
            disabled={loading}
            className="w-full py-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-rose-500 font-semibold rounded-2xl transition-colors cursor-pointer text-xs border border-transparent hover:border-rose-500/20"
          >
            Simulate Failure / Cancel
          </button>
        </div>
      </div>

      {/* Visual Sandbox Screen */}
      <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800/80 pt-6 md:pt-0 md:pl-8 flex flex-col justify-center items-center">
        {paymentMethod === 'qris' ? (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-100 flex items-center justify-center w-48 h-48 mx-auto relative group">
              {/* Stylized simulated QR Code */}
              <div className="w-full h-full bg-[radial-gradient(circle_at_30%_30%,#1e293b_30%,transparent_35%),radial-gradient(circle_at_70%_30%,#1e293b_30%,transparent_35%),radial-gradient(circle_at_50%_70%,#1e293b_30%,transparent_35%)] bg-[length:16px_16px] rounded-lg opacity-80" />
              <div className="absolute inset-0 m-12 bg-primary rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                <QrCode className="w-10 h-10 text-white" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">Scan QRIS using GoPay, OVO, Dana, LinkAja, or any e-wallet</p>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400">Virtual Account Number</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">
                    9888802830823908
                  </span>
                  <button
                    onClick={() => copyToClipboard('9888802830823908')}
                    aria-label={copied ? 'Virtual account number copied' : 'Copy virtual account number'}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                  >
                    {copied ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800/60 pt-2 text-[10px] text-slate-400 space-y-1">
                <p className="font-semibold text-slate-500">Instructions:</p>
                <p>1. Choose Transfer to Virtual Account.</p>
                <p>2. Enter the VA number shown above.</p>
                <p>3. Confirm that the amount matches your invoice.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SimulatePaymentPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(11,121,194,0.06),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(11,121,194,0.04),transparent_50%)]" />
      
      <Suspense fallback={
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-slate-500">Loading payment simulator...</p>
        </div>
      }>
        <SimulatorContent />
      </Suspense>
    </div>
  );
}
