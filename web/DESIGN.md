# Notes — frontend design system

## Tokens (`src/styles/tokens.css`)

All visual values are CSS custom properties: color (`--color-*`), type scale
(`--text-xs` … `--text-2xl`, weights, leading), 4px spacing scale
(`--space-1` … `--space-9`), radii (`--radius-sm|md|lg|xl|full`), elevation
(`--shadow-sm|md|lg`), focus rings, motion, and control heights. Components
never use raw hex/px values.

## Breakpoints (`src/breakpoints.js` + tokens header)

| Name | Width | Behavior |
| --- | --- | --- |
| `sm` | 640px | compact login/share/dialog padding, single-column login card |
| `md` | 900px | editor collapses to one pane + bottom tab bar; touch-target sizing; 16px inputs (no iOS zoom) |
| `lg` | 1150px | sidebar slims from 260px to 210px |

JS and CSS share these values — change them in both files together.

## Components (`src/components/`)

| Component | Purpose |
| --- | --- |
| `Button` | variants `default/primary/danger/bare`, sizes `sm/md/lg`, `block`, `active`, `loading` (spinner + disabled) |
| `Field` | label + input + hint/error with invalid styling; render-prop form for custom inputs |
| `Dialog` | modal primitive (overlay, Escape/overlay-click dismiss) |
| `ConfirmDialog` / `PromptDialog` / `ShareLinkDialog` | destructive confirms, single-input prompts, share-link display with copy |
| `Brand` / `BrandLogo` | wordmark ("Notes" + smaller "by Optiq Labs") and logo tile |
| `Icons` | stroke icon set (list, edit, eye, eye-off, plus, x) |
| `EmptyState` | centered muted placeholder |
| `editor/Sidebar` | brand header, doc list, asset panel, account bar |
| `editor/MobileNav` | bottom Docs/Edit/Preview tab bar (< `md`) |
| `editor/PreviewPane` | debounced markdown + diagram renderer |

## Conventions

- Class naming: block__element and modifier `--` suffixes (`.btn--primary`,
  `.field__error`).
- Native `prompt()`/`confirm()` are banned — use the dialog components.
- New UI must consume tokens and existing primitives before adding CSS.
