import { Brand } from "../Brand.tsx";

// Compact brand header shown above the content on mobile, where the full
// sidebar (which normally carries the brand) is hidden.
export function ShellMobileTopbar() {
  return (
    <header className="shell-mobile-topbar">
      <Brand as="span" />
    </header>
  );
}
