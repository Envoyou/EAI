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
    <div className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)] font-sans">
      <header className="ide-titlebar relative z-20 flex h-[48px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)]">
            <EAILogo className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Publication Launch Desk
            </div>
            <div className="text-[10px] text-[var(--muted-foreground)]">
              Workspace setup
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center p-4 md:p-8">
        <div className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
          {/* Left Panel - Launch Desk Info Island */}
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 md:p-8 shadow-[inset_0_0_0_1px_var(--card-border),0_2px_8px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--primary)]">
              <Building2 className="size-5" />
            </div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Step 1 of 2</p>
            <h1 className="mt-2 text-balance font-sans text-3xl font-bold leading-tight text-[var(--foreground)] md:text-4xl">
              Create or choose your workspace
            </h1>
            <p className="mt-4 text-pretty font-sans text-sm md:text-base leading-relaxed text-[var(--muted-foreground)]">
              Your Clerk organization is the permanent workspace identity. After this,
              you will configure the publication name, editorial voice, and delivery settings.
            </p>

            <div className="mt-8 space-y-3.5 border-t border-[var(--border)] pt-6">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 font-sans text-sm text-[var(--foreground)]">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[var(--success)]/10 text-[var(--success)]">
                    <Check className="size-3.5" />
                  </span>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 font-sans text-xs leading-relaxed text-[var(--muted-foreground)]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              <span>
                Organization name and workspace slug remain managed by Clerk. Publication
                identity can be changed later from Settings.
              </span>
            </div>
          </section>

          {/* Right Panel - Clerk Organization Selection Island */}
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-[inset_0_0_0_1px_var(--card-border),0_2px_8px_rgba(0,0,0,0.12)]">
            <OrganizationList
              hidePersonal
              skipInvitationScreen
              afterCreateOrganizationUrl="/onboarding"
              afterSelectOrganizationUrl="/onboarding"
              appearance={{
                elements: {
                  rootBox: 'w-full font-sans',
                  cardBox: 'w-full shadow-none',
                  card: 'w-full border-0 bg-transparent shadow-none p-0',
                  headerTitle: 'font-sans text-lg font-bold text-[var(--foreground)]',
                  headerSubtitle: 'font-sans text-sm text-[var(--muted-foreground)]',
                  organizationListCreateOrganizationAction:
                    'rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] font-sans text-sm hover:bg-[var(--surface-3)]',
                  organizationListOrganizationListItem:
                    'rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-2)] transition',
                  organizationPreviewMainIdentifier: 'font-sans text-sm font-semibold text-[var(--foreground)]',
                  organizationPreviewSecondaryIdentifier: 'font-sans text-xs text-[var(--muted-foreground)]',
                },
              }}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
