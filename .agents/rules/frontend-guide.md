---
trigger: always_on
---

# Envoyou AI (EAI) — Frontend Agent Guide# Envoyou AI (EAI) — Frontend Agent Guide

Specific guide for frontend development of the EAI application in `apps/frontend`.

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

## 2. Development Commands (CLI)

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

## 3. Frontend Directory Structure

```
apps/frontend/src/
├── app/[locale]/         # Next.js App Router with language prefix
│   ├── workspace/        # Main workspace editor
│   ├── dashboard/        # Analytics/statistics page
│   ├── settings/         # Organization, billing, & admin settings
│   └── ...
├── components/           # React Components
│   ├── ui/               # Reusable UI Elements (shadcn & Base UI wrapper)
│   │   ├── select.tsx    # Custom Select (Mobile Bottom Sheet)
│   │   ├── tooltip.tsx   # Custom Tooltip
│   │   ├── badge.tsx     # Custom Badge
│   │   └── ...
│   ├── EditorCanvas.tsx  # Tiptap text editor canvas
│   ├── UserDirectory.tsx # User management console
│   └── ...
├── lib/                  # Frontend utilities & hooks
└── proxy.ts              # Proxy entry point for authentication and locale routing (replaces middleware.ts)
```

---

## 4. UI & Styling Conventions (Strict Rules)

To maintain visual consistency across the EAI application (especially dark/light mode support), **all developers and AI agents MUST comply with the following rules**:

### 🚫 RULE 1: Do Not Style Buttons with Manual Tailwind Classes
Do not write custom Tailwind classes like `bg-blue-600 px-4 py-2 text-white hover:bg-blue-700` to style buttons.
* **Solution**: Use the project's standardized button classes defined in `globals.css`:
  * Primary Button: `ui-btn ui-btn-primary` (Automatically adjusts: white background in Dark mode, brand blue background in Light mode).
  * Outline Button: `ui-btn ui-btn-outline`
  * Surface Button: `ui-btn ui-btn-surface`
  * Sizing: Add `ui-btn-sm`, `ui-btn-xs`, or `ui-btn-lg`.

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

---

## 5. Caching & Feature Flags

* **Feature Flags**: Managed dynamically via Vercel Edge Config. Never import `@eai/shared/server` in Client Components, as doing so breaks browser compilation.
* **Loading State**: Always use the `<Skeleton className="..." />` component from `@/components/ui/skeleton` to visualize loading placeholders instead of leaving the screen blank or styling manual pulse divs.
