// Express app: REST API, MCP-over-HTTP endpoint, asset redirects, share pages,
// and the static editor UI. Used both locally (src/web-server.ts) and as a
// Vercel serverless function (api/index.ts).
//
// Auth surfaces:
//   - /api/auth/*                     public (login portal endpoints)
//   - /.well-known/*, /oauth/*        public (OAuth discovery + flow; consent requires a session)
//   - /api/connections, /api/api-keys session cookie or OAuth bearer token (account management, not API-key-eligible)
//   - /api/documents, /api/assets,
//     /api/tables, ...                session cookie, OAuth bearer token, or API key (dmcp_...)
//   - /mcp                            OAuth bearer token ONLY — API keys are never valid here
//   - /s/:token, /api/share/:token    public — that's what a share link is
//   - /a/:id                          public — image embeds on share pages
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./mcp.js";
import { authenticate, requireAuth, requireApiAuth, authRouter } from "./auth.js";
import { metadataRouter, oauthRouter, oauthCors } from "./oauth.js";
import { tablesRouter } from "./tables.js";
import { log, logError } from "./log.js";
import * as store from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
// Don't advertise the framework in responses.
app.disable("x-powered-by");
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: false }));

// Express 4 doesn't forward rejected promises to the error handler on its own.
const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Every request gets a trace id — reuse Vercel's own request id when present
// (correlates our logs with Vercel's) so the same id threads through this
// access log, any error log, and (for /mcp) every tool-call log it triggers.
// Logged on "finish" rather than up front so req.userId — set later by
// requireAuth/requireApiAuth — is already populated by the time we log it.
app.use((req: Request, res: Response, next: NextFunction) => {
  req.traceId = (req.headers["x-vercel-id"] as string) || (req.headers["x-request-id"] as string) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.traceId);
  const startedAt = Date.now();
  res.on("finish", () => {
    log("http.request", {
      traceId: req.traceId,
      userId: req.userId || null,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - startedAt,
    });
  });
  next();
});

// Per-process, in-memory rate limits (RateLimit-* response headers via
// standardHeaders). On a single long-running server (local/self-hosted) this
// throttles abuse directly; on Vercel each serverless instance enforces its
// own window, which is weaker but still bounds damage from a single hot
// instance and is the best a stateless function can do without an external
// store like Redis.
const mcpLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const mcpUnauthorized = (res: Response) => {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${store.baseUrl()}/.well-known/oauth-protected-resource"`
  );
  return res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Authentication required: connect via OAuth to get a bearer token" },
    id: null,
  });
};

app.use("/api", apiLimiter);

// ---- auth & OAuth provider ----

app.use("/api/auth", authRouter());
app.use(metadataRouter());
app.use("/oauth", oauthRouter());

// ---- MCP over HTTP ----
// Served on /mcp via the Streamable HTTP transport in stateless mode.
// Authentication is OAuth: add the deployed URL as a Claude custom connector
// (or `claude mcp add --transport http docs https://<app>/mcp`) and the
// client discovers /.well-known metadata, registers, and runs the
// authorize/consent flow against your account.
app.options("/mcp", oauthCors);
app.use("/mcp", mcpLimiter);
app.post(
  "/mcp",
  oauthCors,
  ah(async (req, res) => {
    const userId = await authenticate(req);
    if (!userId) return void mcpUnauthorized(res);
    req.userId = userId; // picked up by the access-log middleware's res.on("finish")
    const server = buildServer(userId, req.traceId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logError("mcp.request.error", { traceId: req.traceId, userId, error: (err as Error).message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  })
);
// Stateless mode has no sessions to resume or terminate — but an
// unauthenticated caller still gets 401, not a 405 that would let it probe
// the endpoint's existence/method support without ever proving identity.
app.get(
  "/mcp",
  oauthCors,
  ah(async (req, res) => {
    const userId = await authenticate(req);
    if (!userId) return void mcpUnauthorized(res);
    req.userId = userId;
    res.status(405).json({ error: "method not allowed" });
  })
);
app.delete(
  "/mcp",
  oauthCors,
  ah(async (req, res) => {
    const userId = await authenticate(req);
    if (!userId) return void mcpUnauthorized(res);
    req.userId = userId;
    res.status(405).json({ error: "method not allowed" });
  })
);

// ---- connected MCP integrations (Settings → Integrations) ----

app.get(
  "/api/connections",
  requireAuth,
  ah(async (req, res) => {
    res.json(await store.listConnections(req.userId!));
  })
);

app.delete(
  "/api/connections/:clientId",
  requireAuth,
  ah(async (req, res) => {
    (await store.revokeConnection(req.userId!, req.params.clientId!))
      ? res.json({ disconnected: req.params.clientId })
      : res.status(404).json({ error: "not found" });
  })
);

// ---- API keys (Settings → API keys; REST access for scripts/external tools) ----

app.get(
  "/api/api-keys",
  requireAuth,
  ah(async (req, res) => {
    res.json(await store.listApiKeys(req.userId!));
  })
);

app.post(
  "/api/api-keys",
  requireAuth,
  ah(async (req, res) => {
    const { name } = req.body ?? {};
    const key = await store.createApiKey(req.userId!, name);
    log("apikey.created", { traceId: req.traceId, userId: req.userId, keyId: key.id, prefix: key.prefix });
    res.status(201).json(key);
  })
);

app.delete(
  "/api/api-keys/:id",
  requireAuth,
  ah(async (req, res) => {
    const revoked = await store.revokeApiKey(req.userId!, req.params.id!);
    if (revoked) log("apikey.revoked", { traceId: req.traceId, userId: req.userId, keyId: req.params.id });
    revoked ? res.json({ revoked: req.params.id }) : res.status(404).json({ error: "not found" });
  })
);

// ---- document CRUD (owner-scoped; API key, OAuth bearer token, or session cookie) ----

app.get(
  "/api/documents",
  requireApiAuth,
  ah(async (req, res) => {
    res.json(await store.listDocuments(req.userId!));
  })
);

app.post(
  "/api/documents",
  requireApiAuth,
  ah(async (req, res) => {
    const { title, content } = req.body ?? {};
    if (!title || typeof title !== "string") {
      return void res.status(400).json({ error: "title is required" });
    }
    res.status(201).json(await store.createDocument(req.userId!, { title, content: content ?? "" }));
  })
);

app.get(
  "/api/documents/:id",
  requireApiAuth,
  ah(async (req, res) => {
    const doc = await store.getDocument(req.userId!, req.params.id!);
    doc ? res.json(doc) : res.status(404).json({ error: "not found" });
  })
);

app.put(
  "/api/documents/:id",
  requireApiAuth,
  ah(async (req, res) => {
    const { title, content } = req.body ?? {};
    const doc = await store.updateDocument(req.userId!, req.params.id!, { title, content });
    doc ? res.json(doc) : res.status(404).json({ error: "not found" });
  })
);

app.delete(
  "/api/documents/:id",
  requireApiAuth,
  ah(async (req, res) => {
    (await store.deleteDocument(req.userId!, req.params.id!))
      ? res.json({ deleted: req.params.id })
      : res.status(404).json({ error: "not found" });
  })
);

// ---- asset CRUD (owner-scoped; API key, OAuth bearer token, or session cookie) ----

app.get(
  "/api/assets",
  requireApiAuth,
  ah(async (req, res) => {
    res.json(await store.listAssets(req.userId!));
  })
);

// Accepts either multipart/form-data (a "file" field — the natural shape for
// curl/browsers/scripts) or a JSON body with base64 data (the shape MCP tool
// calls use, since tool arguments are JSON). multer only touches requests
// whose Content-Type is multipart/form-data, so the two paths don't collide.
// Either way the response always includes id, url (relative), and
// public_url (fully qualified).
app.post(
  "/api/assets",
  requireApiAuth,
  upload.single("file"),
  ah(async (req, res) => {
    if (req.file) {
      if (req.file.size === 0) return void res.status(400).json({ error: "uploaded file is empty" });
      const asset = await store.createAsset(req.userId!, {
        filename: req.file.originalname,
        mime: req.file.mimetype || "application/octet-stream",
        data: req.file.buffer,
      });
      return void res.status(201).json(asset);
    }
    const { filename, mime, data } = req.body ?? {};
    if (!filename || !mime || !data) {
      return void res
        .status(400)
        .json({ error: "filename, mime and data (base64) are required — or send multipart/form-data with a 'file' field" });
    }
    const buf = Buffer.from(data, "base64");
    if (buf.length === 0) return void res.status(400).json({ error: "data decoded to an empty file" });
    res.status(201).json(await store.createAsset(req.userId!, { filename, mime, data: buf }));
  })
);

app.delete(
  "/api/assets/:id",
  requireApiAuth,
  ah(async (req, res) => {
    (await store.deleteAsset(req.userId!, req.params.id!))
      ? res.json({ deleted: req.params.id })
      : res.status(404).json({ error: "not found" });
  })
);

// ---- tables (typed-column data tables; API key, OAuth bearer token, or session cookie) ----

app.use("/api/tables", requireApiAuth, tablesRouter());

// Public: stable asset URLs (used by <img> tags on share pages) redirect to
// Vercel Blob. Ids are unguessable 64-bit random values.
app.get(
  "/a/:id",
  ah(async (req, res) => {
    const asset = await store.getAssetPublic(req.params.id!);
    asset ? res.redirect(302, asset.blob_url) : res.status(404).send("not found");
  })
);

// ---- view-only sharing (API key, OAuth bearer token, or session cookie) ----

app.post(
  "/api/documents/:id/share",
  requireApiAuth,
  ah(async (req, res) => {
    const share = await store.createShare(req.userId!, req.params.id!);
    share ? res.status(201).json(share) : res.status(404).json({ error: "not found" });
  })
);

app.get(
  "/api/documents/:id/shares",
  requireApiAuth,
  ah(async (req, res) => {
    res.json(await store.listShares(req.userId!, req.params.id!));
  })
);

app.delete(
  "/api/shares/:token",
  requireApiAuth,
  ah(async (req, res) => {
    (await store.revokeShare(req.userId!, req.params.token!))
      ? res.json({ revoked: req.params.token })
      : res.status(404).json({ error: "not found" });
  })
);

// Public: read-only document access by share token — the only document
// endpoint a viewer needs, and it exposes no ids or write operations.
app.get(
  "/api/share/:token",
  ah(async (req, res) => {
    const doc = await store.getSharedDocument(req.params.token!);
    doc
      ? res.json({ title: doc.title, content: doc.content, updated_at: doc.updated_at })
      : res.status(404).json({ error: "invalid or revoked link" });
  })
);

// The React app (built by `npm run build` into public/) is served statically;
// any other GET falls through to index.html so client-side routes like /login
// and /s/:token deep-link correctly. On Vercel the CDN + rewrites do the same.
app.use(express.static(path.join(root, "public")));
app.get("*", (req: Request, res: Response, next: NextFunction) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/oauth/") ||
    req.path.startsWith("/a/") ||
    req.path === "/mcp" ||
    req.path.startsWith("/.well-known/")
  ) {
    return next();
  }
  res.sendFile(path.join(root, "public", "index.html"));
});

app.use((err: Error & { status?: number; name: string }, req: Request, res: Response, _next: NextFunction) => {
  logError("http.error", {
    traceId: req.traceId,
    userId: req.userId || null,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });
  if (res.headersSent) return;
  if (err.name === "MulterError") return void res.status(400).json({ error: err.message });
  res.status(err.status || 500).json({ error: err.message || "internal error" });
});

export default app;
