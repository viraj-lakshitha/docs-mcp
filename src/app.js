// Express app: REST API, MCP-over-HTTP endpoint, asset redirects, share pages,
// and the static editor UI. Used both locally (src/web-server.js) and as a
// Vercel serverless function (api/index.js).
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./mcp.js";
import * as store from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.use(express.json({ limit: "25mb" }));

// Express 4 doesn't forward rejected promises to the error handler on its own.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- MCP over HTTP ----
// The same tools as src/mcp-server.js, served on /mcp via the Streamable HTTP
// transport in stateless mode (a natural fit for serverless):
// claude mcp add --transport http docs https://<your-app>.vercel.app/mcp
app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});
// Stateless mode has no sessions to resume or terminate.
app.get("/mcp", (req, res) => res.status(405).json({ error: "method not allowed" }));
app.delete("/mcp", (req, res) => res.status(405).json({ error: "method not allowed" }));

// ---- document CRUD ----

app.get("/api/documents", ah(async (req, res) => res.json(await store.listDocuments())));

app.post("/api/documents", ah(async (req, res) => {
  const { title, content } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  res.status(201).json(await store.createDocument({ title, content: content ?? "" }));
}));

app.get("/api/documents/:id", ah(async (req, res) => {
  const doc = await store.getDocument(req.params.id);
  doc ? res.json(doc) : res.status(404).json({ error: "not found" });
}));

app.put("/api/documents/:id", ah(async (req, res) => {
  const { title, content } = req.body ?? {};
  const doc = await store.updateDocument(req.params.id, { title, content });
  doc ? res.json(doc) : res.status(404).json({ error: "not found" });
}));

app.delete("/api/documents/:id", ah(async (req, res) => {
  (await store.deleteDocument(req.params.id))
    ? res.json({ deleted: req.params.id })
    : res.status(404).json({ error: "not found" });
}));

// ---- asset CRUD ----

app.get("/api/assets", ah(async (req, res) => res.json(await store.listAssets())));

app.post("/api/assets", ah(async (req, res) => {
  const { filename, mime, data } = req.body ?? {};
  if (!filename || !mime || !data) {
    return res.status(400).json({ error: "filename, mime and data (base64) are required" });
  }
  const buf = Buffer.from(data, "base64");
  if (buf.length === 0) return res.status(400).json({ error: "data decoded to an empty file" });
  res.status(201).json(await store.createAsset({ filename, mime, data: buf }));
}));

app.delete("/api/assets/:id", ah(async (req, res) => {
  (await store.deleteAsset(req.params.id))
    ? res.json({ deleted: req.params.id })
    : res.status(404).json({ error: "not found" });
}));

// Stable asset URLs (used by <img> tags in documents) redirect to Vercel Blob.
app.get("/a/:id", ah(async (req, res) => {
  const asset = await store.getAsset(req.params.id);
  asset ? res.redirect(302, asset.blob_url) : res.status(404).send("not found");
}));

// ---- view-only sharing ----

app.post("/api/documents/:id/share", ah(async (req, res) => {
  const share = await store.createShare(req.params.id);
  share ? res.status(201).json(share) : res.status(404).json({ error: "not found" });
}));

app.get("/api/documents/:id/shares", ah(async (req, res) => {
  res.json(await store.listShares(req.params.id));
}));

app.delete("/api/shares/:token", ah(async (req, res) => {
  (await store.revokeShare(req.params.token))
    ? res.json({ revoked: req.params.token })
    : res.status(404).json({ error: "not found" });
}));

// Read-only document access by share token — the only document endpoint a
// viewer needs, and it exposes no ids or write operations.
app.get("/api/share/:token", ah(async (req, res) => {
  const doc = await store.getSharedDocument(req.params.token);
  doc
    ? res.json({ title: doc.title, content: doc.content, updated_at: doc.updated_at })
    : res.status(404).json({ error: "invalid or revoked link" });
}));

// Local dev only — on Vercel a rewrite maps /s/:token to the static share.html.
app.get("/s/:token", (req, res) => res.sendFile(path.join(root, "public", "share.html")));

// Local dev only — on Vercel, public/ (including vendor libs) is served by the CDN.
app.use(express.static(path.join(root, "public")));

app.use((err, req, res, next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: err.message || "internal error" });
});

export default app;
