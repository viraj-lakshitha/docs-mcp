import type { TableColumn, TableRow } from "../../../../shared/types.ts";
import { XIcon } from "../Icons.tsx";
import { EmptyState } from "../EmptyState.tsx";

const asDateInputValue = (v: unknown): string => (typeof v === "string" ? v.slice(0, 10) : "");

// Plain HTML table with per-cell inputs matched to each column's type,
// saved on blur (checkboxes save immediately). Deliberately simple — no
// virtualization or keyboard nav — pagination keeps the DOM size bounded.
export function RowGrid({
  columns,
  rows,
  onUpdateCell,
  onDeleteRow,
  onDeleteColumn,
}: {
  columns: TableColumn[];
  rows: TableRow[];
  onUpdateCell: (rowId: string, columnId: string, value: string | number | boolean | null) => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteColumn: (columnId: string) => void;
}) {
  if (columns.length === 0) {
    return <EmptyState>Add a column to start entering data.</EmptyState>;
  }

  return (
    <div className="row-grid-wrap">
      <table className="row-grid">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.id}>
                {col.name}
                <span className="column-type-badge">{col.type}</span>
                <button
                  type="button"
                  className="btn btn--bare btn--sm"
                  title="Delete column"
                  onClick={() => onDeleteColumn(col.id)}
                  style={{ float: "right" }}
                >
                  <XIcon size={12} />
                </button>
              </th>
            ))}
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => {
                const value = row.data[col.id];
                if (col.type === "boolean") {
                  return (
                    <td key={col.id}>
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onUpdateCell(row.id, col.id, e.target.checked)}
                      />
                    </td>
                  );
                }
                if (col.type === "date") {
                  return (
                    <td key={col.id}>
                      <input
                        type="date"
                        defaultValue={asDateInputValue(value)}
                        onBlur={(e) => onUpdateCell(row.id, col.id, e.target.value || null)}
                      />
                    </td>
                  );
                }
                return (
                  <td key={col.id}>
                    <input
                      type={col.type === "number" ? "number" : "text"}
                      defaultValue={(value as string | number | undefined) ?? ""}
                      onBlur={(e) => {
                        const raw = e.target.value;
                        onUpdateCell(row.id, col.id, col.type === "number" ? (raw === "" ? null : Number(raw)) : raw);
                      }}
                    />
                  </td>
                );
              })}
              <td>
                <button type="button" className="btn btn--bare btn--sm" title="Delete row" onClick={() => onDeleteRow(row.id)}>
                  <XIcon size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState>No rows yet — add one to get started.</EmptyState>}
    </div>
  );
}
