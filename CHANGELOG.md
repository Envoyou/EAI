# Changelog

All notable changes to the **Envoyou AI Editorial System** project will be documented in this file.

The format of this file is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Research Notes DB Persistence (Sprint A)**: Integrated Neon PostgreSQL database storage for Research Notes Studio. Notes are now saved inside `AnalysisLog.metadata.researchNotes` instead of being volatile in sessionStorage.
- **Secure Cloudflare R2 Uploads (Sprint B)**: Implemented direct-to-R2 file uploading for CSV, PDF, and TXT files using presigned PUT URLs with a strict 10MB size limit (frontend and backend gates).
- **Sync Text Extraction API (Sprint B)**: Added `/api/storage/extract` endpoint to fetch files securely from private R2 bucket and extract text content via `pdf-parse` (PDF) or `utf-8` conversion (TXT/CSV).
- **Prompt Attachment Context Injection (Sprint B)**: Integrated attached file content (up to 15,000 characters wrapped in `<attached_file>` tags) directly into the strategist AI chat context.
- **Wizard Attachment Badge & Replace UI (Sprint B)**: Added file attachment info card with clear file size, mime-type indicator, deletion, and auto-replacement behavior for new uploads.
- **Dynamic Document Mode Override (Sprint B)**: Added an automatic fast-mode override block (`<document_mode_override>`) when files are attached, forcing quantitative grounding, relaxing constraint lengths, and generating data-focused suggestion questions.

### Changed
- **Stateless Editor Notes Integration (Sprint A)**: Refactored `Editor.tsx` to consume notes and notes mutation callbacks via props, letting `EditorialWorkspace.tsx` handle unified state and storage.
- **R2 Read Auto-Retry Logic (Sprint B)**: Implemented a 3-attempt retry loop with 500ms delay in `getFileBuffer` to protect against read-after-write CDN propagation hiccups.

### Fixed
- **Scanned PDF Rejection (Sprint B)**: Added explicit error detection for scanned image-based PDFs, returning a user-friendly toast warning: `"PDF ini tidak dapat baca karena berbasis gambar atau scan."`
- **Clerk Auth Type-Casting warnings (Sprint A)**: Resolved ESLint `no-explicit-any` errors by extracting style configurations into external variables in layout and login/signup page templates.
- **PDF Parser Class exports (Sprint B)**: Resolved Node.js `ERR_PACKAGE_PATH_NOT_EXPORTED` and TS call signature errors by migrating the pdf-parse default function call to named class instantiations (`new PDFParse(...)` and `.getText()`) to match `pdf-parse` v2.4.5 exports.

## [1.1.0] - 2026-06-29

### Added
- **Compact Mobile Sources Panel**: Introduced a responsive inline list above the chat input form for mobile screens to display cited sources cleanly without blocking the input field.
- **Floating Back Button (`<`)**: Replaced the bulky chat header bar with a small, circular back button (`ChevronLeft`) in the top-left corner, reclaiming vertical screen space on mobile.
- **Default Sidebar Mobile Closed State**: Added automatic viewport detection to set the workspace navigation sidebar to closed by default on screens $\le 860$px on initial load.

### Changed
- **Touch Event Compatibility**: Added `touchstart` listener support alongside `mousedown` to the outside-click handler, guaranteeing reliable dropdown menu closures on all mobile and tablet touchscreens.
- **Tiptap Next.js Hydration configuration**: Configured `immediatelyRender: false` on the Tiptap editor hook to suppress developer console warning logs in Next.js.

### Fixed
- **Tiptap Content Synchronization**: Implemented a reactive `useEffect` synchronization hook in `Editor.tsx` to push external `value` state changes (from wizard generated blueprints or note inserts) directly into the Tiptap canvas without resetting cursor focus.
- **ESLint State Cascade Warning**: Refactored the `collectedSources` state reset logic to eliminate synchronous `setState` updates inside the component effects.

## [1.0.0] - 2026-06-29

### Added
- **Tiptap Rich-Text Editor**: Replaced the raw Markdown textarea with a powerful Tiptap-based rich-text editor for a seamless writing experience.
- **Slash Commands Accelerator (`/`)**: Introduced an interactive slash command menu directly in the editor to trigger quick formatting and AI operations (e.g., Generate Paragraph, SEO Optimize, Add Citation).
- **AI Action Endpoint**: Created a dedicated backend endpoint (`/api/editor/ai-action`) specifically handling granular editor AI actions.
- **AI Preview Block (Accept/Reject)**: Implemented an inline preview block for AI-generated edits. Users can now review the AI's suggestions and choose to "Accept" or "Reject" them before they are permanently merged into the document, preventing loss of control over the draft.
- **Lazy Markdown Serialization**: Configured `tiptap-markdown` to parse ProseMirror JSON into Markdown lazily on demand, significantly improving editor performance compared to syncing on every keystroke.
- **Research Notes Studio**: Added a local `sessionStorage` integration to save AI responses as "Research Notes". Includes an accordion-based UI in the Editor sidebar using `framer-motion` for reviewing collected factual sources.
- **AI Draft Generator**: Implemented `/api/strategist/generate-draft-from-notes` streaming endpoint. This endpoint takes selected research notes, synthesizes them via Gemini interactions API, and streams a cohesive first draft directly into the Editor canvas.
- **EAI Research Copilot (New Feature)**: Launched an interactive AI "Thinking Partner" for content strategists. Built on the Gemini Interactions API, it features a dynamic chat interface with auto-resizing inputs, real-time Google Search Grounding, streaming Markdown rendering, and Perplexity-style inline citations. The Copilot assists users from initial data analysis to drafting content blueprints.
- **Envoyou Token Billing Tracker**: Added a token usage logging mechanism (`interaction.usage.total_tokens`) at the end of the Copilot Fast Mode stream inside `strategist.ts`. This tracks API consumption for future integration with the internal user credit/coin deduction system.
- **Monorepo Architecture (TurboRepo)**: Merged `frontend` and `backend` repositories into a single monorepo to simplify release cycles and CI/CD.
- **Shared Package (`@eai/shared`)**: Moved all duplicate data types, Zod schemas, helper functions, JSON stream utilities, and configuration constants into a single source of truth under `packages/shared`. This officially pays off the Technical Debt of synchronizing data between repositories.
- **Server vs Client Export Isolation**: Exports in `@eai/shared` are separated with a `"./server"` path for backend/edge-specific logic that is incompatible with browser client interfaces like Webpack.
- **Copilot Soft Auth & Rate Limiting**: Added Clerk token verification (soft auth) and custom in-memory rate limiting (20 req/min for chat, 10 req/min for plan) on strategist routes to safeguard backend endpoints.
- **Notes Summary Context Injection**: Added a mechanism to inject a sanitized summary of saved research notes into the Copilot chat history request payload, giving the AI immediate context of what the user has saved.
- **Schema-Driven Blueprint Plans**: Enforced a strict JSON schema for the `/generate-plan` endpoint output via Gemini `response_format` configuration, ensuring stable parsing on the frontend.

### Changed
- **Separation of Fast & Deep Chat Modes**: Overhauled the Copilot backend API to properly differentiate between query depths. "Fast" mode now strips out expensive tools (`url_context`, `code_execution`) and strictly limits Google Search to a single iteration for instant, cost-effective responses.
- **Deep Research Spending Cap Protection**: Applied strict prompt limitations on the `deep-research-preview-04-2026` background agent (max 5 search queries). This prevents indefinite looping that exhausts the Google Cloud project spending limit (`RateLimitError: 429`).
- **Dark Mode Palette Refinement**: Overhauled the Dark Mode color palette to use a neutral, high-contrast monochrome aesthetic based on `#121211`. Replaced hardcoded slate and blue brand colors in `PricingCheckoutButton`, `StatusBar`, and sidebar with native design system variables for a cohesive look.
- **Sidebar Animation**: Refactored the `AppSidebarShell` layout transitions to resolve icon jittering during collapse. Used `max-width` interpolation instead of immediate `display: none` for smooth folding.
- **Editor Layout Animations**: Refactored the Editorial Workspace layout to use fluid `framer-motion` width animations for the Research Notes Studio and Feedback panels. When side panels are hidden, the main text editor gracefully centers itself using a dynamic `max-width` transition, creating an elegant distraction-free writing mode.
- **Relative Path Routing**: Replaced absolute API URLs with relative paths in the Research Copilot UI to route fetches via Next.js proxy middleware, ensuring seamless session token injection.
- **Deep Research Polling Timeout**: Refactored the frontend status checker polling loop to strictly time out after 180 checks (30 minutes) to prevent memory leaks and infinite background loops.
- **Prompt Caching Refactor**: Refactored the `generate-draft-from-notes` prompt layout to place stable persona, groundedness, and citation rules into the `system_instruction` parameter to enable optimal Gemini API caching.
- **Dynamic Fast Mode Length Tiering**: Updated the Fast Mode constraints to support 2-4 paragraphs for research requests and 2-4 sentences for factual queries.
- **Clean Paragraph History Truncation**: Configured assistant messages in the chat history to truncate at the closest paragraph or line boundary near the character limit instead of a hard slice.

### Fixed
- **TypeScript `InteractionSSEEvent` discrimination**: Resolved an IDE type error caused by an invalid `event.step` and `event.delta` property lookup on discriminated unions.
- **Backend Lint Errors**: Removed unused `requireAuth` and `ENVOYOU_PROFILE_ID` imports in the `strategist` routes to fix CI/CD lint failures.
- **Stale LocalStorage State**: Removed obsolete `eai-provider` from the frontend workspace state hydration since AI provider resolution is now securely handled server-side.
- **ESLint `no-explicit-any`**: Fixed build failing Linter errors in `strategist.ts` by defining proper interfaces (`{ role: string; content: string }`) for the interaction history map instead of typecasting to `any`.
- **Blank Signup UI Bug**: Fixed Webpack bundler interference on the frontend where it attempted to package the `node:crypto` dependency and Edge Config types during authentication (Sign-up/Sign-in) due to a barrel export in `packages/shared`.
- **Clerk v6 Fallback Loop**: Configured `fallbackRedirectUrl` on Clerk SSO components (Sign Up & Sign In) to avoid infinite redirect loops or stuck loading states for accounts already recognized by the system.
- **Note Citation Stripping**: Stripped inline citation links (`\s*\[\d+\]\([^)]+\)`) from research note contents prior to generating drafts, resolving the dual-truth problem where the model was confused by duplicated source references.
- **Blueprint Domain Extraction**: Fixed domain hostname parsing from blueprint sources URLs instead of mapping all domains to a hardcoded `'Source'` string.
- **Draft Language Consistency**: Resolved multi-tenant language mixing by forcing the `outputLanguage` from article metadata as an explicit prompt constraint inside the draft generator.
- **Blueprint Sources Deduplication**: Prevented UI clutter by deduplicating newly collected blueprint plan sources against existing ones based on URL.

## [0.37.0] - 2026-06-23

### Added
- **Multi-language Support (i18n)**: Added dual-language support (English as default and Indonesian with `/id` prefix) using the `next-intl` library.
- **Locale Routing Infrastructure**: Migrated all App Router UI routes into the dynamic `src/app/[locale]/` segment to serve pages based on language.
- **Translation Dictionaries**: Created translation files `messages/en.json` and `messages/id.json` as the single source of truth for UI text.

### Changed
- **Middleware Integration**: Overhauled `src/proxy.ts` to merge Clerk authentication integration with the `next-intl` routing system. The middleware now clears the language prefix before performing access checks (such as Feature Flags) so that bypass logic runs normally on language-specific routes.
- **Auth Page Localization**: Refactored the `AuthPageShell.tsx` component to pull words dynamically using `useTranslations` hooks, replacing static English text.

### Fixed
- **Next.js Linting & Type Errors**: Fixed the *exhaustive-deps* warning on the slideshow side effect in `AuthPageShell.tsx`, replaced HTML `<a>` elements with `<Link>` components from `next/link` in `global-error.tsx`, and assigned a stricter TypeScript type (`"en" | "id"`) to replace `any` in the i18n configuration file.

## [0.36.1] - 2026-06-23

### Added
- **Backend: Redis & BullMQ Foundation**: Installed `bullmq` and `ioredis` in `eai-backend` and established the queueing infrastructure (`queue.ts` and `worker.ts`). This foundation is set up to support future asynchronous background processing tasks (such as scraping or bulk tasks) without blocking the API Server. A conscious decision was made *not* to migrate the `/api/analyze` endpoint to this queue system to preserve real-time SSE (Server-Sent Events) streaming UX performance on the frontend.

### Changed
- **Backend: PM2 Ecosystem Separation**: Overhauled `ecosystem.config.cjs` configuration to separate the API Server entry point (`server.ts`) and the AI Worker (`worker.ts`) into two independent apps under PM2 control.
- **Backend: Memory Constraints Optimization**: Added strict parameters `max_memory_restart: '150M'` and `node_args: '--max-old-space-size=150'` in PM2 for both processes (server and worker). This crucial step was taken to secure the 512MB RAM production VPS, forcing the Node.js Garbage Collector (GC) to work more aggressively, and effectively preventing memory Swap Thrashing incidents that could drastically degrade API execution performance.

## [0.36.0] - 2026-06-22

### Added
- **Demo Page: PLG Redesign** (`/demo`): Completely redesigned the demo page with a Product-Led Growth (PLG) flow to improve conversion.
  - **Auto-fill Localized Draft**: Example draft text is automatically populated upon page load based on the user's browser language (`id` → Indonesian, others → English). No more blank states that kill conversion.
  - **Progress Stepper**: Added a three-step indicator below the header — `① Review Draft → ② See Improvements → ③ Save Workspace` — that changes dynamically based on analysis status (Idle → Loading → Done).
  - **Demo Signup Modal**: Added an elegant `"Save this result?"` modal with `[Start Free]` and `[Maybe Later]` buttons that appears when the user clicks the Publish button or exceeds the refine limit, replacing easily missed toast notifications.
  - **"Continue Editing →" CTA Banner**: A banner with copywriting `"Your demo won't be saved. Create an account to keep your work."` appears at the bottom of the editor after a successful analysis.
  - **Dark Mode Default for `/demo`**: The demo page automatically forces dark mode without changing user theme preferences on other pages. The theme is reverted to the original upon navigating away.

### Changed
- **Clean Demo Header**: Removed the intrusive blue (`Demo Mode:`) banner. The header now displays `EAI [Try Demo]` on the left and `Login` + `Start Free` buttons on the right, separated by a thin vertical line.
- **Hidden Sidebar in Demo Mode**: `HistorySidebar` is not displayed on `/demo` to give the editor full screen space and prevent user distraction.
- **Publish Button in Demo Mode**: Clicking the "Publish" button in demo mode now opens the `DemoSignupModal` instead of showing a toast error.
- **Rounded Sidebar Hover Icons**: Standardized the hover effect of all icons in the sidebar to be rounded, consistent with the search icon.
- **Minimalist Fast & Publish Buttons**: Changed analysis mode buttons to icon + short text (`⚡ Fast` / `🚀 Publish`), text is automatically hidden on small screens.
- **Active Tab-Style Indicator**: Active Fast/Publish buttons are now indicated by a brand-colored underline (same as the Draft/Refined Draft tabs) rather than a gray box.
- **"Write or Paste" Hover Effect**: Added a clear hover effect to the "Write or Paste" button in the empty Draft panel to make it visible as a clickable element.
- **Auto-fill Draft as Initial State**: Demo text is initialized directly in `useState()` using a lazy initializer to avoid timing issues — ensuring the Editor never renders a blank state before text is populated.

### Fixed
- **UI Freeze on Navigation**: Added `loading.tsx` with Skeleton UI on `/settings` and `/dashboard` routes and disabled aggressive prefetching (`prefetch={false}`) on sidebar links. This provides instant visual feedback (preventing the screen from appearing frozen) during Server Component transitions.
- **Infinite Loading on Logout**: Fixed the infinite loading spinner bug after logout by correcting the Clerk v6 configuration. The `afterSignOutUrl` property was removed from `<UserButton>` and set globally on `<ClerkProvider afterSignOutUrl="/login">` to ensure explicit client-side navigation.
- **Login Redirect in Sidebar**: Added a functional "Login" button in the sidebar when the user is not authenticated, replacing the unresponsive profile button.
- **ESLint Cleanup**: Removed unused import `SIGNUP_ENABLED`, and removed declared but unused variables `activePlan` and `displayName` in `HistorySidebar.tsx` and `WorkspacePageShell.tsx`. Lint is now **0 warnings, 0 errors**.
- **ERR_HTTP_HEADERS_SENT**: Fixed a bug in the EAI Backend where rate limit checking and cookie setting for demo mode were previously executed *after* the SSE (Server-Sent Events) stream started. This logic is now moved to the pre-flight phase before SSE headers are sent.

## [0.35.0] - 2026-06-21

### Added
- **Workspace Routing**: Added the Workspace `/workspace` page, which serves as the hub for all content management and editorial projects.
- **Editorial Workspace Component**: Created a new `EditorialWorkspace` component that serves as the main interface for users to manage their editorial workspaces.
- **Demo Page**: Added a demo page at `/demo` to showcase the application's full functionality.

### Changed
- **Robots.txt Update**: Updated the `robots.txt` configuration to disallow indexing of the Workspace pages by search engines.
- **Pricing Page Relocation**: Moved the eai `/pricing` pricing page to the `/pricing` landing page and updated internal links across the application.

## [0.34.0] - 2026-06-21

### Added
- **MIT License**: Added the MIT license file in `eai-backend/LICENSE`.
- **EAI Backend README**: Added initialization, configuration, and script execution guides in `eai-backend/README.md`.
- **Gitignore**: Added standard Node.js/TypeScript `.gitignore` configuration in `eai-backend`.

### Changed
- **Legal & NIB/PSE Alignment**: Included Business Identification Number (NIB) registration status and Ministry of Communication and Informatics (Kominfo RI) Electronic System Operator (PSE) registration on the terms of service (`terms/page.tsx`) and privacy policy (`privacy/page.tsx`) documents for official legal protection in Indonesia.
- **Updated Personal Data Processor List**: Updated the list of third parties in the privacy policy to accurately reflect Envoyou's distributed architecture: Biznet Gio (Blog VPS), DigitalOcean (EAI VPS), Supabase & Neon (Database), Cloudflare (DNS/Security), Clerk (Authentication), Google Gemini API (Single AI provider - disabled Groq), and Midtrans (Single payment gateway - disabled DOKU).
- **Cross-Border Data Transfer Clause**: Added an international data transfer policy to the privacy policy in compliance with UU PDP No. 27/2022 and GDPR Article 6 regulations.
- **Legal Identity Configuration Update**: Changed the values of `LEGAL_OPERATOR_NAME` to `"Envoyou"` and `LEGAL_REGISTERED_ADDRESS` to `"Banyuwangi, East Java, Indonesia"` in the `.env` and `.env.example` files.
- **EAI Monolith Decoupling**: Split the EAI monolith repo into two functionally separate parts: Next.js Frontend (`ai-editorial-system`) and Express.js Backend (`eai-backend`).
- **Dynamic API Proxying**: Modified `src/proxy.ts` on the frontend to dynamically proxy `/api/*` routes to the Backend VPS, inserting the Clerk JWT token in the Authorization Bearer header.
- **Separation of Environment Variables**: Reduced the environment variable footprint on the frontend by restricting `.env`, `.env.example`, and `.env.local` only to rendering & Clerk client needs, moving all secret variables (Neon Database, payment gateway API keys, Edge Config write tokens, Gemini/Groq API keys, Zoho Desk) to the backend `.env`.
- **Decoupled Workspace State**: Changed `getWorkspaceState` in frontend's `src/lib/user-workspace.ts` to use a server-side fetch to the VPS API `/api/workspace/state` instead of direct database queries.
- **Billing History Fetch**: Modified `BillingSettingsPage` in `src/app/settings/billing/page.tsx` to retrieve payment history from the backend `/api/payments/recent`.

### Removed
- **Unused DB Footprint on Frontend**: Removed the database module `src/lib/db.ts`, Prisma models `prisma/`, prisma config `prisma.config.ts`, and database dependencies (`@neondatabase/serverless`, `@prisma/adapter-neon`, `@prisma/client`, `pg`) from the frontend `package.json`.
- **Next.js Local API Routes**: Removed the `src/app/api` folder from the frontend as all endpoints have been migrated to the Express.js backend.

## [0.33.0] - 2026-06-18

### Added
- Added a new Account Settings page at `src/app/settings/account`.
- Added a **Validation Report** shortcut menu on the *Dashboard sidebar*, which is restricted (*conditional rendering*) to users with *Owner/SuperAdmin* access.

### Changed
- Completely updated the UI design to a more premium, *seamless* and *borderless* style, where the Header, Tab Bar, and Status Bar colors blend into the background.
- Changed the hover effect appearance on the Tab Bar and document option tabs (Preview, Markdown, Changes) to be more rounded. The active tab indicator was also changed to a minimalist underline style.
- Simplified text elements (such as word and character counts) in the Status Bar by removing the badge background blocks.
- The Workspace Sidebar background color now follows its open/close state (matching the main background color when closed, and a specific color when open).
- Smoothened the hover effect on the "SEO Metadata" button in the Feedback panel.

### Removed
- Removed the `ActivityBar.tsx` component to further simplify navigation in the Editor environment.
- Removed the AI Provider switch menu from the Status Bar UI interface. The Editor will automatically and silently use "Gemini" on every backend API call.

### Fixed
- Fixed the double sidebar layouting issue on the Validation page by configuring `DashboardLayoutShell` to explicitly bypass the layout on the `/dashboard/validation` route.
- Cleaned up and fixed various Lint Warnings and TypeScript compilation errors across core components, including optimizing imports, removing unused functions, and complying with React Hooks rules.

## [0.32.0] - 2026-06-15

### Changed
- Replaced unused experimental flags with EAI operational controls for maintenance, AI processing, CMS export, billing checkout, demo, signup, and pricing via Vercel Edge Config.
- Made Edge Config the runtime authority for public routes and sensitive operations, with `NEXT_PUBLIC_*` still used as a fallback when the Edge Config connection is unavailable.
- Added a branded EAI status page for maintenance and intentionally disabled signup/pricing features, with support access and a recovery path specifically for system owners.

### Fixed
- Connected the **System Feature Flags** panel to actual application behaviors: maintenance and AI kill switches now halt the editorial process, billing flags stop new checkouts without disabling payment webhooks, and CMS flags stop exports.
- Restricted the dashboard and server actions only to recognized key feature flags, and filtered non-boolean Edge Config items to prevent them from appearing as system toggles.
- Fixed Vercel Team Edge Config updates by passing `VERCEL_TEAM_ID` or the system env `VERCEL_ORG_ID`, and displaying token diagnosis, team scope, and Edge Config ID without turning configuration failures into generic 500 errors.
- Replaced the default global **Internal Server Error** screen with a professional recovery screen and forwarded operational API messages to the editor when AI processing or related services are disabled.
- Prevented the maintenance page from failing when Edge Config is slow by skipping flag reads on status/support/owner recovery routes and limiting middleware reads to one second with a safe fallback.
- Fixed `TypeError: immutable` on feature flag redirects by using `NextResponse.redirect`, allowing Clerk to append authentication headers before the maintenance or unavailable page is sent to the browser.
- Hidden the **Try demo mode** shortcut, Pricing links, and signup CTAs on the authentication pages based on the latest Edge Config values, rather than build-time embedded `NEXT_PUBLIC_*` values.

## [0.31.2] - 2026-06-15

### Fixed
- Fixed Sentry integration on Next.js 16 by moving browser initialization to `instrumentation-client.ts`, registering server and edge runtimes via `instrumentation.ts`, and capturing global App Router errors.
- Fixed the **Test Error Capture** button to verify the browser SDK, wait for event delivery, and display the Sentry Event ID or failure status instead of always reporting success based on DSN presence.
- Enabled source map upload authentication configuration via `SENTRY_AUTH_TOKEN` so that production stack traces are mapped correctly during Vercel deployment.

## [0.31.1] - 2026-06-15

### Added
- support and changelog links to navigation in login page.

## [0.31.0] - 2026-06-15

### Added
- Added two-phase onboarding: users must first create or select a Clerk Organization, then fill in the Publication Identity, editorial standards, and CMS options without creating a second local workspace.
- Added a Clerk workspace selection/creation screen on `/onboarding` and changed the Clerk organization to be the permanent source of identity for `name`, `slug`, and `clerkOrganizationId`.
- Added onboarding draft isolation based on `organizationId` so that progress and CMS credentials do not carry over when a user switches organizations.
- Added idempotent trial workspace allocation: 10 free credits are given to the Clerk organization created by an eligible user, rather than to every member or selected organization.
- Added `Organization.createdByUserId` metadata to distinguish workspace creators from invited members and prevent trial stacking through multiple memberships.
- Added the [Production Database Migrations](./docs/PRODUCTION_DATABASE_MIGRATIONS.md) runbook to record staging migrations that have not yet been applied to production, as well as the verification sequence before deployment.
- Added a centralized Vercel Edge Config-based *Feature Flags* system with a Super Admin Dashboard interface (`/settings/system/feature-flags`) to toggle features instantly (*0ms latency*) across all tenants.
- Added error and performance monitoring integration (Telemetry & Logs) using the Sentry SDK (`@sentry/nextjs`), complete with a "Mission Control" panel (`/settings/system/telemetry`) to check DSN status and simulate errors.
- Migrated the monolithic Analytics Dashboard to *Nested Routes* (`/dashboard/overview`, `/dashboard/performance`, `/dashboard/trends`, `/dashboard/productivity`) using Layout composition patterns and embedded smooth Framer Motion transitions.
- Added three-tier protection (*3-Tier Access Control*) to distinguish the authority of *Super Admins* (via `OWNER_USER_IDS`), *Tenant Admins*, and Members on `/settings/system/*`, `/settings/workspace/*`, and `/settings/publication/*` routes.
- Added a dedicated `/settings` page for authenticated users with consistent workspace navigation, profile and theme settings, active organization selection, plan/credit summary, auto-save and output language preferences, as well as default category, article type, audience, and article length.
- Added a responsive `WorkspacePageShell` as the foundation for internal pages with an activity bar, collapsible sidebar, mobile backdrop, status footer, and navigation to the Editor, Dashboard, Publication Settings, and Settings.
- Added theme preference synchronization via local storage and browser events so that light/dark/system changes remain consistent between the editor, activity bar, and Settings page.

### Changed
- Moved trial allocation from the `user.created` webhook to workspace creator resolution. Legacy user trial ledgers are securely migrated to the active organization ledger, while invited members do not bring additional trials.
- Changed the skip onboarding action to **Use defaults**, which only creates a default editorial profile on the active Clerk Organization and no longer creates a local personal organization.
- Locked onboarding, activation, and CMS testing APIs to run only when the request has a corresponding active Clerk Organization.
- Made the organization name and slug on the onboarding payload canonical data from Clerk; browser draft values cannot overwrite workspace identity.
- Relocated the old default admin pages (`/admin/billing` etc.) into the system settings structure (`/settings/system/tenants`) and removed the entire `/admin` route for cleaner code.
- Redesigned the *Settings* panel UI hierarchy to resemble the clean aesthetic of *Linear* style by minimizing outer borders and sharpening panel focus.
- Redesigned the workspace editor into a tighter and more consistent SaaS interface: radius, borders, panel headers, activity bar, tab bar, status bar, buttons, segmented controls, history sidebar, drafting assistant, editorial review, and refined draft now share the same visual hierarchy.
- Moved full settings from the activity bar dropdown to the Settings page; the Settings button now opens a dedicated route, while Demo Mode is still directed to log in first.
- Simplified wording and layout of the Editor, Feedback Panel, Final Draft Panel, History Sidebar, revision controls, SEO metadata, and drafting assistant for easier understanding by authors/editors and improved responsiveness on small screens.
- Improved workspace accessibility with more complete form labels and buttons, button-shaped backdrop elements, explicit tab/section states, focus management on shortcut modals, reduced motion support, and consistent theme preference storage.
- Updated Final Quality Gate prompt rules so that `flags` only contains actual risk labels and must be an empty array when there are no risks.

### Fixed
- Secured blog publication callbacks to `/api/analytics/webhook` with `X-EAI-Secret` validation, using the same shared secret as the EAI draft export path to the blog.
- Fixed new users not seeing 10 free credits after login because the webhook previously wrote credits to the `userId` ledger, while the workspace reads and deducts balances based on `organizationId`.
- Prevented race conditions between the Clerk webhook and lazy organization sync, which previously triggered unique constraints when both created local organization records at the same time.
- Prevented onboarding drafts and secret CMS organization settings from the previous organization from being used after the user switches Clerk Organizations.
- Filtered model responses like `All clear`, `No risks found`, `Tidak ada risiko`, `none`, and `n/a` to prevent them from appearing as critical flags or lowering the readiness of articles that are actually ready.
- Fixed Select dropdowns remaining in the viewport position when the page or container was scrolled; the menu now closes or follows the anchor correctly.
- Fixed the three-dot button on the Refined Draft so that the download menu can be opened as long as the refined draft is available, regardless of whether SEO metadata is complete for CMS export.
- Replaced manual positioning of the Refined Draft download menu with an anchored popover, ensuring the menu appears close to and aligned with the three-dot button and remains correct when the panel is resized or scrolled.

## [0.30.0] - 2026-06-14

### Added
- Added an internal `/admin/billing` page for owners/super-admins featuring email or organization search, workspace balances and plans, transaction history, and manual credit adjustments.
- Added a tenant-safe `manual_adjustment` ledger with idempotency keys, explicit confirmation, debit distribution per bucket, and structured auditing for actors, timestamp, target organization, reasons, and ticket references.
- Integrated read-only Zoho Desk validation on credit adjustments: admins verify tickets, view customer/subject/status, and the backend re-validates tickets before saving the Zoho ticket ID, number, and URL on the audit ledger.
- Added a public `/support` page that creates Zoho Desk tickets server-side, returns the ticket number to the customer, and protects the endpoint with validation, honeypots, size limits, and basic rate limiting.

## [0.29.2] - 2026-06-14

### Fixed
- Fixed refinement reports so that aspect ratios like `9:16` and technical abbreviations like `CTR` are not mistakenly flagged as new facts or entities.
- Classified internal domain URLs that do not match the catalog as **Internal Link Review** instead of **External URL Review**.
- Added editor options to verify, confirm, or remove/neutralize report findings, saving choices and readiness to history so export status remains consistent after reload.
- Reloaded credit balances when users switch Clerk Organizations and display the name of the workspace sourcing the balance so that figures from the previous organization do not linger in Settings.
- Stopped active Clerk organizations from overriding the user's default organization relation on every request.
- Clarified reasons why the Export to CMS button is locked, including when the article is still a Fast Preview or has not passed the Publish Ready quality gate.

## [0.29.1] - 2026-06-14

### Fixed
- Updated heading from "Pricing & Tokenomics" to "Plans & Credits".

## [0.29.0] - 2026-06-14

### Added
- **Visible payment confirmation status**:
  - Added order ID on checkout callbacks and pricing banners to poll order status after the user returns from DOKU.
  - Added a tenant-safe `/api/payments/status` endpoint so users can see pending, paid, failed status, credit amount, and order ID without access to other tenants' orders.
  - Added structured logs when payment notifications are received and successfully processed for admin observability via Vercel Runtime Logs.
  - Added reconciliation via the DOKU Check Status API after 60 seconds so orders can be confirmed and credits allocated even if the HTTP Notification does not arrive.
- **Phase A legal product foundation**:
  - Added public `/legal/terms`, `/legal/privacy`, and `/legal/refund` pages with effective dates and operator identities based on environment variables.
  - Added a confirmation dialog before checkout explaining prepaid payments, manual renewals, refund conditions, and links to legal documents.
  - Added `LEGAL_*` configurations for operator name, registered address, and support, legal, and privacy contacts.
  - Aligned public contacts with active mailboxes: `info@envoyou.com` for legal/administrative matters and `support@envoyou.com` for support and privacy requests.
- **Payment transparency before checkout**:
  - Displays USD prices, final IDR nominals, conversion rates, credit amounts and expiration dates, tax status, and manual renewal options before orders are created.
  - Added `PAYMENT_USD_TO_IDR_RATE` and `PAYMENT_TAX_LABEL` configurations; the checkout backend and UI use the same configuration source.
  - Rejects checkouts with old quotes if the nominal changes before the order is created, forcing users to review the latest pricing.
  - Updated the reference checkout exchange rate to IDR 17,779.30 per USD and maintained decimal precision until the order nominal is rounded to the nearest Rupiah.
- **Product rollout feature flags**:
  - Added centralized public flags for demo, signup, pricing, and billing, with initial configurations showing active demo/signup/pricing and inactive billing.
  - When billing is disabled, the purchase button displays **Coming Soon** and the checkout API returns `503`, while webhooks remain active for old orders.
  - Middleware and guest APIs enforce demo, signup, and pricing flags so restrictions apply beyond just the UI.
- **Payment gateway adapters with DOKU as default**:
  - Added a shared payment provider contract for checkouts, notification verification, and transaction status normalization.
  - Added DOKU Checkout integration with HMAC-SHA256 request/notification signatures and hosted payment URLs.
  - Retained Midtrans Snap as a backup provider that can be activated via `PAYMENT_PROVIDER=midtrans`.
  - Added a `provider` field on `PaymentOrder`, database migrations, environment templates, and DOKU production checklists.
  - Added DOKU Sandbox contract tests for hosted checkout payloads, redirect responses, notification signatures, success/failure statuses, and rejection of modified notifications.
  - Rejects placeholder DOKU credentials before checkout requests are sent so unconfigured deployments fail with clear messages.
- **Production-ready Midtrans checkout foundation**:
  - Added a `PaymentOrder` ledger to store pending orders before Snap transactions are created, so webhooks no longer trust plans, nominals, or target accounts from `order_id`.
  - Added transaction status verification directly to the Midtrans Status API before credits are allocated.
  - Added database migrations and Midtrans/Vercel go-live guides in `docs/MIDTRANS_PRODUCTION.md`.
- **Premium Clean SaaS Auth Page Redesign**:
  - Redesigned login (`/login`) and signup (`/signup`) pages through the shared `AuthPageShell` component into a clean and premium split-screen layout (deep ink `#070b14`).
  - Left panel (brand) displays the EAI logo, eyebrow + headline + description, a list of 4 product highlights (Research & draft, brand alignment, fact-checking, one-click publish) with Lucide icons, and a security footer + dynamic version from `package.json`.
  - Right panel (form) uses a two-column layout on wide screens (`xl`) — intro column + "Try demo mode" card on the left, Clerk form (max. 380px) on the right — so the form does not stretch vertically and utilizes horizontal space; automatically stacks into a single column on small screens.
  - Aligned all accents to a single main brand color (Envoyou Blue / `primary`) with consistent sans typography.
- **Sybil Trial Abuse Prevention**:
  - Added a prevention protection system for free trial exploits by detecting duplicate registrations using Gmail aliases (`+` and `.`) and disposable emails at the Clerk webhook level (`user.created`).
  - Created a smart email normalization helper in `email-utils.ts` that cleans Gmail aliases and rejects disposable email domains.
  - Implemented optimized database queries with a 3-character prefix and email domain to detect data similarities without overloading database performance.
  - Unit & integration test suite for Sybil prevention (`test-sybil-prevention.mjs`) and NPM target script (`npm run test:sybil`).
- **Interactive Pricing Funnel & Comparison Table**:
  - Reorganized the pricing page (`/pricing`) in the following order: Hero ➡️ Pricing Cards ➡️ Additional Credits ➡️ Compare Plans Table ➡️ FAQ Accordion ➡️ Final CTA.
  - Pricing structure is protected with anchor prices ($10 Starter, $19 Pro, $79 Team) across monthly/annual billing options, along with custom visualization for the Pro package using Envoyou Blue branding.
  - Additional Credits section priced at $8 for 50 credits ("Unused credits never expire").
  - Interactive FAQ Accordion containing 7 questions and answers about remaining credits, transfers, rollovers, and onboarding.
  - Final CTA banner to direct users to trial registration with 10 free credits.
- **Active Plan Indicator on Pricing**:
  - `PricingGrid` now utilizes `workspace` data to normalize active subscriptions to the base tier (ignoring the `org:` prefix and `_yearly` suffix).
  - The plan card currently owned by the user is marked with a "Current" badge, and its checkout button changes to a non-clickable "Current Plan" state (via the new `current` prop in `PricingCheckoutButton`).

### Changed
- Linked Terms, Privacy Notice, and Refund Policy from the auth and pricing pages, and opened all `/legal/*` routes without login.
- Organization checkouts now use local workspace IDs and can only be initiated by workspace admins.
- Payment simulator is only available in development with explicit flags and secrets; production no longer silently falls back to the simulator.
- Annual plans are now active for 12 months and provide a prepaid 12-month credit allocation upfront. Auto-renew recurring is not yet enabled.
- **Closer separation between demo and editorial modes**:
  - Guest/demo is always processed as a `fast` preview on the server, while the Publish Ready selection from the UI maps to `deep` analysis.
  - Refines and targeted fixes now maintain the selected analysis mode so that Fast Preview does not accidentally run the Publish Ready pipeline.
  - Copy and download results are locked during Demo Mode; downloads are only available after the article has undergone Publish Ready.
- **Stricter CMS exports and onboarding**:
  - CMS export capabilities are now only active for internal Envoyou workspaces or tenants with active and `verified` CMS connections.
  - The export endpoint verifies saved analysis metadata and only accepts Publish Ready articles with a quality gate of `ready` and an editor status of `refined`.
  - Onboarding activation re-verifies CMS connections using AES-256-GCM encrypted credentials before the workspace is activated.
  - Only Clerk Organization admins can modify workspace onboarding or test CMS connections.
- **English UI and operational messages**:
  - Standardized credit balance labels, plan descriptions, checkout/Midtrans messages, payment simulators, insufficient credits, quality gate warnings, and billing ledger descriptions into English.
  - API error messages for drafts and outlines are now forwarded to the UI so server failures appear more specific to users.
- Updated `docs/future-roadmap.md` based on actual implementation, including partial CMS status, tenant editorial profiles, source workspaces, and active pricing and credit allocations.
- Divided the **Legal and Compliance for Paid SaaS** roadmap based on customer traction: Phase A for the first 1–10 customers, Phase B for validating 10–50 customers, Phase C for growth of 50–200 customers, and Phase D when enterprise contract requirements arise.
- Checkout and webhooks now select adapters based on the order provider; DOKU/Midtrans switching is done via environment variables without changing subscription ledgers or credits.
- **Premium Clean Pricing Page Refresh** (remains adaptive to light/dark):
  - Unified heading typography to sans (removing `font-serif`) for consistency with auth pages.
  - Standardized all checkmarks and accents to a single brand color (`primary`), replacing the emerald + blue mixture.
  - Removed `animate-pulse` animations on balance & top-up icons, and reduced excessive backdrop-blur, gradients, and shadows.
  - Replaced the dark gradient "Additional Credits" block with a unified adaptive panel, matching card corner radius (`rounded-2xl`), and widening the container (`max-w-4xl` ➡️ `max-w-5xl`) to give cards more breathing room.

### Fixed
- Redirected visitors attempting to checkout without a session to the login page and then back to pricing, instead of displaying an `Unauthorized` message.
- Fixed Clerk `protect-rewrite` which changed `/api/checkout` responses without a session to a 404 HTML page; the endpoint now always returns a JSON error from the handler and the UI handles non-JSON responses without syntax errors.
- Fixed a `404` response when demo users executed **Generate with AI** by registering `/api/draft` as a public route that still enforces demo quota limits inside the endpoint.
- Fixed `ReadableStream` initialization on AI Draft so that async tasks run after the stream is available, allowing NDJSON responses to begin sending without waiting for the entire generation process to finish.
- Fixed checkout button conditions which previously allowed exports for results other than readiness `ready`; the UI and API now both enforce Publish Ready requirements.

## [0.28.0] - 2026-06-13

### Added
- **Dashboard Separation (Tenant vs Owner)**: Split the analytics dashboard into two separate views based on role and objective:
  - **Tenant Dashboard (`/dashboard`)**: Displays editorial operational metrics for tenant admins without investment/internal data.
  - **Owner/Internal Dashboard (`/dashboard/validation`)**: A page dedicated to EAI owners (internal) to review product quality validation reports (*investor KPIs*), detailed telemetry, and Demo Mode toggles.
  - **Owner Auth Guard**: Protects the `/dashboard/validation` and `/api/analytics/validation` routes through `OWNER_USER_IDS` checks in the environment.
- **Tenant Analytics Features Upgrade**: Added 5 new analytics features to the tenant dashboard (`/dashboard`):
  - **Per-user breakdown**: Provides an editor productivity and coaching table ("Editor Productivity & Coaching") complete with automatic statuses (*Top Performer*, *Coaching Suggested*, *Active*).
  - **Time-to-publish**: Calculates the average article processing time from the first draft to publication/export (`exported`).
  - **Revision count per article**: Tracks the average frequency of analysis iterations per article.
  - **Category/topic breakdown**: Displays a text category distribution card ("Category Distribution") accompanied by elegant *progress bar* visualizations.
  - **Weekly/monthly comparison**: Added MoM (Month-over-Month) performance comparison indicators with upward/downward trend badges (▲ / ▼) on Summary Cards (Total Reviews, Ready Rate, Total Flags).
- **CSV Export Upgrade**: Expanded the CSV report export feature to include details on editor contributions, article category distribution, performance comparison metrics, as well as average revisions and publication times.
- **Date Range Selector for Analytics**: Added interactive dropdown controls for time range selection (7 Days, 30 Days, 90 Days, This Month, Last Month, All Time) and custom date range inputs on the dashboard.

### Changed
- **Cohesive Brand Visuals**: Aligned all analytics icon colors (summary card highlights, analytics panel title icons, and category progress bars) to the primary Envoyou brand color (`primary` / indigo) for a consistent and premium visual interface.
- **Query-level Date Filtering & Combined Period**: Modified analytics log retrieval to filter dates directly in the Prisma database query based on the selected time range and its comparison period.
- **Database Query Select Optimization**: Optimized Prisma column selection by excluding large article draft `content` columns, saving database bandwidth and minimizing server memory usage.
- **Dynamic Period Comparison**: Dynamically calculates operational performance trends (total reviews, ready rate, total flags) comparing the selected time range with the preceding period.

### Fixed
- **ResponsiveContainer Size Warning**: Resolved Recharts graph size warnings (`width(-1)` and `height(-1)`) by setting explicit pixel height directly on the wrapping element and embedding the `debounce={50}` prop.

## [0.27.1] - 2026-06-12

### Changed
- **Model Pricing Update:** Updated default pricing for built-in Gemini models to align with standard Paid Tier pricing from the Google Gemini API ($1.50 input / $9.00 output per 1M tokens for Gemini 3.5 Flash, and $0.25 input / $1.50 output for Gemini 3.1 Flash-Lite).
- **Public API Stats Enhancement:** Expanded the `/api/public-stats` endpoint to return average AI cost per article in USD (`avgAiCostPerArticle`), active pricing version (`pricingVersion`), drafts processed this month (`draftsThisMonth`), average processing time (`avgProcessTimeMins`), and finished polished drafts (`finishedDrafts`).

### Fixed
- **API Cost Per Refined Calculation:** Fixed the average API cost calculation per article which previously divided total costs by all telemetry logs (including basic draft checks), now dividing based on the number of drafts that were successfully polished (`editorStatus: refined / exported`).
- **Refinement Log Status:** Assured that database logs from repair iteration runs (`role: refine`) are saved with an `editorStatus: 'refined'` status instead of the default `'draft'`, ensuring they are accurately counted in the analytics dashboard and workspace history widgets.

## [0.27.0] - 2026-06-11

### Added
- Protected Public Endpoint: Created a new API route at `/api/stats/public` that returns aggregated data on total drafts (totalDrafts), readiness rate (readyRate), and uptime status.
- Security Token: Protected this route using an `x-api-key` header with a secure `PUBLIC_STATS_TOKEN` token.

## [0.26.1] - 2026-06-10

### Fixed
- Fixed the "Write Manually" button in the editor panel which was non-functional because setting a single space `" "` to switch modes collided with the empty trim evaluation `!value.trim()` on the welcome screen. The system now uses a more explicit `isWritingManually` state to track manual writing choices and automatically resets this state when the draft is explicitly cleared/emptied.

## [0.26.0] - 2026-06-10

### Added
- Added an integrated **AI Drafting Assistant** feature within the workspace Editor, allowing users (Authors & Editors) to generate rough drafts directly inside EAI from a topic description, optional outline, and reference notes.
- Created a new `/api/draft` API endpoint supporting streaming draft responses using the Server-Sent Events / NDJSON protocol, complete with local mock mode and Guest Mode restrictions.
- Integrated the draft assistant form within the `Editor` interface, featuring real-time visualization of metadata synchronization status and automated transitions to manual writing mode.
- Saved draft generation logs to Neon PostgreSQL with a specific `role = "draft_generation"` marker.
- Added an **Interactive Outline Builder** supporting streaming structured outlines (H2/H3 and key bullet points) directly into the draft input fields before writing the full draft, logged under `role = "outline_generation"`.
- Added a **URL Reference Scraper** on the `/api/scrape` endpoint to extract clean paragraphs and headers from reference URLs asynchronously without navigation/footer boilerplate, complete with safe handling of paywall/Cloudflare failures.
- Provided a new **Press Release** mode modifying Gemini instructions to actively strip marketing hype, empty buzzwords, and promotional bias from corporate announcements into objective news drafts.
- Optimized draft assistant UI/UX by dynamically hiding irrelevant inputs based on the active tab mode (From Topic, From Outline, References, Press Release) and sanitizing submitted parameters to avoid input collisions.
- Documented future conceptual designs for a **Workspace NotebookLM-Style & Deep Research Agent** on the project roadmap (`docs/future-roadmap.md` Phase 4).

### Changed
- Updated the future roadmap (`docs/future-roadmap.md`) by marking several short-to-medium-term features as completed (latency optimization via draft streaming, AI Fact-Checker assistant, and database-backed user account synchronization).

### Fixed
- Dynamically localized evaluation messages, correction suggestions, and summaries on local deterministic quality checks (`final-quality.ts`) into English when the `Output Language` configuration is set to `en` (or automatically detected as `en` in `follow_draft` mode), preventing mixed-language evaluation reports.

## [0.25.1] - 2026-06-10

### Added
- Added a dynamic character count hint visual indicator on various form input fields in the Onboarding Wizard and Editorial Control Room (such as brand name, positioning, audience, custom instructions, base URL, connection name, etc.).

### Changed
- Increased the character limit for the `positioning` and `audience` fields on the editorial profile and onboarding schema from 300 characters (`singleLineString`) to 1000 characters (`multiLineString`) to support more flexible multi-line inputs.

### Fixed
- Handled database unique constraint errors in Prisma by deleting old orphaned Clerk user records sharing the same email but having different IDs before creating new records.
- Fixed onboarding PUT & POST validation error response formatting to include Zod error details (`parsed.error.issues`) instead of a flattened structure, and added detailed error logging to the backend console to simplify debugging.

## [0.25.0] - 2026-06-10

### Added
- Added Demo Mode (Guest Mode) allowing users to try the editor and article refinement features directly without needing to log in first.
- Limited the demo quota to a maximum of 2 refinements using a combination of client-side `localStorage` and server-side HTTP-Only `eai_demo_count` cookie.
- Locked premium features (Dashboard, Publication Settings, Export to CMS) with English warning messages and prompts to Sign Up/Sign In.
- Bypassed analysis logging to the database (`prisma.analysisLog.create`) for guest sessions to avoid database pollution and foreign key constraint errors.
- Added a **Try Demo Mode (No Login)** button below the login and signup forms on `AuthPageShell` to facilitate direct access to the demo workspace.
- Added a **History Locked** status in the history sidebar to hide logs and disable API fetching when Demo Mode is active, preventing 401 request triggers.
- Registered the `/api/workspace/config` endpoint as a public route in Clerk middleware so unauthenticated clients can receive 401 responses and transition to Demo Mode correctly.
- Redirected the addition of new categories/article types (`handleAddNewCategoryOrType`) directly to local state updates if Demo Mode is active, preventing `401 Unauthorized` errors when trying to save workspace preferences without logging in.

### Fixed
- Prevented false positive `Unsupported Quantitative Claim` and `Unsupported Entity Detail` warnings when numbers (such as the year `2026`) or entities are inside internal/external link URLs inserted by the system, by stripping URLs before scanning drafts.
- Recognized and processed portfolio ratios like `60/40` as a single number token (rather than separate numbers `60` and `40`), and expanded ratio spacing normalization (such as `60 / 40`) to be equivalent.

## [0.24.0] - 2026-06-10

### Changed
- Split the AI runtime from `api/analyze/route.ts` into the `src/lib/ai` module: provider/model configuration, input-boundary context, unified Gemini/Groq review, Final Quality Gate, SEO generation, and targeted fixes now have distinct boundaries.
- Unified streaming review, incremental JSON parsing, fallback modes, telemetry, and Gemini/Groq schema validation so that both providers no longer have parallel implementations prone to divergence.
- Added the `npm run test:ai-runtime` regression suite for model routing, Gemini 3 sampling, token budgets, input-boundaries, and fallback prompts.

## [0.23.1] - 2026-06-09

### Fixed
- Prevented false positive `Unsupported Quantitative Claim` warnings when the same nominal value in the source draft and final draft only differs in closing punctuation, such as `Rp147.900,` and `Rp147.900.`.
- Recognized dashes after unit-bearing numbers and acronym expansions containing hyphenated words, ensuring formats like `100%—` and `Insurance-Linked Securities/ILS` are no longer treated as new facts or entities.
- Aligned targeted fixes with the main pipeline: tenant prompts and input-boundary guardrails are now applied, article data is separated from system instructions, Gemini 3 sampling uses the default SDK, and reasoning and output-token limits are explicitly configured.
- Enabled `ThinkingLevel.MINIMAL` and safe output-token budgets on Gemini retry reviews to prevent token reasoning from consuming the response budget and cutting off structured JSON before completion.

### Changed
- Incremented `PROMPT_VERSION` to `1.10.0` and removed full serialization of tenant profiles that previously duplicated configurations already embedded in stage prompts.

## [0.23.0] - 2026-06-09

### Changed
- Set Gemini as the default provider in the backend, editor initial state, status bar, and environment templates; Groq remains available as an alternative selectable provider.
- Simplified Gemini model routing to only `gemini-3.5-flash` and `gemini-3.1-flash-lite`; the `fact-checker` role and factual guardrail scripts no longer use `gemini-2.5-pro`.
- Migrated Gemini 3.x configuration from legacy `thinkingBudget: 0` to `ThinkingLevel.MINIMAL` for quality gate, refine, rewrite, and SEO, and used `ThinkingLevel.MEDIUM` on factual guardrail scripts.
- Removed `gemini-2.5-pro` pricing from default telemetry tables and made `.env.example` a Git-tracked template.
- Updated the AI Evaluation Workflow diagram in the README to start from the actual workspace flow: log in, paste draft, select article category/type and mode, click `Refine Draft`, followed by review, rewrite, quality gate, and conditional SEO.

## [0.22.2] - 2026-06-09

### Added
- Added Clerk Organizations foundation for multi-tenant B2B mode: Clerk organizations are synchronized to local EAI tenants, onboarding can complete active organizations, and the Settings Menu now provides an `OrganizationSwitcher`.
- Added structured Gemini outputs derived from Zod schemas and the `npm run test:prompts` regression suite for prompt contracts, quality gates, per-role verdicts, and fallback SEO.
- Added `Organization`, `EditorialProfile`, and `EditorialProfileVersion` models with a create-new-version-on-edit pattern and database protection against updates/hard deletes of old versions.
- Added a tenant profile-based prompt composer, non-overridable core platform guardrails, and Envoyou v1 fallback profiles.
- Saved profile versions, core guardrail versions, and prompt configuration hashes on each `AnalysisLog`.
- Added the `npm run test:profiles` regression suite to ensure Envoyou v1 prompts remain identical and tenant configurations are isolated.
- Added an `Editorial Control Room` admin page to manage editorial identities, categories, tone, article structure, source policies, SEO, internal link domains, and immutable version histories.
- Added admin-only APIs to read active organization profiles and create new configuration versions without mutating previous versions.
- Added a `CmsAdapter` contract and the `envoyou-rest-v1` adapter to query internal link catalogs and export drafts through the same boundary.
- Added the `npm run test:cms` regression suite for catalog contracts, export payloads, adapter authentication, and isolation of profiles without adapters.
- Added a five-step onboarding wizard for organization, editorial identity, editorial rules, CMS connection, and workspace activation.
- Added `OnboardingDraft` to save progress before profile v1 is created, and `CmsConnection` with AES-256-GCM encrypted credentials.
- Added the external `eai-rest-v1` adapter, read-only connection tests, atomic workspace activation, and the `npm run test:onboarding` regression suite.
- Added the `npm run test:json-stream` regression suite for the JSON streaming parser, covering partial feedback objects, escaped newlines, wrapped JSON, raw newlines in strings, and trailing commas.
- Added a Final Quality Gate response normalizer to deterministically truncate excessively long `summary` and `changes` values before schema validation.
- Added final draft cleanup for escaped Markdown/quote artifacts like `*\"daily work life\"*` and safe typo correction of `12 bawah terakhir` to `12 bulan terakhir`.

### Changed
- Cleaned up the login/signup screens into a cleaner two-panel auth layout, matching EAI's identity and removing the stacked Clerk card feel.
- Removed local role dropdowns (`writer/editor/admin`) from the Settings Menu to avoid overlap with Clerk organization roles.
- Clarified in the Settings Menu that the organization dropdown represents the Clerk workspace for tenant access, not the editorial brand name.
- Clarified the Editorial Control Room header with Workspace, Editorial Profile, and Brand labels, and renamed `Profile key` to internal profile key.
- Renamed admin page copy to be more author/editor-friendly: `Publication Settings`, `Publication Identity`, `Writing Standards`, `SEO & Links`, `Settings History`, and masked technical terms like tenant/guardrails/configuration.
- Adjusted onboarding so that the active Clerk Organization is used as a read-only workspace identity; users only complete their EAI publication/editorial profile, rather than creating a second organization.
- Changed main workspace API scoping to read the active organization from the Clerk session, store `organizationId` on the `AnalysisLog`, and restrict history/exports/analytics based on the active tenant.
- Aligned `src/lib` helpers with prompt contract v1.4: quality gates are limited to a maximum of 5 feedbacks, 1-click apply rejects sensitive factual claims, tenant configurations are normalized via Zod, CMS credentials are validated on write/read, and CMS catalog limits are restricted to 1-100.
- Separated editorial briefs, refinement instructions, previous feedback, and drafts from system instructions into structured user content with input-boundary guardrails.
- Used default sampling for Gemini 3.x, tightened quality gate contracts, and made fallback SEO always pass application validation.
- Made fallback SEO and source-fidelity entity allowlists follow the active editorial profile.
- Restricted the legacy Envoyou internal link catalog from being used by external tenant profiles before a per-tenant CMS Adapter is available.
- Moved CMS calls from the analyze/export route to the tenant-aware adapter resolver and saved `cmsAdapterKey` in the export metadata.
- Stopped automatically assigning new users to the Envoyou organization; users without a completed workspace are directed to onboarding.
- Retrieved category and article type choices in the editor/settings from the active editorial profile, and added `articleTypes` configuration to onboarding and the Editorial Control Room.
- Incremented `PROMPT_VERSION` up to `1.9.0` with JSON schema descriptions for structured Gemini outputs, more explicit tenant operational rules, per-tenant source policies, and stricter temporal context guidelines.
- Aligned main editorial prompts to be English-first to serve Envoyou's global audience, including role prompts, SEO metadata, polish diagnosis, rewrites, quality gates, refinement, fallback instructions, and developer mock outputs.
- Changed default settings for new applications to English-first with `profile.language: "en"` and `outputLanguage: "en"`.
- Reduced schema redundancy in Gemini prompts: structured Gemini output now relies on `responseJsonSchema`, while text schemas are preserved for Groq and fallback compatibility.
- Narrowed the Gemini review schema to no longer permit unnecessary fields like `polishedDraft` and `generatedMetadata`.
- Added `response_format: { type: "json_object" }` to the Groq review/SEO paths producing JSON.
- Cleaned up internal linking logs when the CMS adapter has not been configured to clearly represent a non-fatal condition.

### Fixed
- Fixed Analysis/Polish failures caused by model `summary` exceeding the 280-character limit by normalizing it before Zod parsing.
- Fixed Final Quality Gate failures caused by model `changes` items exceeding 180 characters.
- Strengthened Gemini/Groq streaming JSON parsers so that partial scalars like `score`, `verdict`, and `summary` are only emitted once the JSON value is complete.
- Ensured final publication drafts no longer contain backslash escape characters that ruin article aesthetics.

## [0.22.1] - 2026-06-08

### Fixed
- Ensured members in the active Clerk Organization cannot gain admin access from old fallback local roles; when a Clerk `orgId` is active, admin access strictly follows `org:admin`.
- Fixed Clerk runtime errors on the auth pages by moving login/signup routes to catch-all `/login/[[...rest]]` and `/signup/[[...rest]]`.
- Fixed the **Add Source** action in the Post-Polish Review Loop to succeed even when the `targetText` from the quality gate has a different format, contains ellipses, has already become a Markdown link, or cannot be found inline; the system now adds fallback `Verification Notes` and still marks the check as verified.
- Fixed the **Fix with EAI** action so that the `fix_targeted` endpoint is no longer rejected by general `Text is required` validation, including when the targeted fix payload is recognized by `targetText` + instructions.
- Prevented duplicate `Remaining checks` warnings for the same verification claim using normalized target claim-based deduplication, without removing valid different warnings on the same sentence.
- Ensured sensitive factual claim `targetText` retrieves the original sentence from the final draft, not a truncated snippet, so the review loop action can locate the correct context.
- Ensured the Final Quality Gate evaluates the same publication draft as the **Final Draft** panel, not annotated internal drafts, so feedback no longer requests users to delete internal markers like `[Citation recommended]`.

### Changed
- Added a **Flagged claim** display on verification items so editors know the exact claim referred to by high-risk/needs-citation warnings.
- Cleaned up the **Source verified** card in the Refined Report: long URLs are now displayed as responsive domain + path details, with copy and open source buttons.
- Extended the **Add Source** button to all feedback possessing a `verificationStatus`, not just the `Source Verification` and `Source Fidelity` categories.

## [0.22.0] - 2026-06-08

### Added
- Added a **Configurable Source Fidelity Allowlist** per tenant profile with a 3-layer architecture:
  - **Semantic Equivalence**: Automatic equivalence normalization (e.g., `24/7` ↔ `24 hours`) — previously existing.
  - **Context-Aware Classifier**: Terms in the allowlist are only passed if the sentence context is advisory (e.g., `try evaluating for 7 days`); they are still flagged if the context is a factual claim (e.g., `proven to increase in 7 days`).
  - **Tenant Allowlist**: The `allowedEditorialTerms` property in `EditorialProfileConfig` with the structure `{ value, type, scope, categories }` supporting `abbreviation`, `framework`, `duration`, and `brand_term` types.
- Initialized default Envoyou profiles with a built-in list of common abbreviations and durations (`HRD`, `CEO`, `AI`, `24/7`, `24 hours`, etc.).
- Added a **Source Fidelity Allowlist** section on the Editorial Control Room page (`/admin/editorial-profile`) to visually manage allowlist items.
- Synchronized the `allowedEditorialTerms` property in the onboarding draft schema to save progress.
- Added 4 new test cases for the allowlist to the `npm run test:quality` regression suite.

## [0.21.12] - 2026-06-08

### Fixed
- Resolved false positive warnings on the Final Quality Gate:
  - Ignored novel entity detection for generic corporate/industry/technology abbreviations/acronyms such as `HRD`, `HR`, `CEO`, `CTO`, `AI`, `IT`, `UI`, `UX`, `GDP`, `AGI`, `LLM`, etc.
  - Expanded calendar/temporal orientation matching to support the prefix keyword `memasuki` / entering (e.g., `Entering the first half of 2026`).

## [0.21.11] - 2026-06-08

### Added
- Added a Post-Polish Review Loop to the Quality Gate with fully interactive actions to resolve warnings/checks:
  - **Accept Addition** to consciously accept framework additions (marking as `Accepted as Editorial Choice`).
  - **Remove Addition** to remove framework/number/new fact additions using targeted AI models (`mode: 'fix_targeted'`).
  - **Add Source** to automatically insert reference URLs as inline Markdown links `[fact](url)` into the draft and mark status as `Verified`.
  - **Mark Verified** to approve reference claims directly without links (marking as `Source Verified`).
  - **Fix with EAI** to fix problematic sentences directly via custom AI instructions.
- Added auto-population of the `targetText` property with the full sentence containing the warning for `Source Verification` and `Source Fidelity` checks, so the review loop action operates directly on the correct sentence context.
- Dynamically recalculates draft readiness status on the frontend when all checks are resolved/accepted by the editor.

## [0.21.10] - 2026-06-07

### Added
- Added semantic matching for the expression `24/7` to be equivalent to `24 hours` (including spacing variations `24 / 7` and paraphrases like `24 full hours`), so it does not trigger warnings or fail as a new number.
- Lowered draft readiness from `blocked` to `needs_review` on the Final Quality Gate if there are no critical category errors (`fail`) but only reference/source warnings (`warning`).

## [0.21.9] - 2026-06-07

### Fixed
- Fixed an issue where default Envoyou Article Types were mixed with new user custom choices on the Editor panel after completing onboarding, by initializing `articleTypes` in the onboarding draft as an empty array (`[]`).

## [0.21.8] - 2026-06-07

### Changed
- Changed the priority order of fallback draft article titles in the sidebar menu so that the active article type and category combination (`type · category`) is displayed before the article summary (`summary`).

## [0.21.7] - 2026-06-07

### Changed
- Translated remaining Indonesian interface text into English on `ActivityBar` tooltips and `Editor` & `FinalDraftPanel` placeholders/descriptions.
- Removed the "Default Metadata" section and "Strictness" settings from the Settings Menu to avoid overlap with the more central Editorial Control Room configuration.
- Automatically mapped AI review strictness (`strictness` metadata) based on the `sourcePolicy` ('strict' | 'standard') configuration of the active editorial profile.

## [0.21.6] - 2026-06-07

### Added
- Provided a checkbox checklist interface for Article Categories (grouped by pillars) and Article Types (complete with English descriptions) in the Onboarding Wizard and Editorial Control Room (profile admin page) to simplify workspace configuration.

## [0.21.5] - 2026-06-07

### Added
- Changed the category and article type dropdowns to autocomplete text inputs (using datalist) for personal workspace users. New categories and types typed by users are automatically saved to their editorial profiles when the input loses focus (onBlur).

## [0.21.4] - 2026-06-07

### Added
- Added a "Set up later" (skip onboarding) option to the Onboarding Wizard. This option automatically creates a personal sandbox workspace/organization named `[User Name]'s Workspace` with a default editorial profile (`DEFAULT_ONBOARDING_DATA.editorialProfile`) using secure, atomic Prisma database transactions.

## [0.21.3] - 2026-06-07

### Changed
- Translated all validation instructions, error messages, label names, and hints in the Onboarding Wizard (`OnboardingWizard.tsx`) and editorial profile schema (`editorial-profile-schema.ts`) from Indonesian to English to align with the workspace editor.

## [0.21.2] - 2026-06-07

### Added
- **UI & Theme Alignment for Onboarding Wizard**:
  - Aligned the onboarding wizard header layout with `.ide-titlebar` to remain consistent with the workspace editor pages.
  - Added a premium ambient radial glow and noise texture overlay to the onboarding wizard background.

### Fixed
- **Dark & Light Theme Functionality in Onboarding**:
  - Fixed theme toggle functionality failures by changing static hardcoded dark colors for backgrounds, borders, text, option cards, buttons, and form components into adaptive CSS variables from the EAI design system (`var(--background)`, `var(--border)`, `var(--foreground)`, etc.).
  - Applied custom UI classes (`ui-btn`, `ui-control`, `ui-card`, etc.) to all interactive wizard elements to make them responsive to the active theme.

## [0.21.1] - 2026-06-07

### Changed
- Changed the primary system font from `Instrument Sans` to `Inter` for clearer readability.

## [0.21.0] - 2026-06-07

### Added
- **AI Usage Telemetry**:
  - Logs input, output, cached, and reasoning tokens from Gemini and Groq for each review, rewrite, refine, quality gate, and SEO phase.
  - Logs phase and total process durations, retries, fallbacks, failed calls, providers, models, and pricing table versions on audit log metadata.
  - Added the `npm run test:telemetry` regression suite.
- **Editorial Pipeline Loading UI**:
  - Displays actual process stages: `Reviewing source`, `Rewriting article`, `Quality and source checks`, `SEO metadata`, and `Finalizing draft` based on backend event streams.
  - Added process timers, stage checklists in the feedback sidebar, document skeletons before the first chunk, and progress rails during draft streaming.

### Changed
- **Analytics Accuracy**:
  - Replaced static mode-based cost estimations with calculations based on actual tokens and configurable model pricing tables.
  - Changed labels to `Estimated API cost per output` because Rupiah values still depend on provider pricing and the `AI_COST_USD_TO_IDR` exchange rate.
  - Displays telemetry coverage so that old logs without provider usage are not counted as actual data.
  - Calculates process times and retry/fallback rates from telemetry, making Real Mode the default dashboard view.
- **Refine Experience**:
  - Displays articles as soon as the first chunk is received and maintains process indicators without covering the draft.
  - Hides draft actions until content starts becoming available, and consistently uses Envoyou Blue brand accents.

### Fixed
- Cleaned up all legacy ESLint errors and warnings on the analytics webhook, dashboard, signup, and settings menu.
- Fixed the aggregate ready rate to use weighted total verdicts rather than simple day-to-day averages.
- Tightened analytics metadata and webhook parsing without using `any` types.

## [0.20.0] - 2026-06-06

### Added
- **Final Draft Quality Gate**:
  - Replaced raw draft scores in the Polish flow with final readiness statuses: `ready`, `needs_review`, or `blocked`.
  - Displays a refinement report containing primary changes, remaining checks, flags, and actionable feedback on the refined draft.
  - Runs the quality gate again after iterative refinement and saves readiness and changes lists to audit log metadata.
- **Deterministic Editorial Validation**:
  - Added source fidelity checks for numbers, number ranges, URLs, entities, acronym expansion drift, attribution of motives unsupported by sources, and calendar phases that have not yet arrived.
  - Added normalization of ASCII tables to GFM Markdown and detection of broken Markdown tables.
  - Added the `npm run test:quality` regression suite.

### Changed
- **Publication-Safe Verification Flow**:
  - Separated internal draft reviews from the publication draft.
  - Markers like `[Source verification recommended]` still trigger warnings in the refinement report but are removed from the draft displayed, stored, and exported to the CMS.
- **Smart Internal Linking**:
  - Filters candidates based on substantive term overlap, slug quality, and topic families to prevent weak cross-topic links from being fed to the model.
  - Restricts internal links to a maximum of 1–2 highly relevant links.
- **Analytics & History**:
  - Replaced average scores and Polish verdicts with ready rates and `Ready / Needs Review / Blocked` breakdowns.
  - Updated the dashboard, status bar, feedback panel, and history sidebar to use final readiness.
- **Prompt Guardrails**:
  - Incremented `PROMPT_VERSION` to `1.3.6`.
  - Clarified the difference between neutral calendar orientations and new trend claims, prohibited motives for figures/organizations without source support, and tightened table and internal link integrity.

### Fixed
- Prevented ASCII tables with single-segment borders from slipping into the refined draft.
- Prevented internal verification annotations from leaking into the publication draft.
- Prevented false positive source fidelity issues on number ranges, percent formats, bolded numbers, editorial labels, and trusted internal links.
- Added quality gate retries before fallback to reduce incomplete automated reviews.

## [0.19.1] - 2026-06-06

### Changed
- **Enhanced ASCII Table Prohibitions**:
  - Added ASCII text table prohibition rules and GFM (GitHub Flavored Markdown) table rendering instructions to `getIterativeRefinementPrompt` which runs when editors click the "Refine" button / trigger iterative re-analysis.
  - Strengthened table instructions in `getBaseGuidelines` and `getPolishedDraftPrompt` to prevent the AI from wrapping tables in raw text/ASCII code blocks.

## [0.19.0] - 2026-06-05

### Added
- **Multi-user SaaS Clerk Authentication**:
  - Integrated `@clerk/nextjs` and `@clerk/themes` for a SaaS-ready multi-user authentication system.
  - Removed local password logins, replacing them with custom EAI radial glow login/signup pages (`/login`, `/signup`).
  - Added user profile synchronization using Clerk Webhooks (`/api/webhooks/clerk`) to the PostgreSQL database via Prisma.
  - Separated article history data (*data isolation*) between users, ensuring each user can only view and edit their own article history.
- **Validation Metrics Dashboard (Validation Report Tab)**:
  - Implemented a new "Validation Report" tab on the analysis dashboard in a compact single-page layout (*report card style*).
  - Displays 4 evaluation card categories: *Product Usage*, *Output Quality*, *Efficiency Gain*, and *Commercial Readiness*.
  - Added dynamic progress bars and achievement target indicator labels (*Met*, *Developing*, *At Risk*).
  - Dynamically calculates estimated API operational costs per output: **Rp950** for Fast mode and **Rp1,850** for Publish Ready mode.
  - Added a **"Demo Mode"** toggle in the top-right corner of the dashboard (accompanied by a pulsing "Demo Mode" badge next to the dashboard title).
  - When **Demo Mode is ON**, the dashboard displays full hybrid/mock data visualizations (connecting 120+ drafts, 8+ WAU, and colorful charts) for large agency-scale presentation demonstrations.
  - When **Demo Mode is OFF**, the dashboard presents pure real data and calculations directly from the PostgreSQL/Neon database.
  - Refined dashboard evaluation label naming to match EAI's actual workflow (where the AI system evaluates the user's initial rough draft): "Editor acceptance rate" was changed to **"AI system acceptance rate (Accept)"**, "Manual revision rate" to **"AI revision request rate (Revise/Decline)"**, and "% directly publishable" to **"CMS directly publishable rate"**.
  - **CMS Webhook System & CMS Directly Publishable Rate**:
    - Integrated a public webhook endpoint `/api/analytics/webhook` receiving HTTP POST callbacks when authors publish articles in external CMSs.
    - Webhooks match `sourceRef` payloads with `AnalysisLog` in Neon PostgreSQL.
    - Calculates the **AI Retention Rate** (word similarity level using a word-level Levenshtein algorithm optimized with a *single-row buffer* to minimize CPU computation load).
    - Saves publication status and retention levels in the log `metadata` (e.g., "Published with X% AI Retention").
    - Dynamically calculates the **CMS Directly Publishable Rate** in the dashboard as the percentage of published articles with an AI Retention Rate `>= 90%`.
  - Changed Verdict Breakdown category labels from "Approve" and "Reject" to **"Accept"** and **"Decline"** to align with EAI workflow terminology.
  - Added a new metric **"AI refinement POV match rate"** under *Output Quality*. This metric is dynamically calculated by grouping log history by `sourceRef`. If a refined draft is exported directly to the CMS on the first attempt (only 1 log in the `sourceRef` group), it is considered matching the POV (Direct Match). However, if users perform subsequent refinements or re-analyses (more than 1 log before export), it is counted as an initial draft that did not fully meet the POV, requiring further refinements.
- **Editor Activity Bar Navigation**:
  - Added a dashboard link icon (`LayoutDashboard`) in the editor Activity Bar directly below the New Article button.
  - Equipped with the tooltip description *"Open Analytics & Validation Dashboard"* to simplify direct navigation from the editor workspace.
- **Dashboard CSV Export**:
  - Added a **"Download CSV"** button in the top-right corner of the dashboard (next to the Demo Mode toggle).
  - This button dynamically detects the active tab: if on the *Validation Report* tab, the downloaded CSV contains the full metrics report (category, metric name, current value, target, status); if on the *Technical Charts* tab, the CSV contains aggregated summaries, daily score trends, verdict breakdowns, and the top warning flags list.
  - Uses modern browser Blob techniques ensuring files download correctly in Excel and Google Sheets (complete with double-quoted wrapped values).

### Fixed
- **Dashboard UI & Layout**:
  - Fixed dark mode Validation Report and Technical Charts segment tab button colors which were previously white-on-white (white text on a white background) due to an invalid `dark:bg-slate-850` class, replacing it with **`dark:bg-slate-800`**.
  - Resolved Recharts graph dimension warnings (`The width(-1) and height(-1) of chart should be greater than 0`) by embedding the `min-w-0` class on the layout container and the `minWidth={0}` property on the graph `<ResponsiveContainer>`.

## [0.18.2] - 2026-06-05

### Changed
- **Temporal Prompt & Rewrite Guardrails**:
  - Incremented `PROMPT_VERSION` to `1.2.2` with editorial date context based on `Asia/Jakarta`.
  - Added temporal guardrails to prevent current-year events from being mistakenly treated as future projections.
  - Added explicit rewrite priorities: factual integrity, hook/conclusion quality, argument clarity, and then text density.
  - Expanded cross-category tone examples and added a dedicated Polish Review score rubric.
  - Tightened table output requirements to use GFM Markdown rather than ASCII tables in code blocks.

### Fixed
- **Analyze Response Validation**:
  - Normalized model `summary` outputs before schema validation to prevent Zod errors on the frontend for responses with summaries exceeding 280 characters.

## [0.18.1] - 2026-06-03

### Changed
- **Premium UI Enhancements**:
  - Overhauled default system scrollbars to minimalist, thin custom scrollbars (Mac/iOS style) with transparent tracks.
  - Added a thin ambient noise/grain texture overlay (2% opacity) on top of the background radial glow to provide a premium material feel and spatial depth.
  - Reduced the padding height of history items in the History Sidebar to make it more compact and display more drafts.
  - Replaced native dropdown selects (category, role, language choices) in the Settings menu with custom Select components (Radix/Shadcn) so option boxes feature curved corners (`rounded-lg`) and no longer look rigidly square.
  - Fixed icon and text layouts on the Appearance and Strictness segment buttons in Settings by adding `display: flex; align-items: center` and reducing button height to a proportional capsule shape (`min-height: 32px`).
  - Standardized Settings menu labels, placeholders, and options to Title Case for a more consistent and professional appearance (e.g., "Auto-Save Workspace", "Target Audience").

## [0.18.0] - 2026-06-03

### Changed
- **Visual Redesign & Brand Integration**:
  - Changed the EAI color theme from yellow/gold to Envoyou Brand Blue (#0B79C2 / #0066AF) to align its identity with the Envoyou Blog Admin.
  - Applied selective glassmorphism effects (transparency & blur) on shell panels, headers, sidebars, and dialogs to make application transitions feel seamless.
  - Maintained solid surfaces (no glass) on main workspaces (Draft Editor & Refined Draft panel) to keep long-text readability optimal.
  - Adopted Option B (Soft Amber) for text feedback search highlights and warning marks to maintain visual contrast and avoid confusion with brand accent colors.
  - Retained the serif font (Lora) in the drafting textarea for a comfortable "writing studio" feel, while buttons, sidebars, and dashboards use sans-serif fonts.
  - Redesigned the main login and dashboard login pages using ambient blue radial background glows and premium visual cards.
  - Re-themed analytics dashboards (summary cards, score trend line charts, verdict pie charts, and flags bar charts) with modern visuals and matching blue-emerald-amber color schemes.
  - Reduced visual borders across the app by 50% to create a cleaner, more spacious, and breathing layout (premium whitespace). Removed the `0 0 0 1px` shadow outlines on the Editor, Final Draft, and Feedback Panels.
  - Removed dotted background patterns (`dot-grid-bg`) globally to keep the workspace looking minimalist and modern.
  - Redesigned the History Sidebar header with a radial-glow-enhanced "EAI" / "Editorial Intelligence" logo, and aligned the draft history list under "Recent Drafts".
  - Fixed mismatched JSX closing tags in `Editor.tsx` to ensure successful Next.js build compilation.
  - Corrected the final draft panel (`FinalDraftPanel`) background color using `var(--card)` so it does not merge with the workspace background, and repositioned stacking context (`relative z-10`) on editorial instruction and apply-all buttons to avoid overlay blocks from the radial glow.
  - Redesigned the main header (`ide-titlebar`) to a height of 76px with radial glow overlays for visual alignment with panel/sidebar headers, raised its elements' z-index, and scaled up the EAI logo (`w-11 h-11`), brand font (`text-3xl`), and action buttons for better proportions and readability.
  - Redesigned the bottom status bar (`ide-statusbar`) to a height of 44px with a sans-serif font to prevent it from looking like a VS Code extension. Removed bullet separators (`·`) and organized status information (word count, char count, verdict, score) into premium capsule badges with soft hover backgrounds, and changed the AI provider selector to a modern segmented toggle control.
  - Improved top navigation whitespace by raising the tab bar (`ide-tabbar`) height to 52px and changing tab styles to pill-shaped segmented dashboard navigation switchers.
  - Added a toggle button to show/hide draft statistic cards (Added, Removed, Stable) on the final draft panel (`FinalDraftPanel`) for reading area flexibility.
  - Changed the History Sidebar close button icon from `PanelLeftClose` to `PanelLeft` to remain symmetric and aligned with the feedback panel open/close button icon (`PanelRight`).

## [0.17.0] - 2026-06-02

### Added
- **Analysis Speed Modes (Fast vs Publish Ready)**:
  - Implemented analysis speed states (`analysisSpeed`) on the main interface.
  - **Fast Review** mode: Disables SEO metadata generation and internal link references to save tokens, reduce server latency, and optimize operational costs.
  - **Publish Ready** mode: Full editorial workflow with SEO and internal link extraction.
  - Added tooltips to the mode selector to act as informative UI descriptors.
- **Editable History Title**:
  - Updated the `HistorySidebar` component to support inline title editing (via double-click) for draft titles.
  - Added a backend `PATCH /api/history/[id]` endpoint to save custom title changes (`customTitle` inside the JSON `metadata`) to the PostgreSQL database.

### Changed
- **History Sidebar Layout**:
  - Reorganized the history list item UI to be much more compact and dense.
  - Titles are now truncated to a single line (`line-clamp-1`).
  - Shifted the score badge position to the far left and the time-elapsed indicator (`time ago`) to the far right to align with the title.
  - Merged metadata elements (Verdict and Category) directly under the title line.
- **Model Routing Restructuring**:
  - Refactored `route.ts` on the `/api/analyze` endpoint significantly to accommodate dynamic model routing (*Lite* vs *Pro/Flash*) based on execution needs.
  - Log entries (`usedModels`) now represent the actual total models contributing to an analysis.

## [0.16.0] - 2026-05-31

### Added
- **Application Login Gate**:
  - Added a `/login` page to lock access to the main editor application before the user logs in.
  - Extended Next.js `proxy` protection from just the dashboard to the main app (`/`) and internal APIs (`/api/analyze`, `/api/history`, `/api/export`, and `/api/analytics`).
  - Internal APIs now return `401 Unauthorized` when sessions are invalid, rather than permitting unauthenticated requests.
- **Signed Session Authentication**:
  - Replaced simple boolean cookies with HMAC-signed session tokens expiring after 1 day.
  - Added the `src/lib/dashboard-auth.ts` helper for token generation, validation, cookie reading, and password checks.
  - Added optional support for `DASHBOARD_AUTH_SECRET`; if empty, the system falls back to `DASHBOARD_PASSWORD` as the fallback secret.
- **Settings Menu**:
  - Added a `Setting` menu in the editor Activity Bar, positioned right above the dark/light theme toggle.
  - Added local user profiles (`display name`, `role`, and a `UI language` placeholder) under the `Account` section, complete with profile initials in the menu header.
  - Enabled display mode settings (`Light`, `Dark`, `System`), `Auto-save workspace`, `Output Language`, editorial `Strictness`, and `Default metadata`.
  - Moved the logout action into the `Setting` menu.
  - Reused the same `Setting` menu in the analytics dashboard so logout does not appear as a separate button.

### Changed
- **Auth Scope Naming**: Session cookies now use the `eai_auth` name and the `app` internal scope, meaning legacy sessions from the dashboard-only implementation will require logging in again once.
- **Workflow Preferences**: Default metadata is applied when creating new drafts, auto-save can now be toggled off, and strictness and output language are sent to the AI prompt as evaluation context.
- **Documentation**: Updated the README, README Indonesia, `.env.example`, architecture notes, and roadmap to reflect the application login + dashboard setup.

## [0.15.0] - 2026-05-28

### Added
- **Fact-Checking Guardrails**:
  - Implemented smart detection for unsourced factual claims (sensitive numbers, percentages, statistics).
  - Added `verificationStatus` on the feedback schema (`source_backed`, `needs_citation`, `high_risk_factual_claim`).
  - The *Feedback Panel* now bypasses auto-replace (held manually) for high-risk factual data.
  - Automatically injects a `## Verification Notes` warning summary on the final draft if there are unverified facts.

### Fixed
- **Hardcoded Regex Misfire**: Removed the overly aggressive `LOCAL_SUPPRESSION_PATTERN` (such as the words "Indonesia", "Asia Tenggara") that previously accidentally deleted entire paragraphs during remove-target executions.
- **Duplicate Header Prevention**: Refined `ensureTitleAndOpening` detection which previously mistakenly rendered duplicate titles if new AI drafts opened using H2 (`##`).
- **CMS Export Compatibility**: Prohibited H1 titles on the top line of AI output to prevent duplication when exporting to a Headless CMS.
- **Lint Cleanups**: Removed various unused variable declarations (`containsEvaluativeFactualLanguage`, `hasTopLevelTitle`, etc.) post-refactoring.

## [0.14.0] - 2026-05-28

### Added
- **Refined Draft Side-by-Side Workspace**:
  - Merged the Analysis and Final Draft tabs into a single unified **"Refined Draft"** page.
  - Integrated the middle draft panel with a collapsible suggestion card panel (*AI Feedback*) on the right (`w-[380px]`).
  - Animated feedback panel collapse using a minimalist `PanelRight` icon button on the tab bar with standard tooltips.
- **Feedback ↔ Text Interactivity**:
  - **Hover Highlight**: Hovering over suggestion cards instantly highlights corresponding correction segments in the middle panel with a transparent gold style (`bg-[rgba(201,168,76,0.1)] border-[rgba(201,168,76,0.3)]`).
  - **Click Auto-Scroll**: Clicking suggestion cards automatically and smoothly scrolls the screen to the highlighted paragraph/word.
- **Premium Typography (Reading Mode)**:
  - Redesigned the article preview to resemble a Medium page or physical book rather than a programming IDE.
  - Used the premium serif font **Lora** (`var(--font-serif)`), high line height (`leading-[1.85]`), and an optimal reading width of 65 characters (`max-w-2xl mx-auto`).
- **Refined Draft Glossary**:
  - Changed all occurrences of the term "Final Draft" in the user interface to **"Refined Draft"** (status bar, toasts, copy button, headers, and breadcrumbs).
- **Release Prep**: Updated the `CHANGELOG.md` and `package.json` version to **0.14.0**, and prepared Git tags.

## [0.13.0] - 2026-05-27

### Added
- **Smart Internal Linking**:
  - Added functionality to retrieve a list of published articles (up to 50 posts) from the blog API.
  - Added a 2.5-second timeout using `AbortController` when fetching the blog API so EAI remains operational if the blog API is cold starting or down.
  - Updated the `getPolishedDraftPrompt` prompt instructions to insert internal references naturally using the Markdown link format `https://blog.envoyou.com/posts/slug`.
  - Enforced a limit of 2–3 internal links, prioritizing narrative flow over SEO keyword density and avoiding rigid CTA phrases (like "read more" or "click here").

## [0.12.1] - 2026-05-27

### Fixed
- **Streaming Parser & Errors**:
  - Fixed the server-side regex parser to match JSON termination characters before parsing numbers/words, preventing premature parsing values on stream chunks.
  - Client-side transmission error handling now correctly propagates to the main catch block to trigger Toast alerts if the server encounters issues.

## [0.12.0] - 2026-05-27

### Added
- **Streaming Refinement Pipeline**: Added a real-time NDJSON streaming pipeline on the `/api/analyze` route.
  - Server-side incremental parser to parse evaluation data (score, verdict, summary, feedback) and send it incrementally to the client UI safely and robustly.
  - Real-time word-by-word streaming of final draft rewrites (`draft_chunk`).
  - Real-time typing effect on the visual preview and raw markdown with a pulsing cursor effect (`▍` / `animate-pulse`).
  - Interactive streaming simulation in local Mock Mode using realistic delays.
- **Spring Animations & Resizing**: Replaced the CSS Grid layout with a dynamic Flexbox layout on results panels.
  - Integrated Framer Motion `<motion.div>` with `layout` properties and spring configurations (`stiffness: 180`, `damping: 26`) for smooth and elastic panel shifting and expanding.
  - Used `<AnimatePresence>` for premium visual transitions between expanded panels and collapsed sidebars.

## [0.11.0] - 2026-05-27

### Added
- **Motion & Feel Layer**: Integrated `framer-motion` to animate interfaces:
  - Slide down/up accordion height animations on suggestion feedback and SEO metadata blocks in `FeedbackPanel.tsx`.
  - Mobile drawer sidebar with sliding/spring transitions and backdrop fading.
  - Desktop sidebar width collapse/expand animations for smooth layout transitions.
- **Button Micro-Interactions**: Added tactile tap effects (`active:scale-[0.98] transition-all`) to all main system buttons.
- **Editor Quick Actions**: Provided quick action buttons to **"Copy"** (copy raw draft) and **"Clear"** (clear workspace) in the workspace header.
- **Informative Inputs**: Direct input placeholders for target audience and target length in the article metadata section.

### Changed
- **Workspace Layout Expansion**: Configured the Editor to automatically fill 100% of the screen width when results/feedback panels are hidden.

## [0.10.0] - 2026-05-27

### Added
- **Export API Integration**: Added functionality to export final drafts to external systems/CMS (export functionality with source reference tracking and status logging).
- **Export Metadata Extensions**: Added the `coverImageAltText` field to the *FinalDraftPanel* submission logic and the *Export API*.
- **History UI State for Export**: The history sidebar now displays the export status (`exportStatus`) and provides success feedback accompanied by direct links to external admin/CMS pages.

### Fixed
- **Database Type Safety**: Resolved data type mismatch issues by casting metadata to `Prisma.InputJsonValue` during *analysis log* updates.

## [0.9.1] - 2026-05-26

### Changed
- **UI Neutral Theme Alignment**: Aligned all action component colors (such as the *Refine Draft* and *View Final Result* buttons, *Theme Toggle* icon, *New Draft* icon in the sidebar, and *Editor* outlines) to neutral/monochrome modes for a more consistent and elegant appearance across light and dark themes, replacing the previously dominant blue color accents.

### Fixed
- **Code Linting Cleanups**: Resolved lint warnings regarding static component iterations in `FeedbackPanel.tsx` and handled missing dependencies and implicit type declarations (removing `any` types) in the history API route (`/api/history`).

## [0.9.0] - 2026-05-25

### Added
- **History Sidebar Revamp**: The sidebar component now features **Search** (history search) and **Filters** (by status: Approve, Revise, Reject).
- **History Pagination**: Changed client-side history loading to a pagination method (20 items per load) with a **Load More** button interface.
- **Smart Grouping & Delete**: The sidebar automatically groups history into Today, Yesterday, This Week, and Older. Added delete history functionality via the *DELETE* API with a confirmation dialog.
- **Brand Logo Integration**: Integrated the responsive, color-adaptive Envoyou AI Editorial logo (`EAILogo.tsx`) next to the main title.
- **English Localization**: Translated and unified all toast notifications and static sidebar texts into English.

## [0.8.1] - 2026-05-25

### Fixed
- **JSON Sanitization**: Resolved crashes (Error 502) caused by unescaped newlines inside generated JSON strings on the `/api/analyze` route.
- **UI Metadata Rendering**: Fixed `FeedbackPanel.tsx` to properly render `excerpt`, `metaTitle`, and `coverImageAltText`.
- **Markdown Styling Integrity**: Tightened *Polish* mode instructions to forbid H1 (`#`) tags in article content and strictly enforce hierarchical Markdown styling for CMS compatibility.
- **Prompt Refactoring**: Cleaned up legacy code and consolidated instructions (such as the `1-CLICK APPLY RULE`) into reusable constants resistant to reference errors.

## [0.8.0] - 2026-05-25

### Added
- **Single-Flow Polish Pipeline**: Simplified the main experience into a `Paste draft -> Polish Article -> Final Draft + SEO Pack` flow.
- **Final Revised Draft Panel**: Displays the polished AI output ready for pasting, complete with a copy draft button.
- **Change Preview Diff**: Added source paragraph vs polished result comparisons to assist with quick reviews.
- **Response Mode Tracking**: Added `standard`, `compact`, and `manual_fallback` modes to the UI responses and metadata logs.
- **Chunk-Based Rewrite Engine**: Rewrites long drafts section-by-section to reduce truncation on Gemini.
- **SEO Pack Stage**: Split SEO metadata generation into a separate model call for stability and cost-efficiency.

### Changed
- **Product Direction**: Shifted the product from a multi-role evaluator to a simpler core `Polish Article` experience.
- **Prompt Architecture**: Added new editorial guardrails to maintain argument cohesion, reduce hyperbole, prevent number repetition, preserve markdown integrity, and strengthen strategic implications in the conclusion.
- **Gemini Orchestration**: Split the process into three stages:
  - concise review with a light model,
  - final rewrite with a stronger model,
  - SEO metadata generation with a light model.
- **History Hydration**: Article history now reloads `polishedDraft` and `responseMode` from log metadata.

### Fixed
- **Repeated/Truncated Output Handling**: Added fallbacks and stage splits to minimize `MAX_TOKENS`, cut-off JSON, and repeating article outputs.
- **Feedback Layout Overlap**: Fixed the feedback panel overlapping the final draft panel on narrow viewports or long content.
- **Lint Cleanups**: Cleaned up React/TypeScript lint errors on API routes and core components.

## [0.7.0] - 2026-05-24

### Added
- **1-Click Apply Suggestion (Operation Based)**: A revolutionary feature transforming feedback panels into automated editing assistants.
  - Used schema enforcement structures (*Google Structured Outputs / responseSchema*) for 100% stability on the *Gemini backend*.
  - Implemented smart operation types: `replace`, `insert_before`, `insert_after`, and `manual` to prevent accidental draft corruption.
  - Interactive before/after UI in `FeedbackPanel.tsx` displaying text manipulation logic visually.

## [0.6.0] - 2026-05-24

### Added
- **Gemini Role-Based Model Routing**: Transitioned the primary processing engine from Anthropic to Google Gemini with a cost-optimization strategy:
  - `author` mode is powered by `gemini-3.1-flash-lite`.
  - `editor` and `seo` modes are powered by `gemini-3.5-flash`.
  - `fact-checker` mode is powered by `gemini-2.5-pro`.
- Anthropic (Claude) code remains preserved as an optional fallback system configurable via `.env` (`ACTIVE_AI_PROVIDER`).

## [0.5.1] - 2026-05-24

### Changed
- **Workflow Optimization**: Changed the `Category` input to a dropdown menu with specific options for Envoyou blog pillars (Digital Creator, Data & Insights, Finance & Investment, Tech & AI).
- **SEO Metadata Generation**: Highlighted the `seo` mode to automatically generate and display SEO structures (Title, Slug, Meta Description, Tags) in the Feedback Panel.

## [0.5.0] - 2026-05-24

### Added
- **Analytics Dashboard**: Internal dashboard at `/dashboard` for managerial overview, displaying metrics like Total Analyses, Average Score, and Total Warnings.
- **Data Visualizations**: Implemented graphs using `recharts` (Daily Score Trends, Verdict Ratios, and Top Flags).
- **Dashboard Authentication**: Protected the `/dashboard` route with password guards using Next.js `proxy` (replacing `middleware`) and cookies.

## [0.4.0] - 2026-05-24

### Added
- **Fact-Checker Role**: Added a 'fact-checker' role to scan numbers, statistics, organization names, and detect logical fallacies in draft articles.

### Fixed
- **History Sidebar Refresh**: Fixed an issue where the sidebar did not reload recent history after a successful analysis.
- **Error State Sidebar**: Added UI error states to the HistorySidebar if it fails to load data from the database.
- **Prompt Consistency**: Aligned system prompt text with query responses in Indonesian.

## [0.3.0] - 2026-05-24

### Added
- **SEO Role**: Added a new role ('seo') to analyze articles specifically for search engine optimization (SEO).
  - Evaluates search intent, keyword density, content hierarchy (H2/H3), and internal/external linking opportunities.
  - Fully integrated into the `RoleToggle` UI and PostgreSQL `AnalysisLog` logs.

## [0.2.0] - 2026-05-24

### Added
- **History Sidebar**: Sidebar navigating past analysis history with lazy loading details (separate fetch).
- **Dark Mode**: Interface improvements via integrated dark theme (`next-themes`).
- **English Localization**: Translated core interface components and error states into English.
- **Improved UI/UX**: Tooltips for the *New Draft* button and resolved hydration mismatches on `<button>` components.

## [0.1.0] - 2026-05-24

### Added
- **Core Platform**: Initiated the Next.js 16.2 (App Router) project with TypeScript 5 and React 19.
- **Dual Role Evaluator**:
  - **Author (Co-Pilot)** role: Provides constructive feedback on hooks, readability, and draft structure without rejection options.
  - **Editor (Gatekeeper)** role: Scans drafts objectively and strictly for AI-spam, unsourced claims, and style compliance with final decisions (`approve`, `revise`, or `reject`).
- **AI Integration**: Integrated the Anthropic SDK using the `claude-3-5-sonnet-20241022` model with dynamic role-based prompts and article metadata.
- **Mock Mode**: Supported developer mock modes without API keys for feedback simulations without external API calls.
- **Data Validation & Type Safety**: Validated AI JSON output schemas using Zod (`FeedbackOutputSchema`).
- **Database & Audit Logging**:
  - Configured Prisma 7.8 ORM.
  - Designed the Neon PostgreSQL schema with an `AnalysisLog` table to store evaluation audit logs.
  - Implemented automatic logging for both successful responses and system failures.
- **Modern Responsive UI**:
  - Configured global styling using Tailwind CSS v4.
  - Created a draft editor component (`Editor.tsx`) with metadata forms.
  - Created an animated role toggle component (`RoleToggle.tsx`).
  - Created an analysis results panel (`FeedbackPanel.tsx`) showing radial scores, verdicts, feedback checklists, and critical warning flags.
  - Integrated micro-animations using Framer Motion.
  - Integrated interactive toast notifications using Sonner.
- **Documentation**:
  - Internal editorial guidelines file (`editorial-guidelines.md`).
  - Project installation and usage guide (`README.md`).
  - Open-source license file (`LICENSE`).
