# Historical Editor CSS Incident Analysis

> Status: historical record with current-state annotations
> Original context: EAI v3.4.0 and earlier
> Revalidated against: EAI frontend v3.14.0 on 2026-07-23
> Current architecture reference: [UI Architecture v3.14.0](./ui-architecture-v3.13.md)

## Purpose

This document preserves the original investigation into why UI styling around
the Tiptap editor was difficult to control globally. It is not the canonical
description of the current frontend architecture. Each finding is annotated so
that historical workarounds are not mistaken for current design guidance.

### Status definitions

- **Still active**: the original implementation pattern remains in production.
- **Partially resolved**: shared infrastructure now exists, but the original
  pattern or workaround remains in part of the UI.
- **Resolved**: the original problem has been replaced by a maintained pattern.
- **Superseded**: the recommendation no longer matches the current stack.

## Current status summary

| Original finding | Status | Current evidence |
| --- | --- | --- |
| Typography styles leak from the editor's `.prose` root into custom NodeViews | **Resolved** | The existing AI Preview NodeView now isolates its control region with `not-prose` and leaves Markdown in a sibling content region. |
| Button colors need inline overrides in the AI preview | **Resolved** | Reject and Accept now rely on semantic `ui-btn` variants without inline color declarations. |
| Dark editor links require a high-specificity override | **Resolved** | Light and dark link colors now flow through `--editor-link` and Tailwind Typography variables without a broad selector or `!important`. |
| The custom link popup needs manual coordinates and dynamic height | **Still active** | `Editor.tsx` still calculates coordinates against `scrollContainerRef` and changes `minHeight` using `isEditingLink`. |
| Shared UI primitives should be introduced | **Partially resolved** | `components/ui/Button` is now the canonical semantic API backed by `ui-btn` classes, while other controls and legacy feature buttons still require incremental migration. |
| Theme tokens should be bridged into Tailwind | **Resolved** | Tailwind v4 `@theme` and `@theme inline` now map runtime CSS variables to utilities. |
| Portal positioning is missing across the application | **Partially resolved** | Base UI Select, Tooltip, and other maintained primitives use portals; the editor's custom link popup does not. |
| Configure theme colors through Tailwind v3 config | **Superseded** | The frontend now uses Tailwind CSS v4 with CSS-first configuration. |

## Original root causes, revalidated

### 1. Tailwind Typography crosses the content/UI boundary

The Tiptap canvas is still rendered as a `prose` container. This is appropriate
for article content, but a React NodeView placed under the same ProseMirror root
also becomes a descendant of the typography scope. Interface controls and
article content therefore share a cascade boundary.

`AIPreviewBlockComponent` originally illustrated the ambiguity: its header and
action buttons are product interface, while its Markdown preview is article
content. The control header is now a `not-prose` sibling of the Markdown content,
and the redundant nested `prose` instance has been removed.

**Current architectural interpretation:** the root issue was not merely CSS
specificity. It was the absence of an explicit boundary between editor content
styles and embedded application UI. The AI Preview implementation and its
regression contract now establish that boundary for future NodeViews.

### 2. The application has two styling APIs

The original hybrid stack remains, although it has evolved:

1. Runtime design tokens such as `--primary`, `--surface-1`, and `--foreground`.
2. Tailwind v4 utilities backed by `@theme inline`.
3. Global semantic classes such as `.ui-btn` and `.ui-alert`.
4. Base UI/shadcn primitives under `components/ui` using CVA variants.

The fourth layer was added after the original analysis. It improves
accessibility and composition, but creates a second public component/styling API
until adoption and ownership are consolidated.

### 3. Editor overlays have a different layout lifecycle

The original document described editor menus, NodeViews, and portalled popups as
one general problem. The current system requires a narrower distinction:

- Maintained Base UI overlays use portal and positioner primitives.
- Tiptap NodeViews remain inside ProseMirror.
- The custom link-hover editor popup remains absolutely positioned inside the
  editor scroll container and owns manual coordinate calculations.

The remaining risk is therefore isolated primarily to custom editor overlays,
not to every popup in the application.

## Historical incident map

| Scenario | Historical behavior | Root cause | Current state |
| --- | --- | --- | --- |
| AI Preview Accept button | Text contrast was reversed between themes | Product UI inherited editor typography rules | Resolved through a `not-prose` control boundary and semantic button variants |
| Editor links in dark mode | Links became white instead of brand blue | `prose-invert` replaced typography color variables | Resolved through the theme-aware `--editor-link` typography token |
| Link-hover popup height | Form controls were clipped while editing | Static minimum height was smaller than the editing form | `minHeight` is still selected dynamically from editor state |
| Link-hover popup position | Popup drifted relative to editor scrolling/transforms | Overlay coordinates were coupled to the editor container | Manual `getBoundingClientRect` and scroll-offset calculations remain |

## Corrected long-term guidance

### A. Isolate NodeView controls without hiding preview typography

Do not put `not-prose` around the entire NodeView and then attempt to create a
new `prose` subtree inside it. Tailwind Typography does not currently support
nesting a fresh `prose` instance inside `not-prose`.

Use one of these approaches:

1. Keep the article preview in the editor typography scope and apply
   `not-prose` only to a sibling header/action region.
2. Remove `prose` from the ProseMirror root and apply an editor-specific
   stylesheet only to content nodes, explicitly excluding NodeView roots.

The second option provides the clearest long-term ownership but has higher
visual-regression risk and requires editor fixture tests.

### B. Converge on one public primitive API

`components/ui` should eventually become the public API for buttons, inputs,
badges, alerts, selects, tooltips, menus, and dialogs. Runtime tokens and global
semantic classes can remain implementation details during migration.

Do not change the current `AGENTS.md` contract until consumers have migrated and
visual behavior has been validated in both themes.

### C. Use maintained positioners for interactive overlays

New overlays must use the existing Base UI portal/positioner pattern. The custom
link editor popup should be migrated only after its selection, focus, resize,
scroll, and mobile behavior is captured by tests.

## Historical color reference, corrected

| Element | Light mode | Dark mode | Notes |
| --- | --- | --- | --- |
| Primary token | `#0b79c2` | `#EDEDED` | Defined by `--primary` |
| Primary foreground | `#ffffff` | `#121211` | Defined by `--primary-foreground` |
| `.ui-btn-primary` background | `var(--primary)` | `color-mix(in srgb, var(--primary) 82%, var(--card))` | The dark rendered background is a mix, not exactly `#EDEDED` |
| Muted foreground | `#64748b` | `#A1A1AA` | Used by muted controls |
| Editor link | `#0b79c2` | `#3b95d9` | Both values are owned by the semantic `--editor-link` theme token |

## Retirement criteria

This historical document can be marked fully resolved when all of the following
are true:

- [x] embedded NodeView controls have an explicit content/UI styling boundary;
- [x] AI Preview buttons no longer require inline color declarations;
- [x] editor links no longer need the broad `!important` override;
- [ ] the link editor uses a maintained overlay positioning abstraction;
- [ ] one public primitive API is enforced for interactive controls;
- [ ] light, dark, keyboard, mobile, and editor-content visual regressions are
  covered by automated tests.
