# EAI Frontend UI Architecture — v3.13.0

> Status: canonical architecture snapshot
> Snapshot date: 2026-07-19
> Scope: `apps/frontend`
> Historical editor CSS investigation: [Historical Editor CSS Incident Analysis](./historical-editor-css-incident-analysis.md)

## 1. Purpose and constraints

This document describes the current UI architecture of the EAI frontend,
including ownership boundaries, data flow, styling layers, overlay behavior, and
known architectural risks. It complements `apps/frontend/AGENTS.md`, which is
the normative implementation guide. If this document and the scoped agent guide
conflict, the scoped guide wins.

The frontend must preserve these constraints:

- Next.js App Router with Server Components by default.
- Client Components only where state, events, custom hooks, or browser APIs are
  required.
- Multi-tenant data and brand configuration must come from runtime context, not
  hard-coded UI defaults.
- User-facing strings must be routed through `next-intl`.
- Interactive controls must follow the project's current `ui-*` conventions.
- Long-running requests and streams must have deadlines, cancellation, and
  terminal UI states.
- Browser code must never import `@eai/shared/server`.

## 2. Technology baseline

| Concern | Current implementation |
| --- | --- |
| Framework | Next.js 16.2.6 App Router |
| Rendering | React 19.2.4 Server and Client Components |
| Language | TypeScript 5 strict mode |
| Styling | Tailwind CSS v4, CSS-first configuration, runtime CSS variables |
| UI foundations | shadcn `base-nova` components and Base UI primitives |
| Rich-text editing | Tiptap 3 with `tiptap-markdown` |
| Internationalization | `next-intl`, English default and Indonesian locale |
| Authentication | Clerk |
| Animation | Framer Motion |
| Notifications | Sonner |
| Telemetry | Sentry |

## 3. System and component view

```text
Browser
  |
  v
Next.js App Router: src/app/[locale]
  |-- Server layouts/pages
  |     |-- locale validation and messages
  |     |-- Clerk, theme, tooltip, and toast providers
  |     `-- route-level data and authorization boundaries
  |
  `-- Client feature boundaries
        |-- EditorialWorkspace
        |     |-- ThreeColumnLayout
        |     |-- DocumentHistoryPanel
        |     |-- EditorCanvas -> Editor/Tiptap + FinalDraftPanel
        |     `-- AICopilotPanel
        |
        |-- Dashboard, settings, admin, onboarding, checkout
        `-- components/ui primitives

EditorialWorkspace
  |
  `-- useEditorialWorkspace facade
        |-- workspace/hooks: storage, config, keyboard, autosave, streaming
        |-- workspace/actions: analyze, refine, targeted fix, strategist
        |-- workspace/utils: pure normalization and derived state
        `-- lib: fetch deadlines, stream deadlines, API clients
              |
              v
          Express backend APIs

Shared domain contract
  `-- @eai/shared: universal types, schemas, and pure utilities
```

### Rendering boundary

Routes and layouts are Server Components unless they need interactivity. For
example, the workspace route is a thin Server Component that renders the
interactive `EditorialWorkspace` boundary. Once a module is under that client
boundary, its imported component graph becomes part of the client bundle.

This is appropriate for the editor workspace, which relies heavily on local
state, Tiptap, storage, streaming, and browser events. It should not become the
default pattern for mostly static route shells or read-only views.

## 4. Workspace ownership and data flow

The workspace follows a facade-oriented architecture:

| Layer | Responsibility | Must not own |
| --- | --- | --- |
| `EditorialWorkspace.tsx` | Compose panes, modals, status, and feature components | Request parsing, storage mechanics, or response normalization |
| `useEditorialWorkspace.ts` | Coordinate workspace state, hooks, actions, and derived transitions | Low-level fetch/stream implementations or feature markup |
| `workspace/hooks` | Own bounded lifecycle concerns such as storage, configuration, keyboard, autosave, and streaming | Cross-feature UI composition |
| `workspace/actions` | Execute isolated backend workflows and expose typed outcomes | Persistent React state or layout decisions |
| `workspace/utils.ts` | Pure transformations and readiness calculations | Network, browser storage, or React lifecycle effects |
| `lib` | Shared frontend infrastructure such as deadlines and stream readers | Workspace-specific product decisions |
| `@eai/shared` | Universal domain types, schemas, and pure utilities | Browser-only APIs or server secrets |

### Request lifecycle

Frontend network work should follow this sequence:

```text
User action
  -> visible pending state
  -> AbortController + finite request deadline
  -> fetchWithTimeout
  -> readWithTimeout for streams
  -> normalize typed response/event
  -> success | error | cancelled state
  -> clear loading state in finally
```

No assistant placeholder or loading indicator may remain without an explicit
success, error, cancellation, or timeout exit.

## 5. Styling and design-system layers

The current style system has four layers:

### Layer 1: compile-time Tailwind theme

The `@theme` block defines build-time palettes, fonts, and named utilities.

### Layer 2: runtime semantic tokens

`:root` and `.dark` define semantic values such as:

- `--background`, `--foreground`;
- `--surface-1`, `--surface-2`, `--surface-3`;
- `--primary`, `--primary-foreground`;
- `--border`, `--ring`;
- success, warning, and error colors;
- layout dimensions, radii, and transitions.

Components should depend on semantic intent, not copy palette hex values.

### Layer 3: Tailwind runtime bridge

`@theme inline` exposes runtime semantic tokens as Tailwind utilities such as
`bg-background`, `text-primary`, and `border-border`.

### Layer 4: component and semantic-control APIs

Two mechanisms currently coexist during migration:

1. canonical `Button`, `Input`, `Textarea`, and `SelectTrigger` wrappers under
   `src/components/ui`; Button owns the `ui-btn` visual contract, while form
   controls expose a migration-safe `surface` variant backed by `ui-control`
   classes;
2. direct global classes such as `ui-btn`, `ui-badge`, `ui-alert`, `ui-control`,
   and `ui-card` in legacy feature code, plus other Base UI/shadcn wrappers that
   have not yet completed the same consolidation.

New and migrated buttons and text fields must use the corresponding
`components/ui` primitive. Direct `ui-btn` and `ui-control` composition remains
compatibility code and should be migrated feature-by-feature without broad
visual rewrites.

### Target direction

The desired end state is one public primitive API under `components/ui`:

```text
Feature component
  -> Button/Input/Select/Badge/Alert/Dialog/Menu
       -> variants and accessibility behavior
            -> semantic runtime tokens
                 -> light/dark themes
```

Global `ui-*` classes may remain internal compatibility building blocks during
migration. The Button milestone is complete, while Input, Textarea, and
SelectTrigger consolidation has started with explicit `default` and `surface`
contracts. Badge, Alert, and remaining legacy raw controls still need equivalent
ownership and validation.

## 6. Editor content and embedded UI boundary

Tiptap is a special styling domain because article content and application
controls can share the ProseMirror DOM.

### Current state

- The ProseMirror root uses `prose prose-sm dark:prose-invert`.
- React NodeViews, including AI Preview, render inside this root.
- AI Preview marks its control header as `not-prose` and keeps rendered Markdown
  in a sibling `editor-content` region.
- AI Preview buttons use semantic `ui-btn` variants without inline colors.
- The Tiptap Bubble Menu is a `not-prose` control surface; all eight actions use
  the canonical `Button` API, and formatting toggles expose `aria-pressed`.
- Hovered-link actions render through a controlled `LinkHoverPopover` using a
  Base UI portal, an element anchor, fixed positioning, and collision handling;
  `Editor` retains only Tiptap selection and mutation ownership.
- Light and dark article links use the semantic `--editor-link` token through
  Tailwind Typography's normal and inverted link variables.
- A regression contract protects headings, links, tables, inline code, the
  content/control boundary, and the absence of color workarounds.

### Architectural rule for new editor features

Every editor extension must classify its DOM as one of:

- **content DOM**: article semantics that intentionally receive editor
  typography;
- **control DOM**: buttons, inputs, menus, badges, and status UI that must be
  isolated from editor typography;
- **overlay DOM**: floating interaction surfaces that must use a maintained
  positioner and explicit focus behavior.

Do not place `not-prose` around a NodeView that later needs to create a nested
`prose` instance. Prefer sibling content/control regions or a scoped editor
stylesheet that explicitly excludes NodeView controls.

## 7. Overlay and portal architecture

Maintained selects, tooltips, menus, and similar controls should use Base UI
portal and positioner primitives. This provides:

- escape from clipped and transformed ancestors;
- collision and viewport positioning;
- keyboard navigation and focus behavior;
- consistent mobile adaptation;
- predictable z-index ownership.

The responsive Select is the reference pattern: desktop uses a positioned
popover, while mobile uses a portalled bottom sheet and backdrop.

Custom overlays are permitted only when an editor-specific interaction cannot
be represented by an existing primitive. They must document ownership of:

- anchor measurement and scroll updates;
- focus entry and restoration;
- Escape and outside-click behavior;
- viewport collision and mobile layout;
- z-index and transformed ancestor behavior.

## 8. Internationalization and accessibility

All user-visible strings belong in locale message files and must be rendered
through `next-intl`. Hard-coded feature strings are architecture debt because
they bypass the locale boundary, even when the route itself is localized.

Base UI primitives should be preferred for interactive behavior because they
provide accessible semantics and keyboard foundations. Feature components remain
responsible for:

- visible or programmatic labels;
- correct roles and state attributes;
- focus management across loading, error, modal, and cancellation states;
- reduced-motion behavior;
- contrast in both light and dark themes.

## 9. Current architectural strengths

- Server layouts establish locale, authentication, theme, tooltip, and toast
  providers in one predictable boundary.
- Workspace side effects are separated into hooks and action modules instead of
  remaining entirely inside the UI shell.
- Shared schemas and types provide a cross-application domain contract.
- Runtime tokens support theme switching without duplicating component logic.
- Base UI portals establish a reusable overlay foundation.
- Request and streaming utilities provide finite lifecycle behavior.
- Feedback and strategist areas have begun moving toward facade plus subsystem
  folders.

## 10. Risks and priorities

| Priority | Risk | Impact | Recommended next step |
| --- | --- | --- | --- |
| P1 | Primitive consolidation remains incomplete | Inconsistent visuals, accessibility, and maintenance ownership | Continue Input/Textarea migrations from the recorded inventory, then define equivalent Badge and Alert ownership |
| P2 | Large feature components remain | High review cost and hidden state coupling | Continue facade/subsystem extraction around coherent behavior, not arbitrary file-size targets |
| P2 | Hard-coded user-facing strings remain in feature components | Incomplete localization and duplicated copy | Add an i18n audit and migrate by feature namespace |
| P3 | Future NodeViews could bypass the editor boundary contract | Reintroduction of typography leakage and color workarounds | Keep the AI Preview regression contract and enforce the scoped frontend guide |
| P3 | Large client workspace boundary has not been profiled | Possible bundle size and broad re-render surface | Measure before splitting stable shells from interactive islands |
| P3 | Architecture inventories can drift | Incorrect guidance and unsafe assumptions | Revalidate this snapshot at each minor release or structural frontend change |

## 11. Evolution plan

### Phase 1: establish contracts

- Completed on 2026-07-19: added an AI Preview regression contract covering
  content/control separation, semantic buttons, theme-aware article links,
  headings, tables, and inline code.
- Completed on 2026-07-19 for form controls: after migrating Support Form,
  Billing Details Form, General Settings, Defaults Settings, Usage Settings, and
  Workflow Settings, the Editor metadata panel, AI Config, Audit Logs, and
  Billing Admin, Final Draft revision instructions, Onboarding activation, and
  Feedback source entry, plus standard text fields in History, User Directory,
  Strategist, Bubble Menu, and subscription cancellation, followed by checkbox,
  switch, date, file, and Chat composer controls, no feature files contain raw
  `<input>` or `<select>`. Only the Editor Markdown canvas retains one raw
  `<textarea>` as a documented exemption, and no feature code directly composes
  `ui-control` / `ui-input` /
  `ui-textarea` / `ui-select`. Tests and primitive implementations are excluded
  from these counts.
- Define the public variants and accessibility behavior required from each
  primitive.
- Audit hard-coded user-facing strings by feature namespace.

### Phase 2: remove active workarounds

- Completed on 2026-07-19: isolated AI Preview controls, removed inline button
  colors, removed the redundant nested `prose` instance, and replaced the broad
  dark-link selector with the semantic `--editor-link` token.
- Completed on 2026-07-19: extracted the hovered-link surface into a controlled
  `LinkHoverPopover`, replaced manual bounding-rectangle and scroll arithmetic
  with a Base UI portal/positioner anchored to the actual link, enabled collision
  handling, and migrated its controls to canonical `Button` and `Input` APIs.

### Phase 3: consolidate the design system

- Completed for Button on 2026-07-19: mapped canonical semantic variants to the
  existing `ui-btn` visual contract, preserved compatibility aliases, migrated
  AI Preview, Publication UI, and the Tiptap Bubble Menu, then added variant and
  editor-toolbar regression coverage. The `accent` variant owns low-emphasis AI
  actions, while `muted[aria-pressed="true"]` owns formatting-toggle state.
- Completed for feature form controls on 2026-07-19: introduced regression-tested `default`
  and `surface` variants for Input, Textarea, and SelectTrigger, then migrated
  Support Form, Billing Details Form, General Settings, Defaults Settings, Usage
  Settings, Workflow Settings, the Editor metadata panel, AI Config, Audit Logs,
  Billing Admin, Final Draft revision instructions, Onboarding activation, and
  Feedback source entry, followed by History search/rename, User Directory,
  Strategist session rename, Bubble Menu link editing, and cancellation feedback
  without changing their interaction contracts. Standard text-like feature
  controls are now fully canonical and no feature code directly composes the
  legacy form-control classes. Checkbox and switch behavior is owned by Base UI
  primitives, file upload has a native-semantics boundary, Dashboard dates use
  canonical Input, and the auto-resizing Chat composer uses canonical Textarea.
  The raw Markdown canvas is the sole documented feature-level exemption.
- Move feature controls behind `components/ui` primitives incrementally.
- Preserve current visuals and mobile behavior during migration.
- Retire redundant global classes only when no consumers remain.
- Update `apps/frontend/AGENTS.md` to describe the final canonical API.

### Phase 4: reduce client and component surface area

- Measure client bundles and expensive render paths.
- Keep route shells and read-only data work on the server where practical.
- Extract bounded feature subsystems from large components when doing so reduces
  state coupling or improves testability.

## 12. Validation requirements

Any structural UI refactor must include validation proportional to its risk:

- lint and strict TypeScript/build checks;
- focused unit tests for extracted state and actions;
- light and dark visual checks;
- desktop and mobile overlay checks;
- keyboard and focus-path checks;
- editor content fixtures for headings, links, tables, code, and NodeViews;
- cancellation, timeout, error, and success lifecycle checks for async UI;
- `git diff --check` before completion.

## 13. Document maintenance

Update this file when any of the following changes:

- the primary UI primitive API;
- workspace state/action boundaries;
- editor content/control styling ownership;
- overlay or portal infrastructure;
- Next.js rendering boundaries;
- theme-token structure;
- frontend localization or async-lifecycle contracts.
