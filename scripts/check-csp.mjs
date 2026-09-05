// Guards the two ways the Content-Security-Policy can silently rot:
//
//   1. The inline theme script in web/index.html is allow-listed by hash. Edit
//      that script without regenerating the hash and the browser blocks it —
//      dark mode starts flashing white on load and nothing else complains.
//   2. The policy is declared twice (src/security.ts for the Express-served
//      case, vercel.json for the CDN-served case). They have to agree.
//
// Run with --print to emit the current hash when you have legitimately changed
// the theme script. Run with no arguments in CI to fail on drift.
//
// Reads the compiled dist/src/security.js rather than parsing the TypeScript,
// so `npm run build:api` has to have run first.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const fail = (msg) => {
  console.error(`check-csp: ${msg}`);
  process.exitCode = 1;
};

// --- 1. hash the inline script(s) in web/index.html ---
const indexHtml = read("web/index.html");
const inline = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

if (inline.length === 0) {
  console.log("check-csp: no inline scripts in web/index.html — nothing to hash.");
}

const hashes = inline.map((body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);

if (process.argv.includes("--print")) {
  for (const h of hashes) console.log(h);
  process.exit(0);
}

// --- 2. compare against the compiled policy ---
const distPath = path.join(root, "dist/src/security.js");
if (!existsSync(distPath)) {
  fail("dist/src/security.js not found — run `npm run build:api` first.");
  process.exit(1);
}
const { CONTENT_SECURITY_POLICY } = await import(distPath);

for (const h of hashes) {
  if (!CONTENT_SECURITY_POLICY.includes(h)) {
    fail(
      `web/index.html contains an inline script whose hash is not in the policy.\n` +
        `  missing: ${h}\n` +
        `  Update THEME_SCRIPT_HASH in src/security.ts (see \`node scripts/check-csp.mjs --print\`).`
    );
  }
}

// A hash in the policy that no longer matches any inline script means the
// script was edited and the old hash left behind — same bug, other direction.
for (const h of CONTENT_SECURITY_POLICY.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []) {
  if (!hashes.includes(h)) {
    fail(`policy allow-lists ${h}, but no inline script in web/index.html hashes to it.`);
  }
}

// --- 3. the CDN copy must match the app copy ---
const vercel = JSON.parse(read("vercel.json"));
const cdnCsp = vercel.headers
  ?.flatMap((h) => h.headers ?? [])
  .find((h) => h.key?.toLowerCase() === "content-security-policy")?.value;

if (!cdnCsp) {
  fail("vercel.json has no Content-Security-Policy header — the CDN-served SPA shell would ship without one.");
} else if (cdnCsp !== CONTENT_SECURITY_POLICY) {
  fail(
    "vercel.json and src/security.ts disagree on the policy.\n" +
      `  vercel.json:      ${cdnCsp}\n` +
      `  src/security.ts:  ${CONTENT_SECURITY_POLICY}`
  );
}

if (!process.exitCode) console.log("check-csp: policy, inline-script hash and vercel.json all agree.");
