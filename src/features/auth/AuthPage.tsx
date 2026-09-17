import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LockKeyhole, Wallet } from "lucide-react";

export const AUTH_DRAFT_KEY = "cash-patrol.auth-draft";

type AuthDraft = {
  email?: string;
  password?: string;
};

function readDraft(): AuthDraft {
  try {
    const raw = sessionStorage.getItem(AUTH_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AuthDraft;
    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      password: typeof parsed.password === "string" ? parsed.password : "",
    };
  } catch {
    return {};
  }
}

function writeDraft(draft: AuthDraft) {
  try {
    sessionStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode / quota — ignore; login still works without draft restore.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(AUTH_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function draftFromForm(form: HTMLFormElement): AuthDraft {
  const formData = new FormData(form);
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

export function AuthPage() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Read once per mount so remounts (auth gate / SW) restore PM fills.
  const [draft] = useState(readDraft);

  useEffect(() => {
    // Password managers often write DOM values without reliable input events.
    // Poll so a remount still restores the stick-fill.
    const form = formRef.current;
    if (!form) return;
    const persist = () => writeDraft(draftFromForm(form));
    persist();
    const id = window.setInterval(persist, 150);
    return () => window.clearInterval(id);
  }, []);

  function persistDraft(event: FormEvent<HTMLFormElement>) {
    writeDraft(draftFromForm(event.currentTarget));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      // Read from the DOM so password-manager fills stick even if React state never saw them.
      const formData = new FormData(event.currentTarget);
      formData.set("flow", mode);
      writeDraft(draftFromForm(event.currentTarget));
      await signIn("password", formData);
      clearDraft();
    } catch (caught) {
      const raw =
        caught instanceof Error
          ? caught.message.replace(/^Uncaught Error: /, "").replace(/^\[CONVEX[^\]]*\]\s*/g, "")
          : "Unable to sign in.";
      if (/InvalidAccountId/i.test(raw)) {
        setError(
          mode === "signIn"
            ? "No account for that email yet. Create one below if this is your first time."
            : raw,
        );
      } else if (/InvalidSecret/i.test(raw)) {
        setError("Wrong password.");
      } else if (/restricted to the tracker owner/i.test(raw)) {
        setError("This email can’t register. Use the account email set up for Cash Patrol.");
      } else {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">
          <Wallet aria-hidden="true" />
        </div>
        <p className="eyebrow">Balances as truth</p>
        <h1>Cash Patrol</h1>
        <p className="muted">Track balances, plan each paycheck, pay debt down.</p>

        <form
          ref={formRef}
          onSubmit={submit}
          onInput={persistDraft}
          className="auth-form"
          autoComplete="on"
        >
          <label htmlFor="auth-email">
            Email
            <input
              id="auth-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={draft.email ?? ""}
              required
            />
          </label>
          <label htmlFor="auth-password">
            Password
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              defaultValue={draft.password ?? ""}
              minLength={12}
              pattern={mode === "signUp" ? "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,}" : undefined}
              title={
                mode === "signUp"
                  ? "Use at least 12 characters with uppercase, lowercase, and a number."
                  : undefined
              }
              required
            />
            {mode === "signUp" && (
              <small className="field-hint">
                At least 12 characters with uppercase, lowercase, and a number.
              </small>
            )}
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            <LockKeyhole size={18} aria-hidden="true" />
            {busy ? "Working…" : mode === "signIn" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError("");
          }}
        >
          {mode === "signIn" ? "Need an account? Create one" : "Have an account? Sign in"}
        </button>
        <p className="auth-note">Private app — signup is limited to your email.</p>
      </section>
    </main>
  );
}
