import type { DocumentSummary } from "../../../../shared/types.ts";
import { Button } from "../Button.tsx";
import { PlusIcon } from "../Icons.tsx";
import { EmptyState } from "../EmptyState.tsx";

// Document list column: header (+ New) and the list itself.
export function DocList({
  docs,
  currentId,
  onOpenDoc,
  onNewDoc,
}: {
  docs: DocumentSummary[];
  currentId: string | null;
  onOpenDoc: (id: string) => void;
  onNewDoc: () => void;
}) {
  return (
    <div className="notes-doclist">
      <header className="notes-doclist__header">
        <h2 className="notes-doclist__title">Notes</h2>
        <Button variant="primary" size="sm" title="New document" onClick={onNewDoc}>
          <PlusIcon size={14} /> New
        </Button>
      </header>
      <ul className="doc-list">
        {docs.map((doc) => (
          <li key={doc.id} className={doc.id === currentId ? "active" : ""} onClick={() => onOpenDoc(doc.id)}>
            <span className="title">{doc.title}</span>
            <span className="meta">{new Date(doc.updated_at).toLocaleString()}</span>
          </li>
        ))}
        {docs.length === 0 && <EmptyState>No documents yet — create your first one.</EmptyState>}
      </ul>
    </div>
  );
}
