import { useEffect, useRef } from "react";
import { renderDocument } from "../../render.js";
import { EmptyState } from "../EmptyState.jsx";

// Debounced markdown/diagram preview. Re-renders immediately when the mobile
// Preview tab activates — diagrams can't be measured while the pane is hidden.
export function PreviewPane({ markdown, active, view }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => renderDocument(ref.current, markdown), view === "preview" ? 0 : 350);
    return () => clearTimeout(timer);
  }, [markdown, active, view]);

  if (!active) {
    return (
      <div className="rendered">
        <EmptyState>Select or create a document to get started.</EmptyState>
      </div>
    );
  }
  return <div ref={ref} className="rendered" />;
}
