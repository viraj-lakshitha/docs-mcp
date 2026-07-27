import { Button } from "../Button.jsx";
import { SECTIONS } from "./ShellSidebar.jsx";

// Bottom tab bar replacing the sidebar below the md breakpoint. Switches
// top-level sections (Notes / Settings / Attachments); the Notes section has
// its own internal list/edit/preview sub-nav (see NotesView).
export function ShellMobileNav({ section, onSelectSection }) {
  return (
    <nav className="shell-mobile-nav" aria-label="Sections">
      {SECTIONS.map(({ key, label, Icon }) => (
        <Button key={key} active={section === key} onClick={() => onSelectSection(key)}>
          <Icon size={18} />
          {label}
        </Button>
      ))}
    </nav>
  );
}
