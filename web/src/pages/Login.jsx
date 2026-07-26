import { useEffect, useRef, useState } from "react";

const COPY = {
  login: {
    title: "Welcome back",
    sub: "Sign in to your workspace.",
    submit: "Sign in",
    switchHint: "New here? ",
    switchLink: "Create an account",
    autocomplete: "current-password",
  },
  signup: {
    title: "Create your account",
    sub: "A workspace for your documents, ready in seconds.",
    submit: "Create account",
    switchHint: "Already have an account? ",
    switchLink: "Sign in",
    autocomplete: "new-password",
  },
};

// After auth, return to ?next= (e.g. an OAuth consent screen) — local paths only.
function nextDestination() {
  const raw = new URLSearchParams(location.search).get("next");
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  const copy = COPY[mode];

  useEffect(() => {
    // Already signed in? Straight through.
    fetch("/api/auth/me").then((r) => {
      if (r.ok) location.href = nextDestination();
    });
    emailRef.current?.focus();
  }, []);

  const clearErrors = () => {
    setFieldErrors({});
    setServerError("");
  };

  const switchMode = (next) => {
    setMode(next);
    clearErrors();
    emailRef.current?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    clearErrors();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setFieldErrors({ email: "Enter a valid email address." });
    }
    if (password.length < 8) {
      return setFieldErrors({ password: "Password must be at least 8 characters." });
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Request failed (${res.status})`);
      }
      location.href = nextDestination();
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-body">
      <main className="login-card">
        <aside className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <BrandIcon size={28} />
          </div>
          <h2 className="brand">
            Notes <span className="brand-sub">by Optiq Labs</span>
          </h2>
          <p>Create documents with Claude.</p>
          <ul className="login-features">
            <li>Markdown with live preview</li>
            <li>Mermaid &amp; Excalidraw diagrams</li>
            <li>Images &amp; file assets</li>
            <li>View-only share links</li>
            <li>MCP access for Claude</li>
          </ul>
          <a className="brand-site" href="https://optiqlabs.com" target="_blank" rel="noopener noreferrer">
            optiqlabs.com
          </a>
        </aside>

        <section className="login-form-panel">
          <div className="login-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
              Sign in
            </button>
            <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>
              Create account
            </button>
          </div>

          <h1>{copy.title}</h1>
          <p className="login-sub">{copy.sub}</p>

          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                className={fieldErrors.email ? "invalid" : ""}
                onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
              />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={copy.autocomplete}
                  placeholder="••••••••"
                  value={password}
                  className={fieldErrors.password ? "invalid" : ""}
                  onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                />
                <button
                  type="button"
                  className="toggle-password"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <EyeIcon open={!showPassword} />
                </button>
              </div>
              {mode === "signup" && !fieldErrors.password && <span className="field-hint">At least 8 characters.</span>}
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            {serverError && <div className="auth-error" role="alert">{serverError}</div>}

            <button type="submit" className="primary login-submit" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              <span>{copy.submit}</span>
            </button>
          </form>

          <p className="login-switch">
            {copy.switchHint}
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode(mode === "login" ? "signup" : "login"); }}>
              {copy.switchLink}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}

export function BrandIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.6 5.1 1.5M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.6-5.1-1.5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
