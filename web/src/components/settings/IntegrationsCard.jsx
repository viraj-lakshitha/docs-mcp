import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { Card } from "../Card.jsx";
import { Button } from "../Button.jsx";
import { EmptyState } from "../EmptyState.jsx";
import { ConfirmDialog } from "../Dialog.jsx";
import { PlugIcon } from "../Icons.jsx";

export function IntegrationsCard() {
  const [connections, setConnections] = useState(null); // null = loading
  const [dialog, setDialog] = useState(null);

  const refresh = () => api("GET", "/api/connections").then(setConnections);
  useEffect(() => { refresh(); }, []);

  const disconnect = async (clientId) => {
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
                  {conn.active_tokens === "1" || conn.active_tokens === 1 ? "" : "s"}
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
