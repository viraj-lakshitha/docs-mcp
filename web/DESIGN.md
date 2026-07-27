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
| `md` | 900px | shell sidebar → bottom section nav; Notes collapses to one pane + its own List/Edit/Preview sub-nav; touch-target sizing; 16px inputs (no iOS zoom) |
| `lg` | 1150px | shell sidebar 220→180px, Notes doc-list column 240→200px |

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
