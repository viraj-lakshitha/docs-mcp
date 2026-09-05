# Notes — frontend design system

## Routes

| Path | Page | Auth |
| --- | --- | --- |
| `/` | `pages/Landing.jsx` — public marketing page | none |
| `/login` | `pages/Login.jsx` — sign in / create account. `?mode=signup` presets the tab; `?next=` returns to it (e.g. an OAuth consent screen) after auth | none |
| `/app` | `pages/Workspace.jsx` — the app shell | required (redirects to `/login?next=/app` on 401) |
| `/s/:token` | `pages/Share.jsx` — view-only document | none |

## App shell

`pages/Workspace.jsx` is the top-level authenticated page: a persistent nav
(`components/shell/ShellSidebar` on desktop, `ShellMobileNav` + a compact
`ShellMobileTopbar` on mobile) switches between three sections, each fully
self-contained — only the active section's controls render, so Settings
never shows editor buttons and vice versa:

| Section | Component | Contents |
| --- | --- | --- |
| Notes | `components/notes/NotesView` | doc list (`DocList`) + editor + `PreviewPane`; owns its own mobile List/Edit/Preview sub-nav |
| Settings | `components/settings/SettingsView` | `ProfileCard` (name/email, `PUT /api/auth/me`) + `IntegrationsCard` (`GET/DELETE /api/connections` — MCP clients like Claude authorized on this account) |
| Attachments | `components/attachments/AttachmentsView` | every uploaded asset: upload, copy link, delete |

Section choice lives in React state, not the URL — `NotesView` owns the hash
(`#<document-id>`) for its own deep-linking, so the two don't collide.

## Styling architecture (`src/styles/`)

Tailwind CSS v4 + [Untitled UI React](https://www.untitledui.com/react)
(React Aria under the hood), with **Motion** (motion.dev) for animation.

| File | Role |
| --- | --- |
| `index.css` | the only stylesheet `main.tsx` imports; declares cascade layer order and loads everything below |
| `uui/theme.css` | Untitled UI's token system, **vendored verbatim** so `npx untitledui@latest upgrade` stays a clean diff. Never edit. |
| `palette.css` | **the only file that defines colour values.** Overrides the primitive ramps Untitled UI dereferences |
| `prose.css` | document typography for rendered markdown (`.rendered`) |
| `tokens.css` | temporary shim aliasing the old BEM token names onto Untitled UI's. Deleted with `styles.css`. |
| `styles.css` | the pre-Tailwind BEM stylesheet, being retired |

### Why `palette.css` is so small

Untitled UI's theme is two layers: primitive ramps (`--color-brand-*`,
`--color-neutral-*`, `--color-red-*`) and ~350 semantic tokens that are all
`var()` references onto them (`--color-text-primary: var(--color-neutral-900)`).
Replacing the ramps re-skins the entire system — light and dark, every
component — without touching their 856 lines. We ship terracotta instead of
their purple, and a warm stone neutral instead of Tailwind's cool grey.

Use semantic utilities (`bg-primary`, `text-tertiary`, `border-secondary`),
never raw colours. Note the inversion: `bg-primary` is the *card* tone,
`bg-secondary` is the *page* tone.

### Cascade layers — load-bearing

```
theme -> base -> legacy -> components -> utilities
```

`legacy` sits **above** `base` so Tailwind's Preflight doesn't strip the old
BEM styles, and **below** `utilities` so new Tailwind classes win without
`!important`. Preflight also zeroes the margins and list markers that
`marked`'s raw HTML output depends on — `prose.css` re-asserts them inside
`base`, after Preflight. Removing it collapses every rendered document, the
share page and the landing demo simultaneously.

### Dark mode

Class-based (`.dark-mode` on `<html>`), so an explicit choice beats the OS.
Three things must stay in sync: `DARK_CLASS` in `hooks/useTheme.ts`, the
`@custom-variant dark` in `index.css`, and the pre-paint inline script in
`index.html` that sets the class before first paint to avoid a flash.

Mermaid and Excalidraw bake colours into their SVG output at render time, so
`render.ts` re-initialises Mermaid on theme change and components that render
documents depend on `useResolvedTheme()` to re-render.

## Breakpoints (`src/breakpoints.js` + tokens header)

| Name | Width | Behavior |
| --- | --- | --- |
| `sm` | 640px | **phones only.** Shell sidebar → bottom section nav + compact top bar; compact login/share/dialog padding, single-column login card |
| `md` | 900px | **tablets and phones.** Notes collapses to one pane at a time (three columns don't fit below ~1024px) with its own List/Edit/Preview sub-nav; touch-target sizing; 16px inputs (no iOS zoom). The shell sidebar itself is *not* affected here — it stays visible down through `sm` |
| `lg` | 1150px | shell sidebar 220→180px, Notes doc-list column 240→200px |

Tablet is a real third tier, not "mobile stretched wide": between `sm` and
`md` (e.g. an iPad in portrait), the app keeps the persistent sidebar for
navigation (like desktop) while Notes still shows one pane at a time (like
phone) — the sidebar and the pane-collapse behavior are independent axes,
gated by different breakpoints (`sm` vs `md`), not a single mobile/desktop
switch. Only below `sm` does the sidebar itself give way to the bottom nav.

JS and CSS share these values — change them in both files together.

## Components (`src/components/`)

| Component | Purpose |
| --- | --- |
| `Button` | variants `default/primary/danger/bare`, sizes `sm/md/lg`, `block`, `active`, `loading` (spinner + disabled); `as="a"` renders a real link styled as a button (navigation CTAs) — use this instead of `<button onClick={() => location.href = …}>` |
| `Field` | label + input + hint/error with invalid styling; render-prop form for custom inputs |
| `Card` | titled content panel (Settings/Attachments) — title, description, header actions, body |
| `Dialog` | modal primitive (overlay, Escape/overlay-click dismiss) |
| `ConfirmDialog` / `PromptDialog` | await an async `onConfirm`/`onSubmit`; stay open and show an inline error if it rejects, so a failed delete/create/disconnect is never silently swallowed |
| `ShareLinkDialog` | share-link display with copy-to-clipboard |
| `Brand` / `BrandLogo` | wordmark ("Notes" + smaller "by Optiq Labs") and logo tile |
| `Icons` | stroke icon set (list, edit, eye, eye-off, plus, x, notes, settings, paperclip, user, plug, download, logout) |
| `EmptyState` | centered muted placeholder |
| `shell/ShellSidebar` | brand, section nav (Notes/Settings/Attachments), account footer (name/email + logout) |
| `shell/ShellMobileNav` | bottom section tab bar (< `md`) |
| `shell/ShellMobileTopbar` | compact brand header shown when the sidebar is hidden (< `md`) |
| `notes/DocList` | document list column with "+ New" |
| `notes/NotesView` | doc list + editor + preview + its own mobile sub-nav |
| `notes/PreviewPane` | debounced markdown + diagram renderer |
| `settings/ProfileCard` / `settings/IntegrationsCard` | profile editing; MCP connection list + disconnect |
| `attachments/AttachmentsView` | full attachment list: upload, copy link, delete |
| `landing/LandingDemo` | live-rendered sample document (markdown + Mermaid) shown in the hero — proof, not a screenshot |

## Conventions

- Class naming: block__element and modifier `--` suffixes (`.btn--primary`,
  `.field__error`).
- Native `prompt()`/`confirm()` are banned — use the dialog components.
- Any action that can fail (API call inside a dialog's `onConfirm`/`onSubmit`)
  must be `async` and let the error propagate — `ConfirmDialog`/`PromptDialog`
  catch it, keep the dialog open, and show it inline. Don't fire-and-forget.
- New UI must consume tokens and existing primitives before adding CSS.
