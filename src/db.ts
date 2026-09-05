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
import pg, { type QueryResultRow } from "pg";
import { put, del } from "@vercel/blob";
import crypto from "node:crypto";
import { isInlineSafeMime } from "./security.js";
import type {
  User,
  UserRecord,
  Session,
  OAuthClient,
  OAuthTokenResponse,
  AuthCodeGrant,
  Connection,
  ApiKeySummary,
  ApiKeyCreated,
  Document,
  DocumentSummary,
  SharedDocumentView,
  Asset,
  AssetSummary,
  ShareLink,
  ColumnType,
  TableColumn,
  DataTable,
  DataTableSummary,
  DataTableWithColumns,
  TableRow,
  RowsPage,
} from "../shared/types.js";

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

let schemaReady: Promise<void> | undefined;
function ensureSchema(): Promise<void> {
  // A transient connection error during init (e.g. a brief Neon blip on a
  // warm serverless instance) must not poison every future request — clear
  // the cached promise on failure so the next call retries from scratch.
  schemaReady ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        name          TEXT,
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
      CREATE TABLE IF NOT EXISTS oauth_clients (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        redirect_uris TEXT NOT NULL,
        created_at    TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_codes (
        code_hash      TEXT PRIMARY KEY,
        client_id      TEXT NOT NULL,
        user_id        TEXT NOT NULL REFERENCES users(id),
        redirect_uri   TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        scope          TEXT NOT NULL DEFAULT '',
        expires_at     TEXT NOT NULL,
        used           BOOLEAN NOT NULL DEFAULT FALSE
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL REFERENCES users(id),
        client_id          TEXT NOT NULL,
        scope              TEXT NOT NULL DEFAULT '',
        access_hash        TEXT NOT NULL UNIQUE,
        refresh_hash       TEXT NOT NULL UNIQUE,
        access_expires_at  TEXT NOT NULL,
        refresh_expires_at TEXT NOT NULL,
        created_at         TEXT NOT NULL,
        revoked            BOOLEAN NOT NULL DEFAULT FALSE
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
      CREATE TABLE IF NOT EXISTS tables (
        id          TEXT PRIMARY KEY,
        user_id     TEXT,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS table_columns (
        id         TEXT PRIMARY KEY,
        table_id   TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL,
        position   INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`);
    await pool.query("CREATE INDEX IF NOT EXISTS table_columns_table_id_idx ON table_columns(table_id)");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS table_rows (
        id         TEXT PRIMARY KEY,
        table_id   TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        user_id    TEXT,
        data       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
    await pool.query("CREATE INDEX IF NOT EXISTS table_rows_table_id_idx ON table_rows(table_id)");
    // Upgrades for databases created before auth existed.
    await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id TEXT");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id TEXT");
    await pool.query("ALTER TABLE shares ADD COLUMN IF NOT EXISTS user_id TEXT");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT");
  })().catch((err) => {
    schemaReady = undefined;
    throw err;
  });
  return schemaReady;
}

async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

const now = (): string => new Date().toISOString();
const newId = (): string => crypto.randomBytes(8).toString("hex");
// Share/session tokens are long and unguessable.
const newToken = (): string => crypto.randomBytes(20).toString("base64url");
const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");

export const baseUrl = (): string => {
  if (process.env.DOCS_MCP_URL) return process.env.DOCS_MCP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 4680}`;
};

// ---- users ----

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export async function createUser({ email, password }: { email: string; password: string }): Promise<User> {
  const user = { id: newId(), email: email.toLowerCase().trim(), created_at: now() };
  await q("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [
    user.id,
    user.email,
    hashPassword(password),
    user.created_at,
  ]);
  return { ...user, name: null };
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await q<UserRecord>("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await q<User>("SELECT id, email, name, created_at FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// Updates the profile fields provided (undefined fields are left unchanged).
// Returns "email_taken" if the new email collides with a different account.
export async function updateUser(
  id: string,
  { name, email }: { name?: string; email?: string }
): Promise<User | "email_taken" | null> {
  const current = await q<UserRecord>("SELECT * FROM users WHERE id = $1", [id]);
  if (!current[0]) return null;
  const nextEmail = email !== undefined ? email.toLowerCase().trim() : current[0].email;
  if (nextEmail !== current[0].email) {
    const clash = await getUserByEmail(nextEmail);
    if (clash && clash.id !== id) return "email_taken";
  }
  const nextName = name !== undefined ? name.trim() || null : current[0].name;
  await q("UPDATE users SET name = $1, email = $2 WHERE id = $3", [nextName, nextEmail, id]);
  return getUserById(id);
}

// ---- sessions (browser login) ----

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(userId: string): Promise<Session> {
  const session: Session = {
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

export async function getSession(token: string): Promise<Session | null> {
  const rows = await q<Session>("SELECT * FROM sessions WHERE token = $1", [token]);
  const session = rows[0];
  if (!session) return null;
  if (session.expires_at <= now()) {
    await q("DELETE FROM sessions WHERE token = $1", [token]);
    return null;
  }
  return session;
}

export async function deleteSession(token: string): Promise<void> {
  await q("DELETE FROM sessions WHERE token = $1", [token]);
}

// ---- OAuth provider (MCP clients: Claude custom connectors, Claude Code) ----

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;

export async function registerOAuthClient({
  name,
  redirectUris,
}: {
  name: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const client: OAuthClient = { id: newId(), name, redirect_uris: redirectUris, created_at: now() };
  await q("INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES ($1, $2, $3, $4)", [
    client.id,
    client.name,
    JSON.stringify(client.redirect_uris),
    client.created_at,
  ]);
  return client;
}

export async function getOAuthClient(id: string): Promise<OAuthClient | null> {
  const rows = await q<Omit<OAuthClient, "redirect_uris"> & { redirect_uris: string }>(
    "SELECT * FROM oauth_clients WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;
  return { ...rows[0], redirect_uris: JSON.parse(rows[0].redirect_uris) };
}

export async function createAuthCode({
  clientId,
  userId,
  redirectUri,
  codeChallenge,
  scope,
}: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
}): Promise<string> {
  const raw = `dmac_${crypto.randomBytes(24).toString("base64url")}`;
  await q(
    "INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [sha256(raw), clientId, userId, redirectUri, codeChallenge, scope || "", new Date(Date.now() + CODE_TTL_MS).toISOString()]
  );
  return raw;
}

// Single-use: marks the code consumed atomically so a replayed code fails.
export async function consumeAuthCode(rawCode: string): Promise<AuthCodeGrant | null> {
  const rows = await q<AuthCodeGrant>(
    "UPDATE oauth_codes SET used = TRUE WHERE code_hash = $1 AND used = FALSE AND expires_at > $2 RETURNING *",
    [sha256(rawCode), now()]
  );
  return rows[0] ?? null;
}

export async function createOAuthTokens({
  userId,
  clientId,
  scope,
}: {
  userId: string;
  clientId: string;
  scope?: string;
}): Promise<OAuthTokenResponse> {
  const access = `dmat_${crypto.randomBytes(32).toString("base64url")}`;
  const refresh = `dmrt_${crypto.randomBytes(32).toString("base64url")}`;
  await q(
    `INSERT INTO oauth_tokens (id, user_id, client_id, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId(),
      userId,
      clientId,
      scope || "",
      sha256(access),
      sha256(refresh),
      new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
      new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
      now(),
    ]
  );
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: scope || "",
  };
}

export async function getUserIdForAccessToken(raw: string | undefined): Promise<string | null> {
  if (!raw || !raw.startsWith("dmat_")) return null;
  const rows = await q<{ user_id: string }>(
    "SELECT user_id FROM oauth_tokens WHERE access_hash = $1 AND revoked = FALSE AND access_expires_at > $2",
    [sha256(raw), now()]
  );
  return rows[0]?.user_id ?? null;
}

// Refresh-token rotation: the old grant row is revoked and a fresh token pair
// is issued for the same user/client/scope.
export async function rotateRefreshToken(raw: string | undefined): Promise<OAuthTokenResponse | null> {
  if (!raw || !raw.startsWith("dmrt_")) return null;
  const rows = await q<{ user_id: string; client_id: string; scope: string }>(
    "UPDATE oauth_tokens SET revoked = TRUE WHERE refresh_hash = $1 AND revoked = FALSE AND refresh_expires_at > $2 RETURNING user_id, client_id, scope",
    [sha256(raw), now()]
  );
  if (!rows[0]) return null;
  return createOAuthTokens({ userId: rows[0].user_id, clientId: rows[0].client_id, scope: rows[0].scope });
}

// "Connected" means at least one non-revoked, unexpired-refresh token exists
// for that client — i.e. an MCP client (e.g. a Claude connector) that can
// currently act as this user. Shown in Settings → Integrations.
export async function listConnections(userId: string): Promise<Connection[]> {
  return q<Connection>(
    `SELECT c.id AS client_id, c.name AS client_name,
            MIN(t.created_at) AS connected_at,
            COUNT(*) AS active_tokens
       FROM oauth_tokens t
       JOIN oauth_clients c ON c.id = t.client_id
      WHERE t.user_id = $1 AND t.revoked = FALSE AND t.refresh_expires_at > $2
      GROUP BY c.id, c.name
      ORDER BY connected_at DESC`,
    [userId, now()]
  );
}

export async function revokeConnection(userId: string, clientId: string): Promise<boolean> {
  const rows = await q(
    "UPDATE oauth_tokens SET revoked = TRUE WHERE user_id = $1 AND client_id = $2 AND revoked = FALSE RETURNING id",
    [userId, clientId]
  );
  return rows.length > 0;
}

// ---- documents (scoped to owner) ----

export async function createDocument(
  userId: string,
  { title, content = "" }: { title: string; content?: string }
): Promise<Document> {
  const doc: Document = { id: newId(), user_id: userId, title, content, created_at: now(), updated_at: now() };
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

export async function listDocuments(userId: string): Promise<DocumentSummary[]> {
  return q<DocumentSummary>(
    "SELECT id, title, length(content) AS content_length, created_at, updated_at FROM documents WHERE user_id = $1 ORDER BY updated_at DESC",
    [userId]
  );
}

export async function getDocument(userId: string, id: string): Promise<Document | null> {
  const rows = await q<Document>("SELECT * FROM documents WHERE id = $1 AND user_id = $2", [id, userId]);
  return rows[0] ?? null;
}

export async function updateDocument(
  userId: string,
  id: string,
  { title, content }: { title?: string; content?: string }
): Promise<Document | null> {
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

export async function deleteDocument(userId: string, id: string): Promise<boolean> {
  if (!(await getDocument(userId, id))) return false;
  await q("DELETE FROM shares WHERE document_id = $1", [id]);
  await q("DELETE FROM documents WHERE id = $1 AND user_id = $2", [id, userId]);
  return true;
}

// ---- assets (binaries in Vercel Blob, metadata in Postgres) ----

export async function createAsset(
  userId: string,
  { filename, mime, data }: { filename: string; mime: string; data: Buffer }
): Promise<Asset> {
  const id = newId();
  const blob = await put(`docs-mcp/${id}/${filename}`, data, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  // put() returns two URLs for the same object: `url`, served inline, and
  // `downloadUrl`, which sends content-disposition: attachment. Point /a/:id
  // at the inline one only for formats a browser renders in an <img> and that
  // carry no script of their own; everything else downloads rather than
  // rendering, so a public blob URL can't be used to host a page.
  //
  // SVG is the case that motivates the split. It can carry script, but script
  // in an SVG loaded through <img> never executes, so embeds keep working
  // while direct navigation stops being a hosting primitive. (Disposition is
  // chosen by the Blob service per URL, not settable on put(), which is why
  // this is a choice of URL rather than an upload option.)
  const blobUrl = isInlineSafeMime(mime) ? blob.url : blob.downloadUrl;
  const asset = {
    id,
    user_id: userId,
    filename,
    mime,
    size: data.length,
    blob_url: blobUrl,
    blob_pathname: blob.pathname,
    created_at: now(),
  };
  await q(
    "INSERT INTO assets (id, user_id, filename, mime, size, blob_url, blob_pathname, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [asset.id, asset.user_id, asset.filename, asset.mime, asset.size, asset.blob_url, asset.blob_pathname, asset.created_at]
  );
  const url = `/a/${asset.id}`;
  return { ...asset, url, public_url: `${baseUrl()}${url}` };
}

export async function listAssets(userId: string): Promise<AssetSummary[]> {
  const rows = await q<Omit<Asset, "blob_pathname" | "url" | "public_url" | "user_id">>(
    "SELECT id, filename, mime, size, blob_url, created_at FROM assets WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return rows.map((a) => {
    const url = `/a/${a.id}`;
    return { ...a, url, public_url: `${baseUrl()}${url}` };
  });
}

// Intentionally unscoped: /a/:id serves image embeds on public share pages.
// Asset ids are 64-bit random values, mirroring the unguessable-token model.
// Returns the raw row (blob_url is what the /a/:id route redirects to) — no
// derived `url` field, since this is never serialized straight to a client.
export async function getAssetPublic(id: string): Promise<Omit<Asset, "url"> | null> {
  const rows = await q<Omit<Asset, "url">>("SELECT * FROM assets WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function deleteAsset(userId: string, id: string): Promise<boolean> {
  const rows = await q<Omit<Asset, "url">>("SELECT * FROM assets WHERE id = $1 AND user_id = $2", [id, userId]);
  const asset = rows[0];
  if (!asset) return false;
  await del(asset.blob_url);
  await q("DELETE FROM assets WHERE id = $1 AND user_id = $2", [id, userId]);
  return true;
}

// ---- share links (view-only) ----

export async function createShare(userId: string, documentId: string): Promise<ShareLink | null> {
  if (!(await getDocument(userId, documentId))) return null;
  const share = { token: newToken(), user_id: userId, document_id: documentId, created_at: now(), revoked: false };
  await q("INSERT INTO shares (token, user_id, document_id, created_at) VALUES ($1, $2, $3, $4)", [
    share.token,
    share.user_id,
    share.document_id,
    share.created_at,
  ]);
  return { ...share, url: `${baseUrl()}/s/${share.token}` };
}

export async function listShares(userId: string, documentId?: string): Promise<ShareLink[]> {
  const rows = documentId
    ? await q<Omit<ShareLink, "url">>("SELECT * FROM shares WHERE user_id = $1 AND document_id = $2 ORDER BY created_at DESC", [
        userId,
        documentId,
      ])
    : await q<Omit<ShareLink, "url">>("SELECT * FROM shares WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
  return rows.map((s) => ({ ...s, url: `${baseUrl()}/s/${s.token}` }));
}

export async function revokeShare(userId: string, token: string): Promise<boolean> {
  const rows = await q("UPDATE shares SET revoked = TRUE WHERE token = $1 AND user_id = $2 RETURNING token", [
    token,
    userId,
  ]);
  return rows.length > 0;
}

// Public: resolves a share token to its document; returns null for unknown or
// revoked tokens. No user scoping — this is the view-only surface.
export async function getSharedDocument(token: string): Promise<SharedDocumentView | null> {
  const rows = await q<SharedDocumentView>(
    `SELECT d.title, d.content, d.updated_at
       FROM shares s JOIN documents d ON d.id = s.document_id
      WHERE s.token = $1 AND s.revoked = FALSE`,
    [token]
  );
  return rows[0] ?? null;
}

// ---- API keys (REST access for scripts/external tools; never valid for /mcp) ----

export async function createApiKey(userId: string, name: string | undefined): Promise<ApiKeyCreated> {
  const raw = `dmcp_${crypto.randomBytes(24).toString("base64url")}`;
  const key = {
    id: newId(),
    user_id: userId,
    name: name || "API key",
    prefix: raw.slice(0, 10),
    created_at: now(),
    revoked: false,
  };
  await q("INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [
    key.id,
    key.user_id,
    key.name,
    sha256(raw),
    key.prefix,
    key.created_at,
  ]);
  return { id: key.id, name: key.name, prefix: key.prefix, created_at: key.created_at, revoked: false, key: raw };
}

export async function getUserIdForApiKey(rawKey: string | undefined): Promise<string | null> {
  if (!rawKey || !rawKey.startsWith("dmcp_")) return null;
  const rows = await q<{ user_id: string }>("SELECT user_id FROM api_keys WHERE key_hash = $1 AND revoked = FALSE", [
    sha256(rawKey),
  ]);
  return rows[0]?.user_id ?? null;
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  return q<ApiKeySummary>(
    "SELECT id, name, prefix, created_at, revoked FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const rows = await q("UPDATE api_keys SET revoked = TRUE WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length > 0;
}

// ---- tables (typed-column data tables; owner-scoped) ----

const TABLE_COLUMN_TYPES = new Set<ColumnType>(["text", "number", "boolean", "date"]);

export async function createTable(
  userId: string,
  { name, description = null }: { name: string; description?: string | null }
): Promise<DataTable> {
  const table: DataTable = { id: newId(), user_id: userId, name, description, created_at: now(), updated_at: now() };
  await q(
    "INSERT INTO tables (id, user_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [table.id, table.user_id, table.name, table.description, table.created_at, table.updated_at]
  );
  return table;
}

export async function listTables(userId: string): Promise<DataTableSummary[]> {
  return q<DataTableSummary>(
    `SELECT t.*,
            COUNT(DISTINCT c.id) AS column_count,
            COUNT(DISTINCT r.id) AS row_count
       FROM tables t
       LEFT JOIN table_columns c ON c.table_id = t.id
       LEFT JOIN table_rows r ON r.table_id = t.id
      WHERE t.user_id = $1
      GROUP BY t.id
      ORDER BY t.updated_at DESC`,
    [userId]
  );
}

export async function getTable(userId: string, id: string): Promise<DataTableWithColumns | null> {
  const rows = await q<DataTable>("SELECT * FROM tables WHERE id = $1 AND user_id = $2", [id, userId]);
  const table = rows[0];
  if (!table) return null;
  const columns = await q<TableColumn>("SELECT * FROM table_columns WHERE table_id = $1 ORDER BY position", [id]);
  return { ...table, columns };
}

export async function updateTable(
  userId: string,
  id: string,
  { name, description }: { name?: string; description?: string }
): Promise<DataTableWithColumns | null> {
  const table = await getTable(userId, id);
  if (!table) return null;
  await q("UPDATE tables SET name = $1, description = $2, updated_at = $3 WHERE id = $4 AND user_id = $5", [
    name ?? table.name,
    description !== undefined ? description : table.description,
    now(),
    id,
    userId,
  ]);
  return getTable(userId, id);
}

export async function deleteTable(userId: string, id: string): Promise<boolean> {
  const rows = await q("DELETE FROM tables WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length > 0;
}

export async function addColumn(
  userId: string,
  tableId: string,
  { name, type }: { name: string; type: ColumnType }
): Promise<TableColumn | "invalid_type" | null> {
  if (!(await getTable(userId, tableId))) return null;
  if (!TABLE_COLUMN_TYPES.has(type)) return "invalid_type";
  const posRows = await q<{ next: number }>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM table_columns WHERE table_id = $1",
    [tableId]
  );
  const column: TableColumn = { id: newId(), table_id: tableId, name, type, position: posRows[0]!.next, created_at: now() };
  await q("INSERT INTO table_columns (id, table_id, name, type, position, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [
    column.id,
    column.table_id,
    column.name,
    column.type,
    column.position,
    column.created_at,
  ]);
  return column;
}

export async function updateColumn(
  userId: string,
  tableId: string,
  columnId: string,
  { name, type }: { name?: string; type?: ColumnType }
): Promise<TableColumn | "invalid_type" | null> {
  if (!(await getTable(userId, tableId))) return null;
  if (type !== undefined && !TABLE_COLUMN_TYPES.has(type)) return "invalid_type";
  const rows = await q<TableColumn>("SELECT * FROM table_columns WHERE id = $1 AND table_id = $2", [columnId, tableId]);
  const column = rows[0];
  if (!column) return null;
  await q("UPDATE table_columns SET name = $1, type = $2 WHERE id = $3 AND table_id = $4", [
    name ?? column.name,
    type ?? column.type,
    columnId,
    tableId,
  ]);
  return { ...column, name: name ?? column.name, type: type ?? column.type };
}

export async function deleteColumn(userId: string, tableId: string, columnId: string): Promise<boolean> {
  if (!(await getTable(userId, tableId))) return false;
  const rows = await q("DELETE FROM table_columns WHERE id = $1 AND table_id = $2 RETURNING id", [columnId, tableId]);
  if (rows.length === 0) return false;
  await q("UPDATE table_rows SET data = data - $1 WHERE table_id = $2", [columnId, tableId]);
  return true;
}

export async function reorderColumns(userId: string, tableId: string, orderedColumnIds: string[]): Promise<boolean> {
  if (!(await getTable(userId, tableId))) return false;
  for (let i = 0; i < orderedColumnIds.length; i++) {
    await q("UPDATE table_columns SET position = $1 WHERE id = $2 AND table_id = $3", [i, orderedColumnIds[i], tableId]);
  }
  return true;
}

const ROW_PAGE_DEFAULT = 50;
const ROW_PAGE_MAX = 500;

export async function listRows(
  userId: string,
  tableId: string,
  { limit = ROW_PAGE_DEFAULT, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<RowsPage | null> {
  if (!(await getTable(userId, tableId))) return null;
  const cappedLimit = Math.min(Math.max(1, limit), ROW_PAGE_MAX);
  const rows = await q<TableRow & { total_count: string }>(
    "SELECT *, COUNT(*) OVER() AS total_count FROM table_rows WHERE table_id = $1 ORDER BY created_at LIMIT $2 OFFSET $3",
    [tableId, cappedLimit, Math.max(0, offset)]
  );
  return {
    rows: rows.map(({ total_count, ...r }) => r),
    total: rows[0] ? Number(rows[0].total_count) : 0,
  };
}

export async function getRow(userId: string, tableId: string, rowId: string): Promise<TableRow | null> {
  if (!(await getTable(userId, tableId))) return null;
  const rows = await q<TableRow>("SELECT * FROM table_rows WHERE id = $1 AND table_id = $2", [rowId, tableId]);
  return rows[0] ?? null;
}

export async function createRow(userId: string, tableId: string, data: Record<string, unknown>): Promise<TableRow | null> {
  if (!(await getTable(userId, tableId))) return null;
  const row: TableRow = { id: newId(), table_id: tableId, user_id: userId, data, created_at: now(), updated_at: now() };
  await q(
    "INSERT INTO table_rows (id, table_id, user_id, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [row.id, row.table_id, row.user_id, JSON.stringify(row.data), row.created_at, row.updated_at]
  );
  return row;
}

export async function updateRow(
  userId: string,
  tableId: string,
  rowId: string,
  data: Record<string, unknown>
): Promise<TableRow | null> {
  if (!(await getRow(userId, tableId, rowId))) return null;
  await q("UPDATE table_rows SET data = data || $1::jsonb, updated_at = $2 WHERE id = $3 AND table_id = $4", [
    JSON.stringify(data),
    now(),
    rowId,
    tableId,
  ]);
  return getRow(userId, tableId, rowId);
}

export async function deleteRow(userId: string, tableId: string, rowId: string): Promise<boolean> {
  if (!(await getTable(userId, tableId))) return false;
  const rows = await q("DELETE FROM table_rows WHERE id = $1 AND table_id = $2 RETURNING id", [rowId, tableId]);
  return rows.length > 0;
}

// Batched multi-row INSERT so a large CSV import doesn't make one round trip
// per row (relevant on Vercel's per-invocation time budget).
const BULK_INSERT_BATCH_SIZE = 500;

export async function bulkInsertRows(
  userId: string,
  tableId: string,
  rowsData: Record<string, unknown>[]
): Promise<number | null> {
  if (!(await getTable(userId, tableId))) return null;
  let inserted = 0;
  for (let i = 0; i < rowsData.length; i += BULK_INSERT_BATCH_SIZE) {
    const batch = rowsData.slice(i, i + BULK_INSERT_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((data, j) => {
      const base = j * 6;
      values.push(newId(), tableId, userId, JSON.stringify(data), now(), now());
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}, $${base + 6})`;
    });
    await q(
      `INSERT INTO table_rows (id, table_id, user_id, data, created_at, updated_at) VALUES ${placeholders.join(", ")}`,
      values
    );
    inserted += batch.length;
  }
  return inserted;
}
