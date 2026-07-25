// Copies the browser renderer libraries from node_modules into public/vendor
// (runs on postinstall). public/vendor is gitignored; on Vercel the whole
// public/ directory is served from the CDN, so these never bloat the function.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = (...p) => path.join(root, "node_modules", ...p);
const out = (...p) => path.join(root, "public", "vendor", ...p);

rmSync(out(), { recursive: true, force: true });
mkdirSync(out("mermaid"), { recursive: true });
mkdirSync(out("excalidraw"), { recursive: true });

cpSync(nm("marked", "lib", "marked.esm.js"), out("marked.esm.js"));
cpSync(nm("react", "umd", "react.production.min.js"), out("react.js"));
cpSync(nm("react-dom", "umd", "react-dom.production.min.js"), out("react-dom.js"));

// mermaid's ESM entry lazily imports hashed chunk files from the dist root,
// so copy every .js/.mjs there (but not typings, mocks, or sourcemaps).
for (const f of readdirSync(nm("mermaid", "dist"))) {
  if (f.endsWith(".js") || f.endsWith(".mjs")) {
    cpSync(nm("mermaid", "dist", f), out("mermaid", f));
  }
}

cpSync(
  nm("@excalidraw", "excalidraw", "dist", "excalidraw.production.min.js"),
  out("excalidraw", "excalidraw.production.min.js")
);
cpSync(nm("@excalidraw", "excalidraw", "dist", "excalidraw-assets"), out("excalidraw", "excalidraw-assets"), {
  recursive: true,
});

console.log("vendor files copied to public/vendor");
