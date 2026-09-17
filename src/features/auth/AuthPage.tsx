import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
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
    // ignore
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

type FieldSpec = {
  id: string;
  name: string;
  type: "email" | "password";
  autoComplete: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  pattern?: string;
  title?: string;
  inputMode?: string;
};

/**
 * Create the input once in the DOM and never hand it to React's reconciler.
 * React updating type=password while autofill still reports value="" is what
 * wipes 1Password password fills (email usually survives).
 */
function UnmanagedField({ spec }: { spec: FieldSpec }) {
  const slotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const input = document.createElement("input");
    input.id = spec.id;
    input.name = spec.name;
    input.type = spec.type;
    input.setAttribute("autocomplete", spec.autoComplete);
    if (spec.defaultValue) input.value = spec.defaultValue;
    if (spec.required) input.required = true;
    if (spec.minLength != null) input.minLength = spec.minLength;
    if (spec.pattern) input.pattern = spec.pattern;
    if (spec.title) input.title = spec.title;
    if (spec.inputMode) input.inputMode = spec.inputMode as HTMLInputElement["inputMode"];
    if (spec.type === "email") {
      input.setAttribute("autocapitalize", "off");
      input.setAttribute("autocorrect", "off");
      input.spellcheck = false;
    }

    // Unlock on focus / shortly after mount so PMs and bots can fill.
    input.readOnly = true;
    const unlock = () => {
      input.readOnly = false;
    };
    input.addEventListener("focus", unlock);
    input.addEventListener("pointerdown", unlock);
    const unlockTimer = window.setTimeout(unlock, 50);

    slot.replaceChildren(input);

    return () => {
      window.clearTimeout(unlockTimer);
      input.removeEventListener("focus", unlock);
      input.removeEventListener("pointerdown", unlock);
      input.remove();
    };
    // Intentional: mount once per field identity; do not recreate on parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmanaged DOM node must stay stable
  }, [spec.id, spec.name, spec.type, spec.autoComplete]);

  return <span ref={slotRef} className="unmanaged-field" />;
}

function usePasswordRestick(formRef: RefObject<HTMLFormElement | null>) {
  const lastPasswordRef = useRef("");

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const persistAndRestick = () => {
      const passwordInput = form.elements.namedItem("password");
      if (passwordInput instanceof HTMLInputElement) {
        if (passwordInput.value) {
          lastPasswordRef.current = passwordInput.value;
        } else if (lastPasswordRef.current) {
          passwordInput.value = lastPasswordRef.current;
        } else {
          const saved = readDraft().password;
          if (saved) {
            passwordInput.value = saved;
            lastPasswordRef.current = saved;
          }
        }
      }
      persistDraftFromForm(form);
    };

    persistAndRestick();
    const id = window.setInterval(persistAndRestick, 150);
    return () => window.clearInterval(id);
  }, [formRef]);

  return lastPasswordRef;
}

function readCredential(form: HTMLFormElement, name: "email" | "password"): string {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement) {
    el.readOnly = false;
    if (el.value) return el.value;
  }
  return "";
}

function friendlyAuthError(raw: string, mode: AuthMode): string {
  const text = raw
    .replace(/^Uncaught Error: /, "")
    .replace(/^\[CONVEX[^\]]*\]\s*/g, "")
    .replace(/^\[Request ID:[^\]]*\]\s*/g, "")
    .trim();

  if (/InvalidAccountId/i.test(text)) {
    return mode === "signIn"
      ? "No account for that email yet. Create one below if this is your first time."
      : text;
  }
  if (/InvalidSecret|Invalid credentials/i.test(text)) {
    return "Wrong password.";
  }
  if (/TooManyFailedAttempts/i.test(text)) {
    return "Too many failed sign-in attempts. Wait a minute and try again.";
  }
  if (/restricted to the tracker owner/i.test(text)) {
    return "This email can’t register. Use the account email set up for Cash Patrol.";
  }
  // Convex redacts most Error() messages from auth:signIn as "Server Error".
  if (/Server Error/i.test(text)) {
    return mode === "signIn"
      ? "Sign-in failed. Check email and password, or wait a minute and try again."
      : "Couldn’t create the account. Check the details and try again.";
  }
  return text || "Unable to sign in.";
}

type AuthMode = "signIn" | "signUp";

export function AuthPage() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const lastPasswordRef = usePasswordRestick(formRef);
  const [draft] = useState(readDraft);

  function persistDraft(event: FormEvent<HTMLFormElement>) {
    persistDraftFromForm(event.currentTarget);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const form = event.currentTarget;
      const saved = readDraft();
      const email = readCredential(form, "email") || saved.email || "";
      const password =
        readCredential(form, "password") ||
        lastPasswordRef.current ||
        saved.password ||
        "";

      if (!email || !password) {
        setError("Email and password are required.");
        return;
      }

      // Plain object avoids FormData/autofill edge cases with unmanaged inputs.
      writeDraft({ email, password });
      await signIn("password", { email, password, flow: mode });
      clearDraft();
      lastPasswordRef.current = "";
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : "Unable to sign in.";
      setError(friendlyAuthError(raw, mode));
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

        {/*
          Separate sign-in vs sign-up forms (1Password guidance): do not churn
          the same password field between current-password and new-password.
        */}
        {mode === "signIn" ? (
          <form
            key="sign-in"
            ref={formRef}
            method="post"
            onSubmit={submit}
            onInput={persistDraft}
            className="auth-form"
            autoComplete="on"
          >
            <label htmlFor="auth-email">
              Email
              <UnmanagedField
                spec={{
                  id: "auth-email",
                  name: "email",
                  type: "email",
                  autoComplete: "username",
                  defaultValue: draft.email ?? "",
                  required: true,
                  inputMode: "email",
                }}
              />
            </label>
            <label htmlFor="auth-password">
              Password
              <UnmanagedField
                spec={{
                  id: "auth-password",
                  name: "password",
                  type: "password",
                  autoComplete: "current-password",
                  defaultValue: draft.password ?? "",
                  required: true,
                  minLength: 12,
                }}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              <LockKeyhole size={18} aria-hidden="true" />
              {busy ? "Working…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form
            key="sign-up"
            ref={formRef}
            method="post"
            onSubmit={submit}
            onInput={persistDraft}
            className="auth-form"
            autoComplete="on"
          >
            <label htmlFor="auth-email-new">
              Email
              <UnmanagedField
                spec={{
                  id: "auth-email-new",
                  name: "email",
                  type: "email",
                  autoComplete: "username",
                  defaultValue: draft.email ?? "",
                  required: true,
                  inputMode: "email",
                }}
              />
            </label>
            <label htmlFor="auth-password-new">
              Password
              <UnmanagedField
                spec={{
                  id: "auth-password-new",
                  name: "password",
                  type: "password",
                  autoComplete: "new-password",
                  defaultValue: draft.password ?? "",
                  required: true,
                  minLength: 12,
                  pattern: "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,}",
                  title: "Use at least 12 characters with uppercase, lowercase, and a number.",
                }}
              />
              <small className="field-hint">
                At least 12 characters with uppercase, lowercase, and a number.
              </small>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              <LockKeyhole size={18} aria-hidden="true" />
              {busy ? "Working…" : "Create account"}
            </button>
          </form>
        )}

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
