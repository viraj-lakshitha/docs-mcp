import { useEffect, useState } from "react";
import { api } from "../../api.ts";
import type { ApiKeyCreated, ApiKeySummary } from "../../../../shared/types.ts";
import { Card } from "../Card.tsx";
import { Button } from "../Button.tsx";
import { EmptyState } from "../EmptyState.tsx";
import { ConfirmDialog, PromptDialog, SecretRevealDialog } from "../Dialog.tsx";
import { KeyIcon } from "../Icons.tsx";

type DialogState =
  | { type: "new" }
  | { type: "created"; key: string }
  | { type: "revoke"; key: ApiKeySummary }
  | null;

export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null); // null = loading
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = () => api<ApiKeySummary[]>("GET", "/api/api-keys").then(setKeys);
  useEffect(() => { refresh(); }, []);

  const create = async (name: string) => {
    const created = await api<ApiKeyCreated>("POST", "/api/api-keys", { name });
    refresh();
    setDialog({ type: "created", key: created.key });
  };

  const revoke = async (id: string) => {
    await api("DELETE", `/api/api-keys/${id}`);
    refresh();
  };

  return (
    <Card
      title="API keys"
      description="Keys for calling the REST API from scripts or other tools, without the OAuth flow. Each key grants full access to your account and never works against the /mcp endpoint."
      actions={<Button size="sm" onClick={() => setDialog({ type: "new" })}>+ New key</Button>}
    >
      {keys === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : keys.length === 0 ? (
        <EmptyState>No API keys yet. Create one to call the REST API from outside the browser.</EmptyState>
      ) : (
        <ul className="integration-list">
          {keys.map((key) => (
            <li key={key.id}>
              <span className="integration-icon" aria-hidden="true"><KeyIcon size={18} /></span>
              <div className="integration-info">
                <span className="integration-name">{key.name}</span>
                <span className="meta">
                  {key.prefix}… · created {new Date(key.created_at).toLocaleDateString()}
                  {key.revoked ? " · revoked" : ""}
                </span>
              </div>
              {!key.revoked && (
                <Button variant="danger" size="sm" onClick={() => setDialog({ type: "revoke", key })}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog?.type === "new" && (
        <PromptDialog
          title="New API key"
          label="Name"
          placeholder="e.g. import script"
          submitLabel="Create"
          onSubmit={create}
          // PromptDialog calls onClose() right after onSubmit resolves, but
          // create() has already switched `dialog` to the "created" reveal
          // step by then — only clear it if it's still the "new" step,
          // otherwise this unconditional setDialog(null) would close the
          // reveal dialog before it's ever shown.
          onClose={() => setDialog((d) => (d?.type === "new" ? null : d))}
        />
      )}

      {dialog?.type === "created" && (
        <SecretRevealDialog
          title="API key created"
          secret={dialog.key}
          warning="Copy this key now — it won't be shown again. Use it as a Bearer token: Authorization: Bearer <key>."
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === "revoke" && (
        <ConfirmDialog
          title="Revoke API key?"
          message={`"${dialog.key.name}" will stop working immediately for any script or tool using it.`}
          confirmLabel="Revoke"
          danger
          onConfirm={() => revoke(dialog.key.id)}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}
