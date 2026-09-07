// Generates every shipped brand asset from the single source `brand/mark.svg`.
//
//   node brand/build-assets.mjs
//
// Output goes to web/public/, which Vite copies verbatim into the build (unlike
// the repo-root public/, which is gitignored and wiped by emptyOutDir).
//
// Requires `rsvg-convert` (brew install librsvg). Rasterising from vector keeps
// small sizes crisp — downscaling the 1254px AI-generated sources turns to mush
// below ~64px, and the dark source has no alpha channel at all.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "web", "public");
const tmp = join(here, ".tmp");

// Brand palette — must match web/src/styles/palette.css.
const C = {
  tileLight: "#f5f4f1",
  tileDark: "#1c1b19",
  brand600: "#b3562e",
  brand200: "#eec0aa",
  linesLight: "#a8a49b",
  linesDark: "#f0efec",
  canvasLight: "#f7f7f5",
  canvasDark: "#171614",
  textLight: "#1c1b19",
  textDark: "#f5f4f1",
  mutedLight: "#6b6760",
  mutedDark: "#b5b0a7",
};

// The mark's drawing instructions, minus the <svg> wrapper, so the tiled and
// social variants can re-use them at different scales without duplicating paths.
const markSource = readFileSync(join(here, "mark.svg"), "utf8");
const markInner = markSource.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

// In dark contexts the neutral text lines disappear against a dark tile.
const markFor = (theme) =>
  theme === "dark" ? markInner.replaceAll(C.linesLight, C.linesDark) : markInner;

/** A rounded-square app-icon tile with the mark inset. */
function tile({ theme, padding = 0.11, radius = 0.223, bg }) {
  const size = 512;
  const inset = size * padding;
  const scale = (size - inset * 2) / size;
  const fill = bg ?? (theme === "dark" ? C.tileDark : C.tileLight);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="none">
  <rect width="${size}" height="${size}" rx="${(size * radius).toFixed(1)}" fill="${fill}"/>
  <g transform="translate(${inset.toFixed(1)},${inset.toFixed(1)}) scale(${scale.toFixed(4)})">${markFor(theme)}</g>
</svg>`;
}

/** Maskable icons must keep all meaning inside a 40% safe radius, so the mark
 *  shrinks and the tile bleeds to the full square (no rounding). */
function maskable(theme) {
  const size = 512;
  const inset = size * 0.2;
  const scale = (size - inset * 2) / size;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="none">
  <rect width="${size}" height="${size}" fill="${theme === "dark" ? C.tileDark : C.tileLight}"/>
  <g transform="translate(${inset},${inset}) scale(${scale.toFixed(4)})">${markFor(theme)}</g>
</svg>`;
}

/** 1200x630 social card. Slack, X and LinkedIn do not accept SVG for og:image,
 *  so this must be rasterised to PNG. */
function ogCard(theme) {
  const dark = theme === "dark";
  const bg = dark ? C.canvasDark : C.canvasLight;
  const text = dark ? C.textDark : C.textLight;
  const muted = dark ? C.mutedDark : C.mutedLight;
  const tileFill = dark ? C.tileDark : "#ffffff";
  const stroke = dark ? "#35322e" : "#e2e0dc";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" fill="none">
  <rect width="1200" height="630" fill="${bg}"/>
  <circle cx="1080" cy="90" r="340" fill="${C.brand600}" opacity="${dark ? 0.1 : 0.06}"/>
  <circle cx="120" cy="580" r="260" fill="${C.brand200}" opacity="${dark ? 0.08 : 0.14}"/>
  <g transform="translate(96,150)">
    <rect width="150" height="150" rx="34" fill="${tileFill}" stroke="${stroke}" stroke-width="2"/>
    <g transform="translate(19,19) scale(0.2188)">${markFor(theme)}</g>
  </g>
  <!-- SVG cannot measure text, and rsvg has no auto-layout, so every run is
       given an explicit advance width via textLength. Without it the wordmark
       and its byline overlap, and the badge text spills out of its pill. -->
  <text x="96" y="380" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="72" font-weight="700" fill="${text}" letter-spacing="-1.5" textLength="210" lengthAdjust="spacing">Notes</text>
  <text x="330" y="380" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="34" font-weight="500" fill="${muted}">by Optiq Labs</text>
  <text x="96" y="452" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="38" font-weight="400" fill="${muted}">The workspace Claude actually keeps your documents in.</text>
  <text x="96" y="510" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="38" font-weight="400" fill="${muted}">Markdown, Mermaid and Excalidraw over MCP.</text>
  <rect x="96" y="556" width="272" height="46" rx="23" fill="${C.brand600}" opacity="${dark ? 0.18 : 0.12}"/>
  <text x="122" y="586" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="24" font-weight="600" fill="${dark ? C.brand200 : C.brand600}" textLength="220" lengthAdjust="spacing">Open source · MIT</text>
</svg>`;
}

/** A favicon that follows the browser/OS theme on its own. */
function themedFavicon() {
  const light = markInner;
  const dark = markFor("dark");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
  <g class="light">${light}</g>
  <g class="dark" style="display:none">${dark}</g>
  <style>
    @media (prefers-color-scheme: dark) {
      .light { display: none }
      .dark { display: inline !important }
    }
  </style>
</svg>`;
}

function png(svg, name, width, height = width) {
  const src = join(tmp, `${name}.svg`);
  writeFileSync(src, svg);
  execFileSync("rsvg-convert", ["-w", String(width), "-h", String(height), src, "-o", join(out, name)]);
  return name;
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });

const written = [];

// --- scalable, theme-aware: what modern browsers actually use ---
writeFileSync(join(out, "favicon.svg"), themedFavicon());
written.push("favicon.svg");
writeFileSync(join(out, "logo-mark.svg"), markSource);
written.push("logo-mark.svg");
writeFileSync(join(out, "logo-tile-light.svg"), tile({ theme: "light" }));
written.push("logo-tile-light.svg");
writeFileSync(join(out, "logo-tile-dark.svg"), tile({ theme: "dark" }));
written.push("logo-tile-dark.svg");

// --- raster fallbacks (older browsers, and anything that ignores SVG) ---
const lightTile = tile({ theme: "light" });
for (const size of [16, 32, 48, 96, 192, 512]) {
  written.push(png(lightTile, `favicon-${size}.png`, size));
}

// iOS ignores transparency and applies its own rounding, so this ships as an
// opaque square with the tile colour and no corner radius of its own.
written.push(png(tile({ theme: "light", radius: 0 }), "apple-touch-icon.png", 180));

// --- PWA / manifest ---
written.push(png(lightTile, "icon-192.png", 192));
written.push(png(lightTile, "icon-512.png", 512));
written.push(png(maskable("light"), "icon-maskable-512.png", 512));

// --- social cards ---
written.push(png(ogCard("light"), "og.png", 1200, 630));
written.push(png(ogCard("dark"), "og-dark.png", 1200, 630));

writeFileSync(
  join(out, "site.webmanifest"),
  JSON.stringify(
    {
      name: "Notes by Optiq Labs",
      short_name: "Notes",
      description: "The workspace Claude actually keeps your documents in.",
      start_url: "/app",
      scope: "/",
      display: "standalone",
      background_color: C.canvasLight,
      theme_color: C.canvasLight,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2
  ) + "\n"
);
written.push("site.webmanifest");

rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${written.length} assets to web/public/:\n  ` + written.join("\n  "));
