'use client';

import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, LifeBuoy, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

import { EAILogo } from '@/components/EAILogo';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="m-0 min-h-screen bg-[#070b14] font-sans text-slate-100">
        <main className="flex min-h-screen items-center justify-center px-5 py-12">
          <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/80 p-7 shadow-2xl shadow-black/40 sm:p-10">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <EAILogo className="h-6 w-6 text-primary-400" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">EAI</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Editorial System</p>
              </div>
            </div>

            <div className="mt-9 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
              Temporary interruption
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
              We could not load this page.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-400">
              Your work has not been removed. Try loading the page again, or contact support if the problem continues.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
              <Link
                href="/support"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-5 text-sm font-semibold text-slate-200 no-underline"
              >
                <LifeBuoy className="h-4 w-4" />
                Contact support
              </Link>
            </div>
            {error.digest ? (
              <p className="mt-6 font-mono text-[10px] text-slate-600">
                Reference: {error.digest}
              </p>
            ) : null}
          </section>
        </main>
      </body>
    </html>
  );
}
