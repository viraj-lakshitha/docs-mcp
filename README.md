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

## Hook it up to Claude (MCP access)

The same MCP tools are available over two transports — use whichever fits:

**HTTP (recommended — nothing extra to run).** The app exposes MCP at `/mcp`
(Streamable HTTP, stateless — a natural fit for Vercel functions), so any MCP
client can connect with just a URL:

```bash
claude mcp add --transport http docs https://<your-app>.vercel.app/mcp
# or locally: claude mcp add --transport http docs http://localhost:4680/mcp
```

**stdio.** Claude Code spawns the server as a local process (it talks to Neon
and Blob directly, so it needs the same env vars — see Local development):

```bash
claude mcp add docs -- node /path/to/docs-mcp/src/mcp-server.js
```

Or in an MCP client config file:

```json
{
  "mcpServers": {
    "docs": {
      "command": "node",
      "args": ["/path/to/docs-mcp/src/mcp-server.js"]
    }
  }
}
```

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

| Method & path | Purpose |
| --- | --- |
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
| `PORT` | no | Local web server port (default `4680`) |
| `PG_POOL_MAX` | no | Max Postgres connections per instance (default `5`) |

## Security notes

- Share tokens are 160-bit random values; a link is view-only because the
  share endpoints expose no document ids and no write operations. Revoking a
  token disables it immediately.
- The editor, REST API, and `/mcp` endpoint have **no authentication** — a
  deployed instance is publicly writable until you add auth (e.g. Vercel
  deployment protection for the UI plus a bearer token check for `/api` and
  `/mcp`).
- Asset blobs are `access: "public"` — anyone with a blob URL can fetch it;
  deleting the asset deletes the blob.
- Markdown is rendered without sanitization (documents are authored by you or
  your Claude). Add a sanitizer (e.g. DOMPurify) before accepting untrusted
  documents.

## Project layout

```
api/index.js         # Vercel serverless entry (wraps src/app.js)
vercel.json          # rewrites: /s/:token -> share.html, everything else -> /api
src/db.js            # data layer: Neon Postgres + Vercel Blob
src/mcp.js           # MCP tool definitions (shared by both transports)
src/mcp-server.js    # MCP over stdio (spawned by Claude Code)
src/app.js           # Express app: REST API, /mcp, asset redirects, share pages
src/web-server.js    # local entry point (app.listen)
scripts/             # copy-vendor (postinstall), dev-db (local PGlite Postgres)
public/              # editor UI, share page, renderer; vendor/ filled on install
```
