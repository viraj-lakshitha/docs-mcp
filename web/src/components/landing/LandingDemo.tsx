import { useEffect, useRef } from "react";
import { renderDocument } from "../../render.ts";

const SAMPLE_DOC = `# Payments service — design notes

Claude wrote this from a chat, diagram included.

\`\`\`mermaid
flowchart LR
  Client --> API --> Queue --> Worker --> DB[(Postgres)]
\`\`\`

Try it: connect Notes to Claude and ask it to draft one of your own.
`;

// A small "browser window" mockup showing a real document render — proves
// the diagrams claim instead of just asserting it.
export function LandingDemo() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderDocument(ref.current, SAMPLE_DOC);
  }, []);

  return (
    <div className="landing-demo">
      <div className="landing-demo__chrome">
        <span className="landing-demo__dot" /><span className="landing-demo__dot" /><span className="landing-demo__dot" />
        <span className="landing-demo__title">design-notes.md</span>
      </div>
      <div ref={ref} className="landing-demo__body rendered" />
    </div>
  );
}
