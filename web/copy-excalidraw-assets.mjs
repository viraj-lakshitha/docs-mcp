// Excalidraw's exportToSvg loads its fonts from EXCALIDRAW_ASSET_PATH at
// runtime; ship them with the build so rendering works offline.
import { cpSync } from "node:fs";
cpSync(
  "node_modules/@excalidraw/excalidraw/dist/excalidraw-assets",
  "../public/excalidraw-assets",
  { recursive: true }
);
console.log("excalidraw assets copied");
