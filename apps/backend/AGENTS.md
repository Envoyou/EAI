<!-- Managed by agent: workflow-architect -->
<!-- Last updated: 2026-07-29 -->
# Envoyou AI (EAI) — Backend Agent Guide

## Overview

This guide covers backend development rules for the EAI Express.js API and BullMQ worker located in `apps/backend`. It documents the tech stack, CLI commands, database conventions, AI pipeline patterns, and security protocols that all developers and AI agents must follow.


---

## 1. Tech Stack Backend

* **Runtime**: Node.js (Target ES2022, CommonJS output)
* **Framework**: Express.js 4
* **Language**: TypeScript 5
* **Bundler**: tsup (output to `dist/server.js`)
* **Dev Runner**: tsx (direct execution of `src/server.ts`)
* **Database ORM**: Prisma 7 + Neon Serverless Driver Adapter
* **Authentication**: `@clerk/backend`
* **Queue/Worker**: BullMQ + ioredis + Redis
* **AI Integration**: `@google/genai` (Gemini SDK), `groq-sdk`, OpenRouter (`openai` client wrapper)
* **Feature Flags**: Vercel Edge Config SDK
* **File Storage**: AWS S3 SDK pointed at Cloudflare R2 (10MB limit)

---

## Setup

Install dependencies from the repo root:

```bash
npm install
npx prisma generate  # Generate Prisma Client after install
```

Required environment variables (see `.env.example`):
- `DATABASE_URL` — Neon pooled connection string
- `DIRECT_URL` — Neon direct connection (used by `prisma migrate`)
- `REDIS_URL` — Redis/Upstash connection string
- `CLERK_SECRET_KEY` — Clerk backend secret
- `CMS_CREDENTIALS_ENCRYPTION_KEY` — AES-256-GCM key for CMS credential encryption

## Commands

Run these commands from the repository root using workspace filtering, or directly within the `apps/backend` directory:

```bash
# From the repository root
npm run dev -- --filter=backend              # Run dev server
npm run build -- --filter=backend            # Build with tsup
npm run lint -- --filter=backend             # Run lint check

# From inside apps/backend
cd apps/backend
npm run dev
npm run build
npm run lint
npx prisma generate                          # Regenerate Prisma Client
npx prisma migrate deploy                    # Deploy database migrations to Neon
```

---

## 3. Backend Directory Structure

```
apps/backend/
├── prisma/
│   ├── schema.prisma         # Prisma database schema
│   ├── prisma.config.ts      # Prisma 7 config — sets datasource URL from DIRECT_URL || DATABASE_URL
│   └── migrations/           # SQL migration history
├── src/
│   ├── server.ts             # Express entry point — mounts all routers
│   ├── worker.ts             # BullMQ job worker
│   ├── middleware/
│   │   ├── auth.ts           # Clerk JWT verification (requireAuth)
│   │   └── rate-limit.ts     # Atomic Redis-backed distributed HTTP rate limiter
│   ├── lib/
│   │   ├── db.ts             # Prisma + Neon serverless driver setup
│   │   ├── r2.ts             # Cloudflare R2 client (AWS S3 SDK)
│   │   ├── queue.ts          # BullMQ + Redis connection
│   │   ├── redis.ts          # Shared BullMQ and fail-fast request Redis clients
│   │   ├── prompts.ts        # Timezone, date, and prompt version helpers (no prompt bodies)
│   │   ├── text-utils.ts     # Text utilities (stripLeadingH1, joinRewrittenChunks — boundary-aware chunk joiner)
│   │   ├── final-quality.ts  # Final quality gate pipeline — deterministic source-fidelity checks & structural integrity audits (detectMissingSentenceBoundaries, detectContentAfterReferences)
│   │   ├── admin-billing.ts  # Subscription + credit ledger admin helpers
│   │   ├── admin-billing-core.ts  # Core billing primitives
│   │   ├── ai-provider-resolver.ts  # AI provider selection logic (resolveModel, provider overrides)
│   │   ├── ai-telemetry.ts   # AI usage telemetry (token, cost, stage duration)
│   │   ├── ai/gemini-request-policy.ts # Standard/Flex tier, timeout, and bounded capacity retry policy
│   │   ├── chat-billing.ts   # Credit accounting with insufficient-balance guards
│   │   ├── cms-adapter.ts    # CMS adapter abstraction
│   │   ├── credential-vault.ts  # Encrypted credential read/write
│   │   ├── editorial-profile-server.ts  # Editorial profile server helpers
│   │   ├── safe-url-fetch.ts # DNS-pinned HTTP(S) egress policy and SSRF protection
│   │   ├── fetch-with-timeout.ts # Shared aborting deadline for trusted outbound service calls
│   │   ├── request-abort.ts # Binds early HTTP response close to provider AbortSignal
│   │   ├── serializable-transaction.ts # Serializable Prisma transaction retry helper
│   │   ├── __tests__/        # Backend service and security regression tests
│   │   ├── services/         # Domain services
│   │   │   └── analysis-log.service.ts # AnalysisLog + credit transactional ledger operations
│   │   ├── email.ts          # Transactional email sender
│   │   ├── payment.ts        # Payment gateway integration
│   │   ├── payment-processing.ts  # Payment event processing
│   │   ├── trial-credits.ts  # Trial credit allocation
│   │   ├── user-workspace.ts # User + workspace resolver
│   │   ├── zoho-desk.ts      # Zoho Desk support ticket integration
│   │   └── ai/               # AI pipeline stages
│   │       ├── workspace-context.ts    # composeWorkspaceContext + getWorkspaceAgentInstruction
│   │       ├── prompt-context.ts       # Prompt context assembly
│   │       ├── provider-runtime.ts     # Legacy config helpers (deprecated)
│   │       ├── review-stage.ts         # Editorial review — utilizes ReviewPromptComposer
│   │       ├── quality-gate-stage.ts   # Quality gate — utilizes QualityGatePromptComposer
│   │       ├── seo-stage.ts            # SEO metadata generation stage — utilizes SeoPromptComposer
│   │       ├── targeted-fix-stage.ts   # Targeted fix — utilizes RefinementPromptComposer
│   │       ├── model-router.ts         # Sub-system for resolving model and output limit configs
│   │       ├── providers/              # Unified AIProvider abstraction layer
│   │       │   ├── interface.ts        # Contract, capabilities, and token usage schemas
│   │       │   ├── registry.ts         # getProvider() factory returning provider singletons
│   │       │   ├── gemini/             # GeminiProvider wrapping @google/genai
│   │       │   ├── openrouter/         # OpenRouterProvider wrapping openai
│   │       │   └── groq/               # GroqProvider wrapping groq-sdk
│   │       ├── runtime/                # Orchestrator for telemetry tracking
│   │       │   ├── execute-stream.ts   # Streaming telemetry collector
│   │       │   └── execute-generate.ts # Non-streaming telemetry collector
│   │       └── prompt-engine/          # Composable PCA engine
│   │           ├── core/               # Static platform instruction nodes
│   │           │   ├── mission.ts      # Editorial mission
│   │           │   ├── rules.ts        # Markdown, Verification, Language & Temporal rules
│   │           │   ├── facts.ts        # Factual guardrails & source policy
│   │           │   └── strategist.ts   # Strategist role, general constraints, examples, tool guidelines, and Fast Mode node
│   │           ├── tenant/             # Dynamic/tenant instruction nodes (profile, tone)
│   │           │   ├── profile.ts      # Brand metadata, positioning, audience
│   │           │   └── tone.ts         # Visual tone & few-shot examples
│   │           ├── composer/           # Stage composers (orchestrating AST nodes)
│   │           │   ├── seo-composer.ts              # SEO metadata generation AST composer
│   │           │   ├── review-composer.ts           # Multi-role review prompt AST composer
│   │           │   ├── rewrite-composer.ts          # Article rewrite stage AST composer
│   │           │   ├── refinement-composer.ts       # Iterative refinement & targeted fix AST composer
│   │           │   ├── quality-gate-composer.ts     # Quality Gate compliance audit AST composer
│   │           │   ├── strategist-composer.ts       # Quick draft & outline generation AST composer
│   │           │   ├── strategist-chat-composer.ts  # Interactive strategist chat AST composer
│   │           │   ├── strategist-blueprint-composer.ts # Blueprint & initial draft generation AST composer
│   │           │   └── draft-from-notes-composer.ts # Research notes to article draft AST composer
│   │           ├── pricing.ts          # Model pricing catalog & cost estimation utility
│   │           ├── token-estimator.ts  # Offline character-weighted estimator & online cached token counter
│   │           ├── cache-planner.ts    # Prompt caching prefix analyzer (static vs dynamic segments)
│   │           ├── cache-optimizer.ts  # Suggestion engine for prompt optimizations & AST layout ordering
│   │           ├── renderer.ts         # PromptRenderer class for formal visual rendering & XML boundary checks
│   │           ├── serializer.ts       # PromptSerializer class for bidirectional AST <-> JSON serialization
│   │           └── pruning-optimizer.ts # PromptPruningOptimizer for token budget-based node pruning
│   │           └── __tests__/          # Unit test suite for AST, estimators, and planners
│   │               ├── prompt-engine.test.ts # Comprehensive AST, Composer & Node unit tests
│   │               ├── token-estimator.test.ts # Token estimator unit tests
│   │               ├── cache-planner.test.ts   # Caching layout planner tests
│   │               └── cache-optimizer.test.ts # Caching optimization rule tests
│       ├── analyze/          # /api/analyze — modular AI analysis pipeline folder
│       │   ├── index.ts      # Router export (backward-compatible entry)
│       │   ├── controller.ts # Orchestrator (auth, workspace, SSE init, keep-alive)
│       │   ├── types.ts      # Shared types and constants
│       │   ├── handlers/     # Stage/mode execution paths (analyze, refine, fix-targeted, standalone publication checks/SEO, dev-mock)
│       │   └── utils/        # Decomposed utility helpers (signals, factual, verification, text, markdown)
│       ├── prompt-inspector.ts # POST /api/prompt-inspector & /diff — dev console AST audit
│       ├── workspace.ts      # GET/PATCH /api/workspace — workspace management
│       ├── history.ts        # GET /api/history — analysis log history
│       ├── export.ts         # POST /api/export — article export
│       ├── publicStats.ts    # GET /api/public-stats — public metrics
│       ├── checkout.ts       # POST /api/checkout — payment checkout
│       ├── payments.ts       # GET /api/payments — payment status
│       ├── onboarding.ts     # GET/POST /api/onboarding — onboarding wizard
│       ├── scrape.ts         # POST /api/scrape — URL content scraper
│       ├── support.ts        # POST /api/support — support form
│       ├── admin/            # /api/admin — modular owner-only admin operations folder (index, handlers, types, utils)
│       ├── analytics.ts      # GET /api/analytics — usage analytics
│       ├── editor.ts         # /api/editor — editor state management
│       ├── storage.ts        # /api/storage — R2 file storage
│       ├── health.ts         # GET /health, /api/health — shallow & deep health checks
│       ├── strategist/       # /api/strategist — modular AI strategist folder
│       │   ├── index.ts      # Router export, including optional development mock routing
│       │   ├── chat-protocol.ts # Shared production/mock SSE event contract and writer
│       │   ├── types.ts      # Zod validation schemas & derived types
│       │   ├── mock-chat-types.ts # Mock scenario and speed configuration types
│       │   ├── mock-chat.ts  # Opt-in protocol-compatible mock chat scenarios
│       │   ├── utils/        # Grounding URL resolution, leak sanitizer & workspace helpers
│       │   ├── handlers/     # Domain HTTP handlers (chat, plan, draft-from-notes, sessions)
│       │   ├── quick-draft.ts # /api/strategist/quick-draft — quick draft generation
│       │   └── __tests__/    # Production/mock protocol integration coverage
│       └── webhooks/
│           ├── clerk.ts      # /api/webhooks/clerk — Clerk user sync events
│           └── payment.ts    # /api/webhooks/payment — Midtrans payment events
```

## Code style

- **Language**: TypeScript 5 with strict mode; output targeting ES2022 CommonJS via `tsup`
- **Imports**: Use path aliases from `tsconfig.json`. Never use relative `../../../` chains.
- **Error handling**: All async route handlers must be wrapped with `try/catch`; never let unhandled promise rejections propagate to Express's default error handler.
- **Prisma**: Always call `prisma.$disconnect()` in graceful shutdown. Use `$transaction([])` for multi-step writes.
- **Shared types**: Import domain types and Zod schemas from `@eai/shared`. Import server-only utilities (encryption, admin guards) from `@eai/shared/server`.

## 4. Database & ORM Conventions (Prisma & Neon)

* **Prisma 7 Config-Based Datasource**: This project uses `prisma.config.ts` (Prisma 7 feature) instead of putting the URL inside `schema.prisma`. The config sets:
  ```ts
  datasource: { url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"] }
  ```
  This means `DIRECT_URL` is used when available (migrations, direct queries), and falls back to `DATABASE_URL` (pooled). The `schema.prisma` file intentionally has no `url =` field.
* **Neon Connection**: `DATABASE_URL` utilizes Neon's connection pooler. `DIRECT_URL` bypasses the pooler — always use it for migrations (`npx prisma migrate deploy`).
* **JSON Metadata**: The `AnalysisLog` model stores unstructured metadata in a JSON column (`metadata`). The data structure inside must be validated using Zod schemas from `@eai/shared` before being inserted or read (for example, to align `researchNotes` and `attachments`).

---

## 5. AI Pipeline Architecture

The AI analysis pipeline is composed of stages in `src/lib/ai/` and managed dynamically via the **Composable Prompt Component Architecture (PCA)** under `src/lib/ai/prompt-engine/`:

| Path / Class | Purpose |
|---|---|
| `workspace-context.ts` | Builds `<workspace_context>` XML + `<agent_instruction>` block via `composeWorkspaceContext` and `getWorkspaceAgentInstruction` |
| `prompt-context.ts` | Assembles the full prompt context (profile + content + notes + attachments) |
| `provider-runtime.ts` | Provider config helpers: `getNativeGeminiConfig` (native SDK calls) and `getOpenRouterSamplingConfig` (OpenRouter). `getGeminiSamplingConfig` is **deprecated** — do not use. |
| `gemini-request-policy.ts` | Resolves Standard/Flex inference, applies the long Flex timeout, and retries only 429/503 capacity errors without automatic Standard fallback. |
| `review-stage.ts` | Editorial review — utilizes `ReviewPromptComposer` and returns schema-constrained structured feedback; provider-native thinking is not copied into the JSON response |
| `quality-gate-stage.ts` | Final quality gate — utilizes `QualityGatePromptComposer` (`ThinkingLevel.LOW`), deterministic source-fidelity checks via `final-quality.ts` |
| `seo-stage.ts` | SEO metadata analysis and optimization recommendations — utilizes `SeoPromptComposer` |
| `targeted-fix-stage.ts` | Targeted fix — utilizes `RefinementPromptComposer` (`ThinkingLevel.LOW`), tenant-aware prompt with brand guidelines |
| `quick-draft.ts` | Strategist / Quick Draft route — utilizes `StrategistPromptComposer` for draft generation and outline creation |

### Composable Prompt Component Architecture (PCA)
Prompts are constructed dynamically as Abstract Syntax Trees (AST) using nodes located under `prompt-engine/core/` (statically defined guidelines) and `prompt-engine/tenant/` (tenant-specific details):
* **Core Nodes**: Statically configured platform rules (`EditorialMissionNode`, `LanguagePolicyNode`, `StrictnessConstraintNode`, `InputBoundaryNode`, `MarkdownRulesNode`, `VerificationLockNode`, `TemporalContextNode`, `OutputSchemaNode`).
* **Tenant Nodes**: Dynamic configurations (`BrandIdentityNode`, `ToneCalibrationNode`).
* **Composers**: Composers (`SeoPromptComposer`, `ReviewPromptComposer`, `RewritePromptComposer`, `RefinementPromptComposer`, `QualityGatePromptComposer`, `StrategistPromptComposer`, `ContentMemoryClassifierComposer`) assemble these nodes into a unified `CompositePromptNode`.
* **Gemini Prompt Caching**: Composers automatically group static Core nodes at the beginning of the prompt and append dynamic Tenant nodes at the end to maximize cache reuse and minimize Gemini API token costs.
* **Master Prompts File**: Berkas `src/lib/prompts.ts` is simplified and **only** exports timezone, date, and prompt version helpers. All prompt content must be updated inside the AST nodes and stage composers. Never inline raw system prompt blocks in route handlers or stages.

> **H1 Contract**: `routes/analyze/` (specifically the rewrite stage handler) applies `stripLeadingH1` (from `src/lib/text-utils.ts`) to the input draft **before** the rewrite stage. This removes any top-level heading that would duplicate the article title rendered by the frontend.

* **Provider-Native Thinking**: Reviewer and Quality Gate stages may enable provider-native thinking for model quality, but JSON response schemas must contain only the final editorial result. Do not request or persist manual chain-of-thought fields such as `"thinking"`.
* **Provider Cancellation**: Every AI request must pass the originating response-close `AbortSignal` through `StreamRequest` or the provider-native request options. Gemini Flex retry delays must receive the same signal. An `isDisconnected` flag may prevent later writes, but it is not a substitute for aborting active provider work.
* **Workspace Context & Compliance Helpers**:
  * All AI pipeline stages (SEO Optimizer, Fact-Checker, Targeted Fixes, Chat, Strategist) must utilize the shared prompt helper functions from `src/lib/ai/workspace-context.ts`:
    * `composeWorkspaceContext`: Builds a structured workspace context object and renders it as XML (`<workspace_context>`).
    * `getWorkspaceAgentInstruction`: Generates the dynamic `<agent_instruction>` guidelines detailing style restrictions and language fallbacks based on whether the workspace profile is fully configured.
  * Place reference materials and dates inside `<workspace_context>` tags and system-level instructions in `<agent_instruction>` tags to prevent prompt injection.

* **Tenant Content Memory**:
  * Persist canonical Blueprint and draft lifecycle metadata through
    `src/lib/content-memory.ts`; do not index raw Strategist conversations.
  * All artifact retrieval and Duplicate Guard queries must include the active
    internal `organizationId` at query time.
  * Search documents are derived data. Content artifacts and expiring topic
    reservations remain the authoritative registry.
  * Semantic vectors use pgvector `vector(768)` and the configured
    `CONTENT_MEMORY_EMBEDDING_MODEL`. Writes must invalidate stale embedding
    metadata and enqueue bounded background indexing; provider/queue failures
    must not roll back the canonical artifact.
  * Hybrid SQL must scope both `ContentSearchDocument` and joined
    `ContentArtifact` rows by the internal `organizationId`.
  * Probable-duplicate enforcement must use the shared calibration policy:
    feature flag, deterministic organization rollout cohort, minimum labeled
    sample count, and target precision. Missing flag/telemetry state is
    fail-open to shadow/advisory; exact and reservation blocks are never
    overridable.
  * `ContentMemoryClassifierComposer` is used only for ambiguous matches. Its
    structured output cannot produce an exact-duplicate verdict or blocking
    action, and only collaboration-safe metadata may enter its context.
  * Content Intelligence must remain request-time derived data, analyze at most
    300 recent artifacts, scope both sides of semantic pair queries by
    `organizationId`, fail open to metadata similarity, and never send tenant
    content to another model merely to render the dashboard.

---

## Security


* **Token Auth**: All `/api/*` routes are protected by validating Clerk JWT bearer tokens. Tokens are forwarded from the Next.js frontend proxy.
* **Owner-Only Gating**: Sensitive administrative routes must use the `@eai/shared/server` utility (`isOwnerUser`) to restrict access only to the user IDs specified in the `OWNER_USER_IDS` environment variable.
* **CMS Encryption**: Tenant CMS credentials must be encrypted when written to the database using `CMS_CREDENTIALS_ENCRYPTION_KEY` and a secure encryption algorithm (e.g., AES-256-GCM). Never store them in plain text.
* **Manual Subscription Override (Plan Injection)**:
  * Manually changing a tenant's subscription plan is performed via the helper `overrideOrganizationSubscription` in `src/lib/admin-billing.ts`.
  * This operation must be wrapped in a transaction that:
    1. Upserts the `Subscription` details (setting expiration and target plan).
    2. Cancels/resets the current `subscription` credit ledger balances using a `cycle_reset` transaction type.
    3. Allocates the new plan's default credits.
    4. Logs the admin's email, target org, Zoho support ticket ID, and adjustment reason for audit trails.
* **Operational Audit Logs**:
  * Critical administrative actions (credit adjustments, subscription plan overrides, user bans/unbans, and AI engine config updates) must write an audit trail using the `logAuditEvent` helper in `src/lib/audit.ts`.
  * Logs must capture the actor's email, actor's ID, target entity ID, target type (e.g., "Tenant", "User", "System"), a description, and details for comparison.
* **AI Provider Overrides**:
  * Organization-level AI provider and model overrides (stored in the format `provider:model` in the `aiProviderOverride` column) affect only the Refinement stage (rewrite, review, and SEO metadata).
  * Assigning model names in the refinement pipeline must be wrapped with the `resolveModel` helper to dynamically support these tenant-level engine configurations.

---

## Checklist

Before submitting a PR for backend changes:
- [ ] `npm run lint -- --filter=backend` passes with zero errors
- [ ] `npm run build -- --filter=backend` compiles without TypeScript errors
- [ ] New routes are protected by the Clerk auth middleware (except public endpoints like health check)
- [ ] No plain-text credentials written to the database
- [ ] Prisma schema changes accompanied by a migration file (`npx prisma migrate dev`)
- [ ] AI prompt changes follow the caching structure (static instructions first, dynamic last)

## Examples

### Adding a new authenticated route

```typescript
// src/routes/example.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/example', requireAuth, async (req, res) => {
  try {
    const data = await prisma.someModel.findMany();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

export default router;
```

## When stuck

- **Prisma errors**: Run `npx prisma generate` after schema changes; use `DIRECT_URL` for migrations.
- **Redis/BullMQ issues**: Check `REDIS_URL` is set and accessible; verify queue name matches between producer and worker.
- **Clerk auth failures**: Ensure `CLERK_SECRET_KEY` is set; check token forwarding headers from the frontend proxy.
- **Build errors**: Run `npm run build -- --filter=backend` to see TypeScript errors before deploying.
- **Architecture questions**: See [docs/architecture-notes.md](../../docs/architecture-notes.md).
