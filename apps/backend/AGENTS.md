<!-- Managed by agent: workflow-architect -->
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
│   │   └── auth.ts           # Clerk JWT verification (requireAuth)
│   ├── lib/
│   │   ├── db.ts             # Prisma + Neon serverless driver setup
│   │   ├── r2.ts             # Cloudflare R2 client (AWS S3 SDK)
│   │   ├── queue.ts          # BullMQ + Redis connection
│   │   ├── prompts.ts        # Master AI prompt library (all stages)
│   │   ├── final-quality.ts  # Final quality gate pipeline
│   │   ├── admin-billing.ts  # Subscription + credit ledger admin helpers
│   │   ├── admin-billing-core.ts  # Core billing primitives
│   │   ├── ai-provider-resolver.ts  # AI provider selection logic
│   │   ├── ai-telemetry.ts   # AI usage telemetry
│   │   ├── chat-billing.ts   # Chat credit accounting
│   │   ├── cms-adapter.ts    # CMS adapter abstraction
│   │   ├── credential-vault.ts  # Encrypted credential read/write
│   │   ├── editorial-profile-server.ts  # Editorial profile server helpers
│   │   ├── email.ts          # Transactional email sender
│   │   ├── payment.ts        # Payment gateway integration
│   │   ├── payment-processing.ts  # Payment event processing
│   │   ├── trial-credits.ts  # Trial credit allocation
│   │   ├── user-workspace.ts # User + workspace resolver
│   │   ├── zoho-desk.ts      # Zoho Desk support ticket integration
│   │   └── ai/               # AI pipeline stages
│   │       ├── workspace-context.ts    # composeWorkspaceContext + getWorkspaceAgentInstruction
│   │       ├── prompt-context.ts       # Prompt context assembly
│   │       ├── provider-runtime.ts     # Provider runtime abstraction
│   │       ├── review-stage.ts         # Content review stage
│   │       ├── quality-gate-stage.ts   # Quality gate evaluation stage
│   │       ├── seo-stage.ts            # SEO analysis stage
│   │       └── targeted-fix-stage.ts   # Targeted fix application stage
│   └── routes/
│       ├── analyze.ts        # POST /api/analyze — core AI analysis pipeline
│       ├── workspace.ts      # GET/PATCH /api/workspace — workspace management
│       ├── history.ts        # GET /api/history — analysis log history
│       ├── export.ts         # POST /api/export — article export
│       ├── publicStats.ts    # GET /api/public-stats — public metrics
│       ├── checkout.ts       # POST /api/checkout — payment checkout
│       ├── payments.ts       # GET /api/payments — payment status
│       ├── onboarding.ts     # GET/POST /api/onboarding — onboarding wizard
│       ├── scrape.ts         # POST /api/scrape — URL content scraper
│       ├── support.ts        # POST /api/support — support form
│       ├── admin.ts          # /api/admin — owner-only admin operations
│       ├── analytics.ts      # GET /api/analytics — usage analytics
│       ├── editor.ts         # /api/editor — editor state management
│       ├── storage.ts        # /api/storage — R2 file storage
│       ├── strategist/
│       │   ├── index.ts      # /api/strategist — content strategy AI
│       │   └── quick-draft.ts  # /api/strategist/quick-draft — quick draft gen
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

The AI analysis pipeline is composed of stages in `src/lib/ai/`:

| Stage file | Purpose |
|---|---|
| `workspace-context.ts` | Builds `<workspace_context>` XML + `<agent_instruction>` block via `composeWorkspaceContext` and `getWorkspaceAgentInstruction` |
| `prompt-context.ts` | Assembles the full prompt context (profile + content + notes + attachments) |
| `provider-runtime.ts` | Resolves the active AI provider (Gemini / Groq / OpenRouter) per organization override |
| `review-stage.ts` | Runs the editorial review — returns structured feedback with `thinking` CoT field |
| `quality-gate-stage.ts` | Evaluates overall content quality score; acts as the pipeline gate |
| `seo-stage.ts` | SEO metadata analysis and optimization recommendations |
| `targeted-fix-stage.ts` | Applies targeted fixes from reviewer feedback to specific content sections |

Master prompts for all stages live in `src/lib/prompts.ts`. Never write inline prompts in route handlers.


* **Gemini Prompt Caching**: Gemini supports static prompt caching.
  * Structure prompts by placing long, static system instructions at the **beginning**.
  * Place dynamic parameters (such as the user's article content) at the **end** beneath marker blocks: `=== DYNAMIC CONSTRAINTS ===` or `=== ARTICLE CONTENT ===`.
  * This maximizes cache reuse and reduces Gemini API token costs.
* **Chain-of-Thought (CoT)**: When designing JSON output schemas for AI reviewers or quality gates, ensure the Zod schema includes a `"thinking"` string property at the very top to hold the LLM reasoning process before yielding the final evaluation.
* **Workspace Context & Compliance Helpers**:
  * All AI pipeline stages (SEO Optimizer, Fact-Checker, Targeted Fixes, Chat) must utilize the shared prompt helper functions from `src/lib/ai/workspace-context.ts`:
    * `composeWorkspaceContext`: Builds a structured workspace context object and renders it as XML (`<workspace_context>`).
    * `getWorkspaceAgentInstruction`: Generates the dynamic `<agent_instruction>` guidelines detailing style restrictions and language fallbacks based on whether the workspace profile is fully configured.
  * Place reference materials and dates inside `<workspace_context>` tags and system-level instructions in `<agent_instruction>` tags to prevent prompt injection.

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

---

## Checklist

Before submitting a PR for backend changes:
- [ ] `npm run lint -- --filter=backend` passes with zero errors
- [ ] `npm run build -- --filter=backend` compiles without TypeScript errors
- [ ] New routes are protected by the Clerk auth middleware
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
