// Shared document renderer used by the editor preview and the share page.
// Markdown via marked; ```mermaid fences via mermaid; ```excalidraw fences
// (scene JSON) via Excalidraw's exportToSvg.
// All libraries are served locally from /vendor (see web-server.js), so the
// app has no CDN dependency.
import { marked } from "/vendor/marked.esm.js";
import mermaid from "/vendor/mermaid/mermaid.esm.min.mjs";

mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });

// Excalidraw ships as a UMD bundle that expects React globals, so load the
// three scripts in order the first time a scene needs rendering.
window.EXCALIDRAW_ASSET_PATH = "/vendor/excalidraw/";
let excalidrawReady = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(s);
  });
}
async function loadExcalidraw() {
  excalidrawReady ??= (async () => {
    await loadScript("/vendor/react.js");
    await loadScript("/vendor/react-dom.js");
    await loadScript("/vendor/excalidraw/excalidraw.production.min.js");
    return window.ExcalidrawLib;
  })();
  return excalidrawReady;
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
        const { svg } = await mermaid.render(`mmd-${++renderSeq}`, code);
        el.innerHTML = svg;
      } else {
        const { exportToSvg } = await loadExcalidraw();
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
