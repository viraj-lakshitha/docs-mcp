// Authentication for the web app and MCP endpoint.
// Browser users log in with email + password and get an HttpOnly session
// cookie; MCP clients authenticate with an OAuth access token obtained via
// the flow in src/oauth.js, sent as `Authorization: Bearer dmat_...`.
import express from "express";
import * as store from "./db.js";

const COOKIE_NAME = "docs_session";
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(req, res, token, expiresAt) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

// Resolves the acting user from an OAuth bearer token or a session cookie.
export async function authenticate(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const userId = await store.getUserIdForAccessToken(header.slice(7).trim());
    if (userId) return userId;
  }
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) {
    const session = await store.getSession(token);
    if (session) return session.user_id;
  }
  return null;
}

// Resolves the signed-in browser user (session cookie only) — used by the
// OAuth authorize/consent pages, which must not accept bearer tokens.
export async function sessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const session = await store.getSession(token);
  return session ? store.getUserById(session.user_id) : null;
}

export const requireAuth = ah(async (req, res, next) => {
  const userId = await authenticate(req);
  if (!userId) return res.status(401).json({ error: "authentication required" });
  req.userId = userId;
  next();
});

export function authRouter() {
  const router = express.Router();

  router.post("/register", ah(async (req, res) => {
    if (process.env.DOCS_MCP_DISABLE_SIGNUP === "true") {
      return res.status(403).json({ error: "sign-up is disabled" });
    }
    const { email, password } = req.body ?? {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "a valid email is required" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }
    if (await store.getUserByEmail(email)) {
      return res.status(409).json({ error: "an account with this email already exists" });
    }
    const user = await store.createUser({ email, password });
    const session = await store.createSession(user.id);
    setSessionCookie(req, res, session.token, session.expires_at);
    res.status(201).json({ id: user.id, email: user.email });
  }));

  router.post("/login", ah(async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = email && password ? await store.getUserByEmail(email) : null;
    if (!user || !store.verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "invalid email or password" });
    }
    const session = await store.createSession(user.id);
    setSessionCookie(req, res, session.token, session.expires_at);
    res.json({ id: user.id, email: user.email });
  }));

  router.post("/logout", ah(async (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) await store.deleteSession(token);
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    res.json({ ok: true });
  }));

  router.get("/me", requireAuth, ah(async (req, res) => {
    res.json(await store.getUserById(req.userId));
  }));

  return router;
}

