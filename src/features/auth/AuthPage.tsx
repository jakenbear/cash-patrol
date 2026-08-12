import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LockKeyhole, Wallet } from "lucide-react";

export function AuthPage() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", mode);
      await signIn("password", formData);
    } catch (caught) {
      const raw =
        caught instanceof Error
          ? caught.message.replace(/^Uncaught Error: /, "").replace(/^\[CONVEX[^\]]*\]\s*/g, "")
          : "Unable to sign in.";
      if (/InvalidAccountId/i.test(raw)) {
        setError(
          mode === "signIn"
            ? "No account yet. Use “Create the owner account” first."
            : raw,
        );
      } else if (/InvalidSecret/i.test(raw)) {
        setError("Wrong password.");
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
        <div className="brand-mark">
          <Wallet aria-hidden="true" />
        </div>
        <p className="eyebrow">Balances as truth</p>
        <h1>Cash Patrol</h1>
        <p className="muted">Track balances, plan each paycheck, pay debt down.</p>

        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
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
            {busy ? "Working…" : mode === "signIn" ? "Sign in" : "Create owner account"}
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
          {mode === "signIn"
            ? "First visit? Create the owner account"
            : "Already registered? Sign in"}
        </button>
        <p className="auth-note">Only the configured owner email can register.</p>
      </section>
    </main>
  );
}
