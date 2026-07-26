// MCP tool definitions: document, asset, and share-link tools so Claude can
// create and manage documents. Served over Streamable HTTP at /mcp (src/app.js).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as store from "./db.js";

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

## Good to know

- list_documents returns metadata only; get_document returns full content.
- delete_document also revokes all of its share links. It cannot be undone —
  confirm with the user before deleting anything they did not just create.
- Titles are plain text; the first markdown heading inside content is
  independent of the title field.`;

// All tools act as the given user: userId comes from a verified OAuth
// access token presented to /mcp.
export function buildServer(userId) {
  const server = new McpServer(
    { name: "notes-by-optiq-labs", version: "0.1.0" },
    { instructions: INSTRUCTIONS }
  );

  const json = (value) => ({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  });
  const error = (message) => ({
    content: [{ type: "text", text: message }],
    isError: true,
  });

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
      return json({ ...doc, editor_url: `${store.baseUrl()}/#${doc.id}` });
    }
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description: "List all documents (id, title, timestamps; no content).",
      inputSchema: {},
    },
    async () => json(await store.listDocuments(userId))
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
      return doc ? json(doc) : error(`No document with id ${id}`);
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
      return doc ? json(doc) : error(`No document with id ${id}`);
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
      (await store.deleteDocument(userId, id)) ? json({ deleted: id }) : error(`No document with id ${id}`)
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
        return json(await store.createAsset(userId, { filename, mime: mime_type, data }));
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
    async () => json(await store.listAssets(userId))
  );

  server.registerTool(
    "delete_asset",
    {
      title: "Delete asset",
      description: "Delete an uploaded asset. Documents referencing it will show a broken link.",
      inputSchema: { id: z.string().describe("Asset id") },
    },
    async ({ id }) =>
      (await store.deleteAsset(userId, id)) ? json({ deleted: id }) : error(`No asset with id ${id}`)
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
      const share = await store.createShare(userId, id);
      return share ? json(share) : error(`No document with id ${id}`);
    }
  );

  server.registerTool(
    "list_shares",
    {
      title: "List share links",
      description: "List share links, optionally filtered to one document.",
      inputSchema: { document_id: z.string().optional().describe("Filter by document id") },
    },
    async ({ document_id }) => json(await store.listShares(userId, document_id))
  );

  server.registerTool(
    "revoke_share",
    {
      title: "Revoke share link",
      description: "Revoke a share link so it stops working.",
      inputSchema: { token: z.string().describe("Share token (the part after /s/ in the link)") },
    },
    async ({ token }) =>
      (await store.revokeShare(userId, token)) ? json({ revoked: token }) : error(`No share with token ${token}`)
  );

  return server;
}
