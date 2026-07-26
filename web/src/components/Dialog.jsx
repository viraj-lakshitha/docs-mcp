import { useEffect, useRef, useState } from "react";
import { Button } from "./Button.jsx";
import { Field } from "./Field.jsx";

// Modal dialog primitive: overlay + card, Escape/overlay-click to dismiss.
export function Dialog({ title, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        <div className="dialog__body">{children}</div>
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

// Confirmation dialog for destructive or lossy actions.
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onClose }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Dialog>
  );
}

// Single-text-input dialog (e.g. naming a new document).
export function PromptDialog({ title, label, placeholder, initialValue = "", submitLabel = "Create", onSubmit, onClose }) {
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    onClose();
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={submit}>{submitLabel}</Button>
        </>
      }
    >
      <Field label={label}>
        {(id, className) => (
          <input
            id={id}
            className={className}
            placeholder={placeholder}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        )}
      </Field>
    </Dialog>
  );
}

// Displays a freshly minted share link with a copy button.
export function ShareLinkDialog({ url, onClose }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Dialog
      title="View-only link created"
      onClose={onClose}
      actions={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <p style={{ margin: 0 }}>
        Anyone with this link can read the document but can’t edit it. You can revoke it later.
      </p>
      <div className="share-url-row">
        <input ref={inputRef} className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <Button onClick={copy}>{copied ? "Copied!" : "Copy"}</Button>
      </div>
    </Dialog>
  );
}
