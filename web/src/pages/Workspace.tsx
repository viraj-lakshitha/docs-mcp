import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { User } from "../../../shared/types.ts";
import { ShellSidebar, type SectionKey } from "../components/shell/ShellSidebar.tsx";
import { ShellMobileNav } from "../components/shell/ShellMobileNav.tsx";
import { ShellMobileTopbar } from "../components/shell/ShellMobileTopbar.tsx";
import { NotesView } from "../components/notes/NotesView.tsx";
import { TablesView } from "../components/tables/TablesView.tsx";
import { SettingsView } from "../components/settings/SettingsView.tsx";
import { AttachmentsView } from "../components/attachments/AttachmentsView.tsx";

// Top-level authenticated app shell: a persistent nav (sidebar on desktop,
// bottom bar on mobile) switches between Notes, Settings, and Attachments —
// only the active section's UI renders, so each view stays uncluttered by
// controls that don't apply to it. (The URL hash is reserved for NotesView's
// open-document id, so section choice lives in memory, not the address bar.)
export default function Workspace() {
  const [me, setMe] = useState<User | null>(null);
  const [section, setSection] = useState<SectionKey>("notes");

  useEffect(() => {
    api<User>("GET", "/api/auth/me").then(setMe).catch(() => {});
  }, []);

  const logout = async () => {
    await api("POST", "/api/auth/logout");
    location.href = "/login";
  };

  return (
    <div className="shell">
      <ShellSidebar me={me} section={section} onSelectSection={setSection} onLogout={logout} />
      <ShellMobileTopbar />

      <main className="shell-main">
        {section === "notes" && <NotesView />}
        {section === "tables" && <TablesView />}
        {section === "settings" && <SettingsView me={me} onUpdated={setMe} />}
        {section === "attachments" && <AttachmentsView />}
      </main>

      <ShellMobileNav section={section} onSelectSection={setSection} />
    </div>
  );
}
