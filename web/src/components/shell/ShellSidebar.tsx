import type { ComponentType } from "react";
import type { User } from "../../../../shared/types.ts";
import { Brand, BrandLogo } from "../Brand.tsx";
import { Button } from "../Button.tsx";
import { NotesIcon, TableIcon, SettingsIcon, PaperclipIcon, LogoutIcon, type IconProps } from "../Icons.tsx";

export type SectionKey = "notes" | "tables" | "settings" | "attachments";

export interface Section {
  key: SectionKey;
  label: string;
  Icon: ComponentType<IconProps>;
}

export const SECTIONS: Section[] = [
  { key: "notes", label: "Notes", Icon: NotesIcon },
  { key: "tables", label: "Tables", Icon: TableIcon },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
  { key: "attachments", label: "Attachments", Icon: PaperclipIcon },
];

// Persistent left navigation rail (desktop): brand, section nav, account
// footer. Hidden below the md breakpoint in favor of ShellMobileNav.
export function ShellSidebar({
  me,
  section,
  onSelectSection,
  onLogout,
}: {
  me: User | null;
  section: SectionKey;
  onSelectSection: (key: SectionKey) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="shell-sidebar">
      <div className="shell-sidebar__brand">
        <BrandLogo size={22} />
        <Brand as="span" />
      </div>

      <nav className="shell-nav" aria-label="Sections">
        {SECTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`shell-nav__item${section === key ? " active" : ""}`}
            onClick={() => onSelectSection(key)}
            aria-current={section === key ? "page" : undefined}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <div className="shell-sidebar__footer">
        <span className="user-email" title={me?.email}>{me?.name || me?.email}</span>
        <Button size="sm" onClick={onLogout} title="Log out">
          <LogoutIcon size={15} />
        </Button>
      </div>
    </aside>
  );
}
