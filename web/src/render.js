// Document renderer shared by the editor preview and the share page.
// Markdown via marked; ```mermaid and ```excalidraw fences become SVG.
// mermaid and excalidraw are dynamically imported so they land in separate
// chunks and only load when a document actually uses them.
import { marked } from "marked";

window.EXCALIDRAW_ASSET_PATH = "/";

let mermaidPromise = null;
async function getMermaid() {
  mermaidPromise ??= import("mermaid").then((m) => {
    const mermaid = m.default;
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
    return mermaid;
  });
  return mermaidPromise;
}

let excalidrawPromise = null;
async function getExcalidraw() {
  excalidrawPromise ??= import("@excalidraw/excalidraw");
  return excalidrawPromise;
}

const FENCE_RE = /```(mermaid|excalidraw)[^\S\n]*\n([\s\S]*?)```/g;
let renderSeq = 0;

// Renders markdown into `container`, then asynchronously replaces diagram
// placeholders with rendered SVG.
export async function renderDocument(container, markdown) {
  const blocks = [];
  const source = (markdown ?? "").replace(FENCE_RE, (match, lang, code) => {
    blocks.push({ lang, code });
    return `\n<div class="diagram" data-block="${blocks.length - 1}"></div>\n`;
  });

  container.innerHTML = marked.parse(source);

  const jobs = [...container.querySelectorAll(".diagram[data-block]")].map(async (el) => {
    const { lang, code } = blocks[Number(el.dataset.block)];
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
          appState: { exportBackground: false, ...(scene.appState ?? {}) },
          files: scene.files ?? null,
        });
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        el.replaceChildren(svg);
      }
    } catch (err) {
      el.classList.add("diagram-error");
      el.textContent = `Failed to render ${lang} block: ${err.message ?? err}`;
    }
  });
  await Promise.allSettled(jobs);
}
