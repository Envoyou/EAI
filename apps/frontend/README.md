# Envoyou AI Editorial System

[English](./README.md) | [Bahasa Indonesia](./README.id.md)

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-3.x-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/gemini-api)

**Envoyou AI Editorial Intelligence** is an editorial AI platform for transforming rough article drafts into **publication-ready** pieces with a cleaner point of view, stronger structure, and usable SEO metadata.

The current product direction is intentionally simple: **paste a draft or ask EAI to help generate an initial draft idea, choose its category and article type, click `Refine Draft`, review the refined draft readiness report, then ship**. Under the hood, the app uses Gemini by default for staged editorial review, full-draft rewriting, final quality gating, and SEO packaging. Groq remains available as an optional alternative provider.

---

## 🚀 Key Features

1. **AI Drafting Assistant (New)**
   * Generate structured rough article drafts directly in the workspace from a topic, optional outline, and reference notes.
   * Inherits Category, Article Type, Target Audience, and Target Length from the editor metadata panel.
   * Streams generation in real-time to resolve the "blank page syndrome" for authors and editors.

2. **Single-Click Editorial Polish**
   * Paste or generate a rough article draft, select its category and article type, then run `Refine Draft`.
   * The system rewrites the draft into a more publishable Envoyou-style article rather than only returning abstract feedback.

3. **Refined Draft + Readiness Review**
   * Displays a `Refined Draft` panel for the polished output.
   * Includes a paragraph-level change preview to compare the source draft and the rewritten result.
   * Reports final readiness as `Ready`, `Needs Review`, or `Blocked` instead of scoring the intentionally rough source draft.

4. **SEO Pack Generation**
   * Generates title, slug, meta description, and tags as a dedicated SEO output stage.
   * Keeps SEO generation separate from the rewrite stage for better stability and cost control.

5. **Final Quality Gate & Source Fidelity**
   * Returns concise remaining checks, flags, and a summary of the improvements made to the final draft.
   * Audits numbers, URLs, entities, acronym expansions, unsupported motive attribution, temporal framing, Markdown tables, and source-verification requirements.
   * Keeps internal verification markers in the review layer while stripping them from the publication/CMS draft.
   * Supports `standard`, `compact`, and `manual_fallback` response modes so heavy drafts can still complete gracefully.

4. **Audit Log & Advanced History Sidebar**
   * Stores every analysis to PostgreSQL for quality tracking and prompt iteration for each tenant.
   * Pins each run to an immutable editorial profile version, core guardrail version, prompt version, and configuration hash for reproducible audits.
   * Restores past drafts, polished outputs, metadata, and response modes directly from history.
   * Features a smart sidebar with robust search, readiness filtering (Ready/Needs Review/Blocked), date-based grouping, cursor pagination, and persistent history deletion.

7. **Versioned Editorial Profiles**
   * Separates platform-enforced factual and verification guardrails from tenant-configurable brand, audience, tone, structure, categories, SEO limits, and additional prohibited patterns. All can be customized according to each tenant's brand.
   * Uses create-new-version-on-edit semantics; previous profile versions cannot be updated or hard-deleted.
   * Ships Envoyou as the default versioned profile while preserving its existing prompt output byte-for-byte.

8. **Tenant Onboarding**
   * Requires users to create or select a Clerk Organization before configuring publication identity, editorial standards, CMS connection, and activation.
   * Treats Clerk as the permanent source for workspace name and slug while EAI manages the publication identity separately.
   * Saves progress per organization and creates immutable editorial profile v1 only during final activation.
   * Encrypts tenant CMS credentials at rest with AES-256-GCM; secrets are never returned to the browser after storage.

9. **Export & CMS Integration**
   * Export the finalized draft and SEO metadata directly to an external CMS.
   * Tracks export status and source references directly in the History Sidebar for a seamless publishing workflow.
   * Routes CMS catalog and draft export through a tenant-aware adapter boundary.
   * Ships `envoyou-rest-v1` as the first adapter; profiles without a registered adapter fail explicitly instead of falling back to Envoyou.

10. **App Login, Settings Menu, & Demo Mode**
   * Supports a **Demo Mode** (unauthenticated Guest Mode) that lets new visitors try the workspace and run up to 2 free refinements without logging in first.
   * Gives an eligible workspace creator 10 free credits on their Clerk Organization. Invited members do not add another trial allocation.
   * Protects trial credit allocation from abuse by normalising signup emails (including Gmail plus/dot aliases), blocking disposable domains, and using idempotent workspace ledger entries.
   * Protects full access, history, dashboard analytics, publication settings, and CMS exports under a secure login.
   * Provides a `Settings` menu above the dark/light mode toggle for local user preferences, Auto-save, AI Output Language, Editorial Strictness, and logout/sign-in.

11. **Tenant Analytics Dashboard (New)**
   * View high-level editorial metrics including drafts processed, completion rate, SEO completion, voice match, and CMS export success.
   * Filter metrics dynamically by predefined time ranges (Last 7 Days, Last 30 Days, Last 90 Days, This Month, Last Month, All Time) or custom date ranges.
   * Track editor productivity with user breakdown statistics (reviews, ready rate, and average revisions).
   * Measure article publication velocity with Average Time-to-Publish.
   * Analyze content distribution via a visual Category Distribution breakdown.
   * Compare current workspace performance against previous periods dynamically with relative period-over-period comparison indicators.
   * Export tenant-focused reports directly to CSV.

---

## 🛠️ Technology Stack

*   **Core Framework**: [Next.js 16.2.6 (App Router)](https://nextjs.org/)
*   **UI Libraries**: [React 19](https://react.dev/), [Base UI](https://base-ui.com/), [Shadcn](https://ui.shadcn.com/)
*   **Styling & Motion**: [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
*   **ORM & Database**: [Prisma ORM 7.8.0](https://prisma.io/) with PostgreSQL hosted on [Neon Database](https://neon.tech/) (Serverless)
*   **AI Integration**: [Google Gen AI SDK 2.6.0](https://www.npmjs.com/package/@google/genai) with `gemini-3.5-flash` and `gemini-3.1-flash-lite`; Groq is an optional alternative provider
*   **Validation**: [Zod 4.4.3](https://zod.dev/)

---

## 📁 Key Project Structure

```text
ai-editorial-system/
├── docs/                     # Additional project documentation
├── prisma/
│   └── schema.prisma         # Database models (AnalysisLog)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── analyze/
│   │   │       └── route.ts  # Multi-stage Gemini orchestration & DB logging
│   │   ├── login/
│   │   │   └── page.tsx      # App login page
│   │   ├── dashboard/
│   │   │   └── page.tsx      # Analytics dashboard
│   │   ├── globals.css       # Tailwind CSS v4 globals and design tokens
│   │   ├── layout.tsx        # App layout shell
│   │   └── page.tsx          # Main editorial workspace
│   ├── components/
│   │   ├── Editor.tsx        # Text editor and article metadata form
│   │   ├── FeedbackPanel.tsx # Refinement report, readiness, remaining checks, and SEO output
│   │   ├── FinalDraftPanel.tsx # Final polished draft and paragraph diff preview
│   │   ├── HistorySidebar.tsx # Side panel for navigating past analysis logs
│   │   ├── SettingsMenu.tsx  # Workspace settings menu and logout action
│   │   ├── ThemeToggle.tsx   # Light/dark mode toggle button
│   │   └── ui/               # Core atomic UI components (Button, Input, etc.)
│   ├── lib/
│   │   ├── dashboard-auth.ts # Signed app/dashboard session helpers
│   │   ├── db.ts             # Prisma Client singleton
│   │   ├── diff.ts           # Paragraph diff helpers
│   │   ├── editorial-profile.ts # Core guardrails, profile config, prompt composer, and audit hash
│   │   ├── editorial-profile-server.ts # Immutable profile version resolution and creation
│   │   ├── editorial.ts      # Auto-apply editorial operations
│   │   ├── final-quality.ts  # Deterministic final-draft validation and cleanup
│   │   ├── prompts.ts        # System prompts and role-based templates
│   │   ├── schema.ts         # Zod schemas for AI response validation
│   │   └── utils.ts          # Classname merger helper
│   └── types/
│       └── index.ts          # TypeScript type definitions
├── .env.example              # Environment variables template
├── package.json              # App scripts and dependencies
└── tsconfig.json             # TypeScript configuration
```

---

## ⚙️ Setup & Local Installation

Follow these steps to run the Envoyou AI Editorial System locally on your machine.

### 1. Prerequisites
Ensure you have the following installed:
*   **Node.js** (version 18.x or newer)
*   **npm** (or Yarn / Pnpm / Bun)
*   PostgreSQL database (or a [Neon Database](https://neon.tech) account for a quick serverless PostgreSQL instance)

### 2. Navigate into the Project Folder
```bash
cd ai-editorial-system
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Copy `.env.example` to create a `.env` file:
```bash
cp .env.example .env
```
Open `.env` and fill in the configuration:
```env
# Neon Connection Pooling (Used for standard database queries at runtime)
DATABASE_URL="postgres://user:password@endpoint-pooler.neon.tech/neondb?pgbouncer=true&connect_timeout=15"

# Direct Connection (Bypasses PgBouncer pooling; required for Prisma migrations)
DIRECT_URL="postgres://user:password@endpoint.neon.tech/neondb?connect_timeout=15"

# Active AI provider
ACTIVE_AI_PROVIDER="gemini"

# Gemini API Key (primary provider)
GEMINI_API_KEY="your-gemini-api-key"

# Groq API Key (optional alternative provider)
GROQ_API_KEY="your-groq-api-key"

# Cost analytics: provider token usage is actual; IDR cost uses this rate
AI_COST_USD_TO_IDR="USD to IDR rate (e.g., 16500)"

# Optional model price overrides in USD per 1 million tokens
# AI_MODEL_PRICING_JSON='{"qwen/qwen3-32b":{"inputUsdPerMillion":0.29,"outputUsdPerMillion":0.59}}'

# Optional: separate secret for signing login sessions
DASHBOARD_AUTH_SECRET="your-random-session-secret"

# Product rollout flags (rebuild after changing NEXT_PUBLIC values)
NEXT_PUBLIC_DEMO_ENABLED="true"
NEXT_PUBLIC_SIGNUP_ENABLED="true"
NEXT_PUBLIC_PRICING_ENABLED="true"
NEXT_PUBLIC_BILLING_ENABLED="false"

# Payment gateway (midtrans)
PAYMENT_PROVIDER="midtrans"
PAYMENT_USD_TO_IDR_RATE="USD to IDR rate (e.g., 16500)"
PAYMENT_TAX_LABEL="Tax is not separately itemized in the displayed checkout amount."
MIDTRANS_CLIENT_ID="MCH-your-sandbox-client-id"
MIDTRANS_SECRET_KEY="your-sandbox-secret-key"
MIDTRANS_IS_PRODUCTION="false"

# Public legal identity
LEGAL_OPERATOR_NAME="your company name"
LEGAL_REGISTERED_ADDRESS="your company address"
LEGAL_SUPPORT_EMAIL="your business email"
LEGAL_CONTACT_EMAIL="your business email"
LEGAL_PRIVACY_EMAIL="your business email"
```

> [!NOTE]
> If the active provider key is empty or set to `"empty"`, the application falls back to **Development/Mock Mode** so you can test the UI flow without API cost.

The analytics dashboard records provider-reported token usage for each editorial stage. API cost values are estimates calculated from those tokens, the configured model price table, and `AI_COST_USD_TO_IDR`. During refinement, the UI shows the live review, rewrite, quality gate, SEO, and finalization stages while streaming the draft as soon as writing begins.

Gemini routing uses `gemini-3.1-flash-lite` for lightweight/fast stages and `gemini-3.5-flash` for complex review, fact-checking, rewriting, refinement, and quality gating. Gemini 3.x requests use `thinkingLevel` rather than the legacy numeric `thinkingBudget`.

MIDTRANS Checkout is the default payment provider. See [MIDTRANS production checklist](./docs/MIDTRANS_PRODUCTION.md). Midtrans remains available as a configured fallback through `PAYMENT_PROVIDER=midtrans`.

The pricing confirmation displays the final IDR amount calculated with
`PAYMENT_USD_TO_IDR_RATE`, together with the configured tax statement, credit
validity, and manual-renewal terms. Each order stores that final IDR amount for
webhook verification.

The rollout flags independently control guest demo access, new registrations,
pricing visibility, and paid checkout. Disabling billing changes purchase
buttons to **Coming Soon** and the checkout API returns `503`; existing payment
webhooks remain active so previously created orders can still be reconciled.

### 5. Setup Database & Prisma Migrations
For local schema development:
```bash
npx prisma migrate dev
```
For staging or production deployment:
```bash
npx prisma migrate status
npx prisma migrate deploy
```
*(Optional)* Open Prisma Studio to inspect database records inside a visual interface:
```bash
npx prisma studio
```

### 6. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.
You will be redirected to `/signup` before entering the editor workspace. The analytics dashboard remains available at `/dashboard` after login.

---

## 🧠 AI Evaluation Workflow

```mermaid
graph TD
    A[User opens the workspace] --> B[Login]
    B --> C[Paste or write a rough draft]
    C --> D[Select category and article type]
    D --> E[Optionally set audience, target length, and editorial brief]
    E --> F[Choose Fast Review or Publish Ready]
    F --> G[Click Refine Draft or press Ctrl Enter]
    G --> H{Provider API key configured?}
    H -- No --> I[Run development mock flow]
    H -- Yes --> J{Publish Ready mode?}
    J -- Yes --> K[Load relevant internal-link context]
    J -- No --> L[Skip internal-link lookup]
    K --> M[Review draft and identify editorial priorities]
    L --> M
    M --> N[Rewrite and stream the refined draft]
    N --> O[Normalize the publication draft]
    O --> P[Run final quality gate and deterministic checks]
    P --> Q{Publish Ready mode?}
    Q -- Yes --> R[Generate SEO metadata]
    Q -- No --> S[Skip SEO generation]
    R --> T[Save analysis and telemetry to Neon]
    S --> T
    T --> U[Display refined draft, readiness report, checks, and available SEO]
    M -- Error or timeout --> V[Save error details when possible]
    V --> W[Display error notification]
```

---

## 📖 Additional Documentation (in Indonesian)

For deep dives into our technical decisions and writing standards, read the documents located in the `docs/` folder:

*   **[Editorial Philosophy](./docs/editorial-philosophy.md)**: Envoyou content identity, tone guidelines, and automatic failing indicators.
*   **[Architecture Notes](./docs/architecture-notes.md)**: Tech choices, Neon serverless pooler setup, DB logging strategies, and Zod checks.
*   **[Prompt Evolution](./docs/prompt-evolution.md)**: System prompt structures, JSON parsing fixes, score bias correction, and future updates.
*   **[Future Roadmap](./docs/future-roadmap.md)**: Phase roadmap details (analytics tools, SEO & Fact-checking roles, WordPress integrations, and rich editor).
*   **[Evaluation Benchmark](./docs/evaluation-benchmark.md)**: Model performance comparisons (Claude 3.5 Sonnet vs. GPT-4o vs. Llama 3) and test suite guidelines.
*   **[DOKU Production Checklist](./docs/DOKU_PRODUCTION.md)**: Sandbox setup, notification URL, production credentials, and Midtrans fallback instructions.
*   **[Production Database Migrations](./docs/PRODUCTION_DATABASE_MIGRATIONS.md)**: Pending production migrations, deployment order, and post-deploy verification.

---

## 📋 What's News?
All notable changes to the **Envoyou AI Editorial System** will be documented in [CHANGELOG](./CHANGELOG.md)

---

## 📝 License

This project is licensed under the **MIT License**. Read the [LICENSE](./LICENSE) file for more information.
