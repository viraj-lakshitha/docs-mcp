import { ProfileCard } from "./ProfileCard.jsx";
import { IntegrationsCard } from "./IntegrationsCard.jsx";

export function SettingsView({ me, onUpdated }) {
  return (
    <div className="page-view">
      <div className="page-view__inner">
        <h1 className="page-view__title">Settings</h1>
        <ProfileCard me={me} onUpdated={onUpdated} />
        <IntegrationsCard />
      </div>
    </div>
  );
}
