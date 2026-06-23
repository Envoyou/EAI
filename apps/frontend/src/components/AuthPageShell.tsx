'use client';

import { ReactNode, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowUpRight,
  FileCheck2,
  Send,
  ShieldCheck,
  FileSearch,
  CheckCircle,
  Brain,
  LayoutTemplate,
  Paintbrush,
  LineChart,
  Layers,
  Database,
  Share2,
} from 'lucide-react';

import { EAILogo } from '@/components/EAILogo';
import { version } from '../../package.json';
import { useTranslations } from 'next-intl';

type AuthPageShellProps = {
  mode: 'login' | 'signup';
  demoEnabled: boolean;
  pricingEnabled: boolean;
  signupEnabled: boolean;
  children: ReactNode;
};

export function AuthPageShell({
  mode,
  demoEnabled,
  pricingEnabled,
  signupEnabled,
  children,
}: AuthPageShellProps) {
  const t = useTranslations('AuthPageShell');
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      eyebrow: t('slides.0.eyebrow'),
      title: t('slides.0.title'),
      description: t('slides.0.description'),
      highlights: [
        { title: t('slides.0.highlights.0.title'), description: t('slides.0.highlights.0.description'), icon: FileSearch },
        { title: t('slides.0.highlights.1.title'), description: t('slides.0.highlights.1.description'), icon: FileCheck2 },
        { title: t('slides.0.highlights.2.title'), description: t('slides.0.highlights.2.description'), icon: CheckCircle },
        { title: t('slides.0.highlights.3.title'), description: t('slides.0.highlights.3.description'), icon: Send },
      ],
    },
    {
      eyebrow: t('slides.1.eyebrow'),
      title: t('slides.1.title'),
      description: t('slides.1.description'),
      highlights: [
        { title: t('slides.1.highlights.0.title'), description: t('slides.1.highlights.0.description'), icon: Brain },
        { title: t('slides.1.highlights.1.title'), description: t('slides.1.highlights.1.description'), icon: LayoutTemplate },
        { title: t('slides.1.highlights.2.title'), description: t('slides.1.highlights.2.description'), icon: Paintbrush },
        { title: t('slides.1.highlights.3.title'), description: t('slides.1.highlights.3.description'), icon: LineChart },
      ],
    },
    {
      eyebrow: t('slides.2.eyebrow'),
      title: t('slides.2.title'),
      description: t('slides.2.description'),
      highlights: [
        { title: t('slides.2.highlights.0.title'), description: t('slides.2.highlights.0.description'), icon: Layers },
        { title: t('slides.2.highlights.1.title'), description: t('slides.2.highlights.1.description'), icon: Database },
        { title: t('slides.2.highlights.2.title'), description: t('slides.2.highlights.2.description'), icon: ShieldCheck },
        { title: t('slides.2.highlights.3.title'), description: t('slides.2.highlights.3.description'), icon: Share2 },
      ],
    },
  ];

  const slidesLength = slides.length;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slidesLength);
    }, 6000); // Change slide every 6 seconds
    return () => clearInterval(timer);
  }, [slidesLength]);
  return (
    <main 
      className="relative flex min-h-screen w-full bg-[#070b14] font-sans text-slate-100"
      style={{ colorScheme: 'dark' }}
    >
      {/* ── Left: brand panel ─────────────────────────────── */}
      <aside className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-[#0a1020] p-12 xl:w-[42%] xl:p-16 lg:flex">
        {/* single soft brand glow */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(13,135,207,0.08),transparent_55%)]" />

        {/* logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] hover:translate-y-[-2px] transition-all duration-300">
            <EAILogo className="h-7 w-7 text-primary-400" />
          </div>
          <span className="text-2xl font-semibold tracking-tight text-white">EAI</span>
        </div>

        {/* headline + highlights */}
        <div className="relative max-w-md min-h-[460px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-400/90">
                {slides[currentSlide].eyebrow}
              </p>
              <h2 className="mt-4 text-balance text-3xl font-bold leading-[1.15] tracking-tight text-white xl:text-[2.5rem]">
                {slides[currentSlide].title}
              </h2>
              <p className="mt-4 text-pretty text-sm leading-relaxed text-slate-400">
                {slides[currentSlide].description}
              </p>

              <ul className="mt-10 space-y-5">
                {slides[currentSlide].highlights.map(({ title: t, description: d, icon: Icon }) => (
                  <li key={t} className="flex items-start gap-3.5">
                    <div className="mt-0.5 flex shrink-0 items-center justify-center">
                      <Icon className="h-5 w-5 text-primary-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{t}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          {/* slide indicators */}
          <div className="absolute -bottom-8 left-0 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === currentSlide ? 'w-8 bg-primary-400' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* footer */}
        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-500/60" />
          <span>{t('secureFooter')} &middot; v{version}</span>
        </div>
      </aside>

      {/* ── Right: auth column ────────────────────────────── */}
      <section className="relative flex flex-1 flex-col px-6 py-8 sm:px-10 lg:px-16 lg:py-12 xl:py-16">
        {/* top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <EAILogo className="h-7 w-7 text-primary-400" />
            <span className="text-base font-semibold tracking-tight text-white">EAI</span>
          </div>

          <nav className="ml-auto flex items-center gap-5 text-sm">
            <Link
              href="/support"
              className="hidden font-medium text-slate-400 transition hover:text-slate-100 sm:inline"
            >
              {t('support')}
            </Link>
            <a
              href="https://envoyou.com/changelog"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 font-medium text-slate-400 transition hover:text-slate-100 sm:inline-flex"
            >
              {t('changelog')}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            {pricingEnabled && (
              <Link
                href="/pricing"
                className="hidden font-medium text-slate-400 transition hover:text-slate-100 sm:inline"
              >
                {t('pricing')}
              </Link>
            )}
            <span className="hidden text-slate-500 sm:inline">
              {mode === 'login' && signupEnabled ? t('newHere') : mode === 'signup' ? t('haveAccount') : ''}
            </span>
            {(mode === 'signup' || signupEnabled) && (
              <Link
                href={mode === 'login' ? '/signup' : '/login'}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm font-medium text-slate-200 transition hover:border-primary-400/40 hover:text-white"
              >
                {mode === 'login' ? t('signup') : t('login')}
              </Link>
            )}
          </nav>
        </header>

        {/* auth body — two columns on wide screens to use horizontal space */}
        <div className="mx-auto flex w-full max-w-[860px] flex-1 items-center py-10">
          <div className="grid w-full items-center gap-x-14 gap-y-8 xl:grid-cols-[1fr_minmax(0,380px)]">
            {/* intro column */}
            <div className="max-w-md">
              <h1 className="text-3xl font-bold tracking-tight text-white">
                {mode === 'login' ? t('welcomeBack') : t('createAccount')}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {mode === 'login' ? t('loginDesc') : t('signupDesc')}
              </p>

              {/* demo shortcut */}
              {demoEnabled && (
                <div className="mt-8">
                  <p className="text-[13px] text-slate-400">{t('tryDemo')}</p>
                  <Link
                    href="/demo"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-primary-500"
                  >
                    {t('demoLink')}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* form column */}
            <div className="w-full">{children}</div>
          </div>
        </div>

        {/* footer */}
        <footer className="flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
          <p className="text-center sm:text-left">
            {t('termsText1')}{' '}
            <Link href="https://envoyou.com/terms" className="font-medium text-slate-400 hover:text-primary-500">
              {t('termsLink')}
            </Link>{' '}
            {t('termsText2')}{' '}
            <Link href="https://envoyou.com/privacy" className="font-medium text-slate-400 hover:text-primary-500">
              {t('privacyLink')}
            </Link>
            .
          </p>
          <div className="flex items-center gap-4">
            <Link href="/en/login" className="font-medium transition hover:text-slate-300">EN</Link>
            <span className="text-slate-600">·</span>
            <Link href="/id/login" className="font-medium transition hover:text-slate-300">ID</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
