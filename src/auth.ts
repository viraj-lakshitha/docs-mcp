// Authentication for the web app and MCP endpoint.
// Browser users log in with email + password and get an HttpOnly session
// cookie; MCP clients authenticate with an OAuth access token obtained via
// the flow in src/oauth.ts, sent as `Authorization: Bearer dmat_...`.
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import * as store from "./db.js";
import { log } from "./log.js";
import type { User } from "../shared/types.js";

const COOKIE_NAME = "docs_session";
const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(req: Request, res: Response, token: string, expiresAt: string): void {
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
export async function authenticate(req: Request): Promise<string | null> {
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

// Resolves the acting user from an OAuth access token and nothing else — the
// mirror image of sessionUser() below, and what /mcp uses.
//
// /mcp previously went through authenticate(), which falls through to the
// session cookie, so a logged-in browser could drive the MCP endpoint despite
// the docs saying bearer-only. SameSite=Lax meant that was not reachable
// cross-site, but the endpoint's contract and its code disagreed, and the
// safe reading is the narrower one: MCP clients always hold a token.
export async function bearerUser(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return store.getUserIdForAccessToken(header.slice(7).trim());
}

// Resolves the signed-in browser user (session cookie only) — used by the
// OAuth authorize/consent pages, which must not accept bearer tokens.
export async function sessionUser(req: Request): Promise<User | null> {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const session = await store.getSession(token);
  return session ? store.getUserById(session.user_id) : null;
}

export const requireAuth = ah(async (req, res, next) => {
  const userId = await authenticate(req);
  if (!userId) return void res.status(401).json({ error: "authentication required" });
  req.userId = userId;
  next();
});

// REST-only auth: accepts an API key (`dmcp_...`) in addition to everything
// `authenticate()` already accepts (OAuth bearer token, session cookie).
// Deliberately layered on top of — not merged into — authenticate(), which
// the /mcp route also calls directly: /mcp must stay OAuth-only, so API keys
// are never given a path into that function.
export async function authenticateApi(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token.startsWith("dmcp_")) {
      const userId = await store.getUserIdForApiKey(token);
      if (userId) return userId;
    }
  }
  return authenticate(req);
}

export const requireApiAuth = ah(async (req, res, next) => {
  const userId = await authenticateApi(req);
  if (!userId) return void res.status(401).json({ error: "authentication required" });
  req.userId = userId;
  next();
});

// Credential-guessing bucket for the two endpoints that take a password. The
// /api limiter these sit under allows 300/min, which is plenty for a person
// filling in a form and plenty for an attacker too. Same per-instance caveat
// as the other limiters (see the comment in src/app.ts): on Vercel this bounds
// one hot instance rather than the whole deployment.
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Failures are what we care about; a user who logs in successfully on the
  // first try shouldn't spend budget shared with a bot on the same NAT.
  skipSuccessfulRequests: true,
});

export function authRouter() {
  const router = express.Router();

  router.post(
    "/register",
    authLimiter,
    ah(async (req, res) => {
      if (process.env.DOCS_MCP_DISABLE_SIGNUP === "true") {
        return void res.status(403).json({ error: "sign-up is disabled" });
      }
      const { email, password } = req.body ?? {};
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return void res.status(400).json({ error: "a valid email is required" });
      }
      if (!password || password.length < 8) {
        return void res.status(400).json({ error: "password must be at least 8 characters" });
      }
      if (await store.getUserByEmail(email)) {
        log("auth.register.failed", { traceId: req.traceId, email, reason: "email_taken" });
        return void res.status(409).json({ error: "an account with this email already exists" });
      }
      const user = await store.createUser({ email, password });
      const session = await store.createSession(user.id);
      setSessionCookie(req, res, session.token, session.expires_at);
      req.userId = user.id;
      log("auth.register.success", { traceId: req.traceId, userId: user.id, email: user.email });
      res.status(201).json({ id: user.id, email: user.email });
    })
  );

  router.post(
    "/login",
    authLimiter,
    ah(async (req, res) => {
      const { email, password } = req.body ?? {};
      const user = email && password ? await store.getUserByEmail(email) : null;
      if (!user || !store.verifyPassword(password, user.password_hash)) {
        log("auth.login.failed", { traceId: req.traceId, email: email || null });
        return void res.status(401).json({ error: "invalid email or password" });
      }
      const session = await store.createSession(user.id);
      setSessionCookie(req, res, session.token, session.expires_at);
      req.userId = user.id;
      log("auth.login.success", { traceId: req.traceId, userId: user.id, email: user.email });
      res.json({ id: user.id, email: user.email });
    })
  );

  router.post(
    "/logout",
    ah(async (req, res) => {
      const token = parseCookies(req)[COOKIE_NAME];
      if (token) {
        const session = await store.getSession(token);
        req.userId = session?.user_id;
        await store.deleteSession(token);
      }
      log("auth.logout", { traceId: req.traceId, userId: req.userId || null });
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
      res.json({ ok: true });
    })
  );

  router.get(
    "/me",
    requireAuth,
    ah(async (req, res) => {
      res.json(await store.getUserById(req.userId!));
    })
  );

  router.put(
    "/me",
    requireAuth,
    ah(async (req, res) => {
      const { name, email } = req.body ?? {};
      if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return void res.status(400).json({ error: "a valid email is required" });
      }
      if (name !== undefined && typeof name === "string" && name.length > 200) {
        return void res.status(400).json({ error: "name is too long" });
      }
      const user = await store.updateUser(req.userId!, { name, email });
      if (user === "email_taken") return void res.status(409).json({ error: "an account with this email already exists" });
      res.json(user);
    })
  );

  return router;
}
