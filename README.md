# docs-mcp

Create documents with Claude. An MCP server gives Claude full document/asset
CRUD, and a companion web app lets you edit, preview, and share the results
with **view-only links**.

## Features

- **Document CRUD** — create, list, read, update, delete (via MCP tools, REST API, or the web editor)
- **Asset CRUD** — upload images/files and embed them in documents (`![alt](/a/<asset_id>)`)
- **Markdown** — documents are markdown, rendered live in the editor preview and on share pages
- **Mermaid diagrams** — fenced ` ```mermaid ` blocks render as diagrams
- **Excalidraw** — fenced ` ```excalidraw ` blocks containing a scene JSON render as hand-drawn SVG
- **View-only sharing** — mint unguessable share links (`/s/<token>`); viewers get a rendered, read-only page and can be revoked at any time
- **Login & per-user access** — email/password accounts with a browser login portal; documents, assets, and shares are private to their owner. MCP clients connect via OAuth (works as a Claude custom connector)
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
npm run web                              # web app on http://localhost:4680
```

If you'd rather not point local dev at your Neon database, run
`npm run dev:db` in another terminal (an in-process Postgres via PGlite) and
start the app with
`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run web`.

Open http://localhost:4680 for the editor: document list on the left, markdown
editor in the middle, live preview on the right. Upload assets from the
sidebar and click **Insert** to drop a markdown reference at the cursor.
**Share view-only** creates a link anyone can open to read (but not edit) the
document.

## Accounts & login

Open the app in a browser and you'll land on the login portal
(`/login.html`): sign in or create an account (email + password, scrypt-hashed,
30-day HttpOnly session cookie). Everything you create — documents, assets,
share links — belongs to your account; other users can't see or touch it.
Set `DOCS_MCP_DISABLE_SIGNUP=true` to close registration after your team has
accounts.

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
| `create_document` / `get_document` / `list_documents` / `update_document` / `delete_document` | Document CRUD |
| `upload_asset` / `list_assets` / `delete_asset` | Asset CRUD (base64 upload) |
| `share_document` / `list_shares` / `revoke_share` | View-only share links |

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

All `/api` routes except `/api/auth/*` and `/api/share/:token` require a
session cookie or an OAuth bearer token; `/mcp` requires the bearer token.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Accounts & sessions (public) |
| `GET /.well-known/oauth-authorization-server`, `GET /.well-known/oauth-protected-resource` | OAuth discovery metadata |
| `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/decision`, `POST /oauth/token` | OAuth flow (registration, consent, tokens) |
| `GET/POST /api/documents`, `GET/PUT/DELETE /api/documents/:id` | Document CRUD |
| `GET/POST /api/assets`, `DELETE /api/assets/:id`, `GET /a/:id` | Asset CRUD; `/a/:id` redirects to the Vercel Blob URL |
| `POST /api/documents/:id/share`, `GET /api/documents/:id/shares`, `DELETE /api/shares/:token` | Manage share links |
| `GET /s/:token`, `GET /api/share/:token` | View-only share page + its read-only data endpoint |
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
- Asset blobs are `access: "public"` — anyone with a blob URL (or the
  unguessable `/a/:id` redirect) can fetch it, which is what lets images
  render on public share pages; deleting the asset deletes the blob.
- Markdown is rendered without sanitization (documents are authored by you or
  your Claude). Add a sanitizer (e.g. DOMPurify) before accepting untrusted
  documents.

## Project layout

```
api/index.js         # Vercel serverless entry (wraps src/app.js)
vercel.json          # rewrites: /s/:token -> share.html, everything else -> /api
src/db.js            # data layer: Neon Postgres + Vercel Blob (owner-scoped)
src/auth.js          # sessions, login/register routes, auth middleware
src/oauth.js         # OAuth 2.1 provider: discovery, registration, consent, tokens
src/mcp.js           # MCP tool definitions (served over /mcp)
src/app.js           # Express app: REST API, /mcp, OAuth routes, share pages
src/web-server.js    # local entry point (app.listen)
scripts/             # copy-vendor (postinstall), dev-db (local PGlite Postgres)
public/              # editor UI, share page, renderer; vendor/ filled on install
```
