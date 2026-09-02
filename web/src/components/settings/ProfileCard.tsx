import { useState, type FormEvent } from "react";
import { api } from "../../api.ts";
import type { User } from "../../../../shared/types.ts";
import { Card } from "../Card.tsx";
import { Field } from "../Field.tsx";
import { Button } from "../Button.tsx";

export function ProfileCard({
  me,
  onUpdated,
}: {
  me: User | null;
  onUpdated: (user: User) => void;
}) {
  const [name, setName] = useState(me?.name || "");
  const [email, setEmail] = useState(me?.email || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = name !== (me?.name || "") || email !== (me?.email || "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError("Enter a valid email address.");
    }
    setBusy(true);
    try {
      const updated = await api<User>("PUT", "/api/auth/me", { name, email });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Profile" description="Your name and email for this workspace.">
      <form onSubmit={submit} className="settings-form">
        <Field label="Name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <div className="settings-form__actions">
          {saved && <span className="status-chip">Saved</span>}
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
