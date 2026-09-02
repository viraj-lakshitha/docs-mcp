import { useState } from "react";
import { Dialog } from "../Dialog.jsx";
import { Button } from "../Button.jsx";
import { Field } from "../Field.jsx";
import { PlusIcon, XIcon } from "../Icons.jsx";

const COLUMN_TYPES = ["text", "number", "boolean", "date"];

// Multi-field table creation: name + description + a dynamic list of
// {name, type} columns. PromptDialog only handles a single input, so this
// is built directly on the Dialog primitive.
export function CreateTableDialog({ onSubmit, onClose }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState([{ name: "", type: "text" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const updateColumn = (i, patch) =>
    setColumns((cols) => cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addColumn = () => setColumns((cols) => [...cols, { name: "", type: "text" }]);
  const removeColumn = (i) => setColumns((cols) => cols.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!name.trim()) return;
    setError("");
    setBusy(true);
    try {
      const cleanColumns = columns.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), type: c.type }));
      await onSubmit({ name: name.trim(), description: description.trim() || undefined, columns: cleanColumns });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="New table"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={busy} onClick={submit}>Create</Button>
        </>
      }
    >
      <Field label="Name">
        {(id, className) => (
          <input id={id} className={className} placeholder="e.g. Contacts" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Description (optional)">
        {(id, className) => (
          <input id={id} className={className} value={description} onChange={(e) => setDescription(e.target.value)} />
        )}
      </Field>

      <div className="field">
        <label className="field__label">Columns</label>
        <div className="column-editor">
          {columns.map((col, i) => (
            <div className="column-editor-row" key={i}>
              <input
                className="input"
                placeholder="Column name"
                value={col.name}
                onChange={(e) => updateColumn(i, { name: e.target.value })}
              />
              <select className="input" value={col.type} onChange={(e) => updateColumn(i, { type: e.target.value })}>
                {COLUMN_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <Button variant="bare" size="sm" title="Remove column" onClick={() => removeColumn(i)} disabled={columns.length === 1}>
                <XIcon size={14} />
              </Button>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={addColumn}><PlusIcon size={14} /> Add column</Button>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
    </Dialog>
  );
}
