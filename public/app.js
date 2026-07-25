// Editor UI: document list + markdown editor + live preview, asset uploads,
// and view-only share link creation. The URL hash tracks the open document.
import { renderDocument } from "/render.js";

const $ = (id) => document.getElementById(id);
const els = {
  docList: $("doc-list"),
  assetList: $("asset-list"),
  title: $("title"),
  content: $("content"),
  preview: $("preview"),
  status: $("status"),
  save: $("save"),
  del: $("delete-doc"),
  share: $("share"),
  newDoc: $("new-doc"),
  uploadBtn: $("upload-asset"),
  fileInput: $("asset-file"),
};

let currentId = null;
let dirty = false;
let previewTimer = null;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `${method} ${url} failed (${res.status})`);
  }
  return res.json();
}

function setStatus(text) {
  els.status.textContent = text;
  if (text) setTimeout(() => { if (els.status.textContent === text) els.status.textContent = ""; }, 4000);
}

// ---- documents ----

async function refreshDocList() {
  const docs = await api("GET", "/api/documents");
  els.docList.replaceChildren(
    ...docs.map((doc) => {
      const li = document.createElement("li");
      li.classList.toggle("active", doc.id === currentId);
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = doc.title;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = new Date(doc.updated_at).toLocaleString();
      li.append(title, meta);
      li.onclick = () => openDocument(doc.id);
      return li;
    })
  );
}

async function openDocument(id) {
  if (dirty && !confirm("Discard unsaved changes?")) return;
  try {
    const doc = await api("GET", `/api/documents/${id}`);
    currentId = doc.id;
    location.hash = doc.id;
    dirty = false;
    els.title.value = doc.title;
    els.content.value = doc.content;
    for (const el of [els.title, els.content]) el.disabled = false;
    for (const el of [els.save, els.del, els.share]) el.disabled = false;
    schedulePreview(0);
    refreshDocList();
  } catch (err) {
    setStatus(err.message);
  }
}

els.newDoc.onclick = async () => {
  const title = prompt("Document title", "Untitled");
  if (!title) return;
  const doc = await api("POST", "/api/documents", { title, content: "" });
  await openDocument(doc.id);
};

els.save.onclick = async () => {
  if (!currentId) return;
  await api("PUT", `/api/documents/${currentId}`, {
    title: els.title.value,
    content: els.content.value,
  });
  dirty = false;
  setStatus("Saved");
  refreshDocList();
};

els.del.onclick = async () => {
  if (!currentId || !confirm("Delete this document and its share links?")) return;
  await api("DELETE", `/api/documents/${currentId}`);
  currentId = null;
  location.hash = "";
  els.title.value = "";
  els.content.value = "";
  for (const el of [els.title, els.content]) el.disabled = true;
  for (const el of [els.save, els.del, els.share]) el.disabled = true;
  els.preview.innerHTML = '<div class="empty-state">Select or create a document to get started.</div>';
  refreshDocList();
};

els.share.onclick = async () => {
  if (!currentId) return;
  const share = await api("POST", `/api/documents/${currentId}/share`);
  await navigator.clipboard.writeText(share.url).catch(() => {});
  prompt("View-only link (copied to clipboard):", share.url);
};

// ---- editing & preview ----

function schedulePreview(delay = 350) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => renderDocument(els.preview, els.content.value), delay);
}

els.content.addEventListener("input", () => {
  dirty = true;
  schedulePreview();
});
els.title.addEventListener("input", () => { dirty = true; });

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    els.save.onclick();
  }
});

// ---- assets ----

async function refreshAssets() {
  const assets = await api("GET", "/api/assets");
  els.assetList.replaceChildren(
    ...assets.map((asset) => {
      const li = document.createElement("li");
      const name = document.createElement("a");
      name.className = "name";
      name.textContent = asset.filename;
      name.href = asset.url;
      name.target = "_blank";
      const insert = document.createElement("button");
      insert.textContent = "Insert";
      insert.title = "Insert markdown reference at cursor";
      insert.onclick = () => insertAtCursor(
        asset.mime.startsWith("image/")
          ? `![${asset.filename}](${asset.url})`
          : `[${asset.filename}](${asset.url})`
      );
      const del = document.createElement("button");
      del.textContent = "✕";
      del.title = "Delete asset";
      del.onclick = async () => {
        if (!confirm(`Delete asset ${asset.filename}?`)) return;
        await api("DELETE", `/api/assets/${asset.id}`);
        refreshAssets();
      };
      li.append(name, insert, del);
      return li;
    })
  );
}

function insertAtCursor(text) {
  if (els.content.disabled) return;
  const { selectionStart: start, selectionEnd: end, value } = els.content;
  els.content.value = value.slice(0, start) + text + value.slice(end);
  els.content.selectionStart = els.content.selectionEnd = start + text.length;
  els.content.focus();
  dirty = true;
  schedulePreview();
}

els.uploadBtn.onclick = () => els.fileInput.click();
els.fileInput.onchange = async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const data = btoa(binary);
  await api("POST", "/api/assets", {
    filename: file.name,
    mime: file.type || "application/octet-stream",
    data,
  });
  els.fileInput.value = "";
  setStatus(`Uploaded ${file.name}`);
  refreshAssets();
};

// ---- init ----

await refreshDocList();
await refreshAssets();
if (location.hash.length > 1) openDocument(location.hash.slice(1));
