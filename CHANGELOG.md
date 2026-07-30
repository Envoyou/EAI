# Changelog

All notable changes to the **Envoyou AI Editorial System** project will be documented in this file.

The format of this file is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Tenant-safe Refine Draft personas**:
  - Incremented `PROMPT_VERSION` to `2.6.0`.
  - Made the shared editorial mission, rewrite role, rewrite priorities, and iterative-refinement role genuinely tenant-neutral; Envoyou-style premium, professional-audience, and strategic-projection defaults no longer live in cacheable core nodes.
  - Moved publication-specific direction to dynamic editorial-profile context, including the tenant primary goal and default language. An explicit article target audience now overrides the profile audience only for that article.
  - Added the standardized workspace context, agent instruction, and research-note summary to both the primary **Refine Draft** rewrite and subsequent iterative refinement requests.
  - Added regression coverage for tenant-independent static prompt prefixes, non-Envoyou persona leakage, audience precedence, and workspace-context wiring.

## [3.20.0] - 2026-07-30

### Added
- **Actionable Content Intelligence (Phase 6.1)**:
  - Added Content Map-specific CSV exports for the inventory and complete bounded intelligence snapshot; the unrelated Analytics CSV/date controls no longer appear on the Content Map route.
  - Added an accessible Base UI right-side draft preview drawer across inventory and intelligence source actions. Draft text is fetched from the existing tenant-scoped History endpoint only after a member requests a preview; the drawer retains an explicit option to continue in the full Workspace.
  - Added source-draft navigation, article comparison, distinct-angle editing, canonical selection, manual-consolidation confirmation, archive, and attributable "not cannibalization" feedback actions.
  - Added migration `20260730090000_add_content_intelligence_actions` for canonical artifact relationships and tenant-scoped decision history. It was applied to the production Neon database on July 30, 2026; Prisma confirmed all 30 migrations are up to date. Consolidation/archive actions only update the Content Memory registry and never delete source drafts or CMS pages.
  - Content Map presentation now prioritizes publication titles, working titles, and article H1 metadata; prompt instructions and editorial-review/export status sentences are rejected as article titles. Legacy display repair is request-time and contaminated vectors are ignored until refreshed.

### Fixed
- **Content Map data clarity**:
  - Added separate article title, topic, editorial stage, registry status, CMS export status, keyword, source, owner, and source action fields instead of presenting editorial review summaries as article identity.

## [3.19.0] - 2026-07-30

### Added
- **Tenant Content Memory and Duplicate Guard**:
  - Added a tenant-scoped canonical registry for Blueprint, Quick Draft, Draft from Notes, manual draft, and analyzed-content artifacts, with rebuildable search documents, expiring generation reservations, and duplicate-decision telemetry.
  - Added deterministic overlap checks before AI generation. Exact content/title matches and active reservation collisions always block duplicate work, while broader topical overlap remains advisory unless the Phase 5 calibration policy explicitly enables enforcement.
  - Added authenticated Content Memory list/check APIs and the localized **Content Map** dashboard so members can discover related work without exposing raw Strategist conversations or full indexed draft bodies.
  - Added migration `20260729180000_add_content_memory_registry`, including tenant-safe indexes and backfill from attributable `AnalysisLog` and completed Blueprint records. The migration was applied to the production Neon database on July 29, 2026; Prisma confirmed all 27 migrations are up to date.
  - Added Phase 3 hybrid retrieval with tenant-filtered PostgreSQL full-text/trigram candidates and 768-dimensional pgvector cosine search. Gemini embeddings are generated asynchronously by idempotent BullMQ jobs, versioned by model/source hash, retried with bounds, and excluded when stale.
  - Added Phase 4 structured overlap classification for ambiguous candidates through a dedicated PCA composer and per-function Admin AI runtime override. The classifier reports common/different elements and alternative angles but cannot return `exact_duplicate` or hard-block a request.
  - Injected collaboration-safe related-content metadata into Blueprint, Quick Draft, and Draft from Notes prompts so generation can avoid covered angles without treating internal artifacts as factual sources.
  - Added migration `20260729210000_add_content_memory_semantic_retrieval` for pgvector, pg_trgm, HNSW/full-text indexes, embedding lifecycle fields, and classifier/retrieval telemetry. It was applied to the production Neon database on July 29, 2026; Prisma confirmed all 28 migrations are up to date.
  - Added Phase 5 controlled enforcement for calibrated high-confidence probable duplicates. Enforcement requires an owner-controlled feature flag, a deterministic tenant rollout cohort, at least 50 explicit human labels, and measured precision of at least 95%; otherwise decisions remain advisory or shadow-only.
  - Added explicit override and human feedback flows for Blueprint, Quick Draft, and Draft from Notes, plus tenant-scoped enforcement metrics. Canonical duplicates and reservation collisions remain non-overridable.
  - Added migration `20260729223000_add_content_memory_controlled_enforcement` for enforcement decision metadata and attributable human feedback. It was applied to the production Neon database on July 29, 2026; Prisma confirmed all 29 migrations are up to date.
  - Added Phase 6 Content Intelligence with bounded tenant-scoped topic clustering, cannibalization risks, evidence-backed content gaps, freshness/consolidation recommendations, and internal-link opportunities in the bilingual Content Map.
  - Content Intelligence analyzes at most the 300 most recently updated artifacts, uses cross-language semantic pairs when current vectors exist, falls back to collaboration-safe metadata, collapses lifecycle families for pair recommendations, and does not invoke an additional LLM. The snapshot is derived at request time and requires no database migration.

### Fixed
- **Actionable Editorial Preview Feedback**:
  - Required every Final Quality Gate warning/failure to carry a concrete next-step suggestion and instructed the model to include exact structural target text whenever it can be identified safely.
  - Normalized incomplete provider output with a manual-review suggestion so valid feedback can no longer render as a diagnosis-only card.
  - Added `Revise with EAI` for findings without target text and `Accept as editorial decision` for non-factual warnings. Factual/source-risk and blocking findings remain non-accepting and must be revised or verified.
  - Routed targetless EAI revisions through the current Final Draft refinement workflow and its Quality Gate, avoiding an unnecessary Full Analyze pass.
- **Cancelable, Single-Flight Editorial AI Lifecycle**:
  - Kept the title-bar Cancel action visible for the complete Analyze/Refine lifecycle, including rewrite, validation, Quality Gate, SEO, and finalization, instead of tying it to the transient `analysis.status === "loading"` state.
  - Preserved and restored the last completed analysis and source-draft snapshot when a repeated analysis, refinement, Quality Check, or SEO request is cancelled.
  - Added AbortController-backed single-flight guards across Analyze, Refine, targeted fixes, Quality Check, SEO, Prepare, and Draft from Notes, and disabled conflicting Final Draft actions while an editorial AI request owns the workspace.
  - Kept controller ownership until each cancelled request reaches its own `finally` block, preventing a rapid cancel/restart from letting an older request clear the newer request's lifecycle state.

## [3.18.0] - 2026-07-29

### Added
- **Per-Function Runtime AI Configuration**:
  - Expanded the internal Admin Console AI configuration from one workspace-wide provider/model override to a versioned default plus independent overrides for Strategist Fast Chat, Search Chat, Greeting, Data Analysis, Blueprint, Deep Research, Quick Draft, Draft from Notes, and the Analyze Review, Rewrite, Refine, SEO, Quality Gate, and Targeted Fix stages.
  - Added runtime provider/model routing for Gemini, Groq, and OpenRouter across eligible functions, with Gemini-only capability guards for Google Search, grounded Blueprint generation, and Deep Research.
  - Added a confirmation step, model presets, effective-runtime previews, cache invalidation, audit logging, legacy `provider:model` compatibility, and resolver regression tests.
  - Reused the existing `aiProviderOverride` column with a versioned JSON payload, so this feature does not require a database migration.
- **Durable Strategist Blueprint Request Idempotency**:
  - Added a client-generated UUID to each blueprint generation request and a persisted `StrategistPlanRequest` lifecycle (`pending`, `completed`, or `failed`).
  - Added an authenticated blueprint request-status endpoint so the frontend can reconcile an ambiguous network outcome without starting another AI generation.
  - Added migration `20260728090000_add_strategist_plan_idempotency`, applied to the production Neon database on July 28, 2026.
- **Fast Chat Request Lifecycle and Recovery**:
  - Added UUID-based Fast Chat request claims with persisted `pending`, `completed`, and `failed` states plus an authenticated recovery endpoint.
  - Added safe provider failure codes for rate limits, temporary unavailability, timeouts, cancellation, and uncategorized chat failures without exposing raw provider payloads.
  - Added migration `20260729010000_add_strategist_chat_lifecycle`, applied to the production Neon database on July 29, 2026.

### Changed
- **Branded Frontend Loading Indicators**:
  - Replaced Lucide `Loader2` across 55 loading render sites in 28 frontend modules—including pages, panels, buttons, payment status, and Sonner notifications—with the shared `EAILoaderLogo` through the semantic `EAILoaderStatusIcon`.
  - Redirected the compatibility alias `LoadingStatusIcon` to the same branded loader and removed consumer-level `animate-spin` classes because the shared component owns its animation.
- **Consistent Strategist Saved-Artifact Cards**:
  - Aligned the Notes and Deep Report summary cards around the same surface, spacing, hover, segmented delete action, and semantic icon contract while preserving their distinct workflows: Notes remain inline accordions and Deep Reports continue to open in the dedicated reader.
  - Replaced the clickable Notes container with an accessible Button trigger using `aria-expanded` and `aria-controls`, and kept its draft-selection checkbox as a separate sibling control.

### Fixed
- **Progressive Strategist Thinking and Answer Reveal**:
  - Added a shared adaptive typewriter queue for Strategist reasoning, Search grounding summaries, streamed text, and final replacement responses, with lifecycle-safe cancellation, session switching, and `prefers-reduced-motion` support.
  - Rendered progressive reasoning and grounding lines through bounded Markdown/GFM components so headings, emphasis, lists, quotes, inline code, and links no longer appear as raw Markdown syntax in Strategist chat.
- **Strategist Response Footer Synchronization and Separator Contrast**:
  - Delayed sources, message actions, and suggested follow-up buttons until both the response stream and progressive text reveal are complete, preventing the footer controls from appearing ahead of the answer.
  - Reduced the visual intensity of Markdown horizontal rules inside Strategist chat responses so separators remain subordinate to the content.
- **Tenant-Scoped Strategist Sessions and Request Recovery**:
  - Scoped Strategist session listing, detail loading, rename, pin, deletion, Chat continuation, and Blueprint continuation to both the authenticated user and active organization, preventing the same user from carrying a previous brand's session into another tenant.
  - Added `organizationId` to durable Chat and Blueprint idempotency records so status polling, replay, retry claims, and failure reconciliation cannot cross tenant boundaries.
  - Added migration `20260729143000_scope_strategist_records_to_tenant`, which backfills existing request records only through an attributable `ChatSession`; un-attributable records remain in the personal/null scope rather than being guessed from the user's current tenant. Applied it to the production Neon database on July 29, 2026.
- **Backend Strict Type-Check Regressions**:
  - Corrected the Quality Resolution ledger fixture contract, widened the Onboarding persistence fixture to its canonical input type, made the History Pinning source test compatible with the backend's CommonJS configuration, and safely narrowed unknown Greeting JSON before returning it.
- **Unambiguous Gemini Grounding Guard**:
  - Renamed the global Search/Deep Research kill switch from `GEMINI_DISABLE_GROUNDING_FOR_TESTS` to `GEMINI_DISABLE_GROUNDING`, clarified that it is independent of mock chat and applies in every environment, and aligned Strategist model routing, thinking mode, diagnostics, and credit charging with whether Search is actually enabled.
- **False Blueprint Failure and Duplicate Generation**:
  - Prevented a successfully persisted blueprint from being reported as failed when the response was lost or truncated between the backend and browser.
  - Made repeated submissions with the same request UUID replay the committed result or report the in-progress operation instead of generating and storing a duplicate blueprint.
  - Persisted the user message, assistant blueprint, and completed request result in one database transaction so chat history and request status cannot diverge.
  - Preserved rolling-deployment compatibility by generating a server-side UUID for older frontend bundles that do not yet send a request ID.
- **Orphaned Strategist Messages After Failed AI Streams**:
  - Deferred Fast Chat message persistence until AI generation succeeds, then committed the session timestamp, user message, assistant response, and completed request result atomically.
  - Replayed an already committed response when the same chat request UUID is received again and reconciled lost responses from the frontend without another AI call.
  - Prevented duplicate credit deductions for retries of the same Fast Chat request.
  - Propagated Gemini SSE error/completion failures and empty completed streams through the existing Flex retry policy, including failures raised after the stream was opened, and preserved safe provider-specific failure categories for recovery.
  - Added a bounded native Models API fallback when Gemini Interactions ends a Fast Chat stream without answer text. Search requests retry through native Google Search grounding instead of repeating the failing Interactions tool-call path; if grounding also fails, the response degrades transparently to a non-search answer and no Search credit is deducted. Terminal diagnostics remain sanitized and exclude prompts and generated content.
  - Routed Search-enabled Fast Chat through `gemini-3.6-flash` (configurable via `GEMINI_STRATEGIST_SEARCH_MODEL`) while retaining Flash-Lite for chat without Search, preventing `requires_action` / `malformed_tool_call` failures observed when Flash-Lite attempted Google Search through the Interactions API.
  - Replaced the blueprint request's expected unique-constraint exception flow with conflict-free `createMany({ skipDuplicates: true })` claiming, eliminating misleading Prisma `P2002` error logs.

## [3.17.0] - 2026-07-26

### Added
- **Real-Time Gemini Reasoning Stream in Onboarding**:
  - Upgraded `/api/onboarding/discover` to stream real-time Gemini AI thinking thoughts (*Chain of Thought*) via Server-Sent Events (SSE).
  - Integrated `ReactMarkdown` rich text rendering for reasoning stream lines in `OnboardingWizard`, formatting bold text, inline code, and headers without raw Markdown symbols.
  - Implemented a smooth typewriter stream queue (18ms interval) with adaptive token popping and smooth auto-scrolling.
- **Permanent Onboarding Metadata Persistence & Admin Marketing Insights**:
  - Added Prisma database fields `User.onboardingRole` (descriptive editorial role), `Organization.acquisitionSource` (acquisition channel), `Organization.acquisitionSourceOther` (channel details), `Organization.primaryGoal` (workspace objective), and `Organization.onboardingCompletedAt` (completion timestamp).
  - Applied migration `20260726132147_persist_onboarding_metadata` to synchronize Neon database schema.
  - Added Zod invariant schema validation in `@eai/shared` requiring `acquisitionSourceOther` min 2 characters when `acquisitionSource === 'other'`.
  - Added canonical label dictionaries `USER_ROLE_LABELS`, `ACQUISITION_SOURCE_LABELS`, and `PRIMARY_GOAL_LABELS` in `@eai/shared`.
  - Added `acquisitionSourceOther` text input in `OnboardingWizard` Q4 and live preview rendering in onboarding sidebar.
  - Implemented an **Onboarding & Marketing Insights** section in `OrganizationDetailDrawer` (`/admin/users`) displaying self-reported role, acquisition channel & detail, primary goal, publication name, domain, and onboarding activation timestamp.
  - Added comprehensive backend contract persistence unit tests in `apps/backend/src/routes/__tests__/onboarding-persistence.test.ts`.

### Changed
- **Onboarding UI Redesign & Clerk Standards Compliance**:
  - Redesigned the onboarding workspace shell to match the floating multi-island IDE layout with Inter typography and proper token contrast (`bg-[var(--card)]`, `inset 0 0 0 1px var(--card-border)`).
  - Added bounded composite class `.onboarding-goal-card.ui-btn` in `composite-controls.css` to override pill shape and prevent card text distortion.
  - Replaced field icons with Lucide `Goal`, `Rss` (Publication Website), and `Languages` (Primary Language).
  - Expanded reasoning stream container to full-width frameless layout without inner sub-card borders or background constraints.
- **Activation Endpoint Idempotency & Strict Null Handling**:
  - Updated `POST /api/onboarding` in backend to set strict `null` for unprovided marketing/role answers during activation or skip (preventing fake default fallbacks in analytics).
  - Enforced activation idempotency: if workspace onboarding is already completed (`onboardingStatus === 'completed'`), returning existing active state cleanly without re-activating or creating duplicate `EditorialProfile` or `EditorialProfileVersion` records.
- **Frontend Test Suite Ratchet**:
  - Updated `LegacyFeatureFormControls.test.ts` to assert 3 surface `<Input>` components and 7 `variant="surface"` occurrences in the onboarding activation step.

## [3.16.0] - 2026-07-25

### Added
- **Convergent Final Draft Quality Workflow**:
  - Added a persistent quality-resolution ledger in analysis metadata so accepted, applied, or verified warnings can be reconciled on later Quality Check runs without suppressing newly introduced issues.
  - Added exact trusted-source URL reuse for editor-verified external links and stored research-note reuse during standalone Quality Check.
  - Added an explicit **Keep current metadata** action when publication metadata is stale, allowing an editor to confirm that the existing SEO package still applies to the current saved draft.

### Changed
- **Source-Safe Targeted Fixes & Quality Decisions**:
  - Targeted Fix now receives the original draft and stored research notes, validates the candidate replacement for newly introduced numbers, entities, and URLs, and retries once with corrective guidance before rejecting an unsafe change.
  - Final Quality processing now prioritizes combined model and deterministic findings, retains up to 12 actionable items, and derives readiness consistently: any failure is `blocked`, warnings require `needs_review`, and a clean result is `ready`.
  - Publication metadata confirmation records the editor decision for the active saved body without changing metadata values or bypassing Quality Check. Any later body mutation makes the package stale again.

### Fixed
- **Repeated Quality Gate Feedback Loop**:
  - Prevented previously resolved warnings from reappearing indefinitely when their category and target remain unchanged, while preserving all failure-level findings and materially changed warnings.
  - Prevented editor-verified source links from being repeatedly flagged solely because a later standalone Quality Check did not receive the earlier verification context.
  - Allowed editors to resolve the stale-publication-metadata warning through explicit confirmation instead of being forced to regenerate still-relevant SEO metadata.
  - Distinguished acceptance without a body change from applied rewrite/remove actions: accepted decisions can become ready immediately, while body changes are labeled as pending Quality Check and use the backend readiness/package status as authoritative state.
  - Corrected the Feedback panel counter to report unresolved and resolved checks separately, and relabeled retained flags as pending recheck after a handled finding changes the draft.
- **Production Strategist Thinking Stream**:
  - Explicitly enabled Gemini Interactions thought summaries for production chat. Grounded chat uses medium thinking, while chat without Search uses low thinking.
  - Added a tested adapter from Gemini `thought_summary` deltas to the shared Strategist `thinking` SSE event, while retaining the static fallback for simple prompts where the provider returns no summary.
- **Deterministic Quality Checker & Link Provenance Pipeline**:
  - Added URL number extraction from raw source link paths and filenames (e.g., `2025` in `/2025/06/16/` or `Q3-2025.pdf`), eliminating False Positive `Unsupported Quantitative Claim` when year or quarter numbers are present in raw source links.
  - Enhanced domain entity alias extraction to whitelist acronyms derived from domain roots (`gggi.org` -> `GGGI`, `undp.org` -> `UNDP`) for domains up to 12 characters, and added entity word extraction from raw source URLs to eliminate False Positive `Unsupported Entity Detail`.
  - Added `SDG` and `SDGs` to `GENERIC_PROPER_NAMES` and filtered out quarter/date labels (e.g., `Q3-2025`) from novel entity detection.
  - Scoped `trustedInternalUrls` in `analyze.ts` strictly to published posts returned by `selectRelevantPublishedPosts` (the exact catalog provided to the rewrite LLM) using `buildCanonicalInternalPostUrl`.
- **Boundary-Aware Chunk Joining & Calibrated Structural Integrity Audits**:
  - Added `joinRewrittenChunks` to inspect Markdown block boundaries (`\n\n`, headers `#`, fences ```` ``` ````, list items, and sentence punctuation) before joining chunks, preventing malformed sentence concatenation (e.g. `mandates.The`).
  - Added severity-calibrated structural integrity checks: `detectMissingSentenceBoundaries` emits a `warning` (`Missing Sentence Whitespace`), while `detectContentAfterReferences` emits a `fail` (`Content After References`).
- **Prisma Schema Migration & Auto-Save Fix**:
  - Applied migration `20260724043000_add_analysis_log_pinning` (`ALTER TABLE "AnalysisLog" ADD COLUMN "isPinned" ...`) to Neon PostgreSQL database, resolving `P2022 ColumnNotFound` errors during auto-save and history queries.
  - Fixed TypeScript strict null narrowing error on `editorialProfile.config.internalLinkBaseUrl` in `analyze.ts`.

## [3.15.0] - 2026-07-24

### Added
- **Adaptive Action Menus & Draft Pinning**:
  - Added a shared `AdaptiveActionMenu` primitive that renders a portalled dropdown on desktop and the same actions in a bottom sheet on mobile.
  - Added persistent pinning for Draft History, including pinned-first API ordering, optimistic UI updates, and an indexed `AnalysisLog.isPinned` database field.
  - Added Pin, Rename, and Delete actions to each saved Draft History row.
- **Semantic Icon Tokens & Action Controls**:
  - Added tree-shakeable semantic icon catalogs grouped by intent domains (`ai`, `actions`, `navigation`, `status`, `content`, `entities`, and `editor`) so feature code can reference purpose-oriented tokens instead of icon geometry names.
  - Added a canonical `ActionButton` wrapper that composes the global Button primitive with semantic icons, accessible labels, and consistent loading behavior.
  - Added an architecture decision record and regression ratchets that prevent the legacy direct Lucide import inventory from growing during the bounded migration.
- **Revision-Safe Publication Workflow**:
  - Added standalone **Quality Check** and **Regenerate SEO** operations for the saved final draft, without invoking the rewrite pipeline.
  - Added editable final-draft and publication-metadata controls. Saving a body revision invalidates the previous quality decision and SEO package; saving metadata binds it to the quality-approved current draft.
  - Added server-side export guards and persisted workflow states so body-changing feedback fixes require a content recheck, while accepted non-body warnings do not force another full Analyze cycle.
- **Production-Parity Strategist Chat Mock Protocol**:
  - Added a shared Strategist chat event protocol for production and mock streams, including thinking, grounding-source, suggestion, completion, error, and Deep Research lifecycle events.
  - Added opt-in backend mock chat configuration (`ENABLE_MOCK_CHAT`, `MOCK_CHAT_SPEED`) and the matching frontend route switch (`NEXT_PUBLIC_MOCK_CHAT`) without changing the production endpoint contract.
  - Added integration coverage ensuring mock streams remain compatible with the same protocol consumed by the production chat UI.
- **Persistent Deep Research Report Library**:
  - Added a dedicated **Deep Report** tab to the Strategist Copilot, replacing the transient report modal with a persistent per-document report library.
  - Reports are saved automatically, support copy/download/delete/discuss actions, and retain up to five reports. When full, the UI prompts users to remove an older report before another report can be stored.
  - Added report-aware follow-up context so saved research can be reopened and continued in Chat with EAI.

### Changed
- **Consistent Three-Dot Menus**:
  - Migrated Strategist session actions and User Directory admin actions to the shared adaptive menu behavior.
  - Tightened vertical spacing between Strategist chat-session rows while retaining their title, date, and pinned state.
- **Adaptive Workspace & Final Draft Controls**:
  - Consolidated the analysis mode selector into the global adaptive Select primitive, using a desktop popover and mobile bottom sheet without duplicate local state or markup.
  - Extended the global Popover content primitive with an opt-in mobile menu sheet, then migrated Final Draft's categorized More Actions menu to use it.
  - Standardized the semantic intent of Refine Draft, Prepare, EAI Chat, Copy, Edit, Export, and More Actions controls; Prepare now remains icon-visible on mobile and shows its text label on desktop.
- **Strategist Streaming & Responsive UI Contracts**:
  - Split the Strategist chat path selection into `useStrategistChatPath.ts`, keeping mock and production route selection isolated from the main content hook.
  - Expanded the chat presentation for distinct thinking, grounded-source, suggestion, and Deep Research states while retaining the same responsive Copilot layout on desktop, tablet, and mobile.
  - Changed source citations to a borderless disclosure that expands all links in a vertical list, allowed long suggested actions to wrap, and reduced the mobile Copilot tabs and chat toolbar to icon-only controls while retaining accessible labels and desktop text.
  - Added bounded domain selectors for composite controls whose rectangular/card visuals intentionally differ from the pill-shaped Button primitive. These selectors load after primitive styles and avoid `!important`.
- **Content Strategist Direct API Fetch Alignment & Referential Stability**:
  - Aligned Deep Research status polling (`GET /api/strategist/chat/status/:id`) and cancellation (`POST /api/strategist/chat/status/:id/cancel`) in `useContentStrategist.ts` from relative `fetchWithTimeout` (Next.js proxy) to `directFetch` (Railway API).
  - Wrapped `directFetch` in `useCallback` in `useDirectFetch.ts` to ensure function reference stability across re-renders, preventing infinite effect re-triggers and timer resets.
  - Added URL encoding (`encodeURIComponent`) to interaction IDs, preserved per-request timeout protection (`REQUEST_TIMEOUT_MS.polling` = 20s for status polling, `8_000ms` for cancel), and added nuanced UX error feedback on cancellation timeout.
- **Gemini Model Upgrade & Interactions API Migration**:
  - Upgraded primary Gemini model from `gemini-3.5-flash` → `gemini-3.6-flash` across all editorial roles (`polish`, `editor`, `fact-checker`, `author`, `generate-plan`, `draft-from-notes`, and Deep Research) in `model-router.ts`, `helpers.ts`, and `provider-runtime.ts`.
  - Upgraded lightweight/copilot model from `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite` for `seo`, `author`, fast-mode roles, and Strategist Copilot Chat (`MODEL` in `helpers.ts`).
  - Updated legacy fallback mapping in `helpers.ts` (`resolveModel`) to route deprecated models to `gemini-3.6-flash`.
  - Registered pricing and telemetry entries for `gemini-3.6-flash` and `gemini-3.5-flash-lite` in `pricing.ts` and `ai-telemetry.ts`.
  - Migrated Strategist Quick Draft Gemini path (`quick-draft.ts`) from the legacy `generateContent` API to the Interactions API (`gemini.interactions.create()` with `stream: true`), bringing it in line with `chat.ts` and `plan.ts`.
  - Updated streaming event loop in `quick-draft.ts` to use `step.delta` / `content.delta` event handling instead of raw chunk iteration.

### Fixed
- **Mobile Sidebar Auto-Close**:
  - Closed the global workspace and admin navigation drawers immediately after a mobile navigation link is selected.
  - Closed Draft History on mobile after selecting an existing draft, resuming an unsaved draft, or creating a new article, while leaving desktop sidebars and non-navigation actions unchanged.
- **Strategist Session Actions Menu**:
  - Raised the portalled Pin/Rename/Delete menu positioner above the workspace panel stacking layer so the three-dot menu remains visible and interactive.
  - Migrated the session menu trigger to the canonical Button primitive with a larger consistent hit target and a session-specific accessible label.
- **Strategist Copilot Tab Separator**:
  - Removed overlapping borders from individual Copilot tab buttons and the Feedback tab wrapper, retaining one container-owned separator and one outer panel outline.
  - Rendered the active Chat, Feedback, Notes, or Deep Report indicator as a single 1px line over that separator for consistent visual weight.
- **Final Draft Editor Scrolling**:
  - Constrained the Edit Final Draft textarea to a viewport-aware height with internal scrolling, preventing long articles from expanding into the panel's clipped overflow area.
  - Added clear spacing between the Final Draft action row and the editor card.
- **Strategist Dark Theme & Composite Hover Cascade**:
  - Corrected saved-note Markdown typography tokens so headings, emphasis, lists, tables, and links remain readable in dark mode.
  - Fixed Deep Report list hover styling so the entire report card, including its delete action, changes as one surface instead of showing a nested pill hover.
  - Audited post-v3.14 primitive cascade conflicts and began a bounded migration of Copilot tabs, Notes actions, Feedback accordions, and public toggle controls without reintroducing nuclear `!important` overrides.
- **Strategist Chat Thinking Display Not Rendering**: The `thought_summary` delta from the Interactions API uses a nested `delta.content.text` field instead of the flat `delta.text` field used by text deltas. The streaming loop in `chat.ts` now correctly detects `deltaType === 'thought_summary'` and emits a `{ type: 'thinking', chunk }` SSE event, which the frontend (`useContentStrategist.ts` + `ChatMessageList.tsx`) already expects — making the real-time thinking display functional for the first time.

## [3.14.0] - 2026-07-23

### Changed
- **Mobile UX Refinements & Onboarding Design Token Audit**:
  - **AI Chat Output Formatting & Dark Mode Contrast**: Removed AI assistant message card background bubble (rendering background-transparent while preserving user message bubbles as `surface-2`). Fixed dark mode typography contrast for headings (`h1`-`h4`), bold text (`strong`), table headers/cells (`th`, `td`), and external links (`a`) in `ChatMessageList.tsx` and `prose.css`.
  - **Mobile Horizontal Swipe Indicators Across Admin Tables**: Added responsive swipe helper text (`Swipe horizontally to view all columns`) above user directory, tenant ledger, and audit log tables across `/admin/users`, `/admin/tenants`, and `/admin/audit-logs`.
  - **Universal Mobile Sidebar Backdrop Oval Fix**: Fixed giant circle backdrop overlay bug on mobile devices by enforcing `border-radius: 0 !important;` on `.workspace-page-sidebar-backdrop` in `responsive.css`.
  - **TipTap Text Wrapping on Mobile**: Fixed long typed text overflowing canvas width in `/workspace` by enforcing `white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; min-width: 0;` on `.ProseMirror` and editor container nodes in `editor.css` and `Editor.tsx`.
  - **Icon-Only Metadata Collapse Button & Responsive Header**: Transformed editor metadata toggle button in `Editor.tsx` into a compact icon-only control (`size="icon-xs"` with `ChevronUp`/`ChevronDown`), and hid the header subtitle (`hidden sm:block`) to prevent header clipping on narrow mobile viewports.
  - **Onboarding UI & Design Token Audit**: Standardized color tokens (`text-[var(--primary)]`, `bg-[var(--primary)]/10`, `hover:text-[var(--error)]`), updated onboarding step navigation border to `border-b lg:border-b-0 lg:border-r` for mobile 1-column layouts, and optimized primary goal option card heights in `OnboardingWizard.tsx` and `OnboardingOrganizationGate.tsx`.
- **Multi-Island Floating Workbench for `/workspace` (Option A)**:
  - Upgraded `/workspace` panel architecture into a Multi-Island Floating Workbench where the Editor Canvas (`.workspace-center-panel`) and AI Strategist Copilot (`.workspace-right-panel`) render as distinct, floating island cards (`rounded-2xl`, `border`, `shadow-xs`, `bg: var(--card)`).
  - Separated the panels with a clean `10px` outer gap resize handle, letting the outer background canvas (`#0b0b0a` in Dark Mode) show through between panels for maximum visual breathability matching `/dashboard` and `/settings`.
- **Modern Floating Island Layout (VS Code Modern UI & Kimi Aesthetic)**:
  - Transformed the app workspace shell into a modern card-based floating island architecture with outer canvas padding (`10px`), gap spacing (`10px`), floating rounded panels (`rounded-2xl` / `16px`), subtle borders (`border border-[var(--border)]`), and soft elevation shadows.
  - Sidebar panel and main workspace container now render as distinct floating island cards over the outer canvas background, providing clear visual separation and modern desktop app aesthetic.
- **Complete Raw Button Migration & Final System Validation (Phases 1-4 Complete)**:
  - Achieved 100% codebase migration of raw `<button>` elements to the canonical `Button` API (`@/components/ui/button`) and polymorphic `render` prop across all 41 feature files in `apps/frontend/src/`.
  - Locked primitive ownership and 0 raw button policy across the entire repository via expanded `PrimitiveStyleOwnership.test.ts` and `ShellAndWorkspaceControls.test.ts` unit test suite (144/144 tests passing).
  - Validated full production compilation (`npm run build`) for Next.js 16 frontend and Express backend, clean ESLint, zero TypeScript errors (`npx tsc --noEmit`), and clean `git diff --check`.
  - Integrated `@shadcn/message-scroller` into Strategist Chat, replacing manual scroll logic with `MessageScrollerProvider`, `MessageScrollerViewport`, and `MessageScrollerContent` while preserving custom bubble styling and adding `ChatPositionIndicator` and `TranscriptOutline` (using `useMessageScrollerVisibility` and `useMessageScroller`).
- **Canonical Status & Callout APIs**:
  - Added regression-tested semantic `muted`, `surface`, `primary`, `success`, `warning`, and `danger` variants to Badge, plus `xs` sizing and polymorphic link rendering.
  - Added semantic `primary`, `success`, `warning`, `danger`, and `muted` Alert variants with polymorphic rendering for animated surfaces.
  - Migrated all feature-level direct `ui-badge` and `ui-alert` composition to the canonical primitives across workspace readiness, dashboards, billing/admin, strategist sources, and feedback/error states.
  - Corrected interactive badge-styled model presets and source-expansion controls to canonical Button semantics.
- **Canonical Form-Control API**:
  - Added regression-tested `default` and `surface` variants to the shared `Input`, `Textarea`, and `SelectTrigger` primitives; `surface` preserves the existing filled `ui-control` visual contract during incremental migration.
  - Migrated all Support Form text fields, its honeypot field, and both actions from raw elements/direct visual classes to canonical component APIs.
  - Migrated Billing Details Form's legal-name, NPWP, address, and save controls; corrected the address textarea's previous use of input-specific legacy styling.
  - Migrated General and Defaults Settings to canonical surface inputs and select triggers, removing all direct legacy control classes from both pages.
  - Migrated the Usage ledger search and Workflow language trigger while intentionally retaining the native auto-save checkbox as a specialized control.
  - Migrated the Editor metadata category, article type, audience, target length, and writing-instruction fields to canonical surface controls while retaining the raw Markdown canvas as an editor-owned control.
  - Migrated AI Config, Audit Logs, and Billing Admin text-like fields to canonical surface controls; replaced the final raw admin select with the adaptive Select API while preserving privileged-operation review and confirmation flows.
  - Migrated Final Draft revision instructions, Onboarding activation fields, and Feedback source entry to canonical surface controls, eliminating direct legacy form-control class composition from feature code.
  - Migrated the remaining standard text-like controls across History, User Directory, Strategist session rename, Bubble Menu link editing, and subscription cancellation while preserving inline keyboard, privileged-form, and editor control boundaries.
  - Added canonical Base UI Checkbox and Switch primitives plus a native-semantics FileInput boundary; migrated Notes, cancellation reasons, Publication Identity, Workflow auto-save, Dashboard dates, and the auto-resizing Chat composer, leaving only the documented Editor Markdown canvas exemption.
  - Recorded the remaining raw-field and legacy-control inventory in the UI architecture plan to guide bounded feature-by-feature migration.
- **Canonical Button API**:
  - Consolidated the Base UI `Button` wrapper and global `ui-btn` visual contract into one semantic component API with `primary`, `outline`, `surface`, `muted`, `accent`, `danger`, and `link` variants.
  - Preserved the previous shadcn-style variant names as compatibility aliases, migrated AI Preview and existing primitive consumers to semantic variants, and added focused variant/size regression coverage.
  - Migrated all eight Tiptap Bubble Menu actions to the canonical API, isolated the toolbar with `not-prose`, and exposed formatting toggle state through `aria-pressed` with focused regression coverage.
  - Removed all remaining direct `ui-btn` composition from feature code across admin, settings, billing, workspace/editor, onboarding, strategist, history, and feedback surfaces; added a source-level ownership regression contract while recording the remaining raw-button inventory for bounded follow-up.

### Fixed
- **CSS Architecture Refactoring & Cascading Reset Fix**:
  - Eliminated nuclear reset (`* { border-color: transparent !important; }`), replacing it with a safe cascade reset (`@layer base { * { @apply border-border outline-ring/50; } }`).
  - Reduced `!important` statements across the CSS codebase from 113 down to 7 (a 94% reduction), retaining `!important` strictly for library-injected inline style overrides (`react-resizable-panels`).
  - Refactored `.strategist-prose` (~45 `!important`s) and `.prose` table styles (~13 `!important`s) using `@layer components` and `:where()` zero-specificity selectors.
  - Modularized the monolithic CSS codebase into 12 domain-based stylesheets under `src/app/styles/components/` (`buttons.css`, `forms.css`, `cards.css`, `badges.css`, `menus.css`, `feedback.css`) and `src/app/styles/workspace/` (`shell.css`, `sidebar.css`, `editor.css`, `strategist.css`, `chrome.css`, `responsive.css`), with `globals.css` acting as the master import manifest.
  - Added semantic `--shadow-drawer` elevation token in `tokens.css`, fixing missing mobile drawer elevation shadows.
  - Synchronized JS `isMobile` resize detection (`< 768px`) with CSS mobile/tablet layout breakpoints.
- **Editor Link Overlay Architecture**:
  - Replaced manual bounding-rectangle and scroll-offset positioning with a controlled Base UI popover anchored directly to the hovered link.
  - Portaled the overlay with fixed, collision-aware positioning; isolated it from article typography; and migrated edit, remove, cancel, save, and input controls to canonical component APIs.
  - Added regression coverage preventing a return to absolute coordinate arithmetic or raw overlay controls.
- **Editor UI Style Boundary**:
  - Isolated AI Preview controls from Tiptap article typography with a `not-prose` control boundary while preserving Markdown heading, link, table, and code rendering in the sibling content region.
  - Removed inline Accept/Reject color workarounds and the broad dark `.prose a` `!important` override.
  - Added a semantic light/dark `--editor-link` token wired through Tailwind Typography's normal and inverted link variables, plus a focused regression contract.
- **Clerk Middleware Async Guard (`proxy.ts`)**:
  - Added missing `await` to all three `auth.protect()` calls inside `clerkMiddleware` in `src/proxy.ts` (lines 88, 108, 112). In `@clerk/nextjs` v7+, `auth.protect()` is async; omitting `await` caused unhandled promise rejections logged as `unhandledRejection: Error: NEXT_REDIRECT` in the dev console, even on successful authenticated requests.

## [3.13.0] - 2026-07-19

### Added
- **Cost-Controlled Gemini Testing**:
  - Added a shared Gemini request policy for opt-in Standard/Flex inference across both GenerateContent and Interactions API call shapes.
  - Added configurable 15-minute Flex timeouts and bounded exponential backoff for capacity-only `429`/`503` failures, without automatic fallback to full-price Standard traffic.
  - Added an explicit staging guard that removes separately billed Google Search grounding and blocks Deep Research before credits are deducted.
  - Added regression coverage for service-tier forwarding, retry boundaries, timeout configuration, and Flex-aware pricing telemetry.
- **Publication Contract & Visual Policy**:
  - Added `workingTitle`, `PublicationPackage`, and `publicationPackageStatus` (`not_generated`, `current`, `stale`) contracts across shared types, analysis persistence, history restore, and export validation.
  - Added a reusable `VisualFormatSelectionPolicyNode` that defaults to prose and selects Mermaid, tables, numbered lists, or bullets only when the source structure justifies them.
  - Added regression coverage for H1-free CMS bodies, Fast/Publish title semantics, unsafe visual summaries, publication-field feedback safety, and API/KPI acronym handling.
- **Security & Ledger Infrastructure**:
  - Added `safe-url-fetch.ts` to validate HTTP(S) targets, reject credentials and private/local IPv4/IPv6 addresses, pin sockets to the validated DNS result, enforce outbound host/port/size/timeout policy, and revalidate every redirect before outbound fetches.
  - Added an atomic Redis-backed HTTP rate limiter shared across application instances, including isolated namespaces for Strategist and History autosave traffic.
  - Added `serializable-transaction.ts` to run credit-ledger writes at serializable isolation with bounded write-conflict retries.
  - Added SSRF regression coverage for loopback, private network, cloud metadata, IPv6, credential-bearing, and unsupported-protocol URLs.

### Changed
- **Publish Ready Pipeline**:
  - Moved Publication Package generation before Final Quality Gate so the gate audits the canonical CMS title and metadata together with the H1-free article body.
  - Made Fast mode content-only while preserving an extracted working title for previews and downloads.
  - Made publication-field findings target explicit metadata fields instead of inserting Markdown H1 text into the article body.
  - Added tenant-specific SEO length contracts to the SEO prompt and made Fast rewrites source-only for facts, entities, metrics, examples, and visual relationships.
  - Normalized orphaned Markdown headings so primary body sections use H2 and H3 appears only beneath an established H2.
- **AI Request & Usage Boundaries**:
  - Activated runtime Zod validation for Analyze, Strategist Chat, Generate Plan, Quick Draft, Draft From Notes, and attachment payloads before opening streams or consuming AI resources.
  - Removed client-controlled AI provider selection from Analyze and Quick Draft; provider resolution now follows server/workspace configuration.
  - Added request throttling, demo usage limits, authenticated credit checks, analysis logging, and credit deduction to Strategist draft-generation flows.
  - Made credit deduction serializable and rejected insufficient balances instead of writing fallback transactions that could produce negative ledger balances.

### Fixed
- **Gemini Pricing & Telemetry Accuracy**:
  - Replaced stale Prompt Inspector Gemini prices with the current Gemini 3.5 Flash and Gemini 3.1 Flash-Lite list rates.
  - Added the active Gemini service tier to stage telemetry and applied the documented 50% Flex discount to Prompt Inspector and persisted cost estimates.
  - Extended the onboarding timeout under Flex so the local 10-second race no longer cancels requests that legitimately wait in the Flex queue.
- **Title, Metadata & Visual Consistency**:
  - Prevented Final Quality Gate from reporting a missing H1 when the CMS title field is present or when Fast mode intentionally omits publication metadata.
  - Marked publication metadata stale after targeted fixes, applied suggestions, or source-link mutations; stale packages and mismatched stored bodies are now blocked from CMS export.
  - Reconciled Quality Gate change summaries so unsupported diagrams or tables are not simultaneously praised as improvements, and stopped generic API/KPI abbreviations from being misclassified as novel entities.
  - Replaced hard character slicing with word- and sentence-boundary metadata truncation, preventing partial outputs such as `Infrast`, `AI Citat`, or dangling meta descriptions.
  - Prevented Publish Ready results with dangling metadata phrases from being marked ready, while allowing valid terminal acronyms such as `AI`.
  - Strengthened visual selection so short collections remain lists/tables instead of being routinely converted to Mermaid.
  - Restored Fast-mode feedback titles from `workingTitle` when no Publication Package is generated.
  - Validated Strategist plans after JSON parsing and extracted the article-only Draft section when a model returns a composite Blueprint payload.
- **Tenant & Network Security**:
  - Enforced user ownership before updating Strategist sessions or inserting chat messages, including blocking guest-supplied session IDs.
  - Restricted Prompt Inspector and prompt diff endpoints to configured platform owners.
  - Protected Strategist and authenticated scrape flows against private-network SSRF and unsafe redirects.
- **Streaming & Frontend State Integrity**:
  - Stopped Analyze, Refine, Quick Draft, and Draft From Notes pipelines from continuing into Quality Gate, SEO, logging, or billing after client disconnects.
  - Prevented Targeted Fix from resolving feedback when its target text was not found, restored the complete analysis snapshot after cancelled/failed refinements, and removed stale chat placeholders on cancellation.
  - Reset User Directory pagination when filters change, cleared recoverable errors on retry, and ignored stale out-of-order fetch responses.
  - Added shared frontend and backend request deadline contracts, user-visible cancellation for every long AI action, stream-reader plus fetch cancellation on idle timeout, non-overlapping Deep Research polling, and explicit assistant lifecycles so network/provider failures cannot leave indefinite loading states.
  - Propagated client disconnects through Express request lifecycles, AI runtime requests, Gemini Flex retry waits, and Gemini/Groq/OpenRouter SDK transports so abandoned requests stop active provider work instead of merely skipping later pipeline stages.
- **AI Telemetry & Provider Types**:
  - Corrected Gemini reasoning-token accounting to avoid double-counting and added pricing for the default `openai/gpt-4o-mini` OpenRouter model.
  - Restored Groq-compatible mapper type exports and replaced the unsafe targeted-fix telemetry cast with a real collector.

## [3.12.2] - 2026-07-18

### Fixed
- **Structured Output Transport Contract**:
  - Restored Gemini `responseMimeType` and `responseJsonSchema` forwarding in the non-streaming provider path used by Final Quality Gate and SEO metadata generation.
  - Restored `response_format: { type: "json_object" }` forwarding for Groq and OpenRouter streaming and non-streaming requests.
  - Replaced the review-specific `_reviewJsonSchema` request field with the stage-neutral `responseJsonSchema` contract.
- **Quality Gate Recovery & Regression Coverage**:
  - Normalized malformed string feedback and object flags into safe manual-review output, and added an explicit schema correction instruction on the second attempt.
  - Added provider transport and Quality Gate regression tests covering the exact `feedback`/`flags` type mismatch observed in staging.
- **Feedback Preview Safety & Persistence**:
  - Unified per-card and bulk Apply eligibility with the shared editorial contract; manual, verification, resolved, and suggestion-only feedback can no longer be auto-applied.
  - Persisted applied feedback and polished draft updates to analysis history, preventing repeated Apply actions and lost changes after reload.
  - Removed evidence-free “Mark Verified”; Add Source now requires a valid HTTP(S) URL, waits for persistence, avoids nested Markdown links, and never appends internal verification notes to publication content.
  - Corrected insert-before/after previews, feedback identity/state reset behavior, active-card toggling, bulk counts, and async loading guards.
  - Added frontend regression coverage for auto-apply eligibility, readiness, source URL safety, and Markdown linking behavior.
- **Deterministic Grounding Test**:
  - Replaced the live Vertex grounding redirect dependency with a mocked redirect response while testing the production grounding utility directly.
- **Release & Architecture Metadata**:
  - Synchronized workspace package versions and lockfile metadata to `3.12.2`.
  - Aligned backend guidance with provider-native thinking: manual chain-of-thought is no longer requested or persisted in editorial JSON schemas.

## [3.12.1] - 2026-07-18

### Fixed
- **Quality Gate Zod Validation & Fallback Normalization**:
  - Adjusted `FinalQualityGateResponseSchema` `changes` array requirements in `@eai/shared` from `.min(2)` to `.min(1).max(5)` to allow targeted edits and single-improvement refinements without triggering `ZodError` (`expected array to have >=2 items`).
  - Enhanced `normalizeFinalQualityGateResponseCandidate` with automatic fallback `['Processed draft according to editorial brief.']` when `changes` array is empty, and clipped oversized arrays (`changes` > 5, `feedback` > 5, `flags` > 3).
- **Feedback Action & Safe Apply Logic**:
  - Removed dangerous fallback in `useEditorialWorkspace.ts` that appended raw suggestion text to the bottom of the draft when `targetText` was empty.
  - Updated `FeedbackItemCard.tsx` to require a non-empty `targetText` for 1-click apply. Replaced the unsafe "Apply Suggestion" button for suggestion-only feedback items with a "Copy Suggestion" button to prevent draft text corruption.

## [3.12.0] - 2026-07-18

### Changed
- **Decomposed Monolithic Frontend `FeedbackPanel` Component**: Refactored `apps/frontend/src/components/FeedbackPanel.tsx` (44KB) into a modular sub-system under `src/components/feedback-panel/`:
  - `types.ts`: Isolated TypeScript interfaces (`FeedbackPanelProps`, `VerificationBadgeConfig`).
  - `hooks/useFeedbackActions.ts`: Custom hook managing quick-fix, targeted fix, mark verified, add source, and copy feedback state.
  - `components/FeedbackItemCard.tsx`: Dedicated card renderer for individual feedback checks, verification status badges, and action buttons.
  - `components/QualityGateSummary.tsx`: Header component rendering readiness score summary, alerts, and batch actions.
  - `FeedbackPanel.tsx`: Facade shell (< 100 LOC) preserving 100% backward compatibility.
- **Decomposed Monolithic Frontend `StrategistTab` Component**: Refactored `apps/frontend/src/components/StrategistTab.tsx` (40KB) into a modular sub-system under `src/components/strategist-tab/`:
  - `types.ts`: Isolated TypeScript interfaces for chat sessions and props (`StrategistTabProps`).
  - `hooks/useStrategistChat.ts`: Custom hook managing attachment uploads, session renaming state, and chat input controls.
  - `components/SessionSidebar.tsx`: Dedicated sidebar component for chat history session management (pin, rename, delete).
  - `components/ChatMessageList.tsx`: Optimized message list renderer preventing unnecessary re-renders during SSE streaming.
  - `components/ChatInputBar.tsx`: Dedicated chat input bar component supporting search toggle, file attachment, and mode selection.
  - `StrategistTab.tsx`: Facade shell (< 100 LOC) preserving 100% backward compatibility.

### Added
- **Backend Service Unit Tests**:
  - `apps/backend/src/lib/__tests__/chat-billing.test.ts`: Expanded unit test coverage for credit checking (`checkCreditsRemaining`) and bucket deduction (`deductCredits`).
  - `apps/backend/src/lib/__tests__/user-workspace.test.ts`: Expanded unit test coverage for organization context resolution (`toClerkOrganizationContext`) and user record initialization (`ensureCurrentUserRecord`).

## [3.11.0] - 2026-07-18

### Changed
- **Decomposed Monolithic Strategist Route (`apps/backend/src/routes/strategist/index.ts`)**: Refactored the 61KB / 1.566 LOC monolithic strategist route file into a modular, strictly-typed folder structure `apps/backend/src/routes/strategist/` with **Zero Logic Change**:
  - `types.ts`: Isolated Zod validation schemas (`ChatInputSchema`, `GeneratePlanSchema`, `GenerateDraftFromNotesSchema`, `QuickDraftSchema`) with derived `z.infer` TypeScript types.
  - `utils/grounding.ts`: Grounding URL resolution & leak sanitizer (`resolveGroundingUrl`, `sanitizeGroundingLeaks`, `fetchWithTimeout`).
  - `utils/helpers.ts`: Organization resolution helper (`resolveInternalOrgId`), URL scraper, rate limiter, soft auth, and prompt constants.
  - `handlers/chat.ts`: HTTP SSE streaming handler for interactive AI Strategist chat, billing deduction, and grounding search.
  - `handlers/plan.ts`: HTTP handler for AI Blueprint Plan generation (`POST /generate-plan`).
  - `handlers/draft-from-notes.ts`: NDJSON stream handler for converting research notes to structured drafts (`POST /generate-draft-from-notes`).
  - `handlers/sessions.ts`: HTTP CRUD handlers for managing chat history sessions (`GET /sessions`, `GET /sessions/:id`, `DELETE /sessions/:id`).
  - `index.ts`: Unified Express router entrypoint re-exporting all sub-routers with 100% backward compatibility.

## [3.10.0] - 2026-07-18

### Changed
- **Decomposed Monolithic Admin Route (`apps/backend/src/routes/admin.ts`)**: Refactored the 38KB monolithic admin route file into a modular folder `apps/backend/src/routes/admin/` with strict separation of concerns (Zero Logic Change):
  - `types.ts`: Isolated Zod validation schemas (`AdjustmentSchema`, `OverridePlanSchema`, `UserCreditAdjustmentSchema`, `AiConfigSchema`, `AuditLogSchema`).
  - `utils.ts`: Authorization helpers (`getAdminContext`, `getActor`).
  - `handlers/`: Domain-specific HTTP handlers (`users.ts`, `organizations.ts`, `editorial-profiles.ts`, `audit-logs.ts`).
  - `index.ts`: Re-exports unified Express router maintaining 100% backward compatibility.
- **Decomposed Monolithic UserDirectory Component (`apps/frontend/src/components/UserDirectory.tsx`)**: Refactored the 73KB monolithic frontend component into a modular structure under `src/components/user-directory/`:
  - `types.ts`: Unified TypeScript interfaces (`DirectoryUser`, `PaginationMeta`, `UserDetailsData`).
  - `hooks/useUserDirectory.ts`: Custom hook facade isolating directory state management, search, filters, pagination, and API actions.
  - `components/`: Isolated UI sub-components (`UserTable.tsx`, `UserActionMenu.tsx`).
  - `CreditAdjustmentModal.tsx` & `OrganizationDetailDrawer.tsx`: Lazy-loaded dynamic imports to optimize initial bundle size.
  - `UserDirectory.tsx`: Lightweight facade wrapper component (< 100 LOC).
- **Backend Housekeeping & Error Handler Hardening**:
  - Relocated standalone test scripts (`test_*.js`, `test_*.ts`) into `apps/backend/src/__tests__/scripts/` and fixed relative import paths.
  - Hardened global error handler in `apps/backend/src/server.ts` to mask raw internal error messages in production mode.

## [3.9.0] - 2026-07-18

### Added
- **Prompt Node Priority Attribute**: Added optional `priority?: number` property (scale 1-5, where 1 is Mandatory and 5 is Optional/Pruneable) to `PromptNode` interface and `CompositePromptNode` class in `@eai/shared`.
- **Formal Prompt Renderer**: Created `PromptRenderer` class under `apps/backend/src/lib/ai/prompt-engine/renderer.ts` for standardized prompt whitespace cleanup, line ending normalization, and XML tag boundary validation checks.
- **Bidirectional AST Prompt Serializer**: Created `PromptSerializer` class under `apps/backend/src/lib/ai/prompt-engine/serializer.ts` to convert `PromptNode` AST trees to JSON format and reconstruct runtime AST objects back from JSON.
- **Node Pruning Optimizer**: Created `PromptPruningOptimizer` class under `apps/backend/src/lib/ai/prompt-engine/pruning-optimizer.ts` that automatically prunes optional nodes (priority 5 down to 2) when estimated prompt tokens exceed LLM model token limits.
- **Prompt Engine Test Coverage**: Created unit test suites for `PromptRenderer`, `PromptSerializer`, and `PromptPruningOptimizer` with 100% pass rate across 50 total backend unit tests.

## [3.8.0] - 2026-07-17

### Added
- **Prompt Token Estimator**: Introduced `PromptTokenEstimator` under `src/lib/ai/prompt-engine/` supporting character-weighted offline token estimation (XML tags ~3.5 chars/token vs text ~4.2 chars/token) and online cached token estimation.
- **Online Token Counting Cache**: Integrated a SHA-256 in-memory cache with a 30-minute TTL to wrap the provider-specific `countTokens` API calls, drastically reducing network latency.
- **Prompt Cache Planner**: Added `PromptCachePlanner` to traverse prompt AST nodes, map static vs. dynamic tokens, verify prompt structure order, and compute prompt caching efficiency.
- **Prompt Cache Optimizer**: Created `PromptCacheOptimizer` to suggest fixes for position violations (e.g. static nodes after dynamic nodes) and alert if static prefixes fall below provider-defined thresholds (e.g., 32,768 tokens on Gemini).
- **Prompt Inspector Developer Console API**: Mounted `POST /api/prompt-inspector/` and `/diff` endpoints under `routes/prompt-inspector.ts`:
  - `/`: Returns visual tree representation, rendered text, node-by-node token breakdown, caching report, recommendations, and pricing estimation.
  - `/diff`: Performs comparative token, cache efficiency, and node-level delta analysis between two prompt configurations.
  - Supports database workspace context simulation via `workspaceId`.
- **Composer AST Compilation Contract**: Added `.compile()` method to all 5 prompt composers (`SeoPromptComposer`, `ReviewPromptComposer`, `RewritePromptComposer`, `RefinementPromptComposer`, `QualityGatePromptComposer`) returning AST structures.
- **Comprehensive Backend Unit Test Suite**: Added Vitest test files under `src/lib/ai/prompt-engine/__tests__/` and `src/lib/ai/__tests__/` for the estimator, planner, optimizer, and route handler integrations.

## [3.7.0] - 2026-07-17

### Added
- **AI Provider Abstraction Layer**: Replaced scattered provider-specific SDK branching with a unified, capability-driven `AIProvider` interface under `src/lib/ai/providers/`:
  - `interface.ts`: Defines `AIProvider`, `StreamChunk` (normalized delta + usage), `StreamRequest`, `GenerateResult`, and `ProviderCapabilities`.
  - `registry.ts`: Exports `getProvider()` factory returning singletons for `'gemini'`, `'groq'`, and `'openrouter'`.
  - `gemini/`: GeminiProvider wrapping `@google/genai` with custom stream generators, output mapping, and thinking level configs.
  - `openrouter/`: OpenRouterProvider wrapping `openai` SDK mapped to OpenRouter endpoints.
  - `groq/`: GroqProvider wrapping `groq-sdk` sharing common OpenAI-compatible mapping logic.
- **Model Router Subsystem**: Consolidated editorial routing rules into `lib/ai/model-router.ts`:
  - `resolveModel()`: Maps editorial roles and speeds to the optimal model based on provider context.
  - `resolveOutputLimit()`: Standardizes maximum token responses based on standard, compact, or manual fallback modes.
- **Centralized Telemetry Runtime**: Introduced unified orchestrators at `src/lib/ai/runtime/`:
  - `executeStream()`: Iterates normalized streams, captures usage from the final chunk, and records telemetry automatically.
  - `executeGenerate()`: Executes non-streaming generation and dispatches telemetry records.
- **Backend Test Suite Integration**: Configured `vitest` in the backend workspace. Created tests validating:
  - `providers/__tests__/contract.test.ts`: Capability profiles and interface contracts.
  - `runtime/__tests__/execute-stream.test.ts` & `execute-generate.test.ts`: Telemetry dispatching and stream chunk mapping using a mock `FakeAIProvider`.
  - `__tests__/review-stage.test.ts`: Retry and compact fallback execution paths.

### Changed
- **Unified Handlers & Stages (Zero Logic Change)**: Refactored stage files (`review-stage.ts`, `quality-gate-stage.ts`, `seo-stage.ts`, `targeted-fix-stage.ts`) and handlers (`analyze.ts`, `refine.ts`) to use the new `AIProvider` registry and runtime orchestrators, collapsing multi-branch transport code into clean, provider-agnostic execution flows.
- **Cleanup and Deprecations**: Removed obsolete route stubs (`routes/analyze/providers/*`) and marked legacy functions/clients inside `provider-runtime.ts` as `@deprecated` while preserving full backward compatibility for strategist and onboarding endpoints.

## [3.6.0] - 2026-07-17

### Changed
- **Decomposed EditorialWorkspace Component (Zero Logic / UI Change)**: Refactored the monolithic 88KB `EditorialWorkspace.tsx` frontend component into a modular, strictly-typed React custom hook framework located under a dedicated `src/workspace/` domain folder:
  - `useEditorialWorkspace.ts`: Serving as a clean facade orchestrator that delegates state management, workspace configurations, window shortcut events, and network operations to sub-hooks.
  - `types.ts`: Strictly types all properties, states, options, speed levels, and pending actions to ensure type safety.
  - `constants.ts`: Isolates default static assets such as English and Indonesian demo texts.
  - `utils.ts`: Gathers pure helpers for metadata parsing, readiness checks, quality gates, and domain verification.
  - `hooks/`: Compartmentalizes core subsystem logic into specialized hooks:
    - `useWorkspaceStorage.ts`: Handles two-way sync, state retrieval, and backup of workspace preferences with local and session storage.
    - `useWorkspaceConfig.ts`: Pulls workspace tenant parameters, categorizations, and default app settings.
    - `useWorkspaceKeyboard.ts`: Standardizes global key bindings (e.g., `?` for help, `Cmd+B` / `Ctrl+B` for sidebar toggle) and viewport checks.
    - `useWorkspaceAutosave.ts`: Implements debounced cloud autosaving to secure history records in the database.
    - `useWorkspaceStreaming.ts`: Manages stream buffers, stage progress indicators, and requestAnimationFrame rendering batches to optimize DOM updates.
  - `actions/`: Extracts API streaming requests and side effects into testable, isolated functions:
    - `analyze.ts`: Polish and rewrite streaming coordinator.
    - `refine.ts`: Refine stage and instruction applicator.
    - `targetedFix.ts`: Sentence and framework correction.
    - `strategist.ts`: Content blueprint and strategist first-draft generation.
- **Frontend Test Suite Integration**: Installed `vitest` in the frontend workspace, added a custom alias resolution in `vitest.config.ts`, and wrote unit tests under `src/workspace/__tests__/` to validate:
  - Utility helpers (metadata extraction, missing domain checking, quality gate readiness).
  - Actions orchestration (executeAnalyze edge cases with mock context payloads).

## [3.5.0] - 2026-07-17

### Changed
- **Decomposed analyze.ts Route (Zero Logic Change)**: Refactored the monolithic 82KB `analyze.ts` file under `apps/backend/src/routes/analyze.ts` into a structured, modular subfolder at `src/routes/analyze/` with clear concerns:
  - `controller.ts`: Orchestrates request pre-flights, authentication (Clerk JWT validation), user workspace state checks, and SSE stream initialization/keep-alive heartbeats.
  - `types.ts`: Defines shared types, interfaces, and transport-level constants.
  - `utils/`: Decomposed 40+ helper functions into specific domain utility modules:
    - `signals.ts`: Factual signal and citation indicators detection.
    - `factual.ts`: Editorial review feedback sanitization and neutralization.
    - `verification.ts`: Factual claim verification lock injection and annotations.
    - `text.ts`: Article segment chunking, metadata logging helpers, and internal link matching.
    - `markdown.ts`: Cleaners for Markdown tables, heading artifacts, and OpenAI stream adapters.
  - `handlers/`: Isolated stage execution paths into specific sub-handlers:
    - `analyze.ts`: Runs core review stages and polish/rewrite chunks for both Gemini and OpenAI-compatible endpoints.
    - `refine.ts`: Drives the iterative refinement path using Zod-schema validations, final Quality Gates, and SEO generation.
    - `fix-targeted.ts`: Executes targeted paragraph corrections.
    - `dev-mock.ts`: Serves local mock editorial streams when API provider keys are missing.
  - `providers/`: Added Gemini, Groq, and OpenRouter stub placeholders in preparation for the upcoming Sprint 2 provider abstraction.
  - `index.ts`: Re-exports the router to maintain full backward compatibility with `server.ts` without modifying imports.
- **Analysis Log Service Isolation**: Extracted `createAnalysisLogAndDebitCredit` into a standalone domain service at `src/lib/services/analysis-log.service.ts` to manage Prisma database operations, credit bucket logic, and telemetry metrics independently of the route controller.

## [3.4.0] - 2026-07-16

### Added
- **Composable Prompt Component Architecture (PCA)**: Introduced a modular, AST-based prompt composition engine under `packages/shared/src/prompt-engine` and `apps/backend/src/lib/ai/prompt-engine/`.
- **Core and Tenant Prompt Nodes**: Separated static platform prompts into independent Core nodes (`EditorialMissionNode`, `MarkdownRulesNode`, `VerificationLockNode`, `LanguagePolicyNode`, `TemporalContextNode`, `StrictnessConstraintNode`, `InputBoundaryNode`, and `OutputSchemaNode`) and dynamic workspace configurations into Tenant nodes (`BrandIdentityNode`, `ToneCalibrationNode`).
- **SeoPromptComposer**: Implemented the first composer pilot to compile the structured SEO metadata generation prompt from component nodes.
- **ReviewPromptComposer**: Added a flexible, multi-role review prompt composer that targets author, editor, seo (feedback suggestions), fact-checker, and polish (diagnosis transformation) roles.
- **RewritePromptComposer**: Introduced a comprehensive rewrite stage prompt composer that handles few-shot demonstrations, priority guidelines, editorial constraints, smart internal linking (published posts), and chunking boundaries.
- **RefinementPromptComposer**: Implemented a refinement composer for partial edits, supporting both Iterative Refinement and Targeted Fix stages with factual refinement guardrails and output constraints.
- **QualityGatePromptComposer**: Introduced a quality gate stage composer to evaluate the quality, changes, readiness, and risks of final article drafts.
- **StrategistPromptComposer**: Added a strategist composer to handle both rough draft generation and structured outline creation, integrating press release conversion rules.
- **StrategistChatComposer**: Added a strategist chat prompt composer to guide interactive brainstorming sessions, traffic data analysis, page audits, and research assistance.
- **StrategistBlueprintComposer**: Added a strategist blueprint composer to compile detailed editorial plans (angle, hook, target audience, and outline) along with a structured-output-based initial draft.
- **DraftFromNotesComposer**: Added a draft-from-notes composer to generate clean first drafts from research notes or blueprints using a cognitive stage framework (IDENTIFY -> EXTRACT -> EXPAND).
- **StrategistFastModeInstructionNode**: Added a new prompt node to handle Fast Mode system instructions for the strategist assistant in a modular and testable manner.
- **Real-Time Thinking Indicator**: Added frontend SSE support to stream and display Gemini 3.x native thinking reasoning (thought_summary deltas) inside the strategist chat UI.

### Changed
- **Strategist Prompt Optimization**: Refactored strategist prompt nodes (`StrategistSystemRoleNode`, `StrategistGeneralConstraintsNode`, `StrategistExamplesNode`, `StrategistToolGuidelinesNode`, `DraftFromNotesConstraintsNode`, `StrategistBlueprintInstructionNode`) to enforce behavioral anchors, support dynamic runtime date injection via `context.today`, define web search trigger boundaries, and remove obsolete manual CoT XML blocks.
- **Chat Stream Parser Cleanup**: Removed the legacy 75-line `<thinking>` tag buffer state machine from the strategist backend `/chat` router, replacing it with a clean event-based SSE stream forwarder.
- **SSE Stream Data Alignment**: Aligned frontend stream handlers in `useContentStrategist` to consistently accept both `text` and `chunk` types during rewrite operations.
- **SEO Stage Refactoring**: Refactored `runSeoStage` and `analyze.ts` to utilize the new `SeoPromptComposer` for prompt generation, optimizing static prompt blocks for Gemini prompt caching.
- **Review Stage Refactoring**: Refactored `runEditorialReviewStage` and `analyze.ts` to utilize the new `ReviewPromptComposer` instead of the legacy `getPolishReviewPrompt` and `getPromptForRole` functions.
- **Rewrite Stage Refactoring**: Refactored the draft rewrite process in `analyze.ts` to utilize the new `RewritePromptComposer` for prompt generation instead of the legacy `getPolishedDraftPrompt` function.
- **Refinement Stage Refactoring**: Refactored the iterative refinement and targeted fix stages in `analyze.ts` and `targeted-fix-stage.ts` to utilize the new `RefinementPromptComposer` for prompt generation instead of the legacy `getIterativeRefinementPrompt` and `getTargetedFixPrompt` functions.
- **Quality Gate Stage Refactoring**: Refactored the final quality gate evaluation in `quality-gate-stage.ts` to use `QualityGatePromptComposer`.
- **Strategist Stage Refactoring**: Refactored the topic drafting and outline generation in `quick-draft.ts` to use `StrategistPromptComposer`.
- **Monolithic Prompt Cleanup**: Simplified `prompts.ts` by removing all legacy prompt generation functions, retaining only system-wide variables and shared timezone/date helpers.

## [3.3.0] - 2026-07-14

### Added
- **Few-Shot Rewrite Demonstrations**: Added few-shot translation and rewrite demonstrations with explicit reasoning steps in `getPolishedDraftPrompt`'s system instructions to guide model style transformations and eliminate AI clichés.
- **Structured Chain-of-Thought (CoT)**: Enforced a three-step reasoning schema (`CORE DISCOVERY`, `TRANSFORMATION NEEDS`, `REVISION TASKS` for Review stage and `AUDIT DRAFT CHANGES`, `FIDELITY VERIFICATION`, `RESOLUTION` for Quality Gate stage) inside the JSON response `thinking` field to prevent false-positives and ensure thorough factual audits.
- **Structured Outputs for Strategist**: Integrated strict JSON schema formatting (`response_format` with Zod-based/JSON schema) into the strategist router's `interactions.create` call, ensuring type-safe output constraints for `gemini-3.5-flash` model.
- **Robust Parsing Fallbacks**: Implemented double fallback protections: retries API calls without response format restrictions on schema refusal and falls back to wrapping raw model output text inside the draft object on JSON parse failure, preventing server 500 crashes.
- **Bilingual Tone Guidelines**: Added Indonesian translation examples alongside English sentences in `getToneGuidance` to calibrate editorial styles for both language outputs.
- **Responsive Editor Mode Safeguard**: Configured the Tiptap/Markdown mode toggle to hide on mobile viewports (`hidden sm:flex`) and enforced auto-fallback to Tiptap mode on mount or resize under 640px to prevent layout overflows and screen breaks.

### Changed
- **Static Caching Prompts (v2.5.0)**: Refactored prompt templates to be completely static, moving dynamic constraints, strictness options, language policies, and current date requirements out of the system instruction string into the user payload's `articleContext` object to optimize provider-side prompt caching.
- **Guidelines Modularity**: Decomposed the monolithic system prompt assembly into granular, testable sub-prompt functions (`getCoreEditorialMission`, `getFactualTruthHierarchy`, `getOneClickApplyRule`).
- **System Prompt Refactoring**: Removed redundant ASCII table and verification lock instructions, centralizing them in global constants (`GFM_TABLE_RULE`, `VERIFICATION_LOCK_RULE`).
- **Token Bloat Reductions**: Cleaned up duplicated instructions in the Fact-checker role prompt and removed redundant field descriptions from `getSeoMetadataPrompt`.
- **Target Length Constraint Removal**: Deleted quantitative target length restrictions (80-90% tightening target) from `getPolishedDraftPrompt` to support article generation at any length.

## [3.2.1] - 2026-07-14

### Added
- **Leading H1 Title Stripping**: Implemented a deterministic `# ` title stripping mechanism via `stripLeadingH1` in backend text utilities to parse out and extract H1 headings before draft contents enter the rewrite/polish stages. This keeps the Stage 3 UX title intact while respecting the Stage 4 constraints.
- **ThinkingLevel Tuning**: Upgraded Gemini 3.x models' `thinkingConfig.thinkingLevel` from `ThinkingLevel.MINIMAL` to `ThinkingLevel.LOW` across Editorial Review, Quality Gate, Quick Draft, and Targeted Fix stages to optimize factual auditing and outline adherence.
- **Brand-Aware Strategist Context**: Modified `getStrategistSystemPrompt` to accept organizational brand profiles. Injected brand name, tone, audience, positioning, and custom instructions inside a scoped `<brand_editorial_guidelines>` XML tag to prevent prompt injection and keep operational constraints safe.
- **OpenRouter Sampling Overloads**: Introduced `getNativeGeminiConfig` (direct API calls, no temperature payload) and `getOpenRouterSamplingConfig` (OpenRouter API calls, retains temperature payload) inside `provider-runtime.ts` to clear dead parameters and prepare routing for future OpenRouter Gemini engines.

### Fixed
- **Deprecated Model Cleanup**: Replaced deprecated model references across the codebase (e.g. `gemini-2.5-flash`, `gemini-2.0-flash-lite`) with active, recommended tiers (`gemini-3.1-flash-lite`, `gemini-3.5-flash`).
- **Dead Parameter Cleanups**: Removed deprecated, unused `FAST_MODE_TEMPERATURE` and obsolete `getGeminiSamplingConfig` occurrences, achieving 100% linter type-check compatibility.

## [3.2.0] - 2026-07-14

### Added
- **Separate Credit Usage Settings Page**: Created a dedicated `/settings/usage` settings page in [page.tsx](./apps/frontend/src/app/[locale]/settings/usage/page.tsx) that separates credit monitoring from the main Billing Plan page, featuring balance breakdown cards (Total Available, Plan, Free, Add-on) and a detailed audit trail ledger.
- **Teammate Attribution ("Triggered By") in Table**: Integrated audit logs with human/system attribution. Displays names and avatars for teammate actions in team workspaces, "You" for personal workspaces, and "System" with a gear icon for automatic background runs (`isSystem: true`).
- **Quota Expiry Transparency & Reset Warning**: Added dynamic Quota Reset alerts clearly communicating the expiry of remaining monthly plan credits alongside standard Add-on credits exemption notice.
- **Exhausted Credit Indicators**: Appended small indicator warnings (`Monthly Plan Quota Exhausted`, `Free / Trial Credits Exhausted`) at the bottom of the credit cards when balances drop to 0.
- **Active Plan Sidebar Badge**: Mounted live subscription checks in the sidebar [AppSidebarShell.tsx](./apps/frontend/src/components/AppSidebarShell.tsx) next to the Organization Switcher showing colored plan badges (Starter, Pro, Team, Free).
- **Backend API Endpoint `GET /api/workspace/usage`**: Exposed a consolidated endpoint in [workspace.ts](./apps/backend/src/routes/workspace.ts) returning real-time credit buckets, subscription refill states, and user-joined credit transaction histories.
- **Internal Admin Console (`EAI Admin Console`)**: Replaced the previous system settings sub-menu (`/settings/system/*`) with a dedicated operational admin space at `/admin/*`. Added [AdminLayoutShell.tsx](./apps/frontend/src/components/AdminLayoutShell.tsx) providing a custom sidebar, theme controls, and quick navigation for administrators.
- **SuperAdmin Protection & Authorization**: Implemented server-side SuperAdmin verification in `/admin/layout.tsx` to authorize access only to users defined in the `OWNER_USER_IDS` environment variable.
- **Bypass for Maintenance Mode**: Configured the middleware ([proxy.ts](./apps/frontend/src/proxy.ts)) to bypass maintenance mode redirects for all routes under `/admin/*`, allowing system owners to manage production feature flags or troubleshoot errors during maintenance.
- **Refinement AI Engine Overrides per-Organization**: Added support for overriding the default AI provider and model specifically for the Refinement stage (rewrite, review, SEO metadata generation) on an organization level. Obrolan strategis and initial drafts are locked to Google Gemini. Managed via EAI Admin Console under `/admin/ai-config` with preset model suggestions and invalidates Redis configuration caching on update.
- **Global Operational Audit Logs**: Integrated a system-wide audit logging mechanism (`AuditLog` model and `logAuditEvent` helper) to track critical administrative actions. Captures billing credit adjustments (organizational & personal), subscription plan overrides, user ban/unban actions, and AI configuration updates.
- **Audit Logs Explorer & Feature Flag Audits**: Added `/admin/audit-logs` dashboard showing a paginated list of operational logs with search, action filtering, and a slide-over drawer to inspect detailed JSON comparison payloads. Tied Vercel Edge Config feature flag toggles to write audit logs to the backend.
- **Yearly Subscription Credit Scheduler**: Configured yearly subscriptions to allocate credits monthly (e.g. 50/month) instead of a upfront lump sum. Built a daily cron job `monthly-credit-allocation` using BullMQ to reset remaining monthly subscription credits and refill the monthly quota, using idempotency keys (`monthly-refill:${sub.id}:${year}-${month}`) to prevent double allocation.
- **Delayed Downgrade (Stripe-Way)**: Implemented delayed downgrade flow from yearly to monthly plans. Creates a new monthly subscription row in the `queued` state scheduled to activate automatically at the yearly plan's `currentPeriodEnd`. Built a daily cron job `activate-queued-downgrade` to handle automatic activation.
- **Cancel Scheduled Downgrade**: Added "Keep My Current Plan" confirmation button to delete the queued monthly plan and restore the yearly plan's active status.
- **Yearly Purchase Gating**: Blocks buying or renewing yearly plans if the workspace already has a pending scheduled downgrade, displaying a helpful inline warning.
- **Dedicated PATCH Endpoints**: Split `/api/history/:id` into specific `/resolve` and `/autosave` endpoints to isolate business logic, validation schemas, and rate limits.
- **Autosave Schema & Rate Limiting**: Added `AutosaveSchema` validation and an in-memory `autosaveRateLimiter` middleware (max 100 requests/minute per user) to safeguard autosaves against database spam.
- **Historical Subscriptions & Database Constraints**:
  - Removed `@unique` constraints on `userId` and `organizationId` from the `Subscription` model to transition to a 1-to-many relationship supporting expired/cancelled subscription history.
  - Added PostgreSQL `CHECK` constraint (`chk_subscription_target`) to enforce database-level mutual exclusivity between user and organization subscription owners.
  - Added partial unique indexes to guarantee at most one active subscription per user or organization.
  - Integrated transactional updates using a single `prisma.$transaction` context to expire existing active subscriptions and create new ones atomically.
- **Automated Plan Prorata & Credit Merging**: Calculates the prorated remaining cash value of active plans when a user changes subscriptions mid-period. Skips resetting user/organization credits (`cycle_reset`) on upgrades/downgrades to merge unused credits into the new plan cycle.
- **Leftover Account Balance**: Introduced account balance (`balanceIdr` field on `User`/`Organization`) to store leftover funds from plan changes, which automatically apply as discounts to subsequent checkouts.
- **Bypass for Rp 0 Checkout**: Implemented direct activation for checkouts fully covered by prorated refunds or account balances without redirecting to payment gateways.
- **Grace Period State Support**: Updated backend subscription checks to recognize `cancels_at_period_end` as an active subscription state.
- **Public Exchange Rate API**: Added a public `GET /api/payments/rate` route to expose the active backend exchange rate, preventing race conditions or currency mismatches on serverless cold starts.
- **Reactivate Subscription Flow**: Added Reactivate Subscription button with full confirmation UI calling a new backend reactivation endpoint.

### Fixed
- **Locked Exchange Rate on Invoices**: Fixed and locked the exchange rate on automatic Midtrans invoices at a stable rate of 1 USD = Rp 18,000 to match checkout values, and added detail breakouts for prorated discount adjustments.
- **Dynamic Subscription Usage Formula**: Fixed incorrect `0 / 300` monthly credit progress calculation by subtracting only the actual consumed subscription credits in the current billing cycle.
- **TypeScript Compilation & ESLint in UserDirectory**: Cleaned up implicit `any` types in [UserDirectory.tsx](./apps/frontend/src/components/UserDirectory.tsx) to use the new typed `UserSubscription` interface, resolving the ESLint `@typescript-eslint/no-explicit-any` rules and Next.js production build errors.
- **Settings Sidebar Cleanups**: Removed unused Lucide icon imports and cleaned up the `SECTIONS` navigation items type definition in [SettingsLayoutShell.tsx](./apps/frontend/src/components/SettingsLayoutShell.tsx) to resolve Type Errors from the removal of the EAI System submenu.
- **Brace-Counting JSON Extractor**: Implemented a stateful brace-counting parser in `extractJsonFromText` to extract the exact JSON object from model outputs. This strips trailing fences/comments (even if they contain parenthesis or braces) and prevents JSON parsing retries on Quality Gate checks.
- **Pricing Exchange Rate Rendering**: Adjusted invoice exchange rate logic to display the base exchange rate (USD 1 = Rp 18.000) instead of dividing tax-inclusive IDR total by USD amount.
- **Dynamic Pricing Disclosures**: Updated Next.js server pricing page to fetch the real-time rate from the backend container, resolving visual mismatch and payment validation conflicts.

## [3.1.1] - 2026-07-12

### Added
- **Link Deletion Safeguards (Layer 2 & Layer 3)**:
  - **Frontend Link Interceptor**: Added utility `checkMissingSources` in the Editor to detect if original citation links have been deleted before refinement. Displays a warning dialog allowing the user to restore missing sources at the bottom of the draft, refine anyway, or cancel.
  - **Backend Fact-Checker Context**: Injected original research notes and source links into the `<session_notes>` XML tag in `<workspace_context>` during the Quality Gate evaluation, providing the AI Fact-Checker with the complete original research context to audit factual claims.
- **Programmatic Grounding Extraction (Option B)**: Extracted actual Google Search redirect URLs directly from `interaction.steps` metadata annotations in `/generate-plan`, bypassing hallucinated 404 links.

### Changed
- **Safe Grounding Resolution Timeout**: Implemented `fetchWithTimeout` helper in the strategist backend router to limit Vertex redirect resolution to 3 seconds, preventing Express server and frontend infinite loading hangs.
- **Hierarchical Citation Matching**: Updated citation matching regex in the strategist backend to capture hierarchical citation formats (e.g., `[cite: 1.1.8]`).

### Fixed
- **ESLint & TypeScript Type Integrity**: Resolved linter violations (`no-explicit-any`, `prefer-const`) across both frontend and backend files, achieving 100% clean check status in turbo monorepo lint.

## [3.1.0] - 2026-07-11

### Added
- **Rich Text & Raw Markdown Editor Toggle**: Implemented visual switcher in the editor panel to toggle between Rich Text (Tiptap) and Raw Markdown mode (with localStorage persistence). Rendered both modes concurrently via CSS visibility to preserve editor selection history, with instant bidirectional synchronization on toggle.
- **Hover Link Edit Popover**: Added custom hover event listener over anchor links (`<a>`) in Tiptap editor that displays a scroll-relative absolute-positioned popover with link details, edit button, and deletion action.
- **Bubble Menu Link Editor**: Replaced the AI "Rewrite" button inside the text bubble menu with an inline Link insertion form that supports adding, editing, and unlinking text anchors. Included stop-propagation handlers to isolate inputs from ProseMirror focus theft.

### Changed
- **AI Preview Button Alignment**: Restructured AI preview block (Shorten/Expand) action buttons (Accept/Reject) to use standard `ui-btn` class selectors. Applied inline styles to override Tailwind Typography's parent `.prose` and `.editor-canvas` color rules, ensuring proper brand-blue in light mode and monochrome-white in dark mode.
- **Resizable Link Menus**: Configured both the hover link edit popover and the inline bubble menu link editor to be resizable in both directions (`resize: both`, `overflow: auto`). Equipped the hover popover with a dynamic `minHeight` threshold (200px when editing, 56px when viewing) to prevent form truncation.
- **Slash Command Clean-up**: Completely removed the "Rewrite (AI)" suggestion command from the editor's slash commands menu.

### Fixed
- **Blueprint Saving Bug**: Fixed a bug where generated blueprints in the Content Strategist chat panel disappeared upon refresh, menu transition, or initiating a new draft. This was resolved by migrating raw `fetch` to authenticated `directFetch` in the frontend hook, ensuring the callback has updated `currentSessionId` state references, and adding fallback logic in the backend `generate-plan` endpoint to automatically create a new `ChatSession` in the database if `sessionId` is `'new'`.
- **Markdown Paste Escape Bug**: Set `transformPastedText` and `transformCopiedText` to true in the Markdown extension configuration to ensure pasted markdown parses directly into nodes instead of double-escaping headings with backslashes.
- **Duplicate Tiptap Link Extension Warning**: Resolved duplicate registration warnings for the `'link'` extension by configuring it directly inside `StarterKit.configure` rather than importing it independently.
- **Dark Mode Link Color Visibility**: Added explicit CSS rule `.dark .prose a` targeting anchor links inside dark-theme prose containers to force them to blue (`#3b95d9`) instead of defaulting to white.

## [3.0.3] - 2026-07-10

### Added
- **Shallow and Deep Health Checks**: Implemented `/health` (shallow probe, returning in <5ms for process liveness) and `/api/health` (deep probe for dependency monitoring) endpoints.
- **Parallel Dependency Verification**: The deep health check queries Database (Prisma/Postgres `SELECT 1`), Redis (`PING`), Clerk Auth (`/v1/instance`), Cloudflare R2 Storage (`HeadBucket`), active AI Providers (Gemini/OpenRouter/Groq API metadata keys), Midtrans (`healthcheck-ping-dummy`), and active email integrations in parallel.
- **Resilient Timeout & Severity**: Configured a `3000ms` timeout per dependency to prevent blocking. Dependency errors are classified into critical (returns HTTP 503) and non-critical (returns HTTP 200 with `degraded` status) to avoid unnecessary alerts.
- **User Journey Monitoring**: Added `/api/health/journey` to verify the end-to-end user workflows (Onboarding, Strategist Chat & Sessions, Workspace configuration, AI Analysis, In-Editor Actions, History retrieval, Exporting drafts, Payments and Checkout flows) in parallel, checking whether auth-protected routes are alive (expecting 401/403) and public routes are accessible (expecting 200).
- **BullMQ Worker, Edge Config & Exchange Rate Checks**: Integrated active worker verification (checking worker counts and queue status) into `/api/health` as a critical dependency (in production), along with Vercel Edge Config (feature flags) and Exchange Rate API checks to ensure complete system liveness.
- **System Monitoring Metadata**: Included version, git commit SHA, process uptime, startedAt timestamp, and individual service latencies in the health JSON payload for better debugging.

## [3.0.2] - 2026-07-09

### Fixed
- **Clearer Blog Export Error Notifications**: Redesigned the warning message system for failed article draft exports to your blog (such as WordPress or Ghost). Error messages are now presented in a friendly, professional English format with clear solutions, instead of confusing system error codes.
- **Duplicate URL Slug Error Handling**: Fixed a system issue that triggered a "502 Bad Gateway" error when trying to export an article with a URL slug that has already been used on your blog. The system will now specifically notify you if the URL already exists, so you can simply change the article's title or URL slug before exporting again.
- **Blog Connection Issue Detection**: The system can now accurately distinguish whether an export failure is caused by permission issues (incorrect password/token) or because your blog server is currently offline.
- **Direct Backend Fetching for AI Streams**: Routed all long-running streaming API endpoints (Draft Generation, Analysis, Targeted Fixes, and Strategist Chat) directly to the EAI backend server (`api-eai.envoyou.com`) instead of proxying them through Vercel. This resolves a critical issue where Vercel's default serverless timeout (10 seconds on Hobby tier) abruptly terminates connection tunnels during intense AI generation phases, causing the frontend editor to display a truncated draft, hang indefinitely, and keep the generate button in a perpetual loading state.
- **Auto-Checkout URL Integration**: Added support for passing a `?plan=<planId>` query parameter to the pricing page. It automatically checks and switches the billing cycle (Monthly vs Annual), matches the plan card, and launches the checkout confirmation modal directly, allowing seamless purchases starting from links on the marketing landing page.
- **Mobile Feedback Panel Horizontal Overflow**: Fixed an issue where opening certain feedback check cards in the sidebar's Feedback tab caused the panel to stretch horizontally across the entire mobile screen. The root causes were: (1) the `overflow-x: auto` property on paragraph elements inside flex/grid containers tricked the browser into expanding the container width to match the unbroken scroll-width of the content; (2) the `.ui-badge` element with `white-space: nowrap` for long verification status labels (e.g. "High-risk factual claim") prevented text from wrapping; and (3) long continuous URL strings inside `font-mono` target-text and flagged-claim blocks (e.g. McKinsey or Traveloka URLs embedded in markdown links) were not broken at character boundaries. Fixed by: removing `max-w-full overflow-x-auto` from content paragraphs, adding `whitespace-normal flex-wrap h-auto` to the verification status badge, and switching `break-words` to `break-all` on all mono-spaced text blocks.
- **Mobile AI Chat Panel Horizontal Overflow**: Fixed an issue where AI responses in the Strategist Chat tab containing Markdown tables, code blocks, or long bare URLs caused the entire chat sidebar to stretch horizontally on mobile. Fixed by: adding `overflow-x: hidden` to the chat scroll container and `overflow: hidden` to the assistant message bubble in `StrategistTab.tsx`; adding `.strategist-prose code`, `.strategist-prose pre`, and `.strategist-prose a` CSS rules with `word-break: break-all` and `white-space: pre-wrap` in `globals.css`; and making `.strategist-prose table` use `display: block; overflow-x: auto` so wide tables scroll horizontally within the bubble instead of pushing the layout outward.

## [3.0.1] - 2026-07-08

### Added
- **Manual Subscription Plan Override (Inject Plan)**: Added manual subscription plan override capability to the internal admin billing interface. Allows super-admins/owners to change subscription plans (Starter, Starter Yearly, Pro, Pro Yearly, Team, Team Yearly) for custom durations, verify Zoho Desk tickets, reset existing subscription credit balances (`cycle_reset`), and allocate new package credits.
- **Modular Workspace Context & Brand Alignment**: Extracted a unified helper (`apps/backend/src/lib/ai/workspace-context.ts`) to compose structured workspace XML payloads (`<workspace_context>`) and dynamic brand instructions (`<agent_instruction>`) across all AI endpoints (Chat Strategist, SEO Optimizer, Fact-Checker, Targeted Fix).

### Changed
- **UI Billing Admin Tabbed Layout**: Restructured the right side card of the Admin Billing dashboard into tabs (Adjust Credits vs Override Plan) using the custom portal-rendered Select component and confirmation action modals.

## [3.0.0] - 2026-07-06

### Added
- **AI-First Onboarding Redesign**: Overhauled the user onboarding wizard flow, reducing it from 5 complex system-config screens to 3 interactive minimal stages (`activation`, `discovery`, and `review`).
- **Automated Editorial DNA Extraction**: Integrated automated scraping and AI synthesis via Jina Reader API and Gemini 3.5 Flash to automatically extract brand names, positioning statements, target audiences, topics/categories, tones, and article types based on user website content.
- **DNA Review & Live Editing Interface**: Added interactive pill tags and text editors inside the DNA Review wizard screen, allowing users to preview, add, edit, or remove categories, writing tones, and article types before finalizing activation.
- **Onboarding Discovery Cancel Safety**: Added a "Batal & Kembali" (Cancel & Go Back) option on the discovery loading screen to safely abort hanging network requests, reset the onboarding state back to `'activation'` in the database, and return to the form screen.
- **Article Types Wizard Representation**: Added full frontend support for displaying and configuring predefined and AI-generated article types directly inside the DNA review UI.
- **Sidebar Organization Switcher**: Integrated Clerk's `OrganizationSwitcher` inside the main application sidebar (`AppSidebarShell`), enabling seamless tenant switching directly from the navigation pane when expanded.
- **Mobile-Friendly Select Component**: Enhanced the `Select` component (`ui/select.tsx`) to support a bottom-sheet drawer pattern on mobile viewports ($\le 768$px) with a semi-transparent backdrop, drag handle, and slide-up transition. Also migrated native filter dropdowns in the User Directory page to use this component.
- **Mobile Custom Date Picker**: Added a responsive, mobile-specific date range layout in `DashboardLayoutShell` for the custom date range option.
- **Workspace Admin Configuration**: Added `isAdmin` field to the backend workspace configuration (`/api/workspace/config`) and updated frontend `SettingsProvider` / `WorkspaceConfig` types to track user organization role privilege.

### Changed
- **DNA Review Visual Overhaul**: Increased font sizing, text contrast, tag paddings, and label weights across the DNA Review page elements to improve overall visual hierarchy and readability on large displays.
- **Prioritized Jina Reader Scraping**: Re-engineered the website scraper backend utility to try the Jina Reader API first (with a 4.5s timeout) before falling back to local raw HTML fetch, aligning onboarding scraper behaviors with the strategist module.
- **Admin Settings Gating**:
  - Gated the Workspace Settings page (`/settings/workspace`) to allow administrator-only access; non-admin users are automatically redirected to General Settings.
  - Optimized `PublicationProvider` to bypass fetching the editorial profile when the user is not an administrator, avoiding redundant request errors.
- **Citations Collapsible List in Strategist Chat**: Updated cited sources rendering in `StrategistTab` to display up to 3 sources by default with an interactive expand/collapse toggle ("Show All" / "+X more") to prevent chat stream clutter.
- **Strategist Chat UI Polish**: Styled the strategist input controls (attachments, search toggle, send buttons) with rounded-full geometry and custom border/background transition feedback.
- **Theme Selection Selector**: Replaced the segmented button theme picker in General Settings with the custom mobile-friendly `Select` component for unified UI controls.
- **Workspace Panel Labeling**: Updated the right-hand panel trigger label in the main workspace from "AI Copilot" to "EAI Chat".
- **User Row Actions Mobile Bottom Sheet**: Refactored the mobile actions menu in User Directory table to match the global bottom-sheet styles, removing individual item borders, backgrounds, and the cancel button, and aligning the backdrop blur, drag handle, and transitions. Also neutralized colorful action icons (credit card, history, mail) in both desktop and mobile dropdowns to align with the core theme.
- **User Row Actions Dropdown Overlay**: Refactored the desktop action dropdown menu to use `@base-ui/react/menu` rendered within a `<Menu.Portal />`. This escapes the table's `overflow` boundaries completely and utilizes Floating UI to dynamically position the menu (automatically flipping it upward/downward) relative to the viewport, preventing clipping under any row count or filtering scenario.
- **User Modals Theme Alignment**: Styled the **Adjust Credits** and **User Audit & Details Console** modals to align focus states, loading spinners, tag selectors, badges, buttons, and text indicators with primary brand colors (`var(--primary)`) instead of standard indigo and sky colors. Also migrated search and modal buttons in the User Directory page to use system-wide `ui-btn` classes, ensuring primary buttons correctly render as white/black in dark mode and brand blue/white in light mode.
- **Agent Guide Specifications**: Updated [AGENTS.md](file:///home/husni-kusuma/Project-envoyou/EAI/AGENTS.md) with strict UI/styling conventions regarding the usage of global UI button styles (`ui-btn-primary`), responsive mobile bottom-sheet selectors, and portal-rendered Base UI Menu overlays to prevent future custom UI fragmentations. Added a comprehensive guide on available global UI components (Badge, Tooltip, Sonner, Alert, ScrollArea, Skeleton) to enforce consistency.

### Fixed
- **User Directory Free Plan Filter**: Fixed a database query bug in the `/api/admin/users` endpoint where filtering by the "Free" plan returned zero users; updated the Prisma query to correctly match users or organizations that have no active subscription record (i.e. `subscription: null` or expired) in the database.
- **Onboarding Rate Limiter Elimination**: Removed the database `updatedAt`-based rate limiter check on `/discover` endpoint to prevent race conditions with preceding draf saving calls triggering instant false 429 timeouts.
- **Clerk Signup Active Session Lag**: Implemented Clerk session header propagation (`x-clerk-org-id`, `x-clerk-org-slug`, `x-clerk-org-role`) from Edge middleware to backend auth handler, bypassing Clerk JWT claims delay during the first signup organization creation.
- **Discovery Infinite Loading Protection**: Added a strict 10-second `Promise.race` timeout to the Gemini API content generation call in the backend onboarding route, preventing infinite loading screens and triggering a safe, language-aware fallback.
- **Autosave Recovery**: Implemented error handling for autosave actions in `EditorialWorkspace` to detect unauthorized or missing history IDs (`403`/`404` errors) and automatically clear/reset the active history ID state, preventing persistent failed save attempts.
- **Responsive Header Layout**: Adjusted `WorkspacePageShell` top bar typography and breadcrumbs to prevent text overlap on smaller screens.

## [2.1.0] - 2026-07-05

### Added
- **Content Strategist Chat Session Persistence**: Integrated `sessionStorage` state persistence in `ContentStrategistWizard` for `messages`, `collectedSources`, `currentPlan`, `deepResearchReport`, and `uploadedAttachment` to avoid losing chat state when switching panels.
- **AI Strategist Toggle Button & Overlay**: Added an "AI Strategist" button to the editor header, allowing users to toggle open the strategist chat as a z-index absolute overlay regardless of whether draft text already exists.
- **Automated Blueprint Save**: Automatically converts generated blueprints (Angle, Outline, Audience, Hook, SEO Intent, Sources) into a structured markdown note and saves it to the Research Notes Studio panel upon clicking "Proceed to Editor".

### Changed
- **Optimized Chat Serialization**: Synchronized chat message arrays to `sessionStorage` only when `isTyping` changes to `false` (when streaming/generating finishes) to prevent browser keystroke lag.
- **Improved Token & Temperature Configurations**: Restricted Gemini 3.5's reasoning tokens with `thinking_level: "low"` and raised `max_output_tokens` to `8192` in `/generate-plan` to prevent JSON schema truncation. Integrated `getGeminiSamplingConfig` to dynamically omit temperature (defaulting to `1.0` as recommended by Google) for Gemini 3 series.

### Fixed
- **History PATCH Schema Relaxation**: Relaxed Zod schema bounds (`EditorialResolutionSchema`, `EditorialFeedbackSchema`) in history endpoints, resolving "Fix Failed: A title or valid editorial resolution is required" errors. Raised max polished draft characters to `100000` and gracefully marked resolved if target sentences are missing.

## [2.0.2] - 2026-07-04

### Added
- **Chain-of-Thought (CoT) Reasoning Traces**: Integrated optional `"thinking"` property to the prompt schema definitions (`FEEDBACK_OUTPUT_PROMPT_SCHEMA`, `POLISH_DIAGNOSIS_OUTPUT_PROMPT_SCHEMA`) and Zod schemas (`FeedbackOutputSchema`, `PolishDiagnosisResponseSchema`, `FinalQualityGateSchema`), forcing reviewer roles and Quality Gate prompts to output step-by-step reasoning before generating verdicts.
- **Prompt Caching Caching Optimizations**: Restructured system prompt functions to place all dynamic prompt properties (like language policies and strictness instructions) under a `=== DYNAMIC CONSTRAINTS ===` block at the end, ensuring static template prefixes remain highly reusable for Gemini and Claude caching.
- **Replace/Insert Few-Shot Examples**: Added compact examples for the `replace` and `insert_after` edit operations in the 1-click apply rule prompt instructions.

## [2.0.1] - 2026-07-02

### Changed
- **Nginx Streaming Route Configuration**: Restructured Nginx location rule from `/api/draft` to a regex matching all actual backend streaming endpoints (`/api/analyze`, `/api/strategist/chat`, and `/api/strategist/generate-draft-from-notes`) to guarantee real-time typing/streaming UX.
- **PM2 Memory Limit Upgrade**: Increased memory limits (`--max-old-space-size` and `max_memory_restart`) in `ecosystem.config.cjs` from 150MB to 400MB to resolve OOM crashes and 502 Bad Gateway errors under load.

### Fixed
- **Production Database Migration**: Ran `npx prisma migrate deploy` to safely apply the pending database migration `20260630040119_add_copilot_chat_transaction_types` to the production database.

## [2.0.0] - 2026-07-02

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
