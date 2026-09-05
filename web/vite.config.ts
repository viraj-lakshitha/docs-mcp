import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Build output lands in ../public, which the Express server (locally) and
// Vercel's CDN (deployed) serve as the static site.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Required by @excalidraw/excalidraw 0.17 when bundling with Vite.
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  // Untitled UI components are generated with `@/` imports; this mirrors the
  // `paths` entry in tsconfig.json so they resolve at build time too.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` proxies API traffic to the local Express server.
    //
    // These are matched as prefixes, so the asset route MUST be `^/a/` and not
    // `/a`: a bare `/a` also matches `/app`, which silently proxied the whole
    // workspace to :4680 and served the last production build out of ../public
    // instead of the dev bundle. Vite treats keys starting with `^` as regexes,
    // which is the only way to anchor this. `/mcp` is exact for the same reason.
    proxy: Object.fromEntries(
      ["/api", "^/mcp$", "/oauth", "^/a/", "/.well-known"].map((p) => [
        p,
        { target: "http://localhost:4680", changeOrigin: false },
      ])
    ),
    // web/ is the Vite root, but src/ imports shared/types.ts from the repo
    // root (the request/response interfaces shared with the backend) —
    // allow serving files from there too.
    fs: { allow: [".."] },
  },
});
