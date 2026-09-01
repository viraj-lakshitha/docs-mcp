import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Field } from "./Field.tsx";

// Modal dialog primitive: overlay + card, Escape/overlay-click to dismiss.
export function Dialog({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        <div className="dialog__body">{children}</div>
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

// Confirmation dialog for destructive or lossy actions. Awaits onConfirm
// (which may be async) before closing, and stays open with an inline error
// if it throws — so a failed delete/disconnect doesn't silently vanish.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setError("");
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} autoFocus loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
      {error && <div className="alert" role="alert">{error}</div>}
    </Dialog>
  );
}

// Single-text-input dialog (e.g. naming a new document).
export function PromptDialog({
  title,
  label,
  placeholder,
  initialValue = "",
  submitLabel = "Create",
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setError("");
    setBusy(true);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!value.trim()} loading={busy} onClick={submit}>{submitLabel}</Button>
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
      {error && <div className="alert" role="alert">{error}</div>}
    </Dialog>
  );
}

// Displays a freshly minted share link with a copy button.
export function ShareLinkDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

// Displays a freshly minted API key exactly once — the server never stores
// or returns the raw value again after this.
export function SecretRevealDialog({
  title,
  secret,
  warning,
  onClose,
}: {
  title: string;
  secret: string;
  warning: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <p style={{ margin: 0 }}>{warning}</p>
      <div className="share-url-row">
        <input ref={inputRef} className="input" readOnly value={secret} onFocus={(e) => e.target.select()} />
        <Button onClick={copy}>{copied ? "Copied!" : "Copy"}</Button>
      </div>
    </Dialog>
  );
}
