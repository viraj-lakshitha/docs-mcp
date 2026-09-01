import { useState } from "react";
import type { AddColumnRequest, ColumnType } from "../../../../shared/types.ts";
import { Dialog } from "../Dialog.tsx";
import { Button } from "../Button.tsx";
import { Field } from "../Field.tsx";

const COLUMN_TYPES: ColumnType[] = ["text", "number", "boolean", "date"];

export function AddColumnDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (req: AddColumnRequest) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setError("");
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), type });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add column"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={busy} onClick={submit}>Add</Button>
        </>
      }
    >
      <Field label="Name">
        {(id, className) => (
          <input id={id} className={className} value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        )}
      </Field>
      <Field label="Type">
        {(id, className) => (
          <select id={id} className={className} value={type} onChange={(e) => setType(e.target.value as ColumnType)}>
            {COLUMN_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </Field>
      {error && <div className="alert" role="alert">{error}</div>}
    </Dialog>
  );
}
