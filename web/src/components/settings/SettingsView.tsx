import type { User } from "../../../../shared/types.ts";
import { ProfileCard } from "./ProfileCard.tsx";
import { IntegrationsCard } from "./IntegrationsCard.tsx";
import { ApiKeysCard } from "./ApiKeysCard.tsx";

export function SettingsView({
  me,
  onUpdated,
}: {
  me: User | null;
  onUpdated: (user: User) => void;
}) {
  return (
    <div className="page-view">
      <div className="page-view__inner">
        <h1 className="page-view__title">Settings</h1>
        <ProfileCard me={me} onUpdated={onUpdated} />
        <IntegrationsCard />
        <ApiKeysCard />
      </div>
    </div>
  );
}
