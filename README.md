# Notes <sub>by [Optiq Labs](https://optiqlabs.com)</sub>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The workspace Claude actually keeps your documents in. Google Docs has no
connection to Claude, and Claude's own chat can't render a Mermaid diagram or
an Excalidraw sketch that survives past the conversation. Notes connects to
Claude over MCP: every document, diagram, and sketch it creates lives in one
organized, shareable workspace. (Repository: `docs-mcp`.) **Open source, MIT
licensed** — see [Open source](#open-source--self-hosting) below.

## Features

- **Document CRUD** — create, list, read, update, delete (via MCP tools, REST API, or the web editor)
- **Tables** — n8n-style typed-column data tables: create a table, define Text/Number/Boolean/Date columns, and CRUD rows via the web grid, REST API, or MCP tools; import rows from CSV (as a new table with auto-detected columns, or into an existing table with column mapping)
- **Asset CRUD** — upload images/files and embed them in documents (`![alt](/a/<asset_id>)`)
- **Markdown** — documents are markdown, rendered live in the editor preview and on share pages
- **Mermaid diagrams** — fenced ` ```mermaid ` blocks render as diagrams
- **Excalidraw** — fenced ` ```excalidraw ` blocks containing a scene JSON render as hand-drawn SVG
- **View-only sharing** — mint unguessable share links (`/s/<token>`); viewers get a rendered, read-only page and can be revoked at any time
- **Login & per-user access** — email/password accounts with a browser login portal; documents, assets, tables, and shares are private to their owner. MCP clients connect via OAuth (works as a Claude custom connector); scripts and other tools can call the REST API with an API key instead
- **App shell** — a persistent nav (sidebar on desktop, bottom bar on mobile) switches between four sections: **Notes** (the document list/editor/preview), **Tables** (the table list and row grid), **Settings** (edit your name/email; see and disconnect MCP integrations; create and revoke API keys), and **Attachments** (every uploaded asset in one place, with copy-link and delete)
- **Marketing landing page** — a public `/` page explaining what Notes is and why, with CTAs into sign-up/sign-in; the app itself lives at `/app`
- **Vercel-native** — deploys as a Vercel project: documents/shares in **Neon Postgres**, asset binaries in **Vercel Blob**, frontend + vendored renderer libraries on the CDN, API/MCP as a serverless function

## Deploy to Vercel

The app expects a Vercel project with the **Neon Postgres** and **Blob**
integrations enabled (they inject `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`).
With those configured:

```bash
vercel deploy      # or push to the connected git repo
```

Tables are created automatically on first use. Everything (editor, share
pages, REST API, and the `/mcp` endpoint) is served from your project domain.

## Local development

Requires Node.js 22.x.

```bash
npm install
vercel env pull .env.development.local   # brings DATABASE_URL + BLOB_READ_WRITE_TOKEN
npm run build                            # builds the React app into public/
npm run web                              # serves app + API on http://localhost:4680
```

For frontend work with hot reload, run `npm run dev:web` in a second
terminal — Vite serves the React app on :5173 and proxies API/OAuth/MCP
traffic to the Express server on :4680.

If you'd rather not point local dev at your Neon database, run
`npm run dev:db` in another terminal (an in-process Postgres via PGlite) and
start the app with
`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run web`.

Open http://localhost:4680 — that's the public landing page. **Get started
free** / **Sign in** take you to `/login`, which lands you on `/app`: the
workspace shell, with **Notes** (document list, editor, live preview),
**Settings** (profile, connected MCP integrations), and **Attachments**
behind a persistent nav. **Share view-only** on any document creates a link
anyone can open to read (but not edit).

## Accounts & login

Open the app in a browser and you'll land on the login portal (`/login`):
sign in or create an account (email + password, scrypt-hashed, 30-day
HttpOnly session cookie). Everything you create — documents, assets, share
links — belongs to your account; other users can't see or touch it. Set
`DOCS_MCP_DISABLE_SIGNUP=true` to close registration after your team has
accounts.

Once signed in, the app is a four-section shell:

- **Notes** — the document list, editor, and live preview (this is the main workspace)
- **Tables** — create a table, define typed columns (Text/Number/Boolean/Date), and edit rows in a spreadsheet-like grid; import a CSV as a new table or into an existing one
- **Settings** — edit your name and email, see/disconnect the MCP clients (e.g. Claude) currently authorized on your account, and create/revoke API keys for REST access
- **Attachments** — every asset you've uploaded in one place, with copy-link and delete

On desktop these live behind a left nav rail; on mobile, a bottom tab bar switches sections (Notes has its own List/Edit/Preview sub-tabs at the top, since only that section needs them).

## Connect it to Claude (MCP over OAuth)

The app is a remote MCP server at `https://<your-app>.vercel.app/mcp`
(Streamable HTTP, stateless) with a built-in OAuth 2.1 provider — discovery
metadata, dynamic client registration, authorization-code + PKCE, and
refresh-token rotation — which is exactly what Claude expects from a custom
connector.

**Claude (claude.ai / desktop / mobile):** Settings → Connectors → *Add
custom connector* → enter `https://<your-app>.vercel.app/mcp`. Claude
discovers the OAuth server, sends you to your login portal, and shows a
consent screen; after you click **Allow access**, every tool call runs as
your account.

**Claude Code:** the HTTP transport handles the same OAuth flow —
`claude mcp add --transport http docs https://<your-app>.vercel.app/mcp`,
then `/mcp` → authenticate in the browser when prompted.

Tokens are per-user and scoped: whatever Claude creates or edits belongs to
the account that approved the connection, same as the web editor.

Every transport talks to the same Neon database and Blob store, so documents
Claude creates appear in the editor immediately.

Then ask Claude things like:

> Create a design doc for our payments service with an architecture diagram
> (mermaid) and share it with the team as view-only.

### MCP tools

| Tool | Purpose |
| --- | --- |
| `get_instructions` | Full usage guide: document format, diagram fences, assets, sharing rules, tables (also served as MCP server `instructions` at initialize) |
| `create_document` / `get_document` / `list_documents` / `update_document` / `delete_document` | Document CRUD |
| `upload_asset` / `list_assets` / `delete_asset` | Asset CRUD (base64 upload) |
| `share_document` / `list_shares` / `revoke_share` | View-only share links |
| `create_table` / `list_tables` / `get_table` / `update_table` / `delete_table` | Table CRUD |
| `add_column` / `update_column` / `delete_column` | Column schema management |
| `create_row` / `list_rows` / `update_row` / `delete_row` | Row CRUD (row data keyed by column name; `list_rows` is paginated) |
| `import_csv_rows` | Bulk-import rows into a table from CSV text (matched to existing columns by name) |

Tool results are returned as Markdown, not raw JSON — `create_document`,
`get_document`, and `update_document` include the document's actual content
in the response, so a `` ```mermaid `` diagram it contains renders live
wherever the client renders tool-result Markdown (Claude Code, Claude
Desktop, claude.ai). `share_document` prints the share URL directly in the
response text for easy copying. Table tools render rows as a Markdown table.

## Document format

Documents are plain markdown with two special fenced blocks:

````markdown
# My design doc

```mermaid
flowchart LR
  Client --> API --> DB
```

```excalidraw
{"elements": [ ... excalidraw elements ... ], "appState": {}, "files": {}}
```

![screenshot](/a/1a2b3c4d5e6f7a8b)
````

The Excalidraw block is a standard scene export (the same JSON you get from
Excalidraw's *Save to file*, or that Claude can author directly).

## REST API

Most `/api` routes accept a session cookie, an OAuth bearer token, **or an
API key** (`Authorization: Bearer dmcp_...`, created in Settings → API
keys) — the exceptions are `/api/auth/*`, `/api/connections`, and
`/api/api-keys` itself, which stay session/OAuth-only since they manage
your account rather than your content. `/mcp` accepts **only** an OAuth
bearer token — API keys are deliberately never valid there, since Claude's
custom-connector flow requires OAuth for that endpoint.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Accounts & sessions (public) |
| `PUT /api/auth/me` | Update your profile (name, email) |
| `GET /api/connections`, `DELETE /api/connections/:clientId` | List/disconnect MCP integrations authorized on your account |
| `GET /api/api-keys`, `POST /api/api-keys`, `DELETE /api/api-keys/:id` | Create/list/revoke API keys (the raw key is returned once, on creation) |
| `GET /.well-known/oauth-authorization-server`, `GET /.well-known/oauth-protected-resource` | OAuth discovery metadata |
| `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/decision`, `POST /oauth/token` | OAuth flow (registration, consent, tokens) |
| `GET/POST /api/documents`, `GET/PUT/DELETE /api/documents/:id` | Document CRUD |
| `GET/POST /api/assets`, `DELETE /api/assets/:id`, `GET /a/:id` | Asset CRUD; `POST` accepts either `multipart/form-data` (a `file` field) or JSON with base64 `data`; `/a/:id` redirects to the Vercel Blob URL |
| `POST /api/documents/:id/share`, `GET /api/documents/:id/shares`, `DELETE /api/shares/:token` | Manage share links |
| `GET /s/:token`, `GET /api/share/:token` | View-only share page + its read-only data endpoint |
| `GET/POST /api/tables`, `GET/PATCH/DELETE /api/tables/:id` | Table CRUD |
| `POST /api/tables/:id/columns`, `PATCH/DELETE /api/tables/:id/columns/:columnId`, `PUT /api/tables/:id/columns/reorder` | Column schema management |
| `GET/POST /api/tables/:id/rows`, `GET/PATCH/DELETE /api/tables/:id/rows/:rowId` | Row CRUD (`GET` is paginated via `?limit=&offset=`) |
| `POST /api/tables/import` | Create a new table from CSV (auto-detected columns) |
| `POST /api/tables/:id/rows/import/preview`, `POST /api/tables/:id/rows/import` | Preview a CSV's headers/sample rows, then import into an existing table with a column mapping |
| `POST /mcp` | MCP endpoint (Streamable HTTP transport, stateless) |

## Configuration

| Env var | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | yes | Neon Postgres connection string (injected by the Vercel Neon integration) |
| `BLOB_READ_WRITE_TOKEN` | for asset uploads | Vercel Blob token (injected by the Vercel Blob integration) |
| `DOCS_MCP_URL` | no | Overrides the base URL used in share/editor links (defaults to the Vercel production URL, or `http://localhost:4680` locally) |
| `DOCS_MCP_DISABLE_SIGNUP` | no | Set to `true` to reject new account registration |
| `PORT` | no | Local web server port (default `4680`) |
| `PG_POOL_MAX` | no | Max Postgres connections per instance (default `5`) |

## Security notes

- Share tokens are 160-bit random values; a link is view-only because the
  share endpoints expose no document ids and no write operations. Revoking a
  token disables it immediately.
- Passwords are hashed with scrypt (random salt, timing-safe compare);
  sessions are 160-bit random HttpOnly cookies (`Secure` when served over
  HTTPS). Registration is open by default — see `DOCS_MCP_DISABLE_SIGNUP`.
- OAuth: PKCE (S256) is mandatory, redirect URIs must be https (loopback
  excepted) and exact-match the registration, authorization codes are
  single-use with a 10-minute expiry, and access/refresh tokens are stored
  only as SHA-256 hashes; refresh use rotates the pair and revokes the old
  grant (access tokens live 1 hour, refresh 30 days).
- API keys are stored only as SHA-256 hashes (the raw `dmcp_...` value is
  shown once, at creation, and never again); a key grants full access to
  every REST endpoint your account can reach but is never accepted on
  `/mcp`, which stays OAuth-only.
- `/mcp` and `/api/*` are rate-limited per-process (`RateLimit-*` response
  headers); unauthenticated requests to `/mcp` always get 401 regardless of
  HTTP method, so the endpoint's method support can't be probed without
  credentials. OAuth authorization responses carry `iss` (RFC 9207) so a
  client juggling multiple authorization servers can't be tricked by a
  mixed-up code. The `X-Powered-By` header is disabled.
- Asset blobs are `access: "public"` — anyone with a blob URL (or the
  unguessable `/a/:id` redirect) can fetch it, which is what lets images
  render on public share pages; deleting the asset deletes the blob.
- Markdown is rendered without sanitization (documents are authored by you or
  your Claude). Add a sanitizer (e.g. DOMPurify) before accepting untrusted
  documents.

## Project layout

```
LICENSE              # MIT
api/index.js         # Vercel serverless entry (wraps src/app.js)
vercel.json          # build config + rewrites (API paths -> function, rest -> SPA)
src/db.js            # data layer: Neon Postgres + Vercel Blob (owner-scoped)
src/auth.js          # sessions, API keys, login/register routes, auth middleware
src/oauth.js         # OAuth 2.1 provider: discovery, registration, consent, tokens
src/tables.js        # REST API for Tables: table/column/row CRUD, CSV import
src/mcp.js           # MCP tool definitions (served over /mcp)
src/app.js           # Express app: REST API, /mcp, OAuth routes, SPA fallback
src/web-server.js    # local entry point (app.listen)
web/                 # React app (Vite): pages + design system (see web/DESIGN.md)
scripts/dev-db.mjs   # local PGlite Postgres for development
public/              # build output of web/ (gitignored; created by npm run build)
```

## Open source & self-hosting

Notes is open source under the [MIT license](LICENSE). Everything is here —
the MCP server and its tools, the OAuth 2.1 provider that makes it work as a
Claude custom connector, the auth/sharing backend, and the React frontend.

To self-host your own copy:

1. Fork/clone the repo and create a Vercel project from it.
2. Add the **Neon Postgres** and **Vercel Blob** integrations (they inject
   `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` automatically — see
   [Configuration](#configuration)).
3. Deploy. Tables are created on first use; no migration step needed.
4. Add your deployment as a custom connector in Claude (see
   [Connect it to Claude](#connect-it-to-claude-mcp-over-oauth)).

Issues and pull requests are welcome — see the [test plan checklists in past
PRs](../../pulls?q=is%3Apr) for the kind of verification (curl against a real
Postgres, a Playwright pass in light/dark and desktop/mobile) this project
expects from a change before merging.
