import { Brand, BrandLogo } from "../Brand.jsx";
import { Button } from "../Button.jsx";
import { NotesIcon, SettingsIcon, PaperclipIcon, LogoutIcon } from "../Icons.jsx";

export const SECTIONS = [
  { key: "notes", label: "Notes", Icon: NotesIcon },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
  { key: "attachments", label: "Attachments", Icon: PaperclipIcon },
];

// Persistent left navigation rail (desktop): brand, section nav, account
// footer. Hidden below the md breakpoint in favor of ShellMobileNav.
export function ShellSidebar({ me, section, onSelectSection, onLogout }) {
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
