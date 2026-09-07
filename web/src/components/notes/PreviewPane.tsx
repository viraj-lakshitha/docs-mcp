import { useEffect, useRef } from "react";
import { renderDocument } from "../../render.ts";
import { useResolvedTheme } from "../../hooks/useTheme.ts";
import { EmptyState } from "../EmptyState.tsx";

// Debounced markdown/diagram preview. Re-renders immediately when the mobile
// Preview tab activates — diagrams can't be measured while the pane is hidden.
export function PreviewPane({
  markdown,
  active,
  view,
}: {
  markdown: string;
  active: boolean;
  view: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Diagram SVGs have their colours baked in at render time, so a theme change
  // has to re-run the whole render, not just restyle the container.
  const theme = useResolvedTheme();

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => renderDocument(ref.current!, markdown), view === "preview" ? 0 : 350);
    return () => clearTimeout(timer);
  }, [markdown, active, view, theme]);

  if (!active) {
    return (
      <div className="rendered">
        <EmptyState>Select or create a document to get started.</EmptyState>
      </div>
    );
  }
  return <div ref={ref} className="rendered" />;
}
