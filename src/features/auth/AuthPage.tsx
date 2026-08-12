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
