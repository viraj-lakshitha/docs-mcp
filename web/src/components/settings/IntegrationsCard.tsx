import { useEffect, useState } from "react";
import { api } from "../../api.ts";
import type { Connection } from "../../../../shared/types.ts";
import { Card } from "../Card.tsx";
import { Button } from "../Button.tsx";
import { EmptyState } from "../EmptyState.tsx";
import { ConfirmDialog } from "../Dialog.tsx";
import { PlugIcon } from "../Icons.tsx";

export function IntegrationsCard() {
  const [connections, setConnections] = useState<Connection[] | null>(null); // null = loading
  const [dialog, setDialog] = useState<Connection | null>(null);

  const refresh = () => api<Connection[]>("GET", "/api/connections").then(setConnections);
  useEffect(() => { refresh(); }, []);

  const disconnect = async (clientId: string) => {
    await api("DELETE", `/api/connections/${clientId}`);
    refresh();
  };

  return (
    <Card
      title="Connected MCP integrations"
      description="Apps like Claude that have been authorized to access your documents over MCP."
    >
      {connections === null ? (
        <EmptyState>Loading…</EmptyState>
      ) : connections.length === 0 ? (
        <EmptyState>
          No integrations connected yet. Add this workspace as a custom connector in Claude to get started.
        </EmptyState>
      ) : (
        <ul className="integration-list">
          {connections.map((conn) => (
            <li key={conn.client_id}>
              <span className="integration-icon" aria-hidden="true"><PlugIcon size={18} /></span>
              <div className="integration-info">
                <span className="integration-name">{conn.client_name}</span>
                <span className="meta">
                  Connected {new Date(conn.connected_at).toLocaleDateString()} · {conn.active_tokens} active session
                  {String(conn.active_tokens) === "1" ? "" : "s"}
                </span>
              </div>
              <Button variant="danger" size="sm" onClick={() => setDialog(conn)}>Disconnect</Button>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <ConfirmDialog
          title="Disconnect integration?"
          message={`"${dialog.client_name}" will lose access to your documents immediately. You can reconnect it later from Claude.`}
          confirmLabel="Disconnect"
          danger
          onConfirm={() => disconnect(dialog.client_id)}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}
