import { useEffect, useRef, useState } from "react";
import { Brand, BrandLogo } from "../components/Brand.jsx";
import { Button } from "../components/Button.jsx";
import { Field } from "../components/Field.jsx";
import { EyeIcon, EyeOffIcon } from "../components/Icons.jsx";

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
          <BrandLogo />
          <Brand as="h2" />
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
            <Button role="tab" aria-selected={mode === "login"} active={mode === "login"} onClick={() => switchMode("login")}>
              Sign in
            </Button>
            <Button role="tab" aria-selected={mode === "signup"} active={mode === "signup"} onClick={() => switchMode("signup")}>
              Create account
            </Button>
          </div>

          <h1>{copy.title}</h1>
          <p className="login-sub">{copy.sub}</p>

          <form onSubmit={submit} noValidate>
            <Field label="Email" error={fieldErrors.email}>
              {(id, className) => (
                <input
                  id={id}
                  ref={emailRef}
                  className={className}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                />
              )}
            </Field>
            <Field
              label="Password"
              error={fieldErrors.password}
              hint={mode === "signup" ? "At least 8 characters." : undefined}
            >
              {(id, className) => (
                <div className="password-wrap">
                  <input
                    id={id}
                    className={className}
                    type={showPassword ? "text" : "password"}
                    autoComplete={copy.autocomplete}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                  />
                  <Button
                    type="button"
                    variant="bare"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </Button>
                </div>
              )}
            </Field>

            {serverError && <div className="alert" role="alert">{serverError}</div>}

            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              {copy.submit}
            </Button>
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
