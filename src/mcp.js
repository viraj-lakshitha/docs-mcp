// MCP tool definitions: document, asset, and share-link tools so Claude can
// create and manage documents. Served over Streamable HTTP at /mcp (src/app.js).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as store from "./db.js";
import { parseCsv, coerceCell } from "./tables.js";
import { log, logError } from "./log.js";

const INSTRUCTIONS = `# Notes by Optiq Labs — MCP usage guide

Notes is a document workspace. Through this MCP server you create and manage
markdown documents, upload assets, and publish view-only share links. Every
tool acts as the account that authorized this connection; you only ever see
that user's documents.

## Typical workflow

1. create_document with a title and markdown content — the response includes
   the document id and an editor_url the user can open in a browser.
2. Refine with update_document. IMPORTANT: content is a full replacement, not
   a patch — call get_document first, modify that text, and send it back whole.
3. When the user wants to share it, call share_document and give them the
   returned url. Anyone with the link can read the rendered document but can
   never edit it. revoke_share kills a link immediately.

## Document format

Documents are GitHub-flavored markdown with two special fenced code blocks:

### Mermaid diagrams

\`\`\`mermaid
flowchart LR
  Client --> API --> Database
\`\`\`

Any Mermaid diagram type works (flowchart, sequenceDiagram, classDiagram,
erDiagram, gantt, pie, stateDiagram-v2, ...). Prefer Mermaid for boxes-and-
arrows diagrams — it is compact and easy to update later.

### Excalidraw sketches

A fenced block whose body is an Excalidraw scene JSON — the same format as
Excalidraw's "Save to file" export:

\`\`\`excalidraw
{"elements": [{"id": "r1", "type": "rectangle", "x": 0, "y": 0, "width": 200,
"height": 90, "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor":
"transparent", "fillStyle": "solid", "strokeWidth": 2, "roughness": 1,
"opacity": 100, "seed": 1, "version": 1, "versionNonce": 1, "isDeleted":
false, "groupIds": [], "frameId": null, "boundElements": null, "updated": 1,
"link": null, "locked": false}], "appState": {}, "files": {}}
\`\`\`

Elements need the full set of fields shown above. Use type "rectangle",
"ellipse", "diamond", "arrow", "line", or "text" (text elements additionally
need text, fontSize, fontFamily, textAlign, verticalAlign, containerId,
originalText, lineHeight, baseline). Reach for Excalidraw when a hand-drawn
look is wanted; otherwise Mermaid is usually the better tool.

## Images and assets

1. upload_asset with filename, mime_type, and base64_data.
2. Embed the returned path in any document: ![alt text](/a/<asset_id>).
   Asset URLs are stable and also work on public share pages.
3. delete_asset removes the file (documents referencing it will show a
   broken image).

## Sharing rules

- share_document returns a fresh unguessable URL per call; a document can
  have many active links.
- Links are strictly view-only: viewers get rendered HTML, never an editor,
  and cannot reach any other document.
- list_shares shows what is live; revoke_share disables a link permanently.

## Tables

Tables are a separate, structured data primitive — not documents. Use them
for lists of records with consistent fields (contacts, inventory, tasks),
not for prose.

1. create_table with a name and a list of columns, each with a name and a
   type: "text", "number", "boolean", or "date".
2. create_row / list_rows / update_row / delete_row manage individual rows.
   Row data is a JSON object keyed by **column name** (not id) — pass
   {"Name": "Alice", "Age": 30}, and it's matched against the table's
   columns for you.
3. import_csv_rows bulk-loads rows from CSV text: the header row is matched
   against existing column names (unmatched CSV columns are ignored), each
   cell is coerced to its column's type, and mismatched cells are recorded
   in the response rather than failing the whole import.
4. add_column / update_column / delete_column change the schema. Deleting a
   column drops that field from every row — it cannot be undone.
5. list_rows is paginated (50 rows per page by default); pass offset to
   page through a large table.

## Good to know

- list_documents returns metadata only; get_document returns full content.
- delete_document also revokes all of its share links. It cannot be undone —
  confirm with the user before deleting anything they did not just create.
- Titles are plain text; the first markdown heading inside content is
  independent of the title field.`;

// All tools act as the given user: userId comes from a verified OAuth
// access token presented to /mcp.
export function buildServer(userId, traceId) {
  const server = new McpServer(
    { name: "notes-by-optiq-labs", version: "0.1.0" },
    { instructions: INSTRUCTIONS }
  );

  // Every tool call is logged with the request's trace id and the acting
  // user id — wrapping registerTool itself here means every tool
  // registered below (25 of them) gets this for free, with no per-tool
  // instrumentation to keep in sync as tools are added.
  const registerTool = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) =>
    registerTool(name, config, async (...args) => {
      const startedAt = Date.now();
      log("mcp.tool.call", { traceId, userId, tool: name });
      try {
        const result = await handler(...args);
        log("mcp.tool.result", { traceId, userId, tool: name, ms: Date.now() - startedAt, isError: !!result?.isError });
        return result;
      } catch (err) {
        logError("mcp.tool.error", { traceId, userId, tool: name, ms: Date.now() - startedAt, error: err.message });
        throw err;
      }
    });

  // MCP clients (Claude Code, Claude Desktop, claude.ai) render a tool
  // result's text content as Markdown, including live diagrams for fenced
  // ```mermaid blocks. Returning the document body as real Markdown text
  // (instead of it sitting escaped inside a JSON string) is what lets a
  // freshly created or fetched document — diagrams included — render
  // directly in the conversation instead of showing as an opaque JSON blob.
  const md = (text) => ({ content: [{ type: "text", text }] });
  const error = (message) => ({
    content: [{ type: "text", text: message }],
    isError: true,
  });

  const editorUrl = (id) => `${store.baseUrl()}/app#${id}`;

  const docPreview = (doc, verb) => {
    const parts = [
      `${verb} **${doc.title}** — id \`${doc.id}\``,
      `Editor: ${editorUrl(doc.id)}`,
      "",
      "---",
      "",
      doc.content?.trim() ? doc.content : "_(empty document)_",
    ];
    return md(parts.join("\n"));
  };

  const docTable = (docs) => {
    if (docs.length === 0) return md("No documents yet.");
    const rows = docs.map((d) => `| ${d.title.replace(/\|/g, "\\|")} | ${d.updated_at} | \`${d.id}\` |`);
    return md(["| Title | Updated | id |", "| --- | --- | --- |", ...rows].join("\n"));
  };

  const CONTENT_HINT = [
    "Document content is markdown. Two special fenced code blocks are rendered as diagrams:",
    "```mermaid — a Mermaid diagram definition;",
    '```excalidraw — an Excalidraw scene as JSON: {"elements": [...], "appState": {}, "files": {}}.',
    "Uploaded assets can be embedded with ![alt](/a/<asset_id>).",
  ].join(" ");

  server.registerTool(
    "get_instructions",
    {
      title: "Get usage instructions",
      description:
        "Returns the complete guide for using Notes via MCP: the document format (markdown, ```mermaid and ```excalidraw fences), asset embedding, sharing rules, and recommended workflow. Call this first if you are unsure how to structure content.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: INSTRUCTIONS }] })
  );

  // ---- document CRUD ----

  server.registerTool(
    "create_document",
    {
      title: "Create document",
      description: `Create a new document. ${CONTENT_HINT}`,
      inputSchema: {
        title: z.string().describe("Document title"),
        content: z.string().optional().describe("Markdown content"),
      },
    },
    async ({ title, content }) => {
      const doc = await store.createDocument(userId, { title, content: content ?? "" });
      return docPreview(doc, "Created");
    }
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description: "List all documents (id, title, timestamps; no content).",
      inputSchema: {},
    },
    async () => docTable(await store.listDocuments(userId))
  );

  server.registerTool(
    "get_document",
    {
      title: "Get document",
      description: "Fetch a document including its full markdown content.",
      inputSchema: { id: z.string().describe("Document id") },
    },
    async ({ id }) => {
      const doc = await store.getDocument(userId, id);
      return doc ? docPreview(doc, "Fetched") : error(`No document with id ${id}`);
    }
  );

  server.registerTool(
    "update_document",
    {
      title: "Update document",
      description: `Update a document's title and/or content (full replacement of the provided fields). ${CONTENT_HINT}`,
      inputSchema: {
        id: z.string().describe("Document id"),
        title: z.string().optional().describe("New title"),
        content: z.string().optional().describe("New markdown content (replaces existing content)"),
      },
    },
    async ({ id, title, content }) => {
      const doc = await store.updateDocument(userId, id, { title, content });
      return doc ? docPreview(doc, "Updated") : error(`No document with id ${id}`);
    }
  );

  server.registerTool(
    "delete_document",
    {
      title: "Delete document",
      description: "Delete a document and its share links. This cannot be undone.",
      inputSchema: { id: z.string().describe("Document id") },
    },
    async ({ id }) =>
      (await store.deleteDocument(userId, id))
        ? md(`Deleted document \`${id}\` and its share links.`)
        : error(`No document with id ${id}`)
  );

  // ---- asset CRUD ----

  server.registerTool(
    "upload_asset",
    {
      title: "Upload asset",
      description:
        "Upload an image or other binary asset (base64-encoded). Returns the asset id and URL path; embed images in documents with ![alt](/a/<asset_id>).",
      inputSchema: {
        filename: z.string().describe("File name, e.g. diagram.png"),
        mime_type: z.string().describe("MIME type, e.g. image/png"),
        base64_data: z.string().describe("File contents encoded as base64"),
      },
    },
    async ({ filename, mime_type, base64_data }) => {
      const data = Buffer.from(base64_data, "base64");
      if (data.length === 0) return error("base64_data decoded to an empty file");
      try {
        const asset = await store.createAsset(userId, { filename, mime: mime_type, data });
        return md(
          [
            `Uploaded **${asset.filename}** — id \`${asset.id}\``,
            `URL: ${store.baseUrl()}${asset.url}`,
            "",
            `Embed it in a document with: \`![${asset.filename}](${asset.url})\``,
          ].join("\n")
        );
      } catch (err) {
        return error(`Asset upload failed: ${err.message}`);
      }
    }
  );

  server.registerTool(
    "list_assets",
    {
      title: "List assets",
      description: "List all uploaded assets (id, filename, mime, size, url).",
      inputSchema: {},
    },
    async () => {
      const assets = await store.listAssets(userId);
      if (assets.length === 0) return md("No assets yet.");
      const rows = assets.map(
        (a) => `| ${a.filename.replace(/\|/g, "\\|")} | ${a.mime} | ${a.size} | ${a.url} | \`${a.id}\` |`
      );
      return md(["| Filename | Type | Size (bytes) | URL | id |", "| --- | --- | --- | --- | --- |", ...rows].join("\n"));
    }
  );

  server.registerTool(
    "delete_asset",
    {
      title: "Delete asset",
      description: "Delete an uploaded asset. Documents referencing it will show a broken link.",
      inputSchema: { id: z.string().describe("Asset id") },
    },
    async ({ id }) =>
      (await store.deleteAsset(userId, id)) ? md(`Deleted asset \`${id}\`.`) : error(`No asset with id ${id}`)
  );

  // ---- view-only sharing ----

  server.registerTool(
    "share_document",
    {
      title: "Share document (view-only)",
      description:
        "Create a view-only share link for a document. Anyone with the link can read the rendered document but cannot edit it.",
      inputSchema: { id: z.string().describe("Document id") },
    },
    async ({ id }) => {
      const doc = await store.getDocument(userId, id);
      if (!doc) return error(`No document with id ${id}`);
      const share = await store.createShare(userId, id);
      return md(
        [
          `View-only share link created for **${doc.title}**:`,
          "",
          share.url,
          "",
          `Anyone with this link can read the document but cannot edit it. Revoke it anytime with revoke_share (token \`${share.token}\`).`,
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "list_shares",
    {
      title: "List share links",
      description: "List share links, optionally filtered to one document.",
      inputSchema: { document_id: z.string().optional().describe("Filter by document id") },
    },
    async ({ document_id }) => {
      const shares = await store.listShares(userId, document_id);
      if (shares.length === 0) return md("No share links yet.");
      const rows = shares.map(
        (s) => `| \`${s.document_id}\` | ${s.url} | ${s.created_at} | ${s.revoked ? "Revoked" : "Active"} |`
      );
      return md(["| Document | URL | Created | Status |", "| --- | --- | --- | --- |", ...rows].join("\n"));
    }
  );

  server.registerTool(
    "revoke_share",
    {
      title: "Revoke share link",
      description: "Revoke a share link so it stops working.",
      inputSchema: { token: z.string().describe("Share token (the part after /s/ in the link)") },
    },
    async ({ token }) =>
      (await store.revokeShare(userId, token))
        ? md(`Revoked share link \`${token}\`.`)
        : error(`No share with token ${token}`)
  );

  // ---- tables (typed-column data; distinct from documents) ----

  const tableList = (tables) => {
    if (tables.length === 0) return md("No tables yet.");
    const rows = tables.map(
      (t) => `| ${t.name.replace(/\|/g, "\\|")} | ${t.column_count} | ${t.row_count} | \`${t.id}\` |`
    );
    return md(["| Name | Columns | Rows | id |", "| --- | --- | --- | --- |", ...rows].join("\n"));
  };

  const columnList = (columns) => {
    if (columns.length === 0) return "_(no columns yet)_";
    return columns.map((c) => `- **${c.name}** (${c.type}) — id \`${c.id}\``).join("\n");
  };

  const tableGrid = (columns, rows) => {
    if (rows.length === 0) return md("No rows yet.");
    const header = `| ${columns.map((c) => c.name).join(" | ")} | id |`;
    const sep = `| ${columns.map(() => "---").join(" | ")} | --- |`;
    const body = rows.map(
      (r) => `| ${columns.map((c) => String(r.data[c.id] ?? "").replace(/\|/g, "\\|")).join(" | ")} | \`${r.id}\` |`
    );
    return md([header, sep, ...body].join("\n"));
  };

  // Row data arrives keyed by column name (the natural thing for an LLM to
  // send); resolve it against the table's columns to the column-id keys
  // table_rows actually stores.
  const resolveRowData = (columns, data) => {
    const byName = new Map(columns.map((c) => [c.name, c.id]));
    const resolved = {};
    for (const [key, value] of Object.entries(data || {})) {
      const id = byName.get(key) ?? (columns.some((c) => c.id === key) ? key : undefined);
      if (id) resolved[id] = value;
    }
    return resolved;
  };

  const COLUMN_TYPE = z.enum(["text", "number", "boolean", "date"]);

  server.registerTool(
    "create_table",
    {
      title: "Create table",
      description:
        "Create a new typed-column table for structured data (contacts, inventory, tasks, etc.) — not for prose, that's a document.",
      inputSchema: {
        name: z.string().describe("Table name"),
        description: z.string().optional().describe("Optional description"),
        columns: z
          .array(z.object({ name: z.string(), type: COLUMN_TYPE }))
          .describe('Columns to create, e.g. [{"name":"Name","type":"text"},{"name":"Age","type":"number"}]'),
      },
    },
    async ({ name, description, columns }) => {
      const table = await store.createTable(userId, { name, description });
      for (const col of columns) await store.addColumn(userId, table.id, col);
      const full = await store.getTable(userId, table.id);
      return md(
        [`Created table **${full.name}** — id \`${full.id}\``, "", "Columns:", columnList(full.columns)].join("\n")
      );
    }
  );

  server.registerTool(
    "list_tables",
    { title: "List tables", description: "List all tables (name, column count, row count, id).", inputSchema: {} },
    async () => tableList(await store.listTables(userId))
  );

  server.registerTool(
    "get_table",
    {
      title: "Get table",
      description: "Fetch a table's metadata and column definitions (needed before creating/reading rows).",
      inputSchema: { table_id: z.string().describe("Table id") },
    },
    async ({ table_id }) => {
      const table = await store.getTable(userId, table_id);
      if (!table) return error(`No table with id ${table_id}`);
      return md(
        [`**${table.name}**${table.description ? ` — ${table.description}` : ""} — id \`${table.id}\``, "", "Columns:", columnList(table.columns)].join(
          "\n"
        )
      );
    }
  );

  server.registerTool(
    "update_table",
    {
      title: "Update table",
      description: "Rename a table or change its description.",
      inputSchema: {
        table_id: z.string().describe("Table id"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
      },
    },
    async ({ table_id, name, description }) => {
      const table = await store.updateTable(userId, table_id, { name, description });
      return table ? md(`Updated table **${table.name}** — id \`${table.id}\``) : error(`No table with id ${table_id}`);
    }
  );

  server.registerTool(
    "delete_table",
    {
      title: "Delete table",
      description: "Delete a table, its columns, and all of its rows. This cannot be undone.",
      inputSchema: { table_id: z.string().describe("Table id") },
    },
    async ({ table_id }) =>
      (await store.deleteTable(userId, table_id)) ? md(`Deleted table \`${table_id}\`.`) : error(`No table with id ${table_id}`)
  );

  server.registerTool(
    "add_column",
    {
      title: "Add column",
      description: "Add a new column to an existing table.",
      inputSchema: {
        table_id: z.string().describe("Table id"),
        name: z.string().describe("Column name"),
        type: COLUMN_TYPE.describe("Column type"),
      },
    },
    async ({ table_id, name, type }) => {
      const column = await store.addColumn(userId, table_id, { name, type });
      if (column === "invalid_type") return error("type must be one of: text, number, boolean, date");
      return column ? md(`Added column **${column.name}** (${column.type}) — id \`${column.id}\``) : error(`No table with id ${table_id}`);
    }
  );

  server.registerTool(
    "update_column",
    {
      title: "Update column",
      description: "Rename a column or change its type. Changing type does not retroactively convert existing values.",
      inputSchema: {
        table_id: z.string().describe("Table id"),
        column_id: z.string().describe("Column id"),
        name: z.string().optional().describe("New name"),
        type: COLUMN_TYPE.optional().describe("New type"),
      },
    },
    async ({ table_id, column_id, name, type }) => {
      const column = await store.updateColumn(userId, table_id, column_id, { name, type });
      if (column === "invalid_type") return error("type must be one of: text, number, boolean, date");
      return column ? md(`Updated column **${column.name}** (${column.type}).`) : error(`No column with id ${column_id}`);
    }
  );

  server.registerTool(
    "delete_column",
    {
      title: "Delete column",
      description: "Delete a column. This drops that field from every row and cannot be undone.",
      inputSchema: { table_id: z.string().describe("Table id"), column_id: z.string().describe("Column id") },
    },
    async ({ table_id, column_id }) =>
      (await store.deleteColumn(userId, table_id, column_id))
        ? md(`Deleted column \`${column_id}\`.`)
        : error(`No column with id ${column_id}`)
  );

  server.registerTool(
    "list_rows",
    {
      title: "List rows",
      description: "List a table's rows as a Markdown table, paginated (50 per page by default).",
      inputSchema: {
        table_id: z.string().describe("Table id"),
        limit: z.number().optional().describe("Rows per page (default 50, max 500)"),
        offset: z.number().optional().describe("Rows to skip (default 0)"),
      },
    },
    async ({ table_id, limit, offset }) => {
      const table = await store.getTable(userId, table_id);
      if (!table) return error(`No table with id ${table_id}`);
      const result = await store.listRows(userId, table_id, { limit, offset });
      const grid = tableGrid(table.columns, result.rows);
      if (result.total <= result.rows.length + (offset || 0)) return grid;
      const shown = (offset || 0) + result.rows.length;
      grid.content.push({ type: "text", text: `\nShowing ${(offset || 0) + 1}-${shown} of ${result.total}.` });
      return grid;
    }
  );

  server.registerTool(
    "create_row",
    {
      title: "Create row",
      description: 'Add a row to a table. data is keyed by column name, e.g. {"Name": "Alice", "Age": 30}.',
      inputSchema: { table_id: z.string().describe("Table id"), data: z.record(z.any()).describe("Row data keyed by column name") },
    },
    async ({ table_id, data }) => {
      const table = await store.getTable(userId, table_id);
      if (!table) return error(`No table with id ${table_id}`);
      const row = await store.createRow(userId, table_id, resolveRowData(table.columns, data));
      return md(`Created row \`${row.id}\` in **${table.name}**.`);
    }
  );

  server.registerTool(
    "update_row",
    {
      title: "Update row",
      description: "Update a row's data (partial merge, keyed by column name).",
      inputSchema: {
        table_id: z.string().describe("Table id"),
        row_id: z.string().describe("Row id"),
        data: z.record(z.any()).describe("Fields to update, keyed by column name"),
      },
    },
    async ({ table_id, row_id, data }) => {
      const table = await store.getTable(userId, table_id);
      if (!table) return error(`No table with id ${table_id}`);
      const row = await store.updateRow(userId, table_id, row_id, resolveRowData(table.columns, data));
      return row ? md(`Updated row \`${row.id}\`.`) : error(`No row with id ${row_id}`);
    }
  );

  server.registerTool(
    "delete_row",
    {
      title: "Delete row",
      description: "Delete a row from a table.",
      inputSchema: { table_id: z.string().describe("Table id"), row_id: z.string().describe("Row id") },
    },
    async ({ table_id, row_id }) =>
      (await store.deleteRow(userId, table_id, row_id)) ? md(`Deleted row \`${row_id}\`.`) : error(`No row with id ${row_id}`)
  );

  server.registerTool(
    "import_csv_rows",
    {
      title: "Import CSV rows",
      description:
        "Bulk-import rows into an existing table from CSV text. The header row is matched against existing column names (unmatched CSV columns are ignored); mismatched cells are recorded rather than failing the whole import.",
      inputSchema: {
        table_id: z.string().describe("Table id"),
        csv: z.string().describe("Raw CSV text"),
        has_header: z.boolean().optional().describe("Whether the first row is a header (default true)"),
      },
    },
    async ({ table_id, csv, has_header }) => {
      const table = await store.getTable(userId, table_id);
      if (!table) return error(`No table with id ${table_id}`);
      let headers, dataRows;
      try {
        ({ headers, dataRows } = parseCsv(csv, has_header ?? true));
      } catch (err) {
        return error(err.message);
      }
      const columnsByName = new Map(table.columns.map((c) => [c.name, c]));
      const errors = [];
      const rows = dataRows.map((rawRow, rowIndex) => {
        const data = {};
        headers.forEach((header, i) => {
          const column = columnsByName.get(header);
          if (!column) return;
          const { value, error: cellError } = coerceCell(rawRow[i], column.type);
          data[column.id] = value;
          if (cellError) errors.push(`row ${rowIndex + 1}, ${column.name}: ${cellError}`);
        });
        return data;
      });
      const imported = await store.bulkInsertRows(userId, table_id, rows);
      const parts = [`Imported ${imported} row(s) into **${table.name}**.`];
      if (errors.length > 0) parts.push("", `${errors.length} cell(s) couldn't be coerced and were left blank:`, ...errors.slice(0, 20).map((e) => `- ${e}`));
      return md(parts.join("\n"));
    }
  );

  return server;
}
