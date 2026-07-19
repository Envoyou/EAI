<!-- Managed by agent: workflow-architect -->
# Envoyou AI (EAI) — Frontend Agent Guide

## Overview

This guide covers frontend development rules for the EAI Next.js 16 application in `apps/frontend`. It documents the tech stack, CLI commands, directory structure, strict UI/styling conventions, and caching guidelines that all developers and AI agents must follow.

---

## 1. Tech Stack Frontend

* **Framework**: Next.js 16.2.6 (App Router)
* **React**: 19.2.4
* **Language**: TypeScript 5 (Strict mode)
* **Editor**: Tiptap Rich Text + `tiptap-markdown`
* **Styling**: Tailwind CSS v4 (CSS-only config via `globals.css`) + `@tailwindcss/postcss`
* **UI Components**: shadcn/ui (`base-nova` style, neutral base) + Base UI (`@base-ui/react`)
* **Authentication**: `@clerk/nextjs` 7.4.3
* **Internationalization**: `next-intl` (English default + Indonesian `/id` prefix)
* **Toast**: `sonner`
* **Telemetry**: Sentry 10 (`@sentry/nextjs`)

---

## Setup

Install dependencies from the repo root:

```bash
npm install
```

Required environment variables:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key
- `CLERK_SECRET_KEY` — Clerk backend secret (for server components)
- `NEXT_PUBLIC_API_URL` — Backend Express API base URL

## Commands

Run these commands from the repository root using workspace filtering, or directly within the `apps/frontend` directory:

```bash
# From the repository root
npm run dev -- --filter=frontend    # Run development server
npm run build -- --filter=frontend  # Build production assets
npm run lint -- --filter=frontend   # Run lint check

# From inside apps/frontend
cd apps/frontend
npm run dev
npm run build
npm run lint
```

---

## Code style

- **Language**: TypeScript 5 in strict mode. Avoid `any` — use proper types from `@eai/shared`.
- **Components**: Use React Server Components by default; add `'use client'` only when browser APIs or hooks are required.
- **Styling**: Tailwind CSS v4 utility classes are acceptable for layout. New or migrated buttons must use the canonical `<Button>` from `@/components/ui/button`; its variants own the project's `ui-btn` classes. Existing direct `ui-*` consumers are compatibility code to migrate incrementally.
- **Imports**: Use `@/` path alias. Never use relative `../../../` chains.
- **i18n**: All user-facing strings must go through `next-intl`; never hardcode English strings in components.

## 3. Frontend Directory Structure

```
apps/frontend/
├── next.config.ts        # Next.js config — Sentry + next-intl plugin, remotePatterns for avatars
├── src/
│   ├── proxy.ts          # Clerk middleware + next-intl + feature flags (replaces middleware.ts)
│   ├── app/
│   │   ├── globals.css   # Tailwind v4 + all ui-btn / ui-badge / ui-alert CSS classes
│   │   └── [locale]/     # All routes under locale prefix (en / id)
│   │       ├── page.tsx          # Landing / home page
│   │       ├── layout.tsx        # Root layout (Clerk + Sentry + ThemeProvider)
│   │       ├── workspace/        # Main workspace editor (EditorialWorkspace)
│   │       ├── dashboard/        # Analytics & usage dashboard
│   │       ├── settings/         # Settings shell
│   │       │   ├── general/      # Organization name, slug, logo
│   │       │   ├── account/      # User account settings
│   │       │   ├── billing/      # Subscription & payment management
│   │       │   ├── usage/        # Credit balance breakdown & transaction history
│   │       │   ├── publication/  # Editorial profile & CMS connections
│   │       │   ├── workflow/     # AI pipeline preferences
│   │       │   ├── workspace/    # Workspace-level settings
│   │       │   └── defaults/     # Default settings
│   │       ├── admin/            # EAI Admin Console
│   │       │   ├── page.tsx          # Index with redirect
│   │       │   ├── tenants/          # Tenant/Billing administration
│   │       │   ├── users/            # User directory console
│   │       │   ├── telemetry/        # Telemetry & logs Sentry status
│   │       │   └── feature-flags/    # Edge Configuration feature flags
│   │       ├── checkout/         # Payment checkout flow
│   │       ├── pricing/          # Public pricing page
│   │       ├── onboarding/       # New-user onboarding wizard
│   │       ├── login/            # Clerk sign-in page
│   │       ├── signup/           # Clerk sign-up page (feature-flagged)
│   │       ├── demo/             # Product demo (feature-flagged)
│   │       ├── support/          # Support form (public)
│   │       ├── maintenance/      # Maintenance mode page
│   │       └── unavailable/      # Feature unavailable page
│   ├── components/
│   │   ├── ui/                   # Reusable UI primitives
│   │   │   ├── select.tsx        # Custom Select (Mobile Bottom Sheet via Base UI)
│   │   │   ├── tooltip.tsx       # Custom Tooltip (Base UI — use render prop, not asChild)
│   │   │   ├── badge.tsx         # Custom Badge
│   │   │   ├── button.tsx        # Canonical semantic Button API backed by ui-btn classes
│   │   │   ├── alert.tsx         # Alert wrapper
│   │   │   ├── skeleton.tsx      # Loading skeleton
│   │   │   ├── input.tsx         # Input field
│   │   │   ├── textarea.tsx      # Textarea field
│   │   │   ├── scroll-area.tsx   # Scroll area
│   │   │   ├── sidebar-item.tsx  # Sidebar navigation item
│   │   │   └── sonner.tsx        # Toast provider (Sonner)
│   │   ├── editor/               # Tiptap editor extensions & components
│   │   ├── EditorialWorkspace.tsx  # Pure UI orchestrator / shell (delegates logic to useEditorialWorkspace)
│   │   ├── Editor.tsx            # Tiptap editor wrapper
│   │   ├── EditorCanvas.tsx      # Tiptap canvas
│   │   ├── FeedbackPanel.tsx     # Facade shell (< 100 LOC) for AI feedback panel
│   │   ├── feedback-panel/       # FeedbackPanel modular sub-system
│   │   │   ├── types.ts          # Props & verification types
│   │   │   ├── hooks/            # Custom hooks (useFeedbackActions)
│   │   │   └── components/       # Sub-components (FeedbackItemCard, QualityGateSummary)
│   │   ├── StrategistTab.tsx     # Facade shell (< 100 LOC) for AI Strategist chat
│   │   ├── strategist-tab/       # StrategistTab modular sub-system
│   │   │   ├── types.ts          # Props & chat session types
│   │   │   ├── hooks/            # Custom hooks (useStrategistChat)
│   │   │   └── components/       # Sub-components (SessionSidebar, ChatMessageList, ChatInputBar)
│   │   ├── FinalDraftPanel.tsx   # Final draft view
│   │   ├── StrategistTab.tsx     # Content strategy AI tab
│   │   ├── UserDirectory.tsx     # User management console (66KB)
│   │   ├── BillingAdmin.tsx      # Admin billing panel
│   │   ├── AdminLayoutShell.tsx  # Dedicated Admin Console sidebar shell
│   │   ├── OnboardingWizard.tsx  # Multi-step onboarding wizard
│   │   ├── AICopilotPanel.tsx    # AI copilot chat panel
│   │   ├── DocumentHistoryPanel.tsx  # Document history/versioning
│   │   └── ...                   # Other feature components
│   ├── workspace/                # Custom React hook framework for the workspace component
│   │   ├── useEditorialWorkspace.ts  # Facade orchestration hook
│   │   ├── types.ts              # Strictly typed state interfaces
│   │   ├── constants.ts          # Static demo texts
│   │   ├── utils.ts              # Stateless helpers (metadata, readiness, missing sources)
│   │   ├── hooks/                # Sub-hooks (Storage, Config, Keyboard, Autosave, Streaming)
│   │   ├── actions/              # Isolated side effects / API streaming triggers
│   │   └── __tests__/            # Unit test suites (vitest)
│   ├── i18n/                     # next-intl routing + locale config
│   ├── lib/                      # Frontend utilities, hooks, API client
│   │   ├── fetch-utils.ts       # Shared request deadlines, abort propagation, and API error parsing
│   │   ├── stream-utils.ts      # Idle-timeout reader with underlying stream cancellation
│   │   └── strategist-stream.ts # Strategist SSE event/error normalization
│   └── messages/                 # i18n translation files (en / id)
```

---

## 4. UI & Styling Conventions (Strict Rules)

To maintain visual consistency across the EAI application (especially dark/light mode support), **all developers and AI agents MUST comply with the following rules**:

### 🚫 RULE 1: Do Not Style or Assemble Buttons Manually
Do not create new raw `<button>` controls with manual Tailwind styling or direct `ui-btn` class composition.
* **Solution**: Use `<Button>` from `@/components/ui/button`. Canonical variants are `primary`, `outline`, `surface`, `muted`, `accent`, `danger`, and `link`; canonical sizes are `default`, `xs`, `sm`, `lg`, and the `icon*` sizes. Toggle controls must expose their active state with `aria-pressed`.
* **Compatibility**: `default`, `secondary`, `ghost`, and `destructive` remain supported aliases for existing consumers. Do not use those aliases in new code.
* **Migration boundary**: Existing raw buttons and direct `ui-btn` consumers may be migrated feature-by-feature. Do not perform unrelated global rewrites.

### 🚫 RULE 2: Do Not Use Standard HTML `<select>` Tags
Standard browser `<select>` tags have poor aesthetics on mobile devices and lack consistency.
* **Solution**: Use the custom `<Select>` component from `@/components/ui/select`. This component automatically renders as a **Swipeable Bottom Sheet** with a drag handle on mobile devices ($\le 768$px) and an adaptive popover on desktop.
* *Note*: Since `<Select>` is powered by Base UI under the hood, the `onValueChange` property is typed as `(value: string | null) => void`. **Always implement a guard condition `if (value !== null)`** before updating your React state.

### 🚫 RULE 3: Do Not Use the `asChild` Property on Tooltips
Our `<TooltipTrigger>` component is based on Base UI (`@base-ui/react/tooltip`), which **does not support the `asChild` prop** (unlike Radix UI). Using `asChild` will cause TypeScript type errors during build time.
* **Solution**: Always use the `render` prop to inject the trigger element into the tooltip.
  * *Incorrect*: `<TooltipTrigger asChild><button>...</button></TooltipTrigger>`
  * *Correct*: `<TooltipTrigger render={<button>...</button>} />`

### 🚫 RULE 4: Do Not Use Raw `<img>` Tags for External Avatars
Using `<img>` for Clerk/OAuth profile pictures will trigger LCP warnings from the Next.js linter (`@next/next/no-img-element`).
* **Solution**: Use the `<Image />` component from `next/image` with explicit `width` and `height` properties. Make sure the external image domain is registered in `remotePatterns` in `next.config.ts`.
* Conditionally use the `unoptimized` prop if the image URL originates from outside the `img.clerk.com` domain.

### 🚫 RULE 5: Do Not Style Badges or Pills Manually
Do not style badge Tailwind classes ad-hoc (e.g., `bg-amber-500/10 text-amber-500 rounded-full`).
* **Solution**: Use global badge CSS classes:
  * Default/Muted Badge: `ui-badge ui-badge-surface` or `ui-badge-muted`
  * Warning/Gold Badge: `ui-badge ui-badge-warning`
  * Danger/Red Badge: `ui-badge ui-badge-danger`
  * Success/Green Badge: `ui-badge ui-badge-success`
  * Primary/Blue Badge: `ui-badge ui-badge-primary`
  * Small sizing: Add `ui-badge-xs`.

### 🚫 RULE 6: Do Not Use Absolute Positioning for Dropdown Menus in Tables
Dropdown menus inside scrollable containers or `overflow-hidden` tables will get cut off (clipped) if you use standard absolute positioning.
* **Solution**: Always use portal-rendered dropdowns powered by `@base-ui/react/menu` (utilizing `<Menu.Root>`, `<Menu.Portal>`, `<Menu.Positioner>`, and `<Menu.Popup>`). This renders the popup at the `body` level, preventing it from being clipped by table boundaries.

### 🚫 RULE 7: Do Not Design Inline Custom Callout or Warning Boxes
* **Solution**: Use global `ui-alert` CSS classes:
  * Danger Warning: `ui-alert ui-alert-danger`
  * Success Warning: `ui-alert ui-alert-success`
  * Warning Amber: `ui-alert ui-alert-warning`
  * Include Lucide icons (such as `AlertCircle`, `CheckCircle2`) inside the box to clarify visual context.

### 🚫 RULE 8: Do Not Render Multiple Overlapping Forms on Admin Panes
When building administrative views that allow multiple distinct operations (such as credit adjustment and plan overrides), do not render separate cards or sidebars that clutter the viewport.
* **Solution**: Wrap them in a single `ui-card` container with a tabbed switcher header (e.g., using React state-based tabs: `activeTab === 'credits' ? <CreditsForm /> : <PlanOverrideForm />`).

### 🚫 RULE 9: Always Provide an Overlay Confirmation Modal for Administrative Actions
Any high-privilege administrative operation that performs database modifications (ledger writes, subscription updates, overrides) must require a confirmation step.
* **Solution**: Render a modal overlay using the absolute container `fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm`. Inside, provide a detailed table-like breakdown of the action using description list tags (`<dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">`), and ensure the confirmation button shows a loading spinner (`<Loader2 className="animate-spin" />`) while `submitting` is active.

### 🚫 RULE 10: Do Not Let Editor Typography Style NodeView Controls
Tiptap NodeViews render inside the ProseMirror `.prose` tree, so embedded buttons, inputs, menus, badges, and status UI must have an explicit control boundary.
* **Solution**: Mark the control-only wrapper with `not-prose` and keep article content in a sibling content region. Do not wrap the entire NodeView in `not-prose` and then create a nested `prose` instance; Tailwind Typography does not support re-enabling `prose` inside `not-prose`.
* **Link colors**: Configure editor links through the semantic `--editor-link` token and the `--tw-prose-links` / `--tw-prose-invert-links` variables in `globals.css`. Do not add broad `.dark .prose a` selectors or inline color workarounds.

---

## Security

- **Never import `@eai/shared/server`** in Client Components (`'use client'`) — this breaks browser compilation.
- **Feature flags** from Vercel Edge Config must be read server-side only (via `getMiddlewareFeatureFlags` in `proxy.ts`).
- All sensitive actions (admin billing, plan overrides) must display a confirmation modal before executing (see Rule 9 above).

## 5. Caching & Feature Flags

* **Feature Flags**: Managed dynamically via Vercel Edge Config. Import `getMiddlewareFeatureFlags` from `@eai/shared/server` **only** in server-side code (`proxy.ts`, Server Components, Route Handlers). Never import `@eai/shared/server` in Client Components.
* **Loading State**: Always use the `<Skeleton className="..." />` component from `@/components/ui/skeleton` to visualize loading placeholders instead of leaving the screen blank or styling manual pulse divs.
* **Request Lifecycle**: Frontend and server-side API calls must use `fetchWithTimeout` from `@/lib/fetch-utils`; AI streams must additionally use `readWithTimeout` and pass the originating controller abort callback. Preserve caller abort signals, provide a visible Cancel action for long requests, clear loading state in `finally`, and assign assistant placeholders an explicit `pending`, `success`, `error`, or `cancelled` lifecycle.

## Checklist

Before submitting a PR for frontend changes:
- [ ] `npm run lint -- --filter=frontend` passes with zero errors
- [ ] `npm run build -- --filter=frontend` compiles without TypeScript errors
- [ ] No raw `<select>` tags — use `<Select>` from `@/components/ui/select`
- [ ] New or migrated buttons use `<Button>` with canonical semantic variants; no new direct `ui-btn` composition
- [ ] No `asChild` prop on `<TooltipTrigger>` — use `render` prop
- [ ] External avatar images use `<Image />` from `next/image`
- [ ] Tiptap NodeView controls use a `not-prose` control boundary and no inline color workaround
- [ ] All user-facing strings routed through `next-intl`
- [ ] API requests have a finite deadline and every loading/streaming placeholder has success, failure, and cancellation exits

## Examples

### Correct button usage

```tsx
// ✅ Correct
<Button variant="primary">Save</Button>
<Button variant="outline" size="sm">Cancel</Button>

// ❌ Wrong
<button className="bg-blue-600 px-4 py-2 text-white">Save</button>
<button className="ui-btn ui-btn-primary">Save</button>
```

### Correct tooltip usage

```tsx
// ✅ Correct
<TooltipTrigger render={<button aria-label="Info" />} />

// ❌ Wrong
<TooltipTrigger asChild><button>Info</button></TooltipTrigger>
```

## When stuck

- **Build errors**: Run `npm run build -- --filter=frontend` locally to see TypeScript and Next.js errors.
- **Styling issues**: Check `globals.css` for the full list of `ui-btn`, `ui-badge`, and `ui-alert` classes.
- **Clerk auth issues**: Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set in `.env.local`.
- **i18n missing key**: Add the key to the relevant locale JSON file under `messages/`.
- **Architecture questions**: See [UI Architecture v3.13.0](../../docs/frontend/ui-architecture-v3.13.md) for frontend boundaries and [docs/architecture-notes.md](../../docs/architecture-notes.md) for the wider system.
