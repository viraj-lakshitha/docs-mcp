import { useRef, useState, type ChangeEvent } from "react";
import { api } from "../../api.ts";
import type {
  CreateTableFromCsvResponse,
  DataTable,
  ImportPreviewResponse,
  ImportRowsResponse,
  TableColumn,
} from "../../../../shared/types.ts";
import { Dialog } from "../Dialog.tsx";
import { Button } from "../Button.tsx";
import { Field } from "../Field.tsx";

type Step = "pick" | "map" | "done";
type ImportResultView = CreateTableFromCsvResponse | ImportRowsResponse;

// CSV upload, two modes:
//  - tableId omitted: create a new table from the CSV (name + auto-detected columns)
//  - tableId set: import rows into an existing table via a column-mapping step
export function CsvImportDialog({
  tableId,
  columns,
  onImported,
  onClose,
}: {
  tableId?: string;
  columns: TableColumn[];
  onImported: (table: DataTable | null) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("pick"); // pick -> map (existing-table mode only) -> done
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // csvHeader -> columnId
  const [result, setResult] = useState<ImportResultView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = () => fileRef.current?.click();

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    if (!name) setName(file.name.replace(/\.csv$/i, ""));

    if (tableId) {
      setBusy(true);
      setError("");
      try {
        const p = await api<ImportPreviewResponse>(
          "POST",
          `/api/tables/${tableId}/rows/import/preview`,
          { csv: text, hasHeaderRow }
        );
        setPreview(p);
        const initialMapping: Record<string, string> = {};
        for (const header of p.headers) {
          const match = columns.find((c) => c.name.toLowerCase() === header.toLowerCase());
          if (match) initialMapping[header] = match.id;
        }
        setMapping(initialMapping);
        setStep("map");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }
  };

  const submitCreate = async () => {
    if (!name.trim() || !csv) return;
    setError("");
    setBusy(true);
    try {
      const res = await api<CreateTableFromCsvResponse>("POST", "/api/tables/import", { name: name.trim(), csv, hasHeaderRow });
      setResult(res);
      setStep("done");
      onImported(res.table);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitImport = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api<ImportRowsResponse>(
        "POST",
        `/api/tables/${tableId}/rows/import`,
        { csv, hasHeaderRow, columnMapping: mapping }
      );
      setResult(res);
      setStep("done");
      onImported(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={tableId ? "Import CSV rows" : "Create table from CSV"}
      onClose={onClose}
      actions={
        step === "done" ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : step === "map" ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={submitImport}>Import {preview?.rowCount} row(s)</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            {!tableId && (
              <Button variant="primary" disabled={!csv || !name.trim()} loading={busy} onClick={submitCreate}>Create table</Button>
            )}
          </>
        )
      }
    >
      {step === "pick" && (
        <>
          {!tableId && (
            <Field label="Table name">
              {(id, className) => (
                <input id={id} className={className} value={name} onChange={(e) => setName(e.target.value)} />
              )}
            </Field>
          )}
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-2)" }}>
            <input type="checkbox" checked={hasHeaderRow} onChange={(e) => setHasHeaderRow(e.target.checked)} />
            First row is a header
          </label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFileChange} />
          <Button onClick={pickFile} loading={busy}>{fileName || "Choose CSV file…"}</Button>
          <p className="field__hint" style={{ margin: 0 }}>Up to 2MB / 5,000 rows.</p>
        </>
      )}

      {step === "map" && preview && (
        <>
          <p style={{ margin: 0 }}>Match each CSV column to a table column, or leave it unmatched to skip it.</p>
          <div className="column-editor">
            {preview.headers.map((header) => (
              <div className="column-editor-row" key={header}>
                <span style={{ flex: 1 }}>{header}</span>
                <select
                  className="input"
                  value={mapping[header] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                >
                  <option value="">— skip —</option>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {step === "done" && result && (
        <>
          <p style={{ margin: 0 }}>Imported {result.imported} row(s).</p>
          {result.errors.length > 0 && (
            <div className="alert" role="alert">
              {result.errors.length} cell(s) couldn't be coerced and were left blank:
              <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "1.2em" }}>
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>row {e.row}, {e.column}: {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {error && <div className="alert" role="alert">{error}</div>}
    </Dialog>
  );
}
