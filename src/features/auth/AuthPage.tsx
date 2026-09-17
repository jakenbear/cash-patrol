import { memo, useEffect, useRef, useState, type FormEvent } from "react";
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

/** Keep non-empty values — password autofill often reads back as "" until focus. */
function mergeDraft(next: AuthDraft, prev: AuthDraft = readDraft()): AuthDraft {
  return {
    email: next.email || prev.email || "",
    password: next.password || prev.password || "",
  };
}

function persistDraftFromForm(form: HTMLFormElement) {
  writeDraft(mergeDraft(draftFromForm(form)));
}

/**
 * Isolate credential inputs so parent re-renders (error/busy/auth latch) do not
 * reconcile type=password nodes. React writing node.value when autofill still
 * reports "" is what wipes 1Password password dots while leaving email intact.
 */
const StableEmailInput = memo(function StableEmailInput({
  defaultValue,
}: {
  defaultValue: string;
}) {
  return (
    <input
      id="auth-email"
      name="email"
      type="email"
      inputMode="email"
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      defaultValue={defaultValue}
      required
    />
  );
});

const StablePasswordInput = memo(function StablePasswordInput({
  autoComplete,
  defaultValue,
  minLength,
  pattern,
  title,
}: {
  autoComplete: string;
  defaultValue: string;
  minLength?: number;
  pattern?: string;
  title?: string;
}) {
  return (
    <input
      id="auth-password"
      name="password"
      type="password"
      autoComplete={autoComplete}
      defaultValue={defaultValue}
      minLength={minLength}
      pattern={pattern}
      title={title}
      required
    />
  );
});

export function AuthPage() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const lastPassword = useRef("");
  // Read once per mount so remounts can restore PM fills.
  const [draft] = useState(readDraft);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const persistAndRestick = () => {
      const passwordInput = form.elements.namedItem("password");
      if (passwordInput instanceof HTMLInputElement) {
        if (passwordInput.value) {
          lastPassword.current = passwordInput.value;
        } else if (lastPassword.current) {
          // Re-apply if React/autofill quirk cleared a password we already saw.
          passwordInput.value = lastPassword.current;
        } else {
          const saved = readDraft().password;
          if (saved) {
            passwordInput.value = saved;
            lastPassword.current = saved;
          }
        }
      }
      persistDraftFromForm(form);
    };

    persistAndRestick();
    const id = window.setInterval(persistAndRestick, 150);
    return () => window.clearInterval(id);
  }, []);

  function persistDraft(event: FormEvent<HTMLFormElement>) {
    persistDraftFromForm(event.currentTarget);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const form = event.currentTarget;
      const passwordInput = form.elements.namedItem("password");
      if (
        passwordInput instanceof HTMLInputElement &&
        !passwordInput.value &&
        lastPassword.current
      ) {
        passwordInput.value = lastPassword.current;
      }

      const formData = new FormData(form);
      if (!formData.get("password") && lastPassword.current) {
        formData.set("password", lastPassword.current);
      }
      formData.set("flow", mode);
      persistDraftFromForm(form);
      await signIn("password", formData);
      clearDraft();
      lastPassword.current = "";
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
            <StableEmailInput defaultValue={draft.email ?? ""} />
          </label>
          <label htmlFor="auth-password">
            Password
            <StablePasswordInput
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              defaultValue={draft.password ?? ""}
              minLength={12}
              pattern={mode === "signUp" ? "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,}" : undefined}
              title={
                mode === "signUp"
                  ? "Use at least 12 characters with uppercase, lowercase, and a number."
                  : undefined
              }
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
