// Web app: editor UI, REST API, asset serving, and view-only share pages.
// Shares the SQLite store with the MCP server, so documents created by Claude
// appear here immediately.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.use(express.json({ limit: "25mb" }));

// ---- document CRUD ----

app.get("/api/documents", (req, res) => res.json(store.listDocuments()));

app.post("/api/documents", (req, res) => {
  const { title, content } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  res.status(201).json(store.createDocument({ title, content: content ?? "" }));
});

app.get("/api/documents/:id", (req, res) => {
  const doc = store.getDocument(req.params.id);
  doc ? res.json(doc) : res.status(404).json({ error: "not found" });
});

app.put("/api/documents/:id", (req, res) => {
  const { title, content } = req.body ?? {};
  const doc = store.updateDocument(req.params.id, { title, content });
  doc ? res.json(doc) : res.status(404).json({ error: "not found" });
});

app.delete("/api/documents/:id", (req, res) => {
  store.deleteDocument(req.params.id)
    ? res.json({ deleted: req.params.id })
    : res.status(404).json({ error: "not found" });
});

// ---- asset CRUD ----

app.get("/api/assets", (req, res) => res.json(store.listAssets()));

app.post("/api/assets", (req, res) => {
  const { filename, mime, data } = req.body ?? {};
  if (!filename || !mime || !data) {
    return res.status(400).json({ error: "filename, mime and data (base64) are required" });
  }
  const buf = Buffer.from(data, "base64");
  if (buf.length === 0) return res.status(400).json({ error: "data decoded to an empty file" });
  res.status(201).json(store.createAsset({ filename, mime, data: buf }));
});

app.delete("/api/assets/:id", (req, res) => {
  store.deleteAsset(req.params.id)
    ? res.json({ deleted: req.params.id })
    : res.status(404).json({ error: "not found" });
});

// Serve asset binaries (used by <img> tags in documents).
app.get("/a/:id", (req, res) => {
  const asset = store.getAsset(req.params.id);
  if (!asset) return res.status(404).send("not found");
  res.set("Content-Type", asset.mime);
  res.set("Content-Disposition", `inline; filename="${asset.filename.replace(/"/g, "")}"`);
  res.send(Buffer.from(asset.data));
});

// ---- view-only sharing ----

app.post("/api/documents/:id/share", (req, res) => {
  const share = store.createShare(req.params.id);
  share ? res.status(201).json(share) : res.status(404).json({ error: "not found" });
});

app.get("/api/documents/:id/shares", (req, res) => res.json(store.listShares(req.params.id)));

app.delete("/api/shares/:token", (req, res) => {
  store.revokeShare(req.params.token)
    ? res.json({ revoked: req.params.token })
    : res.status(404).json({ error: "not found" });
});

// Read-only document access by share token — the only document endpoint a
// viewer needs, and it exposes no ids or write operations.
app.get("/api/share/:token", (req, res) => {
  const doc = store.getSharedDocument(req.params.token);
  doc
    ? res.json({ title: doc.title, content: doc.content, updated_at: doc.updated_at })
    : res.status(404).json({ error: "invalid or revoked link" });
});

app.get("/s/:token", (req, res) => res.sendFile(path.join(root, "public", "share.html")));

// Renderer libraries are vendored from node_modules so the app is fully
// self-contained (no CDN dependency; works offline / behind firewalls).
const nm = (...p) => path.join(root, "node_modules", ...p);
app.get("/vendor/marked.esm.js", (req, res) => res.sendFile(nm("marked", "lib", "marked.esm.js")));
app.get("/vendor/react.js", (req, res) => res.sendFile(nm("react", "umd", "react.production.min.js")));
app.get("/vendor/react-dom.js", (req, res) =>
  res.sendFile(nm("react-dom", "umd", "react-dom.production.min.js"))
);
app.use("/vendor/mermaid", express.static(nm("mermaid", "dist")));
app.use("/vendor/excalidraw", express.static(nm("@excalidraw", "excalidraw", "dist")));

app.use(express.static(path.join(root, "public")));

const port = Number(process.env.PORT || 4680);
app.listen(port, () => {
  console.log(`docs-mcp web app on ${store.baseUrl()} (port ${port})`);
});
