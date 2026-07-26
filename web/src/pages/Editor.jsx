import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { isMobile } from "../breakpoints.js";
import { Button } from "../components/Button.jsx";
import { ConfirmDialog, PromptDialog, ShareLinkDialog } from "../components/Dialog.jsx";
import { Sidebar } from "../components/editor/Sidebar.jsx";
import { MobileNav } from "../components/editor/MobileNav.jsx";
import { PreviewPane } from "../components/editor/PreviewPane.jsx";

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
  const [dialog, setDialog] = useState(null); // {type, ...payload}
  const contentRef = useRef(null);
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

  const loadDocument = useCallback(async (id) => {
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
  }, [flash]);

  const openDocument = useCallback((id) => {
    if (dirty && id !== currentId) {
      setDialog({ type: "discard", id });
    } else {
      loadDocument(id);
    }
  }, [dirty, currentId, loadDocument]);

  useEffect(() => {
    (async () => {
      const user = await api("GET", "/api/auth/me");
      setMe(user);
      await Promise.all([refreshDocs(), refreshAssets()]);
      if (location.hash.length > 1) loadDocument(location.hash.slice(1));
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

  const createDoc = async (docTitle) => {
    const doc = await api("POST", "/api/documents", { title: docTitle, content: "" });
    await refreshDocs();
    loadDocument(doc.id);
  };

  const deleteDoc = async () => {
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
    const shareLink = await api("POST", `/api/documents/${currentId}/share`);
    setDialog({ type: "share", url: shareLink.url });
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

  const insertAsset = (asset) => {
    const el = contentRef.current;
    if (!el || !currentId) return;
    const text = asset.mime.startsWith("image/")
      ? `![${asset.filename}](${asset.url})`
      : `[${asset.filename}](${asset.url})`;
    const { selectionStart: start, selectionEnd: end } = el;
    setContent(content.slice(0, start) + text + content.slice(end));
    setDirty(true);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    });
  };

  return (
    <div className="app">
      <Sidebar
        me={me}
        docs={docs}
        assets={assets}
        currentId={currentId}
        onNewDoc={() => setDialog({ type: "new" })}
        onOpenDoc={openDocument}
        onUploadAsset={uploadAsset}
        onInsertAsset={insertAsset}
        onDeleteAsset={(asset) => setDialog({ type: "delete-asset", asset })}
        onLogout={logout}
      />

      <section className="editor-pane">
        <div className="pane-header">
          <input
            className="input"
            type="text"
            placeholder="Title"
            value={title}
            disabled={!currentId}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          />
          <Button variant="primary" disabled={!currentId} onClick={save}>Save</Button>
          <Button variant="danger" disabled={!currentId} onClick={() => setDialog({ type: "delete-doc" })}>
            Delete
          </Button>
        </div>
        <textarea
          className="editor-textarea"
          ref={contentRef}
          placeholder="Write markdown here — use ```mermaid and ```excalidraw fences for diagrams."
          value={content}
          disabled={!currentId}
          onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        />
      </section>

      <section className="preview-pane">
        <div className="pane-header">
          <span className="pane-header__title">Preview</span>
          <span className="status-chip">{status}</span>
          <span className="pane-header__spacer" />
          <Button disabled={!currentId} onClick={share}>Share view-only</Button>
        </div>
        <PreviewPane markdown={content} active={currentId !== null} view={view} />
      </section>

      <MobileNav view={view} onChange={setView} />

      {dialog?.type === "new" && (
        <PromptDialog
          title="New document"
          label="Title"
          placeholder="Untitled"
          onSubmit={createDoc}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "discard" && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="This document has unsaved edits. Opening another document will lose them."
          confirmLabel="Discard changes"
          danger
          onConfirm={() => loadDocument(dialog.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete-doc" && (
        <ConfirmDialog
          title="Delete document?"
          message={`"${title}" and all of its share links will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteDoc}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete-asset" && (
        <ConfirmDialog
          title="Delete asset?"
          message={`"${dialog.asset.filename}" will be removed. Documents that embed it will show a broken link.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await api("DELETE", `/api/assets/${dialog.asset.id}`);
            refreshAssets();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "share" && <ShareLinkDialog url={dialog.url} onClose={() => setDialog(null)} />}
    </div>
  );
}
