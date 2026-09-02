import { useEffect, useState } from "react";
import { Brand, BrandLogo } from "../components/Brand.jsx";
import { Button } from "../components/Button.jsx";
import { LandingDemo } from "../components/landing/LandingDemo.jsx";
import {
  NotesIcon,
  PaperclipIcon,
  EyeIcon,
  PlugIcon,
  EditIcon,
  DiagramIcon,
  GitHubIcon,
  ArrowRightIcon,
  CheckIcon,
  XIcon,
} from "../components/Icons.jsx";

const REPO_URL = "https://github.com/viraj-lakshitha/docs-mcp";

const FEATURES = [
  { Icon: NotesIcon, title: "One organized workspace", desc: "Every document Claude creates lands in the same place instead of scattered across chat history." },
  { Icon: DiagramIcon, title: "Mermaid diagrams", desc: "Flowcharts, sequence diagrams, ERDs, Gantt charts — Claude writes them, Notes renders them, and they stay editable forever." },
  { Icon: EditIcon, title: "Excalidraw sketches", desc: "Hand-drawn-style diagrams Claude can author directly as a scene, rendered right in the document." },
  { Icon: PaperclipIcon, title: "Images & attachments", desc: "Upload files and images, embed them in any document, manage them all from one Attachments view." },
  { Icon: EyeIcon, title: "View-only share links", desc: "Publish a read-only link to any document in one click. Revoke it just as fast." },
  { Icon: PlugIcon, title: "Native Claude connector", desc: "Connect over MCP with OAuth — no API keys to copy around. Claude asks, you approve, it's connected." },
];

const COMPARISONS = [
  {
    name: "Google Docs",
    negative: true,
    points: [
      "No connection to Claude — everything is copy-paste",
      "No Mermaid or Excalidraw rendering",
      "Diagrams live as static images, not editable source",
    ],
  },
  {
    name: "Claude's chat",
    negative: true,
    points: [
      "Diagrams render once in the conversation, then you lose them",
      "Nothing is organized — it's buried in scrollback",
      "No way to share just the document without the whole thread",
    ],
  },
  {
    name: "Notes",
    negative: false,
    points: [
      "Claude creates and edits documents directly over MCP",
      "Mermaid and Excalidraw render natively and stay editable",
      "Every document organized, searchable, and shareable in one place",
    ],
  },
];

const STEPS = [
  { n: "1", title: "Create a free account", desc: "Sign up in seconds — no credit card, no setup." },
  { n: "2", title: "Connect it to Claude", desc: "Claude → Settings → Connectors → Add custom connector. It's OAuth, so there's no API key to copy." },
  { n: "3", title: "Ask Claude to write", desc: "“Draft a design doc with an architecture diagram” — it shows up in your workspace, diagrams and all." },
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.title = "Notes — the workspace Claude actually keeps your documents in";
  }, []);

  return (
    <div className="landing">
      <header className={`landing-header${scrolled ? " scrolled" : ""}`}>
        <div className="landing-header__inner">
          <a href="/" className="landing-header__brand">
            <BrandLogo size={20} />
            <Brand as="span" />
          </a>
          <nav className="landing-header__nav" aria-label="Page sections">
            <a href="#features">Features</a>
            <a href="#open-source">Open source</a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
              <GitHubIcon size={18} />
            </a>
          </nav>
          <div className="landing-header__actions">
            <Button as="a" href="/login">Sign in</Button>
            <Button as="a" href="/login?mode=signup" variant="primary">Get started free</Button>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="landing-eyebrow">Documents built for how you actually use Claude</span>
            <h1>Give Claude a real place to keep your documents</h1>
            <p className="landing-hero__sub">
              Google Docs has no idea Claude exists. Claude's own chat forgets everything the moment
              you close it — and neither one can render a Mermaid diagram or an Excalidraw sketch that
              stays editable. Notes is the workspace in between: connect it to Claude once, and every
              document, diagram, and sketch it creates lives in one organized place you can open, edit,
              and share.
            </p>
            <div className="landing-hero__actions">
              <Button as="a" href="/login?mode=signup" variant="primary" size="lg">
                Get started free <ArrowRightIcon />
              </Button>
              <Button as="a" href="#features" size="lg">See what it does</Button>
            </div>
          </div>
          <div className="landing-hero__demo">
            <LandingDemo />
          </div>
        </section>

        <section className="landing-section">
          <h2 className="landing-section__title">Why not just use what you already have?</h2>
          <p className="landing-section__sub">Google Docs and Claude's chat both fall short in the same two ways: no live connection, and no diagrams that survive.</p>
          <div className="comparison-grid">
            {COMPARISONS.map((c) => (
              <div key={c.name} className={`comparison-card${c.negative ? "" : " comparison-card--positive"}`}>
                <h3>{c.name}</h3>
                <ul>
                  {c.points.map((p) => (
                    <li key={p}>
                      {c.negative ? <XIcon size={15} /> : <CheckIcon size={15} />}
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="landing-section">
          <h2 className="landing-section__title">Everything your documents need</h2>
          <p className="landing-section__sub">Markdown at the core, with the two diagram formats that actually matter for technical writing.</p>
          <div className="feature-grid">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="feature-card">
                <div className="feature-card__icon"><Icon size={20} /></div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section--muted">
          <h2 className="landing-section__title">Connected in three steps</h2>
          <div className="steps-grid">
            {STEPS.map((s) => (
              <div key={s.n} className="step-card">
                <span className="step-card__num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="open-source" className="landing-section landing-oss">
          <div className="landing-oss__icon"><GitHubIcon size={32} /></div>
          <h2 className="landing-section__title">Notes is open source</h2>
          <p className="landing-section__sub">
            The full app — the MCP server, the OAuth connector implementation, the editor — is built in
            the open and MIT-licensed. Read the code, self-host it on your own Vercel + Neon + Blob
            project, or send a pull request.
          </p>
          <div className="landing-hero__actions" style={{ justifyContent: "center" }}>
            <Button as="a" href={REPO_URL} target="_blank" rel="noopener noreferrer" variant="primary" size="lg">
              <GitHubIcon size={18} /> View on GitHub
            </Button>
            <Button as="a" href={`${REPO_URL}#readme`} target="_blank" rel="noopener noreferrer" size="lg">
              Read the docs
            </Button>
          </div>
        </section>

        <section className="landing-cta">
          <h2>Ready to give Claude somewhere to put its work?</h2>
          <Button as="a" href="/login?mode=signup" variant="primary" size="lg">
            Get started free <ArrowRightIcon />
          </Button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__brand">
          <Brand as="span" withLink />
        </div>
        <nav className="landing-footer__links" aria-label="Footer">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://optiqlabs.com" target="_blank" rel="noopener noreferrer">optiqlabs.com</a>
          <a href="/login">Sign in</a>
        </nav>
      </footer>
    </div>
  );
}
