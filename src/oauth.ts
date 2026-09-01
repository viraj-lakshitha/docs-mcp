// OAuth 2.1 provider for MCP clients (Claude custom connectors, Claude Code,
// MCP Inspector). Implements what the MCP authorization spec requires:
//   - protected-resource + authorization-server metadata discovery
//   - dynamic client registration (RFC 7591, public clients, no secret)
//   - authorization code flow with PKCE (S256 only), consent screen
//   - token endpoint with refresh-token rotation
// Users authenticate with their existing docs-mcp session; the consent screen
// links into the login portal when signed out.
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import crypto from "node:crypto";
import * as store from "./db.ts";
import { sessionUser } from "./auth.ts";
import { log } from "./log.ts";
import type { OAuthClient, User } from "../shared/types.ts";

const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// MCP clients (and browser-based tools) call these endpoints cross-origin.
export function oauthCors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, mcp-protocol-version");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

export function metadataRouter() {
  const router = express.Router();
  router.use(oauthCors);

  const authServerMetadata = (_req: Request, res: Response) => {
    const base = store.baseUrl();
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
      // RFC 9207: authorization responses carry `iss` so a client juggling
      // multiple authorization servers can tell which one issued a code,
      // closing the mix-up attack the RFC targets.
      authorization_response_iss_parameter_supported: true,
    });
  };
  const resourceMetadata = (_req: Request, res: Response) => {
    const base = store.baseUrl();
    res.json({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
    });
  };

  router.get("/.well-known/oauth-authorization-server", authServerMetadata);
  // Path-suffixed variants (RFC 8414/9728 style) some clients request.
  router.get("/.well-known/oauth-authorization-server/mcp", authServerMetadata);
  router.get("/.well-known/oauth-protected-resource", resourceMetadata);
  router.get("/.well-known/oauth-protected-resource/mcp", resourceMetadata);
  return router;
}

const escapeHtml = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function consentPage({
  client,
  user,
  params,
}: {
  client: OAuthClient;
  user: User;
  params: Record<string, string>;
}): string {
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join("\n          ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${escapeHtml(client.name)} — Notes by Optiq Labs</title>
  <style>
    /* Self-contained: the SPA's stylesheet is hash-named, so this server-
       rendered page carries its own copy of the consent styles. */
    /* Light-only design: without this, dark-mode Safari paints form controls
       with its dark UA palette (white button text on our white background). */
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #1f1e1c; display: grid; place-items: center; min-height: 100vh; padding: 24px;
      background:
        radial-gradient(600px 400px at 15% 10%, rgba(179, 86, 46, 0.10), transparent 60%),
        radial-gradient(700px 500px at 90% 90%, rgba(179, 86, 46, 0.08), transparent 60%),
        #f7f7f5;
    }
    .consent-card {
      width: min(430px, 100%); background: #fff; border: 1px solid #e2e0dc; border-radius: 16px;
      padding: 34px 36px; box-shadow: 0 18px 50px -18px rgba(31,30,28,.25), 0 2px 8px rgba(31,30,28,.05);
    }
    .consent-logo {
      width: 48px; height: 48px; border-radius: 12px; background: #b3562e; color: #fff;
      display: grid; place-items: center; margin-bottom: 12px;
    }
    .consent-brand { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: #7a766f; }
    .brand-sub { font-size: .62em; font-weight: 500; opacity: .72; white-space: nowrap; }
    h1 { font-size: 19px; margin: 0 0 6px; font-weight: 500; line-height: 1.4; }
    .consent-sub { margin: 0 0 18px; color: #7a766f; font-size: 13.5px; }
    .consent-scopes {
      list-style: none; margin: 0 0 22px; padding: 14px 16px; background: #f7f7f5;
      border: 1px solid #e2e0dc; border-radius: 10px; display: grid; gap: 8px;
    }
    .consent-scopes li { font-size: 13.5px; padding-left: 22px; position: relative; }
    .consent-scopes li::before { content: "\\2713"; position: absolute; left: 2px; color: #b3562e; font-weight: 700; }
    .consent-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .consent-actions button {
      font: inherit; padding: 9px 18px; border: 1px solid #e2e0dc; border-radius: 8px;
      background: #fff; color: #1f1e1c; cursor: pointer;
      -webkit-appearance: none; appearance: none;
    }
    .consent-actions button:hover { border-color: #b3562e; color: #b3562e; }
    .consent-actions button.primary { background: #b3562e; border-color: #b3562e; color: #fff; }
    .consent-actions button.primary:hover { opacity: .9; color: #fff; }
    @media (max-width: 640px) { .consent-card { padding: 26px 22px; } }
  </style>
</head>
<body>
  <main class="consent-card">
    <div class="consent-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>
      </svg>
    </div>
    <div class="brand consent-brand">Notes <span class="brand-sub">by Optiq Labs</span></div>
    <h1><strong>${escapeHtml(client.name)}</strong> wants to access your documents</h1>
    <p class="consent-sub">Signed in as <strong>${escapeHtml(user.email)}</strong></p>
    <ul class="consent-scopes">
      <li>Create, read, edit, and delete your documents</li>
      <li>Upload and manage your assets</li>
      <li>Create and revoke view-only share links</li>
    </ul>
    <form method="POST" action="/oauth/decision" class="consent-actions">
          ${hidden}
      <button type="submit" name="decision" value="deny">Cancel</button>
      <button type="submit" name="decision" value="approve" class="primary">Allow access</button>
    </form>
  </main>
</body>
</html>`;
}

export function oauthRouter() {
  const router = express.Router();

  router.post(
    "/register",
    oauthCors,
    ah(async (req, res) => {
      const { redirect_uris, client_name } = req.body ?? {};
      if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return void res
          .status(400)
          .json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" });
      }
      for (const uri of redirect_uris) {
        let parsed: URL;
        try {
          parsed = new URL(uri);
        } catch {
          return void res.status(400).json({ error: "invalid_redirect_uri", error_description: `not a valid URL: ${uri}` });
        }
        const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (parsed.protocol !== "https:" && !isLoopback) {
          return void res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect URIs must be https" });
        }
      }
      const client = await store.registerOAuthClient({
        name: typeof client_name === "string" && client_name.trim() ? client_name.trim().slice(0, 100) : "MCP client",
        redirectUris: redirect_uris,
      });
      log("oauth.client.registered", { traceId: req.traceId, clientId: client.id, name: client.name });
      res.status(201).json({
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    })
  );

  router.get(
    "/authorize",
    ah(async (req, res) => {
      const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;
      const client = client_id ? await store.getOAuthClient(String(client_id)) : null;
      // Errors we can't safely bounce to a redirect_uri render as plain text.
      if (!client) return void res.status(400).send("Unknown client_id");
      if (!client.redirect_uris.includes(String(redirect_uri))) {
        return void res.status(400).send("redirect_uri is not registered for this client");
      }
      const bounce = (error: string, description?: string) => {
        const url = new URL(String(redirect_uri));
        url.searchParams.set("error", error);
        if (description) url.searchParams.set("error_description", description);
        if (state) url.searchParams.set("state", String(state));
        url.searchParams.set("iss", store.baseUrl()); // RFC 9207
        res.redirect(302, url.href);
      };
      if (response_type !== "code") return void bounce("unsupported_response_type", "only code is supported");
      if (!code_challenge || (code_challenge_method && code_challenge_method !== "S256")) {
        return void bounce("invalid_request", "PKCE with S256 is required");
      }

      const user = await sessionUser(req);
      if (!user) {
        const next = encodeURIComponent(req.originalUrl);
        return void res.redirect(302, `/login?next=${next}`);
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        consentPage({
          client,
          user,
          params: {
            client_id: String(client_id),
            redirect_uri: String(redirect_uri),
            state: state ? String(state) : "",
            code_challenge: String(code_challenge),
            scope: scope ? String(scope) : "",
          },
        })
      );
    })
  );

  router.post(
    "/decision",
    ah(async (req, res) => {
      const { client_id, redirect_uri, state, code_challenge, scope, decision } = req.body ?? {};
      const client = client_id ? await store.getOAuthClient(String(client_id)) : null;
      if (!client || !client.redirect_uris.includes(String(redirect_uri))) {
        return void res.status(400).send("Invalid authorization request");
      }
      const user = await sessionUser(req);
      if (!user) return void res.status(401).send("Session expired — please sign in and retry the connection.");
      req.userId = user.id; // picked up by the access-log middleware's res.on("finish")

      const url = new URL(String(redirect_uri));
      if (state) url.searchParams.set("state", String(state));
      // RFC 9207: every authorization response — success or error — carries iss.
      url.searchParams.set("iss", store.baseUrl());
      if (decision !== "approve" || !code_challenge) {
        log("oauth.decision", { traceId: req.traceId, userId: user.id, clientId: client.id, decision: "deny" });
        url.searchParams.set("error", "access_denied");
        return void res.redirect(302, url.href);
      }
      const code = await store.createAuthCode({
        clientId: client.id,
        userId: user.id,
        redirectUri: String(redirect_uri),
        codeChallenge: String(code_challenge),
        scope: String(scope || ""),
      });
      log("oauth.decision", { traceId: req.traceId, userId: user.id, clientId: client.id, decision: "approve" });
      url.searchParams.set("code", code);
      res.redirect(302, url.href);
    })
  );

  router.post(
    "/token",
    oauthCors,
    ah(async (req, res) => {
      const { grant_type } = req.body ?? {};
      const fail = (status: number, error: string, description?: string) =>
        res.status(status).json({ error, ...(description ? { error_description: description } : {}) });

      if (grant_type === "authorization_code") {
        const { code, code_verifier, redirect_uri, client_id } = req.body;
        if (!code || !code_verifier) return void fail(400, "invalid_request", "code and code_verifier are required");
        const grant = await store.consumeAuthCode(String(code));
        if (!grant) {
          log("oauth.token.failed", { traceId: req.traceId, grantType: grant_type, reason: "invalid_grant" });
          return void fail(400, "invalid_grant", "code is invalid, expired, or already used");
        }
        if (client_id && grant.client_id !== client_id) return void fail(400, "invalid_grant", "client mismatch");
        if (redirect_uri && grant.redirect_uri !== redirect_uri) {
          return void fail(400, "invalid_grant", "redirect_uri mismatch");
        }
        const challenge = crypto.createHash("sha256").update(String(code_verifier)).digest("base64url");
        if (challenge !== grant.code_challenge) {
          log("oauth.token.failed", {
            traceId: req.traceId,
            userId: grant.user_id,
            clientId: grant.client_id,
            reason: "pkce_mismatch",
          });
          return void fail(400, "invalid_grant", "PKCE verification failed");
        }
        req.userId = grant.user_id;
        log("oauth.token.issued", {
          traceId: req.traceId,
          userId: grant.user_id,
          clientId: grant.client_id,
          grantType: grant_type,
        });
        return void res.json(
          await store.createOAuthTokens({
            userId: grant.user_id,
            clientId: grant.client_id,
            scope: grant.scope,
          })
        );
      }

      if (grant_type === "refresh_token") {
        const tokens = await store.rotateRefreshToken(String(req.body.refresh_token || ""));
        if (!tokens) {
          log("oauth.token.failed", { traceId: req.traceId, grantType: grant_type, reason: "invalid_grant" });
          return void fail(400, "invalid_grant", "refresh token is invalid, expired, or revoked");
        }
        log("oauth.token.issued", { traceId: req.traceId, grantType: grant_type });
        return void res.json(tokens);
      }

      return void fail(400, "unsupported_grant_type", "use authorization_code or refresh_token");
    })
  );

  return router;
}
