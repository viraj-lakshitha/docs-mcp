import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build output lands in ../public, which the Express server (locally) and
// Vercel's CDN (deployed) serve as the static site.
export default defineConfig({
  plugins: [react()],
  define: {
    // Required by @excalidraw/excalidraw 0.17 when bundling with Vite.
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` proxies API traffic to the local Express server.
    proxy: Object.fromEntries(
      ["/api", "/mcp", "/oauth", "/a", "/.well-known"].map((p) => [
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
