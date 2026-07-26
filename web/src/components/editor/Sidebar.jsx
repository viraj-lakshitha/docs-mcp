import { useRef } from "react";
import { Brand } from "../Brand.jsx";
import { Button } from "../Button.jsx";
import { PlusIcon, XIcon } from "../Icons.jsx";

export function Sidebar({
  me,
  docs,
  assets,
  currentId,
  onNewDoc,
  onOpenDoc,
  onUploadAsset,
  onInsertAsset,
  onDeleteAsset,
  onLogout,
}) {
  const fileRef = useRef(null);
  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <Brand as="h1" />
        <Button variant="primary" title="New document" onClick={onNewDoc}>
          <PlusIcon /> New
        </Button>
      </header>

      <ul className="doc-list">
        {docs.map((doc) => (
          <li key={doc.id} className={doc.id === currentId ? "active" : ""} onClick={() => onOpenDoc(doc.id)}>
            <span className="title">{doc.title}</span>
            <span className="meta">{new Date(doc.updated_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>

      <div className="assets-section">
        <h2 className="sidebar__section-title">
          Assets
          <Button size="sm" onClick={() => fileRef.current?.click()}>Upload</Button>
        </h2>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) onUploadAsset(file);
            e.target.value = "";
          }}
        />
        <ul className="asset-list">
          {assets.map((asset) => (
            <li key={asset.id}>
              <a className="name" href={asset.url} target="_blank" rel="noopener noreferrer">
                {asset.filename}
              </a>
              <Button size="sm" title="Insert markdown reference at cursor" onClick={() => onInsertAsset(asset)}>
                Insert
              </Button>
              <Button size="sm" variant="danger" title="Delete asset" onClick={() => onDeleteAsset(asset)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="account-section">
        <div className="account-bar">
          <span className="user-email" title={me?.email}>{me?.email}</span>
          <Button size="sm" onClick={onLogout}>Log out</Button>
        </div>
      </div>
    </aside>
  );
}
