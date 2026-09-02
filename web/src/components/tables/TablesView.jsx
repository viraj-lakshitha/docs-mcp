import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.js";
import { isMobile } from "../../breakpoints.js";
import { Button } from "../Button.jsx";
import { ConfirmDialog } from "../Dialog.jsx";
import { ListIcon, TableIcon } from "../Icons.jsx";
import { TableList } from "./TableList.jsx";
import { TableGridPane } from "./TableGridPane.jsx";
import { CreateTableDialog } from "./CreateTableDialog.jsx";
import { AddColumnDialog } from "./AddColumnDialog.jsx";
import { CsvImportDialog } from "./CsvImportDialog.jsx";

const ROW_PAGE_SIZE = 50;

const SUBVIEWS = [
  { key: "list", label: "List", Icon: ListIcon },
  { key: "grid", label: "Table", Icon: TableIcon },
];

// The Tables section: table list + a selected table's editable row grid.
// Mirrors NotesView's list+detail split (full-bleed, one pane at a time on
// mobile) rather than Attachments' centered Card-list, since a spreadsheet
// grid needs the width.
export function TablesView() {
  const [tables, setTables] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [currentTable, setCurrentTable] = useState(null); // includes .columns
  const [name, setName] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [subview, setSubview] = useState("list");
  const [dialog, setDialog] = useState(null); // {type, ...payload}

  const refreshTables = useCallback(async () => setTables(await api("GET", "/api/tables")), []);

  const refreshRows = useCallback(async (tableId, off) => {
    const result = await api("GET", `/api/tables/${tableId}/rows?limit=${ROW_PAGE_SIZE}&offset=${off}`);
    setRows(result.rows);
    setTotal(result.total);
  }, []);

  const openTable = useCallback(async (id) => {
    const table = await api("GET", `/api/tables/${id}`);
    setCurrentId(table.id);
    setCurrentTable(table);
    setName(table.name);
    setOffset(0);
    await refreshRows(table.id, 0);
    if (isMobile()) setSubview("grid");
  }, [refreshRows]);

  useEffect(() => { refreshTables(); }, [refreshTables]);

  const createTable = async ({ name: newName, description, columns }) => {
    const table = await api("POST", "/api/tables", { name: newName, description });
    for (const col of columns) await api("POST", `/api/tables/${table.id}/columns`, col);
    await refreshTables();
    openTable(table.id);
  };

  const saveName = async () => {
    if (!currentId) return;
    const table = await api("PATCH", `/api/tables/${currentId}`, { name });
    setCurrentTable((t) => ({ ...t, name: table.name }));
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
    refreshRows(currentId, offset);
    refreshTables();
  };

  const updateCell = async (rowId, columnId, value) => {
    await api("PATCH", `/api/tables/${currentId}/rows/${rowId}`, { data: { [columnId]: value } });
  };

  const deleteRow = async (rowId) => {
    await api("DELETE", `/api/tables/${currentId}/rows/${rowId}`);
    refreshRows(currentId, offset);
    refreshTables();
  };

  const addColumn = async ({ name: colName, type }) => {
    await api("POST", `/api/tables/${currentId}/columns`, { name: colName, type });
    const table = await api("GET", `/api/tables/${currentId}`);
    setCurrentTable(table);
  };

  const deleteColumn = async (columnId) => {
    await api("DELETE", `/api/tables/${currentId}/columns/${columnId}`);
    const table = await api("GET", `/api/tables/${currentId}`);
    setCurrentTable(table);
    refreshRows(currentId, offset);
    refreshTables();
  };

  const changePage = (newOffset) => {
    setOffset(newOffset);
    refreshRows(currentId, newOffset);
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
          tableId={currentId}
          columns={currentTable?.columns ?? []}
          onImported={() => { refreshRows(currentId, offset); refreshTables(); }}
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
