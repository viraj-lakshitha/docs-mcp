import type { DataTableWithColumns, TableRow } from "../../../../shared/types.ts";
import { Button } from "../Button.tsx";
import { PlusIcon } from "../Icons.tsx";
import { EmptyState } from "../EmptyState.tsx";
import { RowGrid } from "./RowGrid.tsx";

const ROW_PAGE_SIZE = 50;

export function TableGridPane({
  table,
  name,
  onNameChange,
  onSaveName,
  rows,
  total,
  offset,
  onPageChange,
  onAddRow,
  onUpdateCell,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onImportCsv,
  onDeleteTable,
}: {
  table: DataTableWithColumns | null;
  name: string;
  onNameChange: (name: string) => void;
  onSaveName: () => void;
  rows: TableRow[];
  total: number;
  offset: number;
  onPageChange: (offset: number) => void;
  onAddRow: () => void;
  onUpdateCell: (rowId: string, columnId: string, value: string | number | boolean | null) => void;
  onDeleteRow: (rowId: string) => void;
  onAddColumn: () => void;
  onDeleteColumn: (columnId: string) => void;
  onImportCsv: () => void;
  onDeleteTable: () => void;
}) {
  if (!table) {
    return (
      <section className="table-grid-pane">
        <EmptyState>Select a table, or create a new one.</EmptyState>
      </section>
    );
  }

  const hasMore = offset + rows.length < total;
  const hasPrev = offset > 0;

  return (
    <section className="table-grid-pane">
      <div className="pane-header">
        <input
          className="input"
          type="text"
          placeholder="Table name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <Button variant="primary" onClick={onSaveName}>Save</Button>
        <Button onClick={onAddColumn}><PlusIcon size={14} /> Add column</Button>
        <Button onClick={onImportCsv}>Import CSV</Button>
        <span className="pane-header__spacer" />
        <Button variant="danger" onClick={onDeleteTable}>Delete</Button>
      </div>

      <RowGrid columns={table.columns} rows={rows} onUpdateCell={onUpdateCell} onDeleteRow={onDeleteRow} onDeleteColumn={onDeleteColumn} />

      <div className="tables-pager">
        <Button size="sm" onClick={onAddRow}><PlusIcon size={14} /> Add row</Button>
        <span className="pane-header__spacer" />
        <span className="status-chip">
          {total === 0 ? "0 rows" : `${offset + 1}-${offset + rows.length} of ${total}`}
        </span>
        <Button size="sm" disabled={!hasPrev} onClick={() => onPageChange(Math.max(0, offset - ROW_PAGE_SIZE))}>Prev</Button>
        <Button size="sm" disabled={!hasMore} onClick={() => onPageChange(offset + ROW_PAGE_SIZE)}>Next</Button>
      </div>
    </section>
  );
}
