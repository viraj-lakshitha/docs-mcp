// MCP tool definitions: document, asset, and share-link tools so Claude can
// create and manage documents. buildServer() is used by both transports —
// stdio (src/mcp-server.js) and Streamable HTTP (/mcp in src/web-server.js).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as store from "./db.js";

// All tools act as the given user: userId comes from a verified API key
// (bearer token on /mcp, or DOCS_MCP_API_KEY for the stdio server).
export function buildServer(userId) {
  const server = new McpServer({ name: "docs-mcp", version: "0.1.0" });

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
