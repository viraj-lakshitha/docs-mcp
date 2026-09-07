// Security headers, request-origin checks, and the upload MIME allow-list.
//
// Headers are set in two places on purpose. In production the SPA shell is
// served by Vercel's CDN straight out of public/ (see the rewrites in
// vercel.json) and never touches this Express app, so the CDN needs its own
// `headers` block; locally and self-hosted the same HTML is served by
// express.static in app.ts, which needs the middleware below. Keeping both in
// sync is what scripts/check-csp.mjs is for.
import type { Request, Response, NextFunction } from "express";

// Hash of the inline theme bootstrap in web/index.html — the anti-flash script
// that sets .dark-mode before first paint. It has to be inline (an external
// script would cost a round-trip before paint, which is the exact flash it
// exists to prevent), so `script-src 'self'` alone would block it and
// 'unsafe-inline' would give away most of what this policy is worth.
//
// Vite copies the script through verbatim, so the hash is a pure function of
// web/index.html and will silently go stale if that script is ever edited.
// Regenerate with `node scripts/check-csp.mjs --print`; CI runs the same
// script without --print to fail the build when it drifts.
const THEME_SCRIPT_HASH = "'sha256-GaQUAOFHRIQgSlVNEZqtHhU4g+GccahGWLMIG9oSkS0='";

// Vercel Blob is where asset binaries live. /a/:id 302-redirects to this host,
// and CSP is enforced against the post-redirect URL for subresource loads, so
// the blob origin has to be named here for embedded images to render.
const BLOB_HOST = "https://*.public.blob.vercel-storage.com";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // The OAuth consent screen posts back to /oauth/decision, same origin.
  "form-action 'self'",
  `script-src 'self' ${THEME_SCRIPT_HASH}`,
  // 'unsafe-inline' is load-bearing and not removable by tightening alone:
  // motion writes inline style attributes on every animated element,
  // react-aria-components sets inline positioning on overlays, Excalidraw
  // styles its canvas inline, and Mermaid ships its themeVariables palette in
  // a <style> block inside the rendered SVG. Dropping it breaks all four.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${BLOB_HOST}`,
  "font-src 'self' data:",
  `connect-src 'self' ${BLOB_HOST}`,
  // Excalidraw runs some export work off the main thread.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  // Redundant with frame-ancestors for modern browsers; harmless and still
  // read by some corporate proxies and older clients.
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

const isHttps = (req: Request): boolean => req.secure || req.headers["x-forwarded-proto"] === "https";

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  // Only over TLS: browsers ignore HSTS on plain http anyway, and emitting it
  // in local dev is noise that can outlive the dev session in the browser's
  // HSTS store if the developer ever runs on a real hostname.
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  next();
}

// ---- CSRF defence-in-depth ----

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// SameSite=Lax on the session cookie is what actually stops cross-site
// state-changing requests; this is a second, independent check so that a
// future cookie-attribute regression isn't immediately exploitable.
//
// Deliberately skipped when an Authorization header is present: API-key and
// bearer callers are scripts and MCP clients, not browsers, and legitimately
// send no Origin. They're also not CSRF-able — the browser never attaches
// those credentials on its own.
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING.has(req.method)) return next();
  if (req.headers.authorization) return next();

  const origin = req.headers.origin;
  // No Origin at all: not a browser-initiated cross-site request. Browsers
  // always send Origin on cross-origin state-changing fetches.
  if (!origin) return next();

  const expected = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return void res.status(403).json({ error: "invalid origin" });
  }
  if (!expected || originHost !== expected) {
    return void res.status(403).json({ error: "cross-origin request blocked" });
  }
  next();
}

// ---- upload MIME allow-list ----

// Anything not listed is rejected outright. text/html and application/xhtml+xml
// are the notable exclusions: blobs are stored with public access, so an
// uploaded HTML document would be a hosted-phishing page reachable through a
// link on this app's own domain.
const ALLOWED_UPLOAD_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

// Types a browser will render in an <img> and that carry no script of their
// own. Everything else — including SVG — is stored with an attachment
// disposition so that navigating straight to the blob URL downloads the file
// instead of rendering it. SVG is the reason this distinction exists: it can
// carry script, but scripts in an SVG loaded via <img> never execute, so
// attachment disposition closes the direct-navigation case without breaking
// the embed case.
const INLINE_SAFE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

// "text/plain; charset=utf-8" -> "text/plain"
export const normalizeMime = (mime: string): string => (mime.split(";")[0] ?? "").trim().toLowerCase();

export const isAllowedUploadMime = (mime: string): boolean => ALLOWED_UPLOAD_MIME.has(normalizeMime(mime));

export const isInlineSafeMime = (mime: string): boolean => INLINE_SAFE_MIME.has(normalizeMime(mime));

export const allowedUploadMimeList = (): string[] => [...ALLOWED_UPLOAD_MIME].sort();
