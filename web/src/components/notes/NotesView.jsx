import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { isMobile } from "../../breakpoints.js";
import { Button } from "../Button.jsx";
import { ConfirmDialog, PromptDialog, ShareLinkDialog } from "../Dialog.jsx";
import { ListIcon, EditIcon, EyeIcon } from "../Icons.jsx";
import { DocList } from "./DocList.jsx";
import { PreviewPane } from "./PreviewPane.jsx";

const SUBVIEWS = [
  { key: "list", label: "List", Icon: ListIcon },
  { key: "edit", label: "Edit", Icon: EditIcon },
  { key: "preview", label: "Preview", Icon: EyeIcon },
];

// The Notes section: document list + editor + live preview. On mobile only
// one pane shows at a time, switched with the segmented control below the
// top bar; on desktop all three render side by side.
export function NotesView() {
  const [docs, setDocs] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [subview, setSubview] = useState("list");
  const [dialog, setDialog] = useState(null); // {type, ...payload}
  const contentRef = useRef(null);
  const statusTimer = useRef(null);

  const flash = useCallback((text) => {
    setStatus(text);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 4000);
  }, []);

  const refreshDocs = useCallback(async () => setDocs(await api("GET", "/api/documents")), []);

  const loadDocument = useCallback(async (id) => {
    try {
      const doc = await api("GET", `/api/documents/${id}`);
      setCurrentId(doc.id);
      setTitle(doc.title);
      setContent(doc.content);
      setDirty(false);
      location.hash = doc.id;
      if (isMobile()) setSubview("edit");
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
      await refreshDocs();
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
    if (isMobile()) setSubview("list");
  };

  const share = async () => {
    const shareLink = await api("POST", `/api/documents/${currentId}/share`);
    setDialog({ type: "share", url: shareLink.url });
  };

  return (
    <div className="notes-view" data-subview={subview}>
      <nav className="notes-subnav" aria-label="Notes views">
        {SUBVIEWS.map(({ key, label, Icon }) => (
          <Button key={key} active={subview === key} onClick={() => setSubview(key)}>
            <Icon size={16} /> {label}
          </Button>
        ))}
      </nav>

      <DocList docs={docs} currentId={currentId} onOpenDoc={openDocument} onNewDoc={() => setDialog({ type: "new" })} />

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
        <PreviewPane markdown={content} active={currentId !== null} view={subview} />
      </section>

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
      {dialog?.type === "share" && <ShareLinkDialog url={dialog.url} onClose={() => setDialog(null)} />}
    </div>
  );
}
