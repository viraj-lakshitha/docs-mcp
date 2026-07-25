// Shared data layer used by the MCP tools and the web/API app.
// Documents, users, sessions, API keys, share tokens, and asset metadata live
// in Neon Postgres (DATABASE_URL); asset binaries live in Vercel Blob
// (BLOB_READ_WRITE_TOKEN). Both env vars are injected automatically on a
// Vercel project with the Neon and Blob integrations; locally, run
// `vercel env pull` to get them.
//
// Authorization model: every document/asset/share row is owned by a user_id,
// and every accessor that isn't part of the public share/asset surface takes
// the acting user's id and filters by it.
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
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id),
        name       TEXT NOT NULL,
        key_hash   TEXT NOT NULL UNIQUE,
        prefix     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked    BOOLEAN NOT NULL DEFAULT FALSE
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id         TEXT PRIMARY KEY,
        user_id    TEXT,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id            TEXT PRIMARY KEY,
        user_id       TEXT,
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
        user_id     TEXT,
        document_id TEXT NOT NULL REFERENCES documents(id),
        created_at  TEXT NOT NULL,
        revoked     BOOLEAN NOT NULL DEFAULT FALSE
      )`);
    // Upgrades for databases created before auth existed.
    await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id TEXT");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id TEXT");
    await pool.query("ALTER TABLE shares ADD COLUMN IF NOT EXISTS user_id TEXT");
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
// Share/session tokens are long and unguessable.
const newToken = () => crypto.randomBytes(20).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export const baseUrl = () => {
  if (process.env.DOCS_MCP_URL) return process.env.DOCS_MCP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 4680}`;
};

// ---- users ----

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export async function createUser({ email, password }) {
  const user = { id: newId(), email: email.toLowerCase().trim(), created_at: now() };
  await q("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [
    user.id,
    user.email,
    hashPassword(password),
    user.created_at,
  ]);
  return user;
}

export async function getUserByEmail(email) {
  const rows = await q("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  return rows[0] ?? null;
}

export async function getUserById(id) {
  const rows = await q("SELECT id, email, created_at FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// ---- sessions (browser login) ----

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(userId) {
  const session = {
    token: newToken(),
    user_id: userId,
    created_at: now(),
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  await q("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)", [
    session.token,
    session.user_id,
    session.created_at,
    session.expires_at,
  ]);
  return session;
}

export async function getSession(token) {
  const rows = await q("SELECT * FROM sessions WHERE token = $1", [token]);
  const session = rows[0];
  if (!session) return null;
  if (session.expires_at <= now()) {
    await q("DELETE FROM sessions WHERE token = $1", [token]);
    return null;
  }
  return session;
}

export async function deleteSession(token) {
  await q("DELETE FROM sessions WHERE token = $1", [token]);
}

// ---- API keys (MCP + programmatic access) ----

export async function createApiKey(userId, name) {
  const raw = `dmcp_${crypto.randomBytes(24).toString("base64url")}`;
  const key = {
    id: newId(),
    user_id: userId,
    name: name || "MCP key",
    prefix: raw.slice(0, 10),
    created_at: now(),
  };
  await q("INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [
    key.id,
    key.user_id,
    key.name,
    sha256(raw),
    key.prefix,
    key.created_at,
  ]);
  // The raw key is returned exactly once and never stored.
  return { ...key, key: raw };
}

export async function getUserIdForApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith("dmcp_")) return null;
  const rows = await q("SELECT user_id FROM api_keys WHERE key_hash = $1 AND revoked = FALSE", [sha256(rawKey)]);
  return rows[0]?.user_id ?? null;
}

export async function listApiKeys(userId) {
  return q("SELECT id, name, prefix, created_at, revoked FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [
    userId,
  ]);
}

export async function revokeApiKey(userId, id) {
  const rows = await q("UPDATE api_keys SET revoked = TRUE WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length > 0;
}

// ---- documents (scoped to owner) ----

export async function createDocument(userId, { title, content = "" }) {
  const doc = { id: newId(), user_id: userId, title, content, created_at: now(), updated_at: now() };
  await q("INSERT INTO documents (id, user_id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", [
    doc.id,
    doc.user_id,
    doc.title,
    doc.content,
    doc.created_at,
    doc.updated_at,
  ]);
  return doc;
}

export async function listDocuments(userId) {
  return q(
    "SELECT id, title, length(content) AS content_length, created_at, updated_at FROM documents WHERE user_id = $1 ORDER BY updated_at DESC",
    [userId]
  );
}

export async function getDocument(userId, id) {
  const rows = await q("SELECT * FROM documents WHERE id = $1 AND user_id = $2", [id, userId]);
  return rows[0] ?? null;
}

export async function updateDocument(userId, id, { title, content }) {
  const doc = await getDocument(userId, id);
  if (!doc) return null;
  await q("UPDATE documents SET title = $1, content = $2, updated_at = $3 WHERE id = $4 AND user_id = $5", [
    title ?? doc.title,
    content ?? doc.content,
    now(),
    id,
    userId,
  ]);
  return getDocument(userId, id);
}

export async function deleteDocument(userId, id) {
  if (!(await getDocument(userId, id))) return false;
  await q("DELETE FROM shares WHERE document_id = $1", [id]);
  await q("DELETE FROM documents WHERE id = $1 AND user_id = $2", [id, userId]);
  return true;
}

// ---- assets (binaries in Vercel Blob, metadata in Postgres) ----

export async function createAsset(userId, { filename, mime, data }) {
  const id = newId();
  const blob = await put(`docs-mcp/${id}/${filename}`, data, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  const asset = {
    id,
    user_id: userId,
    filename,
    mime,
    size: data.length,
    blob_url: blob.url,
    blob_pathname: blob.pathname,
    created_at: now(),
  };
  await q(
    "INSERT INTO assets (id, user_id, filename, mime, size, blob_url, blob_pathname, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [asset.id, asset.user_id, asset.filename, asset.mime, asset.size, asset.blob_url, asset.blob_pathname, asset.created_at]
  );
  return { ...asset, url: `/a/${asset.id}` };
}

export async function listAssets(userId) {
  const rows = await q(
    "SELECT id, filename, mime, size, blob_url, created_at FROM assets WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return rows.map((a) => ({ ...a, url: `/a/${a.id}` }));
}

// Intentionally unscoped: /a/:id serves image embeds on public share pages.
// Asset ids are 64-bit random values, mirroring the unguessable-token model.
export async function getAssetPublic(id) {
  const rows = await q("SELECT * FROM assets WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function deleteAsset(userId, id) {
  const rows = await q("SELECT * FROM assets WHERE id = $1 AND user_id = $2", [id, userId]);
  const asset = rows[0];
  if (!asset) return false;
  await del(asset.blob_url);
  await q("DELETE FROM assets WHERE id = $1 AND user_id = $2", [id, userId]);
  return true;
}

// ---- share links (view-only) ----

export async function createShare(userId, documentId) {
  if (!(await getDocument(userId, documentId))) return null;
  const share = { token: newToken(), user_id: userId, document_id: documentId, created_at: now() };
  await q("INSERT INTO shares (token, user_id, document_id, created_at) VALUES ($1, $2, $3, $4)", [
    share.token,
    share.user_id,
    share.document_id,
    share.created_at,
  ]);
  return { ...share, url: `${baseUrl()}/s/${share.token}` };
}

export async function listShares(userId, documentId) {
  const rows = documentId
    ? await q("SELECT * FROM shares WHERE user_id = $1 AND document_id = $2 ORDER BY created_at DESC", [
        userId,
        documentId,
      ])
    : await q("SELECT * FROM shares WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
  return rows.map((s) => ({ ...s, url: `${baseUrl()}/s/${s.token}` }));
}

export async function revokeShare(userId, token) {
  const rows = await q("UPDATE shares SET revoked = TRUE WHERE token = $1 AND user_id = $2 RETURNING token", [
    token,
    userId,
  ]);
  return rows.length > 0;
}

// Public: resolves a share token to its document; returns null for unknown or
// revoked tokens. No user scoping — this is the view-only surface.
export async function getSharedDocument(token) {
  const rows = await q(
    `SELECT d.title, d.content, d.updated_at
       FROM shares s JOIN documents d ON d.id = s.document_id
      WHERE s.token = $1 AND s.revoked = FALSE`,
    [token]
  );
  return rows[0] ?? null;
}
