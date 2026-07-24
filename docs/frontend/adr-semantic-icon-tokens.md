# ADR: Tree-shakeable semantic icon tokens and action buttons

## Status

Accepted on 2026-07-24.

## Context

The frontend currently imports 144 distinct Lucide shapes across 72 files and
renders 277 canonical buttons across 62 files. Shape names do not consistently
communicate intent: for example, a generic sparkle represented draft
refinement, publication preparation, and assistant chat on the same screen.

The system needs globally consistent icon semantics without turning every client
chunk into a consumer of a monolithic runtime registry. It must also preserve
the existing `Button` primitive, responsive behavior, accessibility labels, and
bounded migration strategy.

## Options considered

| Option | Benefits | Costs |
| --- | --- | --- |
| Runtime string registry (`icon="prepare"`) | Compact call sites and centralized lookup | A shared object retains unrelated icons, weakens tree-shaking, and makes domain ownership unclear |
| One global object of Lucide components | Easy discovery | Encourages a god registry and imports the catalog through one client boundary |
| Named semantic exports grouped by domain | Static typing, direct imports, tree-shaking, explicit ownership | More import statements and aliases must be added as intents emerge |
| Continue importing Lucide shapes directly | No migration cost | Preserves semantic drift and repeated icon/label button markup |

## Decision

1. Semantic icon tokens are named component exports grouped under
   `components/ui/icons/<domain>.ts`.
2. Token names describe feature intent, not geometry. Multiple tokens may
   intentionally resolve to the same Lucide shape.
3. Feature code imports directly from a domain module. No runtime string
   registry and no global icon object are permitted.
4. `ActionButton` composes the canonical `Button` for the standard static icon,
   label, and loading-state pattern. Tabs, toggles, polymorphic triggers, and
   structurally rich controls continue using `Button`.
5. Existing direct Lucide imports are migrated feature-by-feature. New or
   touched icon actions adopt semantic tokens immediately.

## Consequences

- Intent remains stable even if the underlying visual asset changes.
- Desktop and mobile surfaces share the same token.
- Named imports remain compatible with Next.js and Lucide package
  optimization.
- The migration is not a blind global rename: each usage requires a semantic
  decision.
- Domain catalogs and regression tests become part of the design-system
  contract.

## Revisit triggers

Reconsider the named-export approach if bundle analysis shows domain modules
retaining unused icons, if product theming requires tenant-provided icon packs,
or if the catalog grows without clear domain ownership.
