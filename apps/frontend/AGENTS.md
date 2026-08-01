<!-- Managed by agent: workflow-architect -->
<!-- Last updated: 2026-07-29 -->
# Envoyou AI (EAI) — Frontend Agent Guide

## Overview

This guide covers frontend development rules for the EAI Next.js 16 application in `apps/frontend`. It documents the tech stack, CLI commands, directory structure, strict UI/styling conventions, and caching guidelines that all developers and AI agents must follow.

---

## 1. Tech Stack Frontend

* **Framework**: Next.js 16.2.11 (App Router)
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
- **Styling**: Tailwind CSS v4 utility classes are acceptable for layout. **STRICT RULE**: All button elements across feature code must use the canonical `<Button>` primitive from `@/components/ui/button` or its polymorphic `render` prop. Raw `<button>` tags are strictly forbidden in feature code and enforced via automated regression tests (`ShellAndWorkspaceControls.test.ts` & `PrimitiveStyleOwnership.test.ts`).
- **Mobile UX & Responsive Table Guidelines**: All tables rendered across admin/dashboard/workspace pages must include a mobile swipe helper text `<div className="px-4 pt-2 text-[9px] text-[var(--muted-foreground)] sm:hidden select-none">Swipe horizontally to view all columns</div>` right above table containers. TipTap editor canvas elements must explicitly set `white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; min-width: 0;` to prevent un-wrapped text from pushing past screen boundaries on mobile devices.
- **Design Tokens**: Always use canonical CSS design tokens (`var(--primary)`, `var(--surface-1)`, `var(--surface-2)`, `var(--error)`) instead of raw utility colors like `bg-primary/10` or `text-red-500`.
- **Imports**: Use `@/` path alias. Never use relative `../../../` chains.
- **i18n**: All user-facing strings must go through `next-intl`; never hardcode English strings in components.
- **Manual Final Draft validation**: Validate only durable saved revisions. Safe edits schedule no background work; meaningful edits use the shared debounce policy and `validate_revision`. Background checks must remain cancellable/non-blocking for continued editing, coalesce on a newer save, and carry the backend-issued revision ID/body hash. Manual `quality_gate` remains recovery/publication checkpoint behavior, not the normal post-save path.
- **SEO dependency refresh**: Consume backend-issued per-field SEO state. Automatically refresh only stale excerpt, meta description, cover alt text, and tags after the exact saved revision passes; never auto-write title, meta title, or slug. Protected fields must surface as editorial decisions, and any unresolved field keeps export blocked.
- **Publication UX state**: Keep `stale`, rerun modes, provider response modes, Quality Gate mechanics, and SEO regeneration terminology internal. Map them through `workspace/publication-ux-state.ts` into checking, completed, or editor-decision outcomes. Manual revision/metadata actions may appear only as contextual recovery tools; normal Apply copy describes the editorial action and implies automatic verification.
- **Content Memory warnings**: The frontend must trust the backend enforcement
  contract and must never derive a block from semantic/classifier confidence.
  Exact/reservation conflicts are non-overridable. A calibrated probable
  duplicate may expose an explicit localized override action; successful
  shadow or override flows should offer attributable duplicate/distinct
  feedback for threshold calibration.
- **Content Intelligence**: Render only the backend snapshot contract. Show
  semantic coverage and bounded/truncated state, keep all recommendation copy
  localized, and do not infer new similarity thresholds or expose indexed body
  text in the client.
- **Actionable Content Intelligence**: Keep Content Map CSV actions local to the
  active inventory/intelligence view. Mutations must use the authenticated
  action contract, honor backend `canManage`, and require an explicit
  confirmation for canonical/consolidation/archive decisions. Never imply that
  registry consolidation merged article bodies or changed CMS pages.
- **Content Map source preview**: Source actions should open the shared Base UI
  right-side drawer first and fetch draft text only from the authenticated,
  tenant-scoped History endpoint after explicit user intent. Keep full
  Workspace navigation available inside the drawer; do not return to direct
  route navigation as the only way to inspect a source.

## 3. Frontend Directory Structure

```
apps/frontend/
├── messages/             # next-intl locale dictionaries (en.json, id.json)
├── next.config.ts        # Next.js config — Sentry + next-intl plugin, remotePatterns for avatars
├── src/
│   ├── proxy.ts          # Clerk middleware + next-intl + feature flags (replaces middleware.ts)
│   ├── app/
│   │   ├── globals.css   # Master CSS import manifest
│   │   ├── styles/       # Domain-based modular CSS architecture
│   │   │   ├── tokens.css       # Design tokens, color palettes, radius, --shadow-drawer
│   │   │   ├── base.css         # Safe @layer base cascade reset & typography base
│   │   │   ├── prose.css        # Prose & strategist-prose styles (@layer components + :where())
│   │   │   ├── components/      # Primitive component modules
│   │   │   │   ├── buttons.css  # ui-btn primitives & variants
│   │   │   │   ├── forms.css    # ui-control, input, select, textarea
│   │   │   │   ├── cards.css    # ui-card, surface-card, pressroom-card
│   │   │   │   ├── badges.css   # ui-badge & ui-alert
│   │   │   │   ├── menus.css    # ui-menu, ui-segmented, mode-segmented
│   │   │   │   ├── feedback.css # feedback-check, accordion actions & verdict colors
│   │   │   │   └── composite-controls.css # Bounded non-workspace composite Button shapes
│   │   │   └── workspace/       # Workspace domain modules
│   │   │       ├── shell.css      # workspace shell & multi-island containers
│   │   │       ├── sidebar.css    # sidebar nav, filter pills & header glow
│   │   │       ├── editor.css     # editor canvas & document tabs
│   │   │       ├── strategist.css # strategist copilot panel styles
│   │   │       ├── chrome.css     # titlebar, tabbar, statusbar & activitybar
│   │   │       └── responsive.css # unified mobile & tablet media queries
│   │   └── [locale]/     # All routes under locale prefix (en / id)
│   │       ├── page.tsx          # Landing / home page
│   │       ├── layout.tsx        # Root layout (Clerk + Sentry + ThemeProvider)
│   │       ├── workspace/        # Main workspace editor (EditorialWorkspace)
│   │       ├── dashboard/        # Analytics & usage dashboard
│   │       │   └── content-map/  # Tenant-wide Blueprint and draft registry
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
│   │       │   ├── feature-flags/    # Edge Configuration feature flags
│   │       │   ├── audit-logs/       # Admin audit log viewer
│   │       │   └── ai-config/        # AI engine configuration console
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
│   │   │   ├── adaptive-action-menu.tsx # Shared desktop dropdown / mobile action sheet
│   │   │   ├── tooltip.tsx       # Custom Tooltip (Base UI — use render prop, not asChild)
│   │   │   ├── badge.tsx         # Custom Badge
│   │   │   ├── button.tsx        # Canonical semantic Button API backed by ui-btn classes
│   │   │   ├── action-button.tsx # Standard semantic icon + label Button composition
│   │   │   ├── icons/            # Tree-shakeable semantic icon tokens grouped by domain
│   │   │   ├── message-scroller.tsx # MessageScroller primitive for auto-scrolling & turn tracking
│   │   │   ├── popover.tsx       # Popover primitive (Base UI)
│   │   │   ├── alert.tsx         # Alert wrapper
│   │   │   ├── skeleton.tsx      # Loading skeleton
│   │   │   ├── input.tsx         # Input field
│   │   │   ├── textarea.tsx      # Textarea field
│   │   │   ├── checkbox.tsx      # Canonical Base UI checkbox
│   │   │   ├── switch.tsx        # Canonical Base UI switch
│   │   │   ├── file-input.tsx    # Native file semantics boundary
│   │   │   ├── scroll-area.tsx   # Scroll area
│   │   │   ├── side-drawer.tsx   # Portalled Base UI right-side drawer
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
│   │   │   └── components/       # SessionSidebar, ChatMessageList, ChatInputBar, DeepResearchReportTab
│   │   ├── FinalDraftPanel.tsx   # Final draft view
│   │   ├── ShortcutsModal.tsx    # Keyboard shortcuts reference modal
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
│   │   ├── strategist-stream.ts # Strategist SSE event/error normalization
│   │   ├── hooks/useContentStrategist.ts # Chat, sessions, notes & saved Deep Report orchestration
│   │   └── hooks/useStrategistChatPath.ts # Mock/production Strategist route selection
```

---

## 4. UI & Styling Conventions (Strict Rules)

To maintain visual consistency across the EAI application (especially dark/light mode support), **all developers and AI agents MUST comply with the following rules**:

### 🚫 RULE 1: Do Not Style or Assemble Buttons Manually
Do not create new raw `<button>` controls with manual Tailwind styling or direct `ui-btn` class composition.
* **Solution**: Use `<Button>` from `@/components/ui/button`. Canonical variants are `primary`, `outline`, `surface`, `muted`, `accent`, `danger`, and `link`; canonical sizes are `default`, `xs`, `sm`, `lg`, and the `icon*` sizes. Toggle controls must expose their active state with `aria-pressed`.
* **Compatibility**: `default`, `secondary`, `ghost`, and `destructive` remain supported aliases for existing consumers. Do not use those aliases in new code.
* **Migration boundary**: Existing raw buttons and direct `ui-btn` consumers may be migrated feature-by-feature. Do not perform unrelated global rewrites.
* **Composite control boundary**: Primitive CSS is imported after Tailwind utilities and therefore owns visual properties such as background, border, radius, color, shadow, and padding. If a composite intentionally needs a different shape (for example a rectangular tab, card-wide accordion trigger, switch track, or carousel indicator), add a named domain class and a narrowly scoped selector loaded after the primitive stylesheet. Do not rely on consumer Tailwind utilities or `!important` to defeat the primitive. Preserve layout utilities in the component and verify the domain selector at desktop, tablet, and mobile breakpoints.

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
* **Solution**: Use `<Badge>` from `@/components/ui/badge`. Canonical variants are `muted`, `surface`, `primary`, `success`, `warning`, and `danger`; use `size="xs"` for compact badges. Links that visually behave as badges should use Badge's `render` prop.
* **Compatibility**: Global `ui-badge*` classes are implementation details owned by the primitive. Do not compose them directly in feature code.

### 🚫 RULE 6: Do Not Use Absolute Positioning for Dropdown Menus in Tables
Dropdown menus inside scrollable containers or `overflow-hidden` tables will get cut off (clipped) if you use standard absolute positioning.
* **Solution**: Always use portal-rendered dropdowns powered by `@base-ui/react/menu` (utilizing `<Menu.Root>`, `<Menu.Portal>`, `<Menu.Positioner>`, and `<Menu.Popup>`). This renders the popup at the `body` level, preventing it from being clipped by table boundaries.

### 🚫 RULE 7: Do Not Design Inline Custom Callout or Warning Boxes
* **Solution**: Use `<Alert>` from `@/components/ui/alert` with the canonical `primary`, `success`, `warning`, `danger`, or `muted` variant. Use its `render` prop when the alert surface must also be a motion component.
* **Compatibility**: Global `ui-alert*` classes are implementation details owned by the primitive. Do not compose them directly in feature code.
  * Include Lucide icons (such as `AlertCircle`, `CheckCircle2`) inside the box to clarify visual context.

### 🚫 RULE 8: Do Not Render Multiple Overlapping Forms on Admin Panes
When building administrative views that allow multiple distinct operations (such as credit adjustment and plan overrides), do not render separate cards or sidebars that clutter the viewport.
* **Solution**: Wrap them in a single `ui-card` container with a tabbed switcher header (e.g., using React state-based tabs: `activeTab === 'credits' ? <CreditsForm /> : <PlanOverrideForm />`).

### 🚫 RULE 9: Always Provide an Overlay Confirmation Modal for Administrative Actions
Any high-privilege administrative operation that performs database modifications (ledger writes, subscription updates, overrides) must require a confirmation step.
* **Solution**: Render a modal overlay using the absolute container `fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm`. Inside, provide a detailed table-like breakdown of the action using description list tags (`<dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">`), and ensure the confirmation button renders `<EAILoaderStatusIcon className="h-4 w-4" />` while `submitting` is active. Import it from `@/components/ui/icons/status`; do not add `animate-spin` because the branded loader owns its animation.

### 🚫 RULE 10: Do Not Let Editor Typography Style NodeView Controls
Tiptap NodeViews render inside the ProseMirror `.prose` tree, so embedded buttons, inputs, menus, badges, and status UI must have an explicit control boundary.
* **Solution**: Mark the control-only wrapper with `not-prose` and keep article content in a sibling content region. Do not wrap the entire NodeView in `not-prose` and then create a nested `prose` instance; Tailwind Typography does not support re-enabling `prose` inside `not-prose`.
* **Link colors**: Configure editor links through the semantic `--editor-link` token and the `--tw-prose-links` / `--tw-prose-invert-links` variables in `globals.css`. Do not add broad `.dark .prose a` selectors or inline color workarounds.

### 🚫 RULE 11: Do Not Position Editor Overlays with Manual Viewport Arithmetic
Anchored editor overlays must not calculate popup `top`/`left` values from `getBoundingClientRect`, container scroll offsets, or inline absolute positioning.
* **Solution**: Use a maintained Base UI overlay primitive with `<Portal>`, `<Positioner anchor={element}>`, fixed positioning, and collision avoidance. Keep Tiptap mutation logic in the editor orchestrator and visual/focus behavior in a bounded overlay component.

### 🚫 RULE 12: Do Not Assemble Text Fields with Raw Visual Classes
New or migrated text-like fields must not combine raw `<input>`/`<textarea>` elements with direct `ui-control`, `ui-input`, or `ui-textarea` classes.
* **Solution**: Use `<Input>` and `<Textarea>` from `@/components/ui`. Use `variant="surface"` when preserving the filled `ui-control` visual contract during incremental migration; `variant="default"` remains available for existing primitive consumers. The same variants apply to `<SelectTrigger>`; do not attach `ui-control ui-select` directly in feature code.
* **Specialized controls**: Use canonical `<Checkbox>`, `<Switch>`, and `<FileInput>` primitives. Native date pickers use `<Input type="date">`; auto-resizing behavior may remain feature-owned while rendering through `<Textarea>`.
* **Documented exemption**: The raw Markdown canvas in `Editor.tsx` remains a native `<textarea>` because it is an editor surface rather than a form field. Keep its regression contract intact; do not treat it as a general-purpose textarea precedent.

### 🚫 RULE 13: Do Not Choose Icon Shapes Directly in Migrated Feature Controls
New or migrated feature controls must import intent-named icon tokens from `@/components/ui/icons/<domain>` instead of choosing a Lucide shape directly.
* **Solution**: Add or reuse a tree-shakeable named alias such as `PreparePublicationIcon`; do not create a runtime string registry or import a global icon object.
* **Action buttons**: Use `<ActionButton icon={Token} label={...} />` for standard icon-and-label actions. Keep `<Button>` for tabs, toggles, polymorphic triggers, or composite controls whose children are structurally richer than an icon plus label.
* **Loading indicators**: Use `EAILoaderStatusIcon` from `@/components/ui/icons/status` for compact progress indicators. `LoadingStatusIcon` is a compatibility alias for the same component. Do not import Lucide `Loader2` or add an external `animate-spin` class to the EAI loader.
* **Migration boundary**: Existing direct `lucide-react` imports are legacy inventory. Migrate them in bounded feature batches; do not perform shape-based global replacement because the same shape can represent different intents.

---

## Security

- **Never import `@eai/shared/server`** in Client Components (`'use client'`) — this breaks browser compilation.
- **Feature flags** from Vercel Edge Config must be read server-side only (via `getMiddlewareFeatureFlags` in `proxy.ts`).
- All sensitive actions (admin billing, plan overrides) must display a confirmation modal before executing (see Rule 9 above).

## 5. Caching & Feature Flags

* **Feature Flags**: Managed dynamically via Vercel Edge Config. Import `getMiddlewareFeatureFlags` from `@eai/shared/server` **only** in server-side code (`proxy.ts`, Server Components, Route Handlers). Never import `@eai/shared/server` in Client Components.
* **Loading State**: Use `<Skeleton className="..." />` from `@/components/ui/skeleton` for content placeholders. Use `EAILoaderStatusIcon` for compact progress states in buttons, panels, and status surfaces instead of Lucide `Loader2` or manually styled spinners.
* **Request Lifecycle**: Frontend and server-side API calls must use `fetchWithTimeout` from `@/lib/fetch-utils`; AI streams must additionally use `readWithTimeout` and pass the originating controller abort callback. Preserve caller abort signals, provide a visible Cancel action for long requests, clear loading state in `finally`, and assign assistant placeholders an explicit `pending`, `success`, `error`, or `cancelled` lifecycle.

## Checklist

Before submitting a PR for frontend changes:
- [ ] `npm run lint -- --filter=frontend` passes with zero errors
- [ ] `npm run build -- --filter=frontend` compiles without TypeScript errors
- [ ] No raw `<select>` tags — use `<Select>` from `@/components/ui/select`
- [ ] New or migrated buttons use `<Button>` with canonical semantic variants; no new direct `ui-btn` composition
- [ ] New or migrated icon actions use domain semantic tokens and `<ActionButton>` where the structure is icon plus label
- [ ] Compact loading indicators use `EAILoaderStatusIcon` without an external `animate-spin` class; no Lucide `Loader2`
- [ ] Composite controls use a named domain selector after primitive CSS; no consumer utility or `!important` fights primitive-owned visuals
- [ ] No `asChild` prop on `<TooltipTrigger>` — use `render` prop
- [ ] External avatar images use `<Image />` from `next/image`
- [ ] Tiptap NodeView controls use a `not-prose` control boundary and no inline color workaround
- [ ] Anchored editor overlays use a portal and maintained positioner, not manual viewport arithmetic
- [ ] New or migrated fields use `<Input>` / `<Textarea>` / `<SelectTrigger>` variants; no new direct `ui-control` composition
- [ ] Checkbox, switch, file, and date controls use their canonical primitives; the Editor Markdown canvas is the only feature-level raw form-control exemption
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
- **Architecture questions**: See [UI Architecture v3.17.0](../../docs/frontend/ui-architecture.md) for frontend boundaries and [docs/architecture-notes.md](../../docs/architecture-notes.md) for the wider system.
