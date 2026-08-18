import { Button } from "../Button.jsx";
import { PlusIcon } from "../Icons.jsx";
import { EmptyState } from "../EmptyState.jsx";
import { RowGrid } from "./RowGrid.jsx";

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
