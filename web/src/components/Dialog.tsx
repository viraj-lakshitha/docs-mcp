import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog as AriaDialog, Modal, ModalOverlay } from "../components/application/modals/modal.tsx";
import { Button } from "./Button.tsx";
import { Field } from "./Field.tsx";

// Modal dialog primitive, built on React Aria's Modal.
//
// Replaces a hand-rolled overlay that listened for Escape but had no focus
// trap and no focus restore: Tab walked straight out of the dialog into the
// page behind it, and closing dropped focus to <body>. React Aria handles
// focus containment, restore-on-close, aria-modal, scroll locking and
// outside-press, and `tailwindcss-animate` gives it an enter/exit transition
// (the old dialog appeared instantly).
export function Dialog({
  title,
  onClose,
  children,
  actions,
  size = "sm",
}: {
  title: string;
  onClose?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <ModalOverlay
      isOpen
      isDismissable={Boolean(onClose)}
      onOpenChange={(open) => !open && onClose?.()}
    >
      <Modal className={size === "md" ? "w-full max-w-2xl" : "w-full max-w-md"}>
        <AriaDialog aria-label={title}>
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            <div className="flex flex-col gap-3 text-md text-tertiary">{children}</div>
            {actions && <div className="mt-1 flex justify-end gap-3">{actions}</div>}
          </div>
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

function DialogError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-error_subtle bg-error-primary px-3 py-2 text-md text-error-primary"
    >
      {message}
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
      <p className="m-0">{message}</p>
      {error && <DialogError message={error} />}
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
      {error && <DialogError message={error} />}
    </Dialog>
  );
}

// A read-only value with a copy button — used for share links and API keys,
// which are both "here is a string, take it with you" moments.
function CopyableValue({ value, mono = false }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; fall back to the old selection
      // trick so this still works over plain http on a LAN address.
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        className={`input flex-1 ${mono ? "font-mono text-sm" : ""}`}
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
      />
      <Button onClick={copy}>{copied ? "Copied!" : "Copy"}</Button>
    </div>
  );
}

// Displays a freshly minted share link with a copy button.
export function ShareLinkDialog({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Dialog
      title="View-only link created"
      onClose={onClose}
      actions={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <p className="m-0">
        Anyone with this link can read the document but can’t edit it. You can revoke it later.
      </p>
      <CopyableValue value={url} mono />
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
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <p className="m-0">{warning}</p>
      <CopyableValue value={secret} mono />
    </Dialog>
  );
}
