// Shared data layer used by the MCP tools and the web/API app.
// Documents, share tokens, and asset metadata live in Neon Postgres
// (DATABASE_URL); asset binaries live in Vercel Blob (BLOB_READ_WRITE_TOKEN).
// Both env vars are injected automatically on a Vercel project with the Neon
// and Blob integrations; locally, run `vercel env pull` to get them.
import pg from "pg";
import { put, del } from "@vercel/blob";
import crypto from "node:crypto";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) is not set. On Vercel, add the Neon integration; locally, run `vercel env pull .env.development.local`."
  );
}

const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 5),
});

let schemaReady;
function ensureSchema() {
  schemaReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id            TEXT PRIMARY KEY,
        filename      TEXT NOT NULL,
        mime          TEXT NOT NULL,
        size          INTEGER NOT NULL,
        blob_url      TEXT NOT NULL,
        blob_pathname TEXT NOT NULL,
        created_at    TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shares (
        token       TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id),
        created_at  TEXT NOT NULL,
        revoked     BOOLEAN NOT NULL DEFAULT FALSE
      )`);
  })();
  return schemaReady;
}

async function q(text, params = []) {
  await ensureSchema();
  const { rows } = await pool.query(text, params);
  return rows;
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(8).toString("hex");
// Share tokens are long and unguessable; knowing one grants read-only access.
const newToken = () => crypto.randomBytes(20).toString("base64url");

export const baseUrl = () => {
  if (process.env.DOCS_MCP_URL) return process.env.DOCS_MCP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 4680}`;
};

// ---- documents ----

export async function createDocument({ title, content = "" }) {
  const doc = { id: newId(), title, content, created_at: now(), updated_at: now() };
  await q("INSERT INTO documents (id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)", [
    doc.id,
    doc.title,
    doc.content,
    doc.created_at,
    doc.updated_at,
  ]);
  return doc;
}

export async function listDocuments() {
  return q(
    "SELECT id, title, length(content) AS content_length, created_at, updated_at FROM documents ORDER BY updated_at DESC"
  );
}

export async function getDocument(id) {
  const rows = await q("SELECT * FROM documents WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function updateDocument(id, { title, content }) {
  const doc = await getDocument(id);
  if (!doc) return null;
  await q("UPDATE documents SET title = $1, content = $2, updated_at = $3 WHERE id = $4", [
    title ?? doc.title,
    content ?? doc.content,
    now(),
    id,
  ]);
  return getDocument(id);
}

export async function deleteDocument(id) {
  if (!(await getDocument(id))) return false;
  await q("DELETE FROM shares WHERE document_id = $1", [id]);
  await q("DELETE FROM documents WHERE id = $1", [id]);
  return true;
}

// ---- assets (binaries in Vercel Blob, metadata in Postgres) ----

export async function createAsset({ filename, mime, data }) {
  const id = newId();
  const blob = await put(`docs-mcp/${id}/${filename}`, data, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  const asset = {
    id,
    filename,
    mime,
    size: data.length,
    blob_url: blob.url,
    blob_pathname: blob.pathname,
    created_at: now(),
  };
  await q(
    "INSERT INTO assets (id, filename, mime, size, blob_url, blob_pathname, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [asset.id, asset.filename, asset.mime, asset.size, asset.blob_url, asset.blob_pathname, asset.created_at]
  );
  return { ...asset, url: `/a/${asset.id}` };
}

export async function listAssets() {
  const rows = await q(
    "SELECT id, filename, mime, size, blob_url, created_at FROM assets ORDER BY created_at DESC"
  );
  return rows.map((a) => ({ ...a, url: `/a/${a.id}` }));
}

export async function getAsset(id) {
  const rows = await q("SELECT * FROM assets WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function deleteAsset(id) {
  const asset = await getAsset(id);
  if (!asset) return false;
  await del(asset.blob_url);
  await q("DELETE FROM assets WHERE id = $1", [id]);
  return true;
}

// ---- share links (view-only) ----

export async function createShare(documentId) {
  if (!(await getDocument(documentId))) return null;
  const share = { token: newToken(), document_id: documentId, created_at: now() };
  await q("INSERT INTO shares (token, document_id, created_at) VALUES ($1, $2, $3)", [
    share.token,
    share.document_id,
    share.created_at,
  ]);
  return { ...share, url: `${baseUrl()}/s/${share.token}` };
}

export async function listShares(documentId) {
  const rows = documentId
    ? await q("SELECT * FROM shares WHERE document_id = $1 ORDER BY created_at DESC", [documentId])
    : await q("SELECT * FROM shares ORDER BY created_at DESC");
  return rows.map((s) => ({ ...s, url: `${baseUrl()}/s/${s.token}` }));
}

export async function revokeShare(token) {
  const rows = await q("SELECT token FROM shares WHERE token = $1", [token]);
  if (rows.length === 0) return false;
  await q("UPDATE shares SET revoked = TRUE WHERE token = $1", [token]);
  return true;
}

// Resolves a share token to its document; returns null for unknown or revoked tokens.
export async function getSharedDocument(token) {
  const rows = await q("SELECT document_id FROM shares WHERE token = $1 AND revoked = FALSE", [token]);
  return rows.length ? getDocument(rows[0].document_id) : null;
}
