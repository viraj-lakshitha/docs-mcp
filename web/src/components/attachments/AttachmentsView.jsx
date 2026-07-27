import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { Card } from "../Card.jsx";
import { Button } from "../Button.jsx";
import { EmptyState } from "../EmptyState.jsx";
import { ConfirmDialog } from "../Dialog.jsx";
import { PaperclipIcon, XIcon } from "../Icons.jsx";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsView() {
  const [assets, setAssets] = useState(null); // null = loading
  const [dialog, setDialog] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const refresh = () => api("GET", "/api/assets").then(setAssets);
  useEffect(() => { refresh(); }, []);

  const upload = async (file) => {
    setError("");
    setUploading(true);
    try {
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
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async (asset) => {
    const url = `${location.origin}${asset.url}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable — link is still shown via the Open action */
    }
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="page-view">
      <div className="page-view__inner">
        <h1 className="page-view__title">Attachments</h1>
        <Card
          title="All attachments"
          description="Images and files uploaded to your documents."
          actions={
            <>
              <input
                ref={fileRef}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
              <Button variant="primary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                Upload
              </Button>
            </>
          }
        >
          {error && <div className="alert" role="alert" style={{ marginBottom: "var(--space-4)" }}>{error}</div>}
          {assets === null ? (
            <EmptyState>Loading…</EmptyState>
          ) : assets.length === 0 ? (
            <EmptyState>No attachments yet — upload an image or file to embed in your notes.</EmptyState>
          ) : (
            <ul className="attachment-list">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <span className="attachment-icon" aria-hidden="true"><PaperclipIcon size={16} /></span>
                  <div className="attachment-info">
                    <a className="attachment-name" href={asset.url} target="_blank" rel="noopener noreferrer">
                      {asset.filename}
                    </a>
                    <span className="meta">
                      {asset.mime} · {formatSize(asset.size)} · {new Date(asset.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Button size="sm" onClick={() => copyLink(asset)}>
                    {copiedId === asset.id ? "Copied!" : "Copy link"}
                  </Button>
                  <Button size="sm" variant="danger" title="Delete" onClick={() => setDialog(asset)}>
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {dialog && (
        <ConfirmDialog
          title="Delete attachment?"
          message={`"${dialog.filename}" will be removed. Documents that embed it will show a broken link.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await api("DELETE", `/api/assets/${dialog.id}`);
            refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
