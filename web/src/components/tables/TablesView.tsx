import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.ts";
import { isMobile } from "../../breakpoints.ts";
import type {
  AddColumnRequest,
  DataTable,
  DataTableSummary,
  DataTableWithColumns,
  RowsPage,
} from "../../../../shared/types.ts";
import { Button } from "../Button.tsx";
import { ConfirmDialog } from "../Dialog.tsx";
import { ListIcon, TableIcon } from "../Icons.tsx";
import { TableList } from "./TableList.tsx";
import { TableGridPane } from "./TableGridPane.tsx";
import { CreateTableDialog, type CreateTableSubmission } from "./CreateTableDialog.tsx";
import { AddColumnDialog } from "./AddColumnDialog.tsx";
import { CsvImportDialog } from "./CsvImportDialog.tsx";

const ROW_PAGE_SIZE = 50;

const SUBVIEWS = [
  { key: "list", label: "List", Icon: ListIcon },
  { key: "grid", label: "Table", Icon: TableIcon },
] as const;

type DialogState =
  | { type: "new" }
  | { type: "import-csv-new" }
  | { type: "add-column" }
  | { type: "import-csv" }
  | { type: "delete-table" }
  | null;

// The Tables section: table list + a selected table's editable row grid.
// Mirrors NotesView's list+detail split (full-bleed, one pane at a time on
// mobile) rather than Attachments' centered Card-list, since a spreadsheet
// grid needs the width.
export function TablesView() {
  const [tables, setTables] = useState<DataTableSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentTable, setCurrentTable] = useState<DataTableWithColumns | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<RowsPage["rows"]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [subview, setSubview] = useState<(typeof SUBVIEWS)[number]["key"]>("list");
  const [dialog, setDialog] = useState<DialogState>(null);

  const refreshTables = useCallback(async () => setTables(await api<DataTableSummary[]>("GET", "/api/tables")), []);

  const refreshRows = useCallback(async (tableId: string, off: number) => {
    const result = await api<RowsPage>("GET", `/api/tables/${tableId}/rows?limit=${ROW_PAGE_SIZE}&offset=${off}`);
    setRows(result.rows);
    setTotal(result.total);
  }, []);

  const openTable = useCallback(
    async (id: string) => {
      const table = await api<DataTableWithColumns>("GET", `/api/tables/${id}`);
      setCurrentId(table.id);
      setCurrentTable(table);
      setName(table.name);
      setOffset(0);
      await refreshRows(table.id, 0);
      if (isMobile()) setSubview("grid");
    },
    [refreshRows]
  );

  useEffect(() => { refreshTables(); }, [refreshTables]);

  const createTable = async ({ name: newName, description, columns }: CreateTableSubmission) => {
    const table = await api<DataTable>("POST", "/api/tables", { name: newName, description });
    for (const col of columns) await api("POST", `/api/tables/${table.id}/columns`, col);
    await refreshTables();
    openTable(table.id);
  };

  const saveName = async () => {
    if (!currentId) return;
    const table = await api<DataTable>("PATCH", `/api/tables/${currentId}`, { name });
    setCurrentTable((t) => (t ? { ...t, name: table.name } : t));
    refreshTables();
  };

  const deleteTable = async () => {
    await api("DELETE", `/api/tables/${currentId}`);
    setCurrentId(null);
    setCurrentTable(null);
    setRows([]);
    setTotal(0);
    refreshTables();
    if (isMobile()) setSubview("list");
  };

  const addRow = async () => {
    await api("POST", `/api/tables/${currentId}/rows`, { data: {} });
    refreshRows(currentId!, offset);
    refreshTables();
  };

  const updateCell = async (rowId: string, columnId: string, value: string | number | boolean | null) => {
    await api("PATCH", `/api/tables/${currentId}/rows/${rowId}`, { data: { [columnId]: value } });
  };

  const deleteRow = async (rowId: string) => {
    await api("DELETE", `/api/tables/${currentId}/rows/${rowId}`);
    refreshRows(currentId!, offset);
    refreshTables();
  };

  const addColumn = async ({ name: colName, type }: AddColumnRequest) => {
    await api("POST", `/api/tables/${currentId}/columns`, { name: colName, type });
    const table = await api<DataTableWithColumns>("GET", `/api/tables/${currentId}`);
    setCurrentTable(table);
  };

  const deleteColumn = async (columnId: string) => {
    await api("DELETE", `/api/tables/${currentId}/columns/${columnId}`);
    const table = await api<DataTableWithColumns>("GET", `/api/tables/${currentId}`);
    setCurrentTable(table);
    refreshRows(currentId!, offset);
    refreshTables();
  };

  const changePage = (newOffset: number) => {
    setOffset(newOffset);
    refreshRows(currentId!, newOffset);
  };

  return (
    <div className="tables-view" data-subview={subview}>
      <nav className="notes-subnav" aria-label="Tables views">
        {SUBVIEWS.map(({ key, label, Icon }) => (
          <Button key={key} active={subview === key} onClick={() => setSubview(key)}>
            <Icon size={16} /> {label}
          </Button>
        ))}
      </nav>

      <TableList
        tables={tables}
        currentId={currentId}
        onOpenTable={openTable}
        onNewTable={() => setDialog({ type: "new" })}
        onImportCsv={() => setDialog({ type: "import-csv-new" })}
      />

      <TableGridPane
        table={currentTable}
        name={name}
        onNameChange={setName}
        onSaveName={saveName}
        rows={rows}
        total={total}
        offset={offset}
        onPageChange={changePage}
        onAddRow={addRow}
        onUpdateCell={updateCell}
        onDeleteRow={deleteRow}
        onAddColumn={() => setDialog({ type: "add-column" })}
        onDeleteColumn={deleteColumn}
        onImportCsv={() => setDialog({ type: "import-csv" })}
        onDeleteTable={() => setDialog({ type: "delete-table" })}
      />

      {dialog?.type === "new" && <CreateTableDialog onSubmit={createTable} onClose={() => setDialog(null)} />}
      {dialog?.type === "import-csv-new" && (
        <CsvImportDialog
          columns={[]}
          onImported={async (table) => {
            await refreshTables();
            if (table) openTable(table.id);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "add-column" && <AddColumnDialog onSubmit={addColumn} onClose={() => setDialog(null)} />}
      {dialog?.type === "import-csv" && (
        <CsvImportDialog
          tableId={currentId!}
          columns={currentTable?.columns ?? []}
          onImported={() => { refreshRows(currentId!, offset); refreshTables(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete-table" && (
        <ConfirmDialog
          title="Delete table?"
          message={`"${currentTable?.name}" and all of its rows will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={deleteTable}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
