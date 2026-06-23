import Link from 'next/link';
import {
  ArrowRight,
  Clock3,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { EAILogo } from '@/components/EAILogo';

type SystemStatePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon?: 'maintenance' | 'restricted';
  primaryAction?: {
    href: string;
    label: string;
  };
  secondaryAction?: {
    href: string;
    label: string;
  };
  ownerAction?: {
    href: string;
    label: string;
  };
};

const iconMap: Record<'maintenance' | 'restricted', LucideIcon> = {
  maintenance: Wrench,
  restricted: LockKeyhole,
};

export function SystemStatePage({
  eyebrow,
  title,
  description,
  icon = 'maintenance',
  primaryAction,
  secondaryAction,
  ownerAction,
}: SystemStatePageProps) {
  const Icon = iconMap[icon];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-5 py-12 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(13,135,207,0.18),transparent_42%),radial-gradient(circle_at_85%_85%,rgba(99,102,241,0.08),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px]" />

      <section className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <EAILogo className="h-6 w-6 text-primary-400" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">EAI</span>
                <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Editorial System
                </span>
              </span>
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200">
              <Clock3 className="h-3.5 w-3.5" />
              Service notice
            </span>
          </div>
        </div>

        <div className="px-6 py-10 sm:px-10 sm:py-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-300/20 bg-primary-400/10 text-primary-300">
            <Icon className="h-7 w-7" />
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary-300">
            {eyebrow}
          </p>
          <h1 className="mt-3 max-w-xl text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-sm leading-7 text-slate-400 sm:text-base">
            {description}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm font-semibold text-slate-100">Your work remains safe</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Existing drafts, history, workspace settings, and payment records are not removed.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <LifeBuoy className="h-5 w-5 text-primary-300" />
              <p className="mt-3 text-sm font-semibold text-slate-100">Need assistance?</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Contact support if this notice remains visible longer than expected.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90"
              >
                {primaryAction.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
            {secondaryAction ? (
              <Link
                href={secondaryAction.href}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
              >
                {secondaryAction.label}
              </Link>
            ) : null}
            {ownerAction ? (
              <Link
                href={ownerAction.href}
                className="text-center text-xs font-medium text-slate-500 transition hover:text-slate-300 sm:ml-auto"
              >
                {ownerAction.label}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
