import type { DataTableSummary } from "../../../../shared/types.ts";
import { Button } from "../Button.tsx";
import { PlusIcon } from "../Icons.tsx";
import { EmptyState } from "../EmptyState.tsx";

// Table list column: header (+ New / Import CSV) and the list itself.
export function TableList({
  tables,
  currentId,
  onOpenTable,
  onNewTable,
  onImportCsv,
}: {
  tables: DataTableSummary[];
  currentId: string | null;
  onOpenTable: (id: string) => void;
  onNewTable: () => void;
  onImportCsv: () => void;
}) {
  return (
    <div className="notes-doclist">
      <header className="notes-doclist__header">
        <h2 className="notes-doclist__title">Tables</h2>
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          <Button size="sm" title="Create a table from a CSV file" onClick={onImportCsv}>Import CSV</Button>
          <Button variant="primary" size="sm" title="New table" onClick={onNewTable}>
            <PlusIcon size={14} /> New
          </Button>
        </div>
      </header>
      <ul className="doc-list">
        {tables.map((table) => (
          <li key={table.id} className={table.id === currentId ? "active" : ""} onClick={() => onOpenTable(table.id)}>
            <span className="title">{table.name}</span>
            <span className="meta">
              {table.column_count} column{String(table.column_count) === "1" ? "" : "s"} ·{" "}
              {table.row_count} row{String(table.row_count) === "1" ? "" : "s"}
            </span>
          </li>
        ))}
        {tables.length === 0 && <EmptyState>No tables yet — create your first one.</EmptyState>}
      </ul>
    </div>
  );
}
