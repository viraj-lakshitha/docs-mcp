// OAuth 2.1 provider for MCP clients (Claude custom connectors, Claude Code,
// MCP Inspector). Implements what the MCP authorization spec requires:
//   - protected-resource + authorization-server metadata discovery
//   - dynamic client registration (RFC 7591, public clients, no secret)
//   - authorization code flow with PKCE (S256 only), consent screen
//   - token endpoint with refresh-token rotation
// Users authenticate with their existing docs-mcp session; the consent screen
// links into the login portal when signed out.
import express from "express";
import crypto from "node:crypto";
import * as store from "./db.js";
import { sessionUser } from "./auth.js";

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// MCP clients (and browser-based tools) call these endpoints cross-origin.
export function oauthCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, mcp-protocol-version");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

export function metadataRouter() {
  const router = express.Router();
  router.use(oauthCors);

  const authServerMetadata = (req, res) => {
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
    });
  };
  const resourceMetadata = (req, res) => {
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

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function consentPage({ client, user, params }) {
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join("\n          ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${escapeHtml(client.name)} — Notes by Optiq Labs</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body class="login-body">
  <main class="consent-card">
    <div class="login-logo consent-logo" aria-hidden="true">
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

  router.post("/register", oauthCors, ah(async (req, res) => {
    const { redirect_uris, client_name } = req.body ?? {};
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" });
    }
    for (const uri of redirect_uris) {
      let parsed;
      try {
        parsed = new URL(uri);
      } catch {
        return res.status(400).json({ error: "invalid_redirect_uri", error_description: `not a valid URL: ${uri}` });
      }
      const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !isLoopback) {
        return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect URIs must be https" });
      }
    }
    const client = await store.registerOAuthClient({
      name: typeof client_name === "string" && client_name.trim() ? client_name.trim().slice(0, 100) : "MCP client",
      redirectUris: redirect_uris,
    });
    res.status(201).json({
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  }));

  router.get("/authorize", ah(async (req, res) => {
    const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;
    const client = client_id ? await store.getOAuthClient(String(client_id)) : null;
    // Errors we can't safely bounce to a redirect_uri render as plain text.
    if (!client) return res.status(400).send("Unknown client_id");
    if (!client.redirect_uris.includes(String(redirect_uri))) {
      return res.status(400).send("redirect_uri is not registered for this client");
    }
    const bounce = (error, description) => {
      const url = new URL(String(redirect_uri));
      url.searchParams.set("error", error);
      if (description) url.searchParams.set("error_description", description);
      if (state) url.searchParams.set("state", String(state));
      res.redirect(302, url.href);
    };
    if (response_type !== "code") return bounce("unsupported_response_type", "only code is supported");
    if (!code_challenge || (code_challenge_method && code_challenge_method !== "S256")) {
      return bounce("invalid_request", "PKCE with S256 is required");
    }

    const user = await sessionUser(req);
    if (!user) {
      const next = encodeURIComponent(req.originalUrl);
      return res.redirect(302, `/login.html?next=${next}`);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(consentPage({
      client,
      user,
      params: {
        client_id: String(client_id),
        redirect_uri: String(redirect_uri),
        state: state ? String(state) : "",
        code_challenge: String(code_challenge),
        scope: scope ? String(scope) : "",
      },
    }));
  }));

  router.post("/decision", ah(async (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, scope, decision } = req.body ?? {};
    const client = client_id ? await store.getOAuthClient(String(client_id)) : null;
    if (!client || !client.redirect_uris.includes(String(redirect_uri))) {
      return res.status(400).send("Invalid authorization request");
    }
    const user = await sessionUser(req);
    if (!user) return res.status(401).send("Session expired — please sign in and retry the connection.");

    const url = new URL(String(redirect_uri));
    if (state) url.searchParams.set("state", String(state));
    if (decision !== "approve" || !code_challenge) {
      url.searchParams.set("error", "access_denied");
      return res.redirect(302, url.href);
    }
    const code = await store.createAuthCode({
      clientId: client.id,
      userId: user.id,
      redirectUri: String(redirect_uri),
      codeChallenge: String(code_challenge),
      scope: String(scope || ""),
    });
    url.searchParams.set("code", code);
    res.redirect(302, url.href);
  }));

  router.post("/token", oauthCors, ah(async (req, res) => {
    const { grant_type } = req.body ?? {};
    const fail = (status, error, description) =>
      res.status(status).json({ error, ...(description ? { error_description: description } : {}) });

    if (grant_type === "authorization_code") {
      const { code, code_verifier, redirect_uri, client_id } = req.body;
      if (!code || !code_verifier) return fail(400, "invalid_request", "code and code_verifier are required");
      const grant = await store.consumeAuthCode(String(code));
      if (!grant) return fail(400, "invalid_grant", "code is invalid, expired, or already used");
      if (client_id && grant.client_id !== client_id) return fail(400, "invalid_grant", "client mismatch");
      if (redirect_uri && grant.redirect_uri !== redirect_uri) return fail(400, "invalid_grant", "redirect_uri mismatch");
      const challenge = crypto.createHash("sha256").update(String(code_verifier)).digest("base64url");
      if (challenge !== grant.code_challenge) return fail(400, "invalid_grant", "PKCE verification failed");
      return res.json(await store.createOAuthTokens({
        userId: grant.user_id,
        clientId: grant.client_id,
        scope: grant.scope,
      }));
    }

    if (grant_type === "refresh_token") {
      const tokens = await store.rotateRefreshToken(String(req.body.refresh_token || ""));
      if (!tokens) return fail(400, "invalid_grant", "refresh token is invalid, expired, or revoked");
      return res.json(tokens);
    }

    return fail(400, "unsupported_grant_type", "use authorization_code or refresh_token");
  }));

  return router;
}
