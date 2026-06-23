import { SignIn } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

import { AuthPageShell } from '@/components/AuthPageShell';
import { getAllFeatureFlags } from '@eai/shared';

export const dynamic = 'force-dynamic';

export default async function AppLoginPage() {
  const featureFlags = await getAllFeatureFlags();

  return (
    <AuthPageShell
      mode="login"
      demoEnabled={featureFlags.demo_enabled}
      pricingEnabled={featureFlags.pricing_enabled}
      signupEnabled={featureFlags.signup_enabled}
    >
      <SignIn
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: '#0d87cf',
            colorBackground: 'transparent',
            colorInputBackground: 'rgba(15, 23, 42, 0.72)',
            colorInputText: '#f8fafc',
            colorText: '#f8fafc',
            colorTextSecondary: '#94a3b8',
            colorNeutral: '#94a3b8',
            borderRadius: '14px',
          },
          elements: {
            rootBox: 'w-full bg-transparent',
            cardBox: 'w-full shadow-none bg-transparent',
            card: 'w-full bg-transparent shadow-none border-none p-0',
            header: 'hidden',
            logoBox: 'hidden',
            main: 'gap-4',
            form: 'gap-4',
            footer: 'bg-transparent border-t border-white/10 mt-6 pt-5',
            footerAction: featureFlags.signup_enabled ? 'text-slate-400' : 'hidden',
            footerActionLink: 'text-primary-300 hover:text-primary-200 font-semibold',
            formButtonPrimary:
              'h-12 rounded-2xl bg-primary-500 text-slate-950 font-bold shadow-[0_18px_45px_-24px_rgba(13,135,207,0.9)] transition hover:bg-primary-400 active:scale-[0.99] border-none',
            formFieldLabel: 'text-slate-100 text-sm font-semibold',
            formFieldInput:
              'h-12 rounded-2xl border border-white/10 bg-slate-950/65 px-4 text-slate-50 shadow-inner shadow-black/20 transition focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20',
            formFieldInputShowPasswordButton: 'text-slate-400 hover:text-primary-300',
            dividerLine: 'bg-white/10',
            dividerText: 'text-slate-500 text-xs uppercase font-bold tracking-wider',
            socialButtonsBlockButton:
              'h-12 rounded-2xl border border-white/10 bg-white/[0.035] text-slate-100 transition hover:border-primary-400/35 hover:bg-primary-500/10',
            socialButtonsBlockButtonText: 'font-semibold text-slate-200',
            alternativeMethodsBlockButton: 'text-primary-300 hover:text-primary-200',
            identityPreviewEditButton: 'text-primary-300 hover:text-primary-200',
            formResendCodeLink: 'text-primary-300 hover:text-primary-200',
            otpCodeFieldInput:
              'border-white/10 bg-slate-950/65 text-slate-50 focus:border-primary-400 focus:ring-primary-400/20',
            userPreviewMainIdentifier: 'text-slate-100',
            userPreviewSecondaryIdentifier: 'text-slate-400',
            formFieldErrorText: 'text-rose-300',
            alertText: 'text-slate-200',
            alert: 'border border-amber-300/20 bg-amber-300/10 text-amber-100',
          },
        }}
      />
    </AuthPageShell>
  );
}
