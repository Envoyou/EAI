'use client';

import React from 'react';
import { UserProfile } from '@clerk/nextjs';

export default function AccountSettingsPage() {
  return (
    <>
      <div className="settings-page-intro mb-8">
        <span>Account</span>
        <h2 className="text-balance">Manage your personal profile and security.</h2>
        <p className="text-pretty">
          Update your email, password, and security settings. These preferences apply to your personal account globally.
        </p>
      </div>

      <div className="w-full pb-10">
        <UserProfile 
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none border border-[var(--border)] bg-[var(--surface-1)] w-full max-w-full rounded-xl",
              navbar: "hidden md:flex",
              navbarButton: "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              headerTitle: "text-[var(--foreground)]",
              headerSubtitle: "text-[var(--muted-foreground)]",
              profileSectionTitleText: "text-[var(--foreground)] font-semibold",
              profileSectionContent: "text-[var(--foreground)]",
              profileSectionPrimaryButton: "text-[var(--foreground)] hover:bg-[var(--surface-2)]",
              badge: "bg-[var(--surface-2)] text-[var(--foreground)]",
              dividerRow: "border-[var(--border)]",
              formButtonPrimary: "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--foreground)]/90",
              formFieldInput: "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground)]",
              formFieldLabel: "text-[var(--foreground)]",
              breadcrumbs: "text-[var(--muted-foreground)]",
              breadcrumbsItem: "text-[var(--foreground)]",
              breadcrumbsItemDivider: "text-[var(--muted-foreground)]",
            }
          }}
        />
      </div>
    </>
  );
}
