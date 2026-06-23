import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, LifeBuoy } from 'lucide-react';

import { EAILogo } from '@/components/EAILogo';
import { SupportForm } from '@/components/SupportForm';

export const metadata: Metadata = {
  title: 'Support | EAI',
  description: 'Contact the EAI support team and receive a trackable support ticket.',
};

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <EAILogo className="h-8 w-8 text-primary" />
            <span className="font-semibold tracking-tight">EAI</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workspace
          </Link>
        </header>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <div className="border-b border-slate-200 px-6 py-8 dark:border-slate-800 sm:px-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <LifeBuoy className="h-3.5 w-3.5" />
              Customer Support
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">How can we help?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Submit a request for billing, account access, editorial workflow,
              CMS integration, or privacy assistance. You will receive a ticket
              number immediately.
            </p>
          </div>

          <div className="px-6 py-8 sm:px-10">
            <SupportForm />
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <Link href="https://envoyou.com/terms" className="hover:text-primary">Terms of Service</Link>
          <Link href="https://envoyou.com/privacy" className="hover:text-primary">Privacy Notice</Link>
          <Link href="https://envoyou.com/refund" className="hover:text-primary">Refund Policy</Link>
        </footer>
      </div>
    </main>
  );
}
