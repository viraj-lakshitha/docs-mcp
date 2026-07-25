// Shared data layer used by both the MCP server and the web server.
// Storage is a single SQLite database (documents, assets, share tokens);
// asset binaries are kept as BLOBs so everything lives in one file.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DOCS_MCP_DATA || path.join(root, "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "docs.sqlite"));
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assets (
    id         TEXT PRIMARY KEY,
    filename   TEXT NOT NULL,
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    data       BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shares (
    token       TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    created_at  TEXT NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0
  );
`);

const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(8).toString("hex");
// Share tokens are long and unguessable; knowing one grants read-only access.
const newToken = () => crypto.randomBytes(20).toString("base64url");

export const baseUrl = () =>
  (process.env.DOCS_MCP_URL || "http://localhost:4680").replace(/\/+$/, "");

// ---- documents ----

export function createDocument({ title, content = "" }) {
  const doc = { id: newId(), title, content, created_at: now(), updated_at: now() };
  db.prepare(
    "INSERT INTO documents (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(doc.id, doc.title, doc.content, doc.created_at, doc.updated_at);
  return doc;
}

export function listDocuments() {
  return db
    .prepare(
      "SELECT id, title, length(content) AS content_length, created_at, updated_at FROM documents ORDER BY updated_at DESC"
    )
    .all();
}

export function getDocument(id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id) ?? null;
}

export function updateDocument(id, { title, content }) {
  const doc = getDocument(id);
  if (!doc) return null;
  const nextTitle = title ?? doc.title;
  const nextContent = content ?? doc.content;
  db.prepare("UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?").run(
    nextTitle,
    nextContent,
    now(),
    id
  );
  return getDocument(id);
}

export function deleteDocument(id) {
  if (!getDocument(id)) return false;
  db.prepare("DELETE FROM shares WHERE document_id = ?").run(id);
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  return true;
}

// ---- assets ----

export function createAsset({ filename, mime, data }) {
  const asset = {
    id: newId(),
    filename,
    mime,
    size: data.length,
    created_at: now(),
  };
  db.prepare(
    "INSERT INTO assets (id, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(asset.id, asset.filename, asset.mime, asset.size, data, asset.created_at);
  return { ...asset, url: `/a/${asset.id}` };
}

export function listAssets() {
  return db
    .prepare("SELECT id, filename, mime, size, created_at FROM assets ORDER BY created_at DESC")
    .all()
    .map((a) => ({ ...a, url: `/a/${a.id}` }));
}

export function getAsset(id) {
  return db.prepare("SELECT * FROM assets WHERE id = ?").get(id) ?? null;
}

export function deleteAsset(id) {
  const found = db.prepare("SELECT id FROM assets WHERE id = ?").get(id);
  if (!found) return false;
  db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  return true;
}

// ---- share links (view-only) ----

export function createShare(documentId) {
  if (!getDocument(documentId)) return null;
  const share = { token: newToken(), document_id: documentId, created_at: now() };
  db.prepare("INSERT INTO shares (token, document_id, created_at) VALUES (?, ?, ?)").run(
    share.token,
    share.document_id,
    share.created_at
  );
  return { ...share, url: `${baseUrl()}/s/${share.token}` };
}

export function listShares(documentId) {
  const rows = documentId
    ? db.prepare("SELECT * FROM shares WHERE document_id = ? ORDER BY created_at DESC").all(documentId)
    : db.prepare("SELECT * FROM shares ORDER BY created_at DESC").all();
  return rows.map((s) => ({ ...s, revoked: Boolean(s.revoked), url: `${baseUrl()}/s/${s.token}` }));
}

export function revokeShare(token) {
  const share = db.prepare("SELECT token FROM shares WHERE token = ?").get(token);
  if (!share) return false;
  db.prepare("UPDATE shares SET revoked = 1 WHERE token = ?").run(token);
  return true;
}

// Resolves a share token to its document; returns null for unknown or revoked tokens.
export function getSharedDocument(token) {
  const share = db.prepare("SELECT * FROM shares WHERE token = ? AND revoked = 0").get(token);
  if (!share) return null;
  return getDocument(share.document_id);
}
