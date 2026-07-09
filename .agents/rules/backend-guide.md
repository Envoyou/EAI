---
trigger: always_on
---

# Envoyou AI (EAI) — Backend Agent Guide

# Envoyou AI (EAI) — Backend Agent Guide

Specific guide for backend development of the EAI application in `apps/backend`.

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

## 2. Development Commands (CLI)

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
│   ├── schema.prisma     # Prisma database schema definition
│   └── migrations/       # Database SQL migrations history
├── src/
│   ├── server.ts         # Express API entry point
│   ├── worker.ts         # BullMQ processing worker (mock processor)
│   ├── middleware/
│   │   └── auth.ts       # Clerk JWT verification middleware
│   ├── lib/              # Core libraries
│   │   ├── db.ts         # Prisma Pooler connection configuration
│   │   ├── r2.ts         # Cloudflare R2 client
│   │   ├── queue.ts      # BullMQ connection & Redis client
│   │   └── ai/           # AI pipelines (reviewers, prompt caching helpers)
│   └── routes/           # Express router endpoints
```

---

## 4. Database & ORM Conventions (Prisma & Neon)

* **Neon Connection**: `DATABASE_URL` utilizes connection pooling. `DIRECT_URL` bypasses the pooler and must be used for database migrations (`prisma migrate`).
* **JSON Metadata**: The `AnalysisLog` model stores unstructured metadata in a JSON column (`metadata`). The data structure inside must be validated using Zod schemas from `@eai/shared` before being inserted or read (for example, to align `researchNotes` and `attachments`).

---

## 5. AI Pipeline & Prompting Rules

* **Gemini Prompt Caching**: Gemini supports static prompt caching.
  * Structure prompts by placing long, static system instructions at the **beginning**.
  * Place dynamic parameters (such as the user's article content) at the **end** beneath marker blocks: `=== DYNAMIC CONSTRAINTS ===` or `=== ARTICLE CONTENT ===`.
  * This maximizes cache reuse and reduces Gemini API token costs.
* **Chain-of-Thought (CoT)**: When designing JSON output schemas for AI reviewers or quality gates, ensure the Zod schema includes a `"thinking"` string property at the very top to hold the LLM reasoning process before yielding the final evaluation.

---

## 6. Authentication & Security

* **Token Auth**: All `/api/*` routes are protected by validating Clerk JWT bearer tokens. Tokens are forwarded from the Next.js frontend proxy.
* **Owner-Only Gating**: Sensitive administrative routes must use the `@eai/shared/server` utility (`isOwnerUser`) to restrict access only to the user IDs specified in the `OWNER_USER_IDS` environment variable.
* **CMS Encryption**: Tenant CMS credentials must be encrypted when written to the database using `CMS_CREDENTIALS_ENCRYPTION_KEY` and a secure encryption algorithm (e.g., AES-256-GCM). Never store them in plain text.
