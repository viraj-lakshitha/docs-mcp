// Canonical request/response shapes shared by the backend (REST routes, MCP
// tools, data layer) and the frontend (web/src/api.js callers). Single
// source of truth so the wire format can't drift between what a route
// returns and what a caller expects. Field names intentionally mirror the
// Postgres columns (snake_case) — this is the JSON shape that has always
// gone over the wire, unchanged by this file's introduction.

// ---- users & sessions ----

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

/** Row shape as stored — includes the password hash. Never sent over the wire. */
export interface UserRecord extends User {
  password_hash: string;
}

export interface Session {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

// ---- OAuth 2.1 provider ----

export interface OAuthClient {
  id: string;
  name: string;
  redirect_uris: string[];
  created_at: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  scope: string;
}

export interface AuthCodeGrant {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  expires_at: string;
  used: boolean;
}

export interface Connection {
  client_id: string;
  client_name: string;
  connected_at: string;
  active_tokens: number;
}

// ---- API keys ----

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked: boolean;
}

/** Returned exactly once, at creation — the raw key is never stored or shown again. */
export interface ApiKeyCreated extends ApiKeySummary {
  key: string;
}

// ---- documents ----

export interface Document {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  content_length: number;
  created_at: string;
  updated_at: string;
}

/** The read-only shape served on a public share page. */
export interface SharedDocumentView {
  title: string;
  content: string;
  updated_at: string;
}

export interface CreateDocumentRequest {
  title: string;
  content?: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  content?: string;
}

// ---- assets ----

export interface Asset {
  id: string;
  user_id: string | null;
  filename: string;
  mime: string;
  size: number;
  blob_url: string;
  blob_pathname: string;
  created_at: string;
  /** Stable, unguessable path relative to this server — always present. */
  url: string;
  /** Same path, fully qualified — always present, this is the public URL. */
  public_url: string;
}

export type AssetSummary = Omit<Asset, "blob_pathname" | "user_id">;

export interface CreateAssetRequestJson {
  filename: string;
  mime: string;
  /** base64-encoded file contents. */
  data: string;
}

// ---- view-only sharing ----

export interface ShareLink {
  token: string;
  user_id: string | null;
  document_id: string;
  created_at: string;
  revoked: boolean;
  /** Full https://.../s/:token URL — always present. */
  url: string;
}

// ---- tables (typed-column data tables) ----

export type ColumnType = "text" | "number" | "boolean" | "date";

export interface TableColumn {
  id: string;
  table_id: string;
  name: string;
  type: ColumnType;
  position: number;
  created_at: string;
}

export interface DataTable {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataTableSummary extends DataTable {
  column_count: number;
  row_count: number;
}

export interface DataTableWithColumns extends DataTable {
  columns: TableColumn[];
}

export interface TableRow {
  id: string;
  table_id: string;
  user_id: string | null;
  /** Keyed by column id, not column name — survives column renames. */
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RowsPage {
  rows: TableRow[];
  total: number;
}

export interface CreateTableRequest {
  name: string;
  description?: string;
}

export interface UpdateTableRequest {
  name?: string;
  description?: string;
}

export interface AddColumnRequest {
  name: string;
  type: ColumnType;
}

export interface UpdateColumnRequest {
  name?: string;
  type?: ColumnType;
}

export interface ReorderColumnsRequest {
  order: string[];
}

export interface CreateRowRequest {
  data: Record<string, unknown>;
}

export interface ListRowsQuery {
  limit?: number;
  offset?: number;
}

// ---- CSV import ----

export interface ImportError {
  row: number;
  column: string;
  reason: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
}

export interface CreateTableFromCsvRequest {
  name: string;
  csv: string;
  hasHeaderRow?: boolean;
}

export interface CreateTableFromCsvResponse extends ImportResult {
  table: DataTableWithColumns;
}

export interface ImportPreviewRequest {
  csv: string;
  hasHeaderRow?: boolean;
}

export interface ImportPreviewResponse {
  headers: string[];
  sample: string[][];
  rowCount: number;
}

export interface ImportRowsRequest {
  csv: string;
  hasHeaderRow?: boolean;
  /** CSV header -> target column id. */
  columnMapping: Record<string, string>;
}

export interface ImportRowsResponse extends ImportResult {
  table_id: string;
}

// ---- generic REST envelopes ----

export interface ErrorResponse {
  error: string;
  error_description?: string;
}

export interface DeletedResponse {
  deleted: string;
}

export interface RevokedResponse {
  revoked: string;
}

// ---- MCP tool structured outputs ----
// Every "create"/"upload" tool returns its normal Markdown `content` block
// (for chat rendering) *and* a `structuredContent` block shaped like one of
// these, so programmatic callers (n8n, scripts) can read `output.id` /
// `output.url` directly instead of parsing prose.

export interface McpCreatedRef {
  id: string;
  editor_url: string;
}

export interface McpAssetRef {
  id: string;
  url: string;
}

export interface McpShareRef {
  token: string;
  url: string;
}

export interface McpTableRef {
  id: string;
}

export interface McpColumnRef {
  id: string;
  table_id: string;
}

export interface McpRowRef {
  id: string;
  table_id: string;
}

export interface McpImportResult extends ImportResult {
  table_id?: string;
}
