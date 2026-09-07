import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { renderDocument } from "../render.ts";
import { useResolvedTheme } from "../hooks/useTheme.ts";
import type { SharedDocumentView } from "../../../shared/types.ts";

export default function Share() {
  const { token } = useParams();
  const [doc, setDoc] = useState<SharedDocumentView | null>(null);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token ?? "")}`);
        if (!res.ok) throw new Error("This link is invalid or has been revoked.");
        setDoc(await res.json());
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (doc) {
      document.title = `${doc.title} — Notes by Optiq Labs`;
      renderDocument(bodyRef.current!, doc.content);
    }
  }, [doc, theme]);

  return (
    <div className="share-wrap">
      <div className="share-header">
        <span className="share-badge">view-only</span>
        <h1>{error ? "Document unavailable" : doc ? doc.title : "Loading…"}</h1>
        <div className="meta">
          {error || (doc && `Last updated ${new Date(doc.updated_at).toLocaleString()}`)}
        </div>
      </div>
      <div ref={bodyRef} className="rendered" />
      <footer className="share-footer">
        Made with <strong>Notes</strong>{" "}
        <span className="brand-sub">
          by{" "}
          <a href="https://optiqlabs.com" target="_blank" rel="noopener noreferrer">
            Optiq Labs
          </a>
        </span>
      </footer>
    </div>
  );
}
