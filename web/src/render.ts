// Document renderer shared by the editor preview and the share page.
// Markdown via marked; ```mermaid and ```excalidraw fences become SVG.
// mermaid and excalidraw are dynamically imported so they land in separate
// chunks and only load when a document actually uses them.
import { marked } from "marked";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}
// Guarded so this module can be imported during the build-time prerender,
// where it is reached via Landing -> LandingDemo but never actually run.
if (typeof window !== "undefined") {
  window.EXCALIDRAW_ASSET_PATH = "/";
}

function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark-mode");
}

// Mermaid's stock "neutral"/"dark" themes are grey and blue respectively, which
// reads as a foreign widget dropped into a warm terracotta app. `theme: "base"`
// plus themeVariables lets it derive everything from our palette instead.
// Values are literals rather than var() because Mermaid writes them into the
// SVG's own <style>, where the document's custom properties don't resolve.
const MERMAID_VARS = {
  light: {
    background: "transparent",
    primaryColor: "#f7dccf", // brand-100
    primaryBorderColor: "#b3562e", // brand-600
    primaryTextColor: "#1f1e1c", // gray-900
    secondaryColor: "#f0efec", // gray-100
    secondaryBorderColor: "#cdcac3", // gray-300
    secondaryTextColor: "#1f1e1c",
    tertiaryColor: "#ffffff",
    tertiaryBorderColor: "#e2e0dc", // gray-200
    tertiaryTextColor: "#1f1e1c",
    lineColor: "#86827a", // gray-500
    textColor: "#1f1e1c",
    mainBkg: "#f7dccf",
    nodeBorder: "#b3562e",
    clusterBkg: "#f7f7f5", // gray-50
    clusterBorder: "#e2e0dc",
    titleColor: "#1f1e1c",
    edgeLabelBackground: "#f7f7f5",
    errorBkgColor: "#fdf1f0", // critical-50
    errorTextColor: "#a33830", // critical-600
    // ER diagrams colour their attribute rows independently of node fills;
    // without these they keep Mermaid's hardcoded white.
    attributeBackgroundColorOdd: "#ffffff",
    attributeBackgroundColorEven: "#f7f7f5",
  },
  dark: {
    background: "transparent",
    primaryColor: "#46281a",
    primaryBorderColor: "#d47c53", // brand-400
    primaryTextColor: "#f5f4f1",
    secondaryColor: "#2a2825",
    secondaryBorderColor: "#47433d",
    secondaryTextColor: "#f5f4f1",
    tertiaryColor: "#1f1e1c",
    tertiaryBorderColor: "#35322e",
    tertiaryTextColor: "#f5f4f1",
    lineColor: "#8b857c",
    textColor: "#f5f4f1",
    mainBkg: "#46281a",
    nodeBorder: "#d47c53",
    clusterBkg: "#1f1e1c",
    clusterBorder: "#35322e",
    titleColor: "#f5f4f1",
    edgeLabelBackground: "#1f1e1c",
    errorBkgColor: "#4d1815",
    errorTextColor: "#e0857c",
    attributeBackgroundColorOdd: "#1f1e1c",
    attributeBackgroundColorEven: "#2a2825",
  },
} as const;

const MERMAID_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
// Mermaid bakes its palette in at initialize() time, so switching themes means
// re-initializing. Tracking which theme the current instance was configured
// with lets us re-init only when it actually changed.
let mermaidTheme: "light" | "dark" | null = null;

async function getMermaid() {
  const wanted = isDark() ? "dark" : "light";
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  const mermaid = await mermaidPromise;
  if (mermaidTheme !== wanted) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      fontFamily: MERMAID_FONT,
      themeVariables: MERMAID_VARS[wanted],
    });
    mermaidTheme = wanted;
  }
  return mermaid;
}

let excalidrawPromise: Promise<typeof import("@excalidraw/excalidraw")> | null = null;
async function getExcalidraw() {
  excalidrawPromise ??= import("@excalidraw/excalidraw");
  return excalidrawPromise;
}

const FENCE_RE = /```(mermaid|excalidraw)[^\S\n]*\n([\s\S]*?)```/g;
let renderSeq = 0;

// Renders markdown into `container`, then asynchronously replaces diagram
// placeholders with rendered SVG.
export async function renderDocument(container: HTMLElement, markdown: string | undefined): Promise<void> {
  const blocks: { lang: string; code: string }[] = [];
  const source = (markdown ?? "").replace(FENCE_RE, (_match, lang, code) => {
    blocks.push({ lang, code });
    return `\n<div class="diagram" data-block="${blocks.length - 1}"></div>\n`;
  });

  container.innerHTML = await marked.parse(source);

  const jobs = [...container.querySelectorAll<HTMLElement>(".diagram[data-block]")].map(async (el) => {
    const { lang, code } = blocks[Number(el.dataset.block)]!;
    try {
      if (lang === "mermaid") {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(`mmd-${++renderSeq}`, code);
        el.innerHTML = svg;
      } else {
        const { exportToSvg } = await getExcalidraw();
        const scene = JSON.parse(code);
        const svg = await exportToSvg({
          elements: scene.elements ?? [],
          appState: {
            exportBackground: false,
            exportWithDarkMode: isDark(),
            ...(scene.appState ?? {}),
          },
          files: scene.files ?? null,
        });
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        el.replaceChildren(svg);
      }
    } catch (err) {
      el.classList.add("diagram-error");
      el.textContent = `Failed to render ${lang} block: ${(err as Error).message ?? err}`;
    }
  });
  await Promise.allSettled(jobs);
}
