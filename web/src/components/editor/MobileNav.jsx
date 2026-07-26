import { Button } from "../Button.jsx";
import { ListIcon, EditIcon, EyeIcon } from "../Icons.jsx";

const TABS = [
  { key: "docs", label: "Docs", Icon: ListIcon },
  { key: "edit", label: "Edit", Icon: EditIcon },
  { key: "preview", label: "Preview", Icon: EyeIcon },
];

export function MobileNav({ view, onChange }) {
  return (
    <nav className="mobile-nav" aria-label="Views">
      {TABS.map(({ key, label, Icon }) => (
        <Button key={key} active={view === key} onClick={() => onChange(key)}>
          <Icon />
          {label}
        </Button>
      ))}
    </nav>
  );
}
