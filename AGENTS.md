<!-- Managed by agent: workflow-architect -->
<!-- Last updated: 2026-07-29 -->

# EAI (Envoyou AI) — Monorepo Agent Guide

> **Precedence**: The closest AGENTS.md wins. Rules in `apps/frontend/AGENTS.md`
> override root rules for frontend code. Rules in `apps/backend/AGENTS.md` override
> root rules for backend code. Scoped files always take precedence over this root guide.

## Scoped AGENTS.md (MUST read before editing)

Before writing any code, read the scoped guide for your target area:

- [Frontend Guide](./apps/frontend/AGENTS.md) — Next.js 16 / React 19 frontend rules
- [Backend Guide](./apps/backend/AGENTS.md) — Express / Prisma backend rules

---

This guide helps both AI coding agents and human developers navigate the monorepo architecture, locate sub-application rules, and understand workflow guidelines.

---

## 🧭 Navigation Instructions (Mandatory)

This project separates concerns into specialized areas to maintain a clean codebase. **Before you write any code, you must read the relevant guide for your target area:**

1. **Frontend Development (`apps/frontend`)**:
   👉 Read [apps/frontend/AGENTS.md](./apps/frontend/AGENTS.md)
   *Contains rules for Next.js 16/React 19 development, frontend CLI commands, and **strict styling constraints** (e.g., standardized button classes, custom selects, tooltip triggers, external avatars, and inline alerts).*

2. **Backend Development (`apps/backend`)**:
   👉 Read [apps/backend/AGENTS.md](./apps/backend/AGENTS.md)
   *Contains instructions for Express/Prisma setup, Neon database migrations, Gemini prompt caching strategies, and backend security protocols.*

3. **Shared Package (`packages/shared`)**:
   * The `@eai/shared` package serves as the single source of truth for domain types, Zod schemas, and pure utilities.
   * Both the Next.js frontend and the Express backend import this package directly from TypeScript sources (`.ts`) during development.
   * **Export Rules**:
     - `@eai/shared`: Contains universal code safe for both the client (browser) and server.
     - `@eai/shared/server`: Contains server-only utilities (Node.js cryptographic libraries, Edge Config integrations, admin privilege guards). **Do not import this path in frontend client components**, as doing so breaks browser compilation.

---

## 📚 Supporting Documentation

Refer to these resources for detailed architectural overviews, third-party integrations, infrastructure guides, and legal compliance materials:

### Architecture & AI Planning
* 📄 [Architecture Notes](./docs/architecture-notes.md) — Detailed design of the intelligent content analysis and AI editor system.
* 📄 [Prompt Component Architecture](./docs/prompt-component-architecture.md) — Formal design spec, layers, caching tree, and future roadmap of EAI's Composable PCA.
* 📄 [Future Roadmap](./docs/future-roadmap.md) — Multi-phase plans for workspace upgrades and CMS integrations.
* 📄 [Prompt Evolution](./docs/prompt-evolution.md) — Documentation of prompt engineering history and prompt designs.

### Database & Infrastructure
* 📄 [Railway Deployment & Migration Guide](./docs/RAILWAY-MIGRATION.md) — Operational instructions for active Express backend servers on Railway.
* 📄 [Prisma Production Database Migrations](./docs/PRODUCTION_DATABASE_MIGRATIONS.md) — Database change workflows on Neon Serverless.
* 📄 [Legacy VPS Guide](./docs/PRODUCTION-VPS.md) — Archived guide for the historical VPS setup.

### Frontend & Third-Party Integrations
* 📄 [Midtrans Production Checklist](./docs/frontend/MIDTRANS_PRODUCTION.md) — Production setup for the Midtrans payment gateway.
* 📄 [Zoho Desk Integration](./docs/frontend/ZOHO_DESK.md) — Operational configuration for support forms.
* 📄 [Editorial Philosophy](./docs/frontend/editorial-philosophy.md) — Core concepts driving the Envoyou smart editorial workspace.
* 📄 [Evaluation Benchmark](./docs/frontend/evaluation-benchmark.md) — Content quality benchmark and evaluation strategies for the AI system.
* 📄 [UI Architecture v3.17.0](./docs/frontend/ui-architecture.md) — Canonical frontend rendering, workspace, design-system, editor, and overlay boundaries.
* 📄 [Historical Editor CSS Incident Analysis](./docs/frontend/historical-editor-css-incident-analysis.md) — Revalidated record of pre-v3.4 editor styling issues and their current status.

---

## 💡 Composable Prompt Component Architecture & Brand Compliance Rules (Mandatory)

To guarantee that all AI assistant operations (Chat, SEO Optimizer, Fact-Checker, Targeted Fixes, Strategist, Quality Gate) align with the active tenant's brand voice:
* **Composable Prompt Component Architecture (PCA)**: All prompts must be built modularly using AST nodes (Core and Tenant nodes) and composed via their respective stage composers:
  - `SeoPromptComposer` (SEO Stage)
  - `ReviewPromptComposer` (Review/Polish Stage)
  - `RewritePromptComposer` (Rewrite Stage)
  - `RefinementPromptComposer` (Iterative Refinement & Targeted Fix Stages)
  - `QualityGatePromptComposer` (Final Quality Gate Stage)
  - `StrategistPromptComposer` (Draft & Outline Strategist Stages)
  - `ContentMemoryClassifierComposer` (Ambiguous Content Overlap Stage)
* **Gemini Prompt Caching Optimization**: All composers must inherit from `CompositePromptNode`, which automatically groups static platform rules and guidelines (Core nodes) at the beginning of the prompt and appends dynamic article/workspace context (Tenant nodes) at the end, maximizing Gemini prompt caching efficiency.
* **Input Boundary Guidelines**: Place references and context inside the `<workspace_context>` tag, and dynamic system rules inside the `<agent_instruction>` tag.
* **Never Duplicate Instructions**: Always fetch instructions through the shared helper `getWorkspaceAgentInstruction` and inject them as system guidelines (`systemInstruction` or provider-specific system prompts) instead of hardcoding them in endpoints.
* **Provider Config Helpers**: For native Gemini calls, use `getNativeGeminiConfig(thinkingLevel)` from `apps/backend/src/lib/ai/provider-runtime.ts`. Do **not** use the deprecated `getGeminiSamplingConfig` — the `temperature` param is silently ignored by the Gemini 2.5 SDK when `thinkingConfig` is active.
* **H1 Format Contract**: The input draft passed to the rewrite stage must **never** contain a leading `# H1` heading. `routes/analyze/` (specifically the rewrite stage handler) automatically applies `stripLeadingH1` before invoking the rewrite stage. If you add a new entry point that feeds content into the rewrite pipeline, ensure this utility is applied first.

---

## 1. Repository Layout & Monorepo Structure

```text
/
├── apps/
│   ├── backend/          # Express.js API + BullMQ worker (Railway) -> See apps/backend/AGENTS.md
│   └── frontend/         # Next.js 16 App Router (Vercel) -> See apps/frontend/AGENTS.md
├── packages/
│   └── shared/           # Shared types, schemas, and utilities (@eai/shared)
├── docs/                 # Supporting documentation (Architecture, Migrations, Legal)
├── package.json          # Root monorepo manifest
├── turbo.json            # Turborepo build pipeline configuration
└── AGENTS.md             # Primary developer & agent guide (This file)
```

### Tenant Content Memory

* `ContentArtifact` is the canonical tenant-scoped registry for Blueprints,
  drafts, analyzed content, and future CMS imports.
* `ContentSearchDocument` contains rebuildable retrieval data; it is not a
  source of truth and must never be queried without `organizationId`.
* Semantic retrieval uses model-versioned 768-dimensional pgvector embeddings
  generated by bounded BullMQ jobs. Stale or unavailable vectors must degrade
  to deterministic/full-text retrieval without failing the editorial request.
* Duplicate Guard uses deterministic checks and expiring
  `ContentReservation` claims before AI generation. Exact matches and active
  reservation collisions are non-overridable. Probable duplicates may block
  only through the shared feature-gated, cohort-based calibration policy;
  unavailable or insufficient telemetry must remain shadow/advisory.
* The structured LLM classifier is an ambiguity adjudicator only. Its schema
  cannot return `exact_duplicate` or `block`, and related artifacts are context
  rather than factual sources.
* Content Intelligence is a rebuildable, bounded projection. Semantic graph
  queries must scope both sides by `organizationId`, degrade to metadata
  clustering, avoid additional model calls, and exclude same-family lifecycle
  derivatives from cannibalization/internal-link pair recommendations.

---

## 2. Global Development Commands (Root CLI)

Run these commands from the repository root to execute scripts across the entire monorepo:

```bash
# Start both frontend and backend development servers concurrently
npm run dev

# Build all applications and packages using Turborepo
npm run build

# Run lint checks across all workspaces
npm run lint

# Clean all build outputs and caching folders (.next, dist, node_modules)
npm run clean
```

---

## 3. Updating This Guide

If you make structural updates to the monorepo, global scripts, or package configurations, you must update this root [AGENTS.md](./AGENTS.md) file. For specific frontend UI components or backend API routing questions, update the corresponding `AGENTS.md` in [apps/frontend/AGENTS.md](./apps/frontend/AGENTS.md) or [apps/backend/AGENTS.md](./apps/backend/AGENTS.md) instead.

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./node_modules/next/dist/docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output AGENTS.md|01-app:{04-glossary.md}|01-app/01-getting-started:{01-installation.md,02-project-structure.md,03-layouts-and-pages.md,04-linking-and-navigating.md,05-server-and-client-components.md,06-fetching-data.md,07-mutating-data.md,08-caching.md,09-revalidating.md,10-error-handling.md,11-css.md,12-images.md,13-fonts.md,14-metadata-and-og-images.md,15-route-handlers.md,16-proxy.md,17-deploying.md,18-upgrading.md}|01-app/02-guides:{ai-agents.md,analytics.md,authentication.md,backend-for-frontend.md,caching-without-cache-components.md,cdn-caching.md,ci-build-caching.md,content-security-policy.md,css-in-js.md,custom-server.md,data-security.md,debugging.md,deploying-to-platforms.md,draft-mode.md,environment-variables.md,forms.md,how-revalidation-works.md,incremental-static-regeneration.md,instant-navigation.md,instrumentation.md,internationalization.md,json-ld.md,lazy-loading.md,local-development.md,mcp.md,mdx.md,memory-usage.md,migrating-to-cache-components.md,multi-tenant.md,multi-zones.md,open-telemetry.md,package-bundling.md,ppr-platform-guide.md,prefetching.md,preserving-ui-state.md,production-checklist.md,progressive-web-apps.md,public-static-pages.md,redirecting.md,rendering-philosophy.md,sass.md,scripts.md,self-hosting.md,single-page-applications.md,static-exports.md,streaming.md,tailwind-v3-css.md,third-party-libraries.md,videos.md,view-transitions.md}|01-app/02-guides/migrating:{app-router-migration.md,from-create-react-app.md,from-vite.md}|01-app/02-guides/testing:{cypress.md,jest.md,playwright.md,vitest.md}|01-app/02-guides/upgrading:{codemods.md,version-14.md,version-15.md,version-16.md}|01-app/03-api-reference:{07-edge.md,08-turbopack.md}|01-app/03-api-reference/01-directives:{use-cache-private.md,use-cache-remote.md,use-cache.md,use-client.md,use-server.md}|01-app/03-api-reference/02-components:{font.md,form.md,image.md,link.md,script.md}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.md,manifest.md,opengraph-image.md,robots.md,sitemap.md}|01-app/03-api-reference/03-file-conventions/02-route-segment-config:{dynamicParams.md,instant.md,maxDuration.md,preferredRegion.md,runtime.md}|01-app/03-api-reference/03-file-conventions:{default.md,dynamic-routes.md,error.md,forbidden.md,instrumentation-client.md,instrumentation.md,intercepting-routes.md,layout.md,loading.md,mdx-components.md,not-found.md,page.md,parallel-routes.md,proxy.md,public-folder.md,route-groups.md,route.md,src-folder.md,template.md,unauthorized.md}|01-app/03-api-reference/04-functions:{after.md,cacheLife.md,cacheTag.md,catchError.md,connection.md,cookies.md,draft-mode.md,fetch.md,forbidden.md,generate-image-metadata.md,generate-metadata.md,generate-sitemaps.md,generate-static-params.md,generate-viewport.md,headers.md,image-response.md,next-request.md,next-response.md,not-found.md,permanentRedirect.md,redirect.md,refresh.md,revalidatePath.md,revalidateTag.md,unauthorized.md,unstable_cache.md,unstable_noStore.md,unstable_rethrow.md,updateTag.md,use-link-status.md,use-params.md,use-pathname.md,use-report-web-vitals.md,use-router.md,use-search-params.md,use-selected-layout-segment.md,use-selected-layout-segments.md,userAgent.md}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.md,allowedDevOrigins.md,appDir.md,assetPrefix.md,authInterrupts.md,basePath.md,cacheComponents.md,cacheHandlers.md,cacheLife.md,compress.md,crossOrigin.md,cssChunking.md,deploymentId.md,devIndicators.md,distDir.md,env.md,expireTime.md,exportPathMap.md,generateBuildId.md,generateEtags.md,headers.md,htmlLimitedBots.md,httpAgentOptions.md,images.md,incrementalCacheHandlerPath.md,inlineCss.md,logging.md,mdxRs.md,onDemandEntries.md,optimizePackageImports.md,output.md,pageExtensions.md,poweredByHeader.md,productionBrowserSourceMaps.md,proxyClientMaxBodySize.md,reactCompiler.md,reactMaxHeadersLength.md,reactStrictMode.md,redirects.md,rewrites.md,sassOptions.md,serverActions.md,serverComponentsHmrCache.md,serverExternalPackages.md,staleTimes.md,staticGeneration.md,taint.md,trailingSlash.md,transpilePackages.md,turbopack.md,turbopackFileSystemCache.md,turbopackIgnoreIssue.md,typedRoutes.md,typescript.md,urlImports.md,useLightningcss.md,viewTransition.md,webVitalsAttribution.md,webpack.md}|01-app/03-api-reference/05-config:{02-typescript.md,03-eslint.md}|01-app/03-api-reference/06-cli:{create-next-app.md,next.md}|01-app/03-api-reference/07-adapters:{01-configuration.md,02-creating-an-adapter.md,03-api-reference.md,04-testing-adapters.md,05-routing-with-next-routing.md,06-implementing-ppr-in-an-adapter.md,07-runtime-integration.md,08-invoking-entrypoints.md,09-output-types.md,10-routing-information.md,11-use-cases.md}|02-pages/01-getting-started:{01-installation.md,02-project-structure.md,04-images.md,05-fonts.md,06-css.md,11-deploying.md}|02-pages/02-guides:{analytics.md,authentication.md,babel.md,ci-build-caching.md,content-security-policy.md,css-in-js.md,custom-server.md,debugging.md,draft-mode.md,environment-variables.md,forms.md,incremental-static-regeneration.md,instrumentation.md,internationalization.md,lazy-loading.md,mdx.md,multi-zones.md,open-telemetry.md,package-bundling.md,post-css.md,preview-mode.md,production-checklist.md,redirecting.md,sass.md,scripts.md,self-hosting.md,static-exports.md,tailwind-v3-css.md,third-party-libraries.md}|02-pages/02-guides/migrating:{app-router-migration.md,from-create-react-app.md,from-vite.md}|02-pages/02-guides/testing:{cypress.md,jest.md,playwright.md,vitest.md}|02-pages/02-guides/upgrading:{codemods.md,version-10.md,version-11.md,version-12.md,version-13.md,version-14.md,version-9.md}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.md,02-dynamic-routes.md,03-linking-and-navigating.md,05-custom-app.md,06-custom-document.md,07-api-routes.md,08-custom-error.md}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.md,02-static-site-generation.md,04-automatic-static-optimization.md,05-client-side-rendering.md}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.md,02-get-static-paths.md,03-forms-and-mutations.md,03-get-server-side-props.md,05-client-side.md}|02-pages/03-building-your-application/06-configuring:{12-error-handling.md}|02-pages/04-api-reference:{06-edge.md,08-turbopack.md}|02-pages/04-api-reference/01-components:{font.md,form.md,head.md,image-legacy.md,image.md,link.md,script.md}|02-pages/04-api-reference/02-file-conventions:{instrumentation.md,proxy.md,public-folder.md,src-folder.md}|02-pages/04-api-reference/03-functions:{get-initial-props.md,get-server-side-props.md,get-static-paths.md,get-static-props.md,next-request.md,next-response.md,use-params.md,use-report-web-vitals.md,use-router.md,use-search-params.md,userAgent.md}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.md,allowedDevOrigins.md,assetPrefix.md,basePath.md,bundlePagesRouterDependencies.md,compress.md,crossOrigin.md,deploymentId.md,devIndicators.md,distDir.md,env.md,exportPathMap.md,generateBuildId.md,generateEtags.md,headers.md,httpAgentOptions.md,images.md,logging.md,onDemandEntries.md,optimizePackageImports.md,output.md,pageExtensions.md,poweredByHeader.md,productionBrowserSourceMaps.md,proxyClientMaxBodySize.md,reactStrictMode.md,redirects.md,rewrites.md,serverExternalPackages.md,trailingSlash.md,transpilePackages.md,turbopack.md,typescript.md,urlImports.md,useLightningcss.md,webVitalsAttribution.md,webpack.md}|02-pages/04-api-reference/04-config:{01-typescript.md,02-eslint.md}|02-pages/04-api-reference/05-cli:{create-next-app.md,next.md}|02-pages/04-api-reference/06-adapters:{01-configuration.md,02-creating-an-adapter.md,03-api-reference.md,04-testing-adapters.md,05-routing-with-next-routing.md,06-implementing-ppr-in-an-adapter.md,07-runtime-integration.md,08-invoking-entrypoints.md,09-output-types.md,10-routing-information.md,11-use-cases.md}|03-architecture:{accessibility.md,fast-refresh.md,nextjs-compiler.md,supported-browsers.md}|04-community:{01-contribution-guide.md,02-rspack.md}<!-- NEXT-AGENTS-MD-END -->
