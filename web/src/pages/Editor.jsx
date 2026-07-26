import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { renderDocument } from "../render.js";
import { BrandIcon } from "./Login.jsx";

const isMobile = () => matchMedia("(max-width: 900px)").matches;

export default function Editor() {
  const [me, setMe] = useState(null);
  const [docs, setDocs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("docs");
  const contentRef = useRef(null);
  const fileRef = useRef(null);
  const statusTimer = useRef(null);

  const flash = useCallback((text) => {
    setStatus(text);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 4000);
  }, []);

  // The mobile tab bar CSS keys off body[data-view].
  useEffect(() => {
    document.body.dataset.view = view;
  }, [view]);

  const refreshDocs = useCallback(async () => setDocs(await api("GET", "/api/documents")), []);
  const refreshAssets = useCallback(async () => setAssets(await api("GET", "/api/assets")), []);

  const openDocument = useCallback(async (id, { confirmDiscard = true } = {}) => {
    if (confirmDiscard && dirty && !confirm("Discard unsaved changes?")) return;
    try {
      const doc = await api("GET", `/api/documents/${id}`);
      setCurrentId(doc.id);
      setTitle(doc.title);
      setContent(doc.content);
      setDirty(false);
      location.hash = doc.id;
      if (isMobile()) setView("edit");
    } catch (err) {
      flash(err.message);
    }
  }, [dirty, flash]);

  useEffect(() => {
    (async () => {
      const user = await api("GET", "/api/auth/me");
      setMe(user);
      await Promise.all([refreshDocs(), refreshAssets()]);
      if (location.hash.length > 1) openDocument(location.hash.slice(1), { confirmDiscard: false });
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    if (!currentId) return;
    await api("PUT", `/api/documents/${currentId}`, { title, content });
    setDirty(false);
    flash("Saved");
    refreshDocs();
  }, [currentId, title, content, flash, refreshDocs]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save]);

  const createDoc = async () => {
    const docTitle = prompt("Document title", "Untitled");
    if (!docTitle) return;
    const doc = await api("POST", "/api/documents", { title: docTitle, content: "" });
    await refreshDocs();
    openDocument(doc.id);
  };

  const deleteDoc = async () => {
    if (!currentId || !confirm("Delete this document and its share links?")) return;
    await api("DELETE", `/api/documents/${currentId}`);
    setCurrentId(null);
    setTitle("");
    setContent("");
    setDirty(false);
    location.hash = "";
    refreshDocs();
    if (isMobile()) setView("docs");
  };

  const share = async () => {
    if (!currentId) return;
    const shareLink = await api("POST", `/api/documents/${currentId}/share`);
    await navigator.clipboard?.writeText(shareLink.url).catch(() => {});
    prompt("View-only link (copied to clipboard):", shareLink.url);
  };

  const logout = async () => {
    await api("POST", "/api/auth/logout");
    location.href = "/login";
  };

  const uploadAsset = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    await api("POST", "/api/assets", {
      filename: file.name,
      mime: file.type || "application/octet-stream",
      data: btoa(binary),
    });
    flash(`Uploaded ${file.name}`);
    refreshAssets();
  };

  const insertAtCursor = (text) => {
    const el = contentRef.current;
    if (!el || !currentId) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    setDirty(true);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    });
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1 className="brand">
            Notes <span className="brand-sub">by Optiq Labs</span>
          </h1>
          <button className="primary" title="New document" onClick={createDoc}>＋ New</button>
        </header>
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.id} className={doc.id === currentId ? "active" : ""} onClick={() => openDocument(doc.id)}>
              <span className="title">{doc.title}</span>
              <span className="meta">{new Date(doc.updated_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <div className="assets-section">
          <h2>
            Assets{" "}
            <button style={{ float: "right" }} onClick={() => fileRef.current?.click()}>Upload</button>
          </h2>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) uploadAsset(file);
              e.target.value = "";
            }}
          />
          <ul className="asset-list">
            {assets.map((asset) => (
              <li key={asset.id}>
                <a className="name" href={asset.url} target="_blank" rel="noopener noreferrer">{asset.filename}</a>
                <button
                  title="Insert markdown reference at cursor"
                  onClick={() =>
                    insertAtCursor(
                      asset.mime.startsWith("image/")
                        ? `![${asset.filename}](${asset.url})`
                        : `[${asset.filename}](${asset.url})`
                    )
                  }
                >
                  Insert
                </button>
                <button
                  title="Delete asset"
                  onClick={async () => {
                    if (!confirm(`Delete asset ${asset.filename}?`)) return;
                    await api("DELETE", `/api/assets/${asset.id}`);
                    refreshAssets();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="account-section">
          <div className="account-bar">
            <span className="user-email" title={me?.email}>{me?.email}</span>
            <button onClick={logout}>Log out</button>
          </div>
        </div>
      </aside>

      <section className="editor-pane">
        <div className="pane-header">
          <input
            type="text"
            placeholder="Title"
            value={title}
            disabled={!currentId}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          />
          <button className="primary" disabled={!currentId} onClick={save}>Save</button>
          <button disabled={!currentId} onClick={deleteDoc}>Delete</button>
        </div>
        <textarea
          id="content"
          ref={contentRef}
          placeholder="Write markdown here — use ```mermaid and ```excalidraw fences for diagrams."
          value={content}
          disabled={!currentId}
          onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        />
      </section>

      <section className="preview-pane">
        <div className="pane-header">
          <span>Preview</span>
          <span id="status">{status}</span>
          <button disabled={!currentId} onClick={share}>Share view-only</button>
        </div>
        <Preview markdown={content} active={currentId !== null} view={view} />
      </section>

      <nav className="mobile-nav" aria-label="Views">
        {[
          ["docs", "Docs", <DocsIcon key="i" />],
          ["edit", "Edit", <EditIcon key="i" />],
          ["preview", "Preview", <PreviewIcon key="i" />],
        ].map(([key, label, icon]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Preview({ markdown, active, view }) {
  const ref = useRef(null);

  // Debounced re-render on edits; immediate re-render when the mobile
  // Preview tab activates (diagrams can't be measured while hidden).
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => renderDocument(ref.current, markdown), view === "preview" ? 0 : 350);
    return () => clearTimeout(timer);
  }, [markdown, active, view]);

  return active ? (
    <div ref={ref} className="rendered" />
  ) : (
    <div className="rendered">
      <div className="empty-state">Select or create a document to get started.</div>
    </div>
  );
}

function DocsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function PreviewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}
