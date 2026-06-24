---
name: OpenDataverse
description: A native-feeling desktop workbench for Microsoft Dataverse and Dynamics 365 workflows.
colors:
  primary: "oklch(0.52 0.128 292)"
  primary-foreground: "oklch(0.985 0.005 290)"
  foreground: "oklch(0.17 0.005 264)"
  background: "oklch(1 0 0)"
  card: "oklch(1 0 0)"
  muted: "oklch(0.965 0.004 270)"
  muted-foreground: "oklch(0.55 0.015 270)"
  border: "oklch(0.91 0.006 270)"
  secondary: "oklch(0.97 0.004 270)"
  destructive: "oklch(0.59 0.22 25)"
  accent: "oklch(0.965 0.004 270)"
  ring: "oklch(0.52 0.128 292)"
  dark-primary: "oklch(0.58 0.14 292)"
  dark-background: "oklch(0.145 0.006 264)"
  dark-card: "oklch(0.185 0.008 264)"
  dark-muted: "oklch(0.235 0.012 264)"
  dark-border: "oklch(1 0 0 / 12%)"
  dark-foreground: "oklch(0.96 0.004 270)"
typography:
  body:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
  label:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  2xl: "0.9rem"
  3xl: "1.1rem"
  4xl: "1.3rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2rem"
  button-destructive:
    backgroundColor: "{colors.destructive}10"
    textColor: "{colors.destructive}"
    rounded: "{rounded.md}"
    padding: "0 0.625rem"
    height: "2rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  badge-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.25rem"
---

# Design System: OpenDataverse

## 1. Overview

**Creative North Star: "The Calm Workbench"**

OpenDataverse is a precision tool for Dynamics 365 developers. It lives in the background of their workday—quiet, confident, and free of the visual noise that plagues enterprise dashboards. The interface should feel like a native macOS utility: surfaces recede, data is legible, and every interactive element behaves predictably. The design language is restrained and warm-tinted, with a single violet-indigo accent that marks selection, primary action, and state without competing for attention.

The system explicitly rejects generic SaaS dashboard aesthetics, bloated enterprise toolbars, AI-generated scaffolding (identical card grids, tiny uppercase eyebrows, numbered section markers, side-stripe borders, gradient text), and decorative motion. It also rejects over-decorated components such as glassmorphism, bouncing motion, and superfluous shadows. The goal is to disappear into the task.

**Key Characteristics:**

- One type family, one accent role, consistent spacing and radii.
- Tonal layering conveys depth; shadows are minimal and state-driven.
- Status is shown with colored dots and subtle pills, never with saturated badges alone.
- Empty states teach the interface with icon wells and concise copy.
- Destructive actions are outline-style with red text, not filled red buttons.
- Dark mode stays true to the same vocabulary with slightly lifted surfaces.

## 2. Colors

The default palette is a restrained OKLCH system: tinted neutrals with a single violet-indigo accent. Additional appearance themes map well-known palettes onto the same semantic tokens, so component code still uses `bg-background`, `text-foreground`, `border-border`, `bg-primary`, and related utilities instead of theme-specific colors.

### Primary

- **Violet Indigo** (`oklch(0.52 0.128 292)`): Primary actions, active selection, focus rings, and the brand dot in status pills. Used on ≤10% of any screen so it stays meaningful.
- **Primary Foreground** (`oklch(0.985 0.005 290)`): Text on primary surfaces.
- **Dark Primary** (`oklch(0.58 0.14 292)`): The light-mode primary lifted slightly for dark mode visibility.

### Neutral

- **White / Near-White** (`oklch(1 0 0)`): Primary background and card surfaces.
- **Ink** (`oklch(0.17 0.005 264)`): Body text, headings, and primary content.
- **Soft Muted** (`oklch(0.965 0.004 270)`): Hover backgrounds, secondary surfaces, inactive tabs.
- **Muted Ink** (`oklch(0.55 0.015 270)`): Secondary text, placeholders, icons in resting state.
- **Hairline** (`oklch(0.91 0.006 270)`): Borders, dividers, and separators.

### Semantic

- **Destructive** (`oklch(0.59 0.22 25)`): Errors and destructive actions, used in outline or 10% tint form, never as a filled CTA.
- **Amber Warning** (`oklch(0.6 0.15 45)`): Warnings and managed-state indicators; paired with `oklch(0.97 0.01 45)` tint backgrounds.
- **Emerald Success** (`oklch(0.6 0.15 145)`): Enabled / success states; paired with `oklch(0.97 0.01 145)` tint backgrounds.
- **Ring** (`oklch(0.52 0.128 292)`): Focus-visible outline color.

### Named Rules

**The One Accent Rule.** The violet-indigo primary is the only accent. It is reserved for selection, primary action, and state indicators. Do not introduce a second saturated accent color for decoration or categorization.

**The Tonal State Rule.** Semantic states (warning, error, success) are conveyed with 10% tinted surfaces and a subtle border, not with full-saturation fills or side stripes.

**Theme Families.** OpenDataverse supports OpenDataverse, Gruvbox, Rose Pine, and Catppuccin theme families, each with light and dark modes. Theme CSS may override only the shared semantic variables in `src/index.css`; module code must keep using semantic Tailwind utilities rather than hard-coded palette values.

## 3. Typography

**Body / Heading / Label Font:** `'Inter Variable', sans-serif`
**Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

**Character:** A single, well-tuned sans-serif carries the entire interface. The mood is neutral, technical, and calm. Monospace is reserved for IDs, paths, and technical metadata.

### Hierarchy

- **Heading** (600, `1rem` / `1.25`): Module titles, dialog titles, and section headers. Line length is unconstrained because it is almost always a single short line.
- **Body** (400, `0.75rem` / `1.5`): General interface copy, descriptions, and tab content. Prose blocks cap at 65–75ch where they appear.
- **Label** (500, `0.75rem` / `1`): Buttons, form labels, table headers, and tab triggers. No uppercase transformation, no letter-spacing expansion.
- **Mono Label** (400, `0.6875rem` / `1.4`): IDs, GUIDs, paths, and raw values in detail lists. Breaks words when necessary.

### Named Rules

**The One Family Rule.** Use Inter Variable for every UI surface. Monospace is a data font, not a display or heading font.

## 4. Elevation

The interface is predominantly flat. Depth is conveyed through tonal layering (background → muted → card → popover) and subtle borders rather than heavy shadows. Shadows appear only as a response to state or elevated transient surfaces.

### Shadow Vocabulary

- **Ambient Low** (`0 1px 2px rgba(0, 0, 0, 0.04)`): Resting state of small interactive surfaces such as buttons and inputs.
- **Dialog Lift** (`0 24px 48px rgba(0, 0, 0, 0.08)`): Modal and popover surfaces; lifts them above the dimmed overlay.

### Named Rules

**The Flat-By-Default Rule.** Surfaces at rest are flat. Use tonal shifts (`bg-background`, `bg-muted`, `bg-card`) to show hierarchy. Introduce shadows only for transient elevated layers such as dialogs, popovers, and dropdown menus.

## 5. Components

### Buttons

- **Shape:** `rounded-md` (0.4rem). Height `2rem` for default, `1.75rem` for `sm`, `1.5rem` for `xs`.
- **Primary:** Violet-indigo background (`bg-primary`), near-white text, subtle shadow, hover darkens to `bg-primary/90`.
- **Outline:** Transparent or background-colored surface with `border-border`, hover shifts to `bg-muted`. This is the default toolbar action style.
- **Destructive:** 10% destructive tint background with destructive text; hover shifts to 15% tint. Never a filled red button.
- **Ghost:** No border, hover uses `bg-muted`. Used for icon-only close buttons and secondary toggles.
- **Focus:** `ring-2 ring-ring/40` around the element; destructive uses `ring-destructive/20`.
- **Active:** Translates down 1px (`translate-y-px`) for tactile feedback, except popup triggers.

### Inputs / Fields

- **Shape:** `rounded-md` (0.4rem), height `2rem`, padding `0.25rem 0.625rem`.
- **Style:** Transparent background with `border-input` stroke; dark mode uses `bg-input/20`.
- **Focus:** Border shifts to `ring`, 2px ring at 40% opacity.
- **Error:** `border-destructive` with 1px destructive ring; dark mode uses reduced-alpha destructive.
- **Placeholder:** `text-muted-foreground` must remain readable (minimum 4.5:1 contrast).

### Badges / Status Pills

- **Shape:** `rounded-md` (0.4rem), height `1.25rem`, padding `0 0.5rem`.
- **Default:** Filled primary background with primary-foreground text; reserved for system/brand labels.
- **Outline:** Background matches surface, `border-border`, dark foreground. Used for neutral metadata.
- **Status Pills (custom):** Inline-flex row with a `size-1.5` colored dot and a subtle border + 5% tinted background. Use emerald for enabled, amber for managed/warning, slate for disabled, and a primary dot for unmanaged selection. This is the preferred pattern over shadcn badge variants for component state.

### Cards / Containers

- **Shape:** `rounded-lg` (0.5rem) or `rounded-xl` (0.7rem) for empty-state wells.
- **Background:** `bg-muted/30`, `bg-muted/40`, or `bg-background` depending on nesting.
- **Border:** `border-border` when the container needs definition; otherwise tonal separation is enough.
- **Shadow:** None at rest. Dialogs and popovers are the exception.
- **Internal Padding:** `0.75rem` to `1rem` typically; empty states use `1rem` to `1.5rem`.

### Navigation

- **Sidebar:** Width `260px`, background `bg-sidebar`, hairline border on the right. Nav items are `rounded-md` with `hover:bg-muted` and primary tint (`bg-primary/5`) for active selection.
- **Tabs:** Default uses a muted pill rail (`bg-muted`) with a white active tab. Line variant uses a 2px foreground indicator under the active trigger. Triggers are `rounded-md` and never uppercase.

### Dialogs

- **Shape:** `rounded-xl` (0.7rem), padding `1.25rem`, border `border-border`, popover background.
- **Overlay:** `bg-black/10` with optional `backdrop-blur-xs`.
- **Entrance:** 100ms fade + zoom; exit is the reverse. No orchestrated page-load sequences.
- **Close:** Ghost icon button at top-right.

### Signature: Icon Well Empty State

A recurring custom pattern: a centered container with `rounded-xl` border, `bg-background` or `bg-muted/30` background, and a 40–48px icon inside. It is used for empty lists, missing environment state, and empty dependency queries. Copy is concise and instructional.

## 6. Do's and Don'ts

### Do:

- **Do** use the OKLCH tokens in `src/index.css` as the source of truth for every new surface.
- **Do** prefer outline buttons for toolbar actions; reserve filled primary for the single most important action on a screen.
- **Do** use colored-dot status pills for state: emerald = enabled/success, amber = managed/warning, slate = disabled, primary dot = selection.
- **Do** round every container: `rounded-md` for controls, `rounded-lg` for panels, `rounded-xl` for empty-state wells.
- **Do** write empty states with an icon well, a short heading, and a helpful sentence explaining what to do next.
- **Do** use Inter Variable for all UI text and monospace only for IDs, paths, and raw values.
- **Do** respect `prefers-reduced-motion` and keep transitions between 100ms and 250ms.
- **Do** use tonal layering (`bg-background` → `bg-muted` → `bg-card`) to show hierarchy before reaching for shadows.

### Don't:

- **Don't** use side-stripe borders (`border-left` or `border-right` ≥2px colored) on cards, list items, callouts, or alerts. Use full borders, background tints, or leading icons instead.
- **Don't** use gradient text (`background-clip: text`) or decorative gradients anywhere.
- **Don't** use glassmorphism or blur as a default surface treatment.
- **Don't** use the hero-metric template (big number + small label + supporting stats + gradient accent).
- **Don't** create identical card grids with icon + heading + text repeated endlessly.
- **Don't** add tiny uppercase tracked eyebrows above sections or numbered section markers (`01 / 02 / 03`) as default scaffolding.
- **Don't** use filled destructive buttons for routine unregister/delete actions. Use outline with destructive text.
- **Don't** let text overflow its container; test headings at every breakpoint and reduce clamp max or rewrite copy if needed.
- **Don't** use display fonts in UI labels, buttons, or data surfaces.
- **Don't** introduce a second saturated accent color for decoration. The One Accent Rule applies everywhere.
