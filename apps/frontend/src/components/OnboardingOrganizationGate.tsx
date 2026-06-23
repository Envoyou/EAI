'use client';

import { OrganizationList } from '@clerk/nextjs';
import { Building2, Check, ShieldCheck } from 'lucide-react';

import { EAILogo } from '@/components/EAILogo';
import { ThemeToggle } from '@/components/ThemeToggle';

const benefits = [
  'Keeps publication data isolated by workspace',
  'Lets you invite editors and manage access later',
  'Prevents duplicate publication workspaces',
];

export function OnboardingOrganizationGate() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="ide-titlebar relative z-20 shrink-0 justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-primary">
            <EAILogo className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Publication Launch Desk
            </div>
            <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              Workspace setup
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:px-8">
        <section className="max-w-xl">
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]">
            <Building2 className="size-5" />
          </div>
          <p className="text-xs font-medium text-[var(--primary)]">Step 1 of 2</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold leading-tight md:text-5xl">
            Create or choose your workspace
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-[var(--muted-foreground)]">
            Your Clerk organization is the permanent workspace identity. After this,
            you will configure the publication name, editorial voice, and delivery settings.
          </p>

          <div className="mt-8 space-y-3">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 items-center justify-center rounded-md bg-[var(--success)]/10 text-[var(--success)]">
                  <Check className="size-3.5" />
                </span>
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-start gap-3 border-t border-[var(--border)] pt-5 text-xs leading-5 text-[var(--muted-foreground)]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            Organization name and workspace slug remain managed by Clerk. Publication
            identity can be changed later from Settings.
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-2xl shadow-black/10">
          <OrganizationList
            hidePersonal
            skipInvitationScreen
            afterCreateOrganizationUrl="/onboarding"
            afterSelectOrganizationUrl="/onboarding"
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'w-full shadow-none',
                card: 'w-full border-0 bg-transparent shadow-none',
                headerTitle: 'text-[var(--foreground)]',
                headerSubtitle: 'text-[var(--muted-foreground)]',
                organizationListCreateOrganizationAction:
                  'rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)]',
                organizationListOrganizationListItem:
                  'rounded-md border border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-2)]',
                organizationPreviewMainIdentifier: 'text-[var(--foreground)]',
                organizationPreviewSecondaryIdentifier: 'text-[var(--muted-foreground)]',
              },
            }}
          />
        </section>
      </main>
    </div>
  );
}
