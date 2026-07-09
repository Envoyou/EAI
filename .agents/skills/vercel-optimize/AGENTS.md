<!-- Managed by agent: workflow-architect -->
# vercel-optimize

Cross-agent entry point for the Vercel Optimize skill. The full procedure is in [SKILL.md](./SKILL.md).

Use this skill when the user asks to optimize a Vercel project, reduce a Vercel bill, investigate slow or expensive routes, find caching opportunities, reduce function invocations, or produce a Vercel cost/performance report.

Do not use it for projects that are not deployed on Vercel, greenfield projects with no traffic, or general code review.

## Requirements

- Node.js 20+
- Vercel CLI with `vercel metrics`, `vercel usage`, `vercel contract`, and `vercel api` support; v53+ is this skill's compatibility floor
- Authenticated Vercel CLI session
- Linked Vercel project directory (`vercel link`) for route metrics. `VERCEL_PROJECT_ID` can help resolve project config, but it does not replace directory linkage for `vercel metrics`. The project must resolve to a CLI-safe team or personal scope so `vercel metrics`, `vercel usage`, and `vercel contract` all run against the same account.
- Observability Plus for per-route metric analysis

## Procedure

1. Read [SKILL.md](./SKILL.md).
2. Collect Vercel signals before reading source files.
3. Gate candidates with deterministic scripts.
4. Investigate only files named by launched candidates.
5. Verify recommendations mechanically before rendering the report.

The hard rules are in [references/doctrine.md](./references/doctrine.md): observability first, deterministic gates, candidate-bound scope, and version-aware citations.

## Install

Preferred:

```bash
npx skills add vercel-labs/agent-skills --skill vercel-optimize
```

Manual project install:

```bash
mkdir -p .agents/skills
cp -R <agent-skills-repo>/skills/vercel-optimize .agents/skills/
```

Then add this to the project `AGENTS.md`:

```md
When optimizing Vercel cost or performance, follow
`.agents/skills/vercel-optimize/SKILL.md` before proposing changes.
Collect Vercel metrics before reading source files.
```

## Overview

This skill provides reference guidance for Vercel and React development patterns used in the EAI frontend.

## Setup

See the root [AGENTS.md](../../../AGENTS.md) and [apps/frontend/AGENTS.md](../../../apps/frontend/AGENTS.md) for environment setup instructions.

## Build

Run `npm run build -- --filter=frontend` from the repo root to build the Next.js frontend.

## Code style

Follow the conventions in [apps/frontend/AGENTS.md](../../../apps/frontend/AGENTS.md) — use `ui-btn`, `ui-badge`, and `ui-alert` CSS classes; prefer RSC over client components.

## Security

Never import `@eai/shared/server` in client components. Follow the security rules in [apps/frontend/AGENTS.md](../../../apps/frontend/AGENTS.md).

## Examples

See individual sections above and [apps/frontend/AGENTS.md](../../../apps/frontend/AGENTS.md) for usage examples.

## When stuck

See [apps/frontend/AGENTS.md](../../../apps/frontend/AGENTS.md) for troubleshooting guidance and [docs/architecture-notes.md](../../../docs/architecture-notes.md) for architectural context.

