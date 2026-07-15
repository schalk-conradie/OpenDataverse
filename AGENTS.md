# Repository Instructions

- Always fetch the latest documentation for tooling rather than relying on outdated knowledge.
- This Mac laptop has Mise installed, so if a tool is not available, use Mise. It also has Homebrew, but prefer Mise when possible.
- Document every application change in the changelog.
- Any application change that can be tested in the frontend must include browser-preview mock data or fallback behavior so Codex can validate it with the Browser plugin, even when the real feature also runs in Tauri.
- Keep `@openai/codex-sdk` and `@anthropic-ai/claude-agent-sdk` pinned to their latest published versions. Check and update both together whenever the AI sidecar changes.

---

# Agent Maintainability Guidelines — OpenDataverse UI

Read `PRODUCT.md`, `DESIGN.md`, and this file before editing any UI. These three documents are the source of truth for product context, design tokens, and operational conventions.

## Quick checks before changing UI

1. Establish a baseline: `npm run lint` and `npm run build:web`.
2. Open the relevant browser preview so you can validate visually.
3. If the change introduces new tokens, components, or anti-pattern risks, update this guide and `DESIGN.md`.

## Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS 4 with `@theme inline` tokens in `src/index.css`
- shadcn/ui v4 primitives in `src/components/ui/`
- Tauri v2 for the desktop shell
- Inter Variable as the sole UI typeface
- Lucide icons

## Architecture boundaries

- Each folder under `src/modules/` owns its UI, pure domain transforms, typed
  Tauri gateway, browser-preview behavior, and focused tests.
- `src/core/` contains only independently shared application/runtime concepts.
  Core code must not import feature modules or feature mock data.
- `src/components/app-shell/` owns shell dialogs, notifications, and tool-window
  composition. Keep `App.tsx` focused on composing shell state and layout.
- Keep tool metadata and lazy component mapping together in
  `src/modules/tool-registry.ts`; do not add a second tool-id switch.
- `src-tauri/src/backend/mod.rs` is only the Tauri composition root. Shared
  storage and authenticated Dataverse transport belong in named modules, and
  production backend modules use explicit imports rather than `use super::*`.
- Renderer-to-Tauri command names and payload shapes are compatibility
  contracts. Update the command-contract check whenever a deliberate IPC change
  is introduced.

## Tokens

All color, radius, and typography tokens live in `src/index.css`. Reference them through Tailwind utilities (`bg-primary`, `text-muted-foreground`, `rounded-md`, `border-border`) or shadcn variables (`--background`, `--foreground`, `--muted`). Do not introduce arbitrary one-off colors or radii in module code.

Appearance themes are implemented as light/dark semantic variable overrides in `src/index.css`. When adding a theme, add both modes, persist only the theme id/mode in user settings, and keep module components on semantic utilities rather than palette-specific classes.

## Component conventions

- **Buttons:** Prefer `variant="outline"` for toolbar actions. Reserve `variant="default"` for the single most important action. Use `variant="outline"` with `className="text-destructive hover:bg-destructive/10"` for destructive actions, not the filled destructive variant.
- **Inputs:** Use `Input` for text fields; it already carries the correct radius and focus ring.
- **Badges:** Use sparingly. For component state, prefer colored-dot status pills (see below).
- **Dialogs:** Use `Dialog` for modal tasks. Keep forms in `DialogContent`; primary action belongs in `DialogFooter`.
- **Tabs:** Use the `line` variant for module-level sub-navigation unless the content is clearly a settings panel.
- **Tables:** Wrap in `rounded-lg border border-border overflow-hidden`. Keep headers in `bg-muted/50`.

## Layout rules

- App shell: `grid-cols-[260px_minmax(0,1fr)]`.
- Module panes: use `grid` with `min-h-0` and `overflow-hidden` to prevent flex blowout.
- Two-pane modules: left list/filter panel and right detail panel; divider is a hairline border, not a shadow.

## Absolute bans

Do not introduce any of these in UI code. If you encounter one while editing, refactor it:

- Side-stripe borders (`border-l-4` or thick colored left/right borders) on cards, callouts, list items, or alerts.
- Gradient text or decorative gradients.
- Glassmorphism as a default surface treatment.
- Hero-metric cards (big number + small label + stats + gradient).
- Identical card grids with icon + heading + text repeated endlessly.
- Tiny uppercase tracked eyebrows above every heading.
- Numbered section markers (`01 / 02 / 03`) as default scaffolding.
- Text that overflows its container.
- Display fonts in labels, buttons, or data surfaces.
- Heavy shadows on static surfaces.

## Empty states

Every empty, loading, and error surface should use the Icon Well pattern:

- Outer container: `rounded-xl border border-border bg-muted/30 p-6`.
- Icon well: 40–48px centered icon inside `rounded-xl border border-border bg-background p-3`.
- Heading: short, in body weight or semibold.
- Instruction: one sentence in `text-muted-foreground` explaining the next step.

## Status and state

- Enabled / active → emerald dot + `bg-emerald-50` pill.
- Managed / warning → amber dot + `bg-amber-50` pill.
- Disabled / inactive → slate dot + `bg-slate-50` pill.
- Selected / current → `bg-primary/5` surface with `border-border`.
- Loading → `Loader2` spinner + `text-muted-foreground`.
- Error → rounded bordered container with `bg-destructive/10` and `text-destructive`.

## Browser preview and mock data

Modules fall back to mock data when not inside Tauri (`isTauriRuntime()`). When adding or changing a module, ensure its browser preview still renders so the Browser plugin can validate it.

## Done checklist

Before finishing UI work:

- [ ] `npm run lint` passes.
- [ ] `npm run build:web` passes.
- [ ] Browser preview shows the changed surface.
- [ ] No new side-stripe borders, gradients, glassmorphism, or hero-metric cards introduced.
- [ ] Dark mode remains coherent.
- [ ] Reduced-motion preference does not break the layout.
- [ ] Changelog entry added in `src/core/changelog.ts`.
