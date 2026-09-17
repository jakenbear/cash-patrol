import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthPage, AUTH_DRAFT_KEY } from "./AuthPage";

const signIn = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn }),
}));

function nativeFill(input: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function readyFields() {
  await waitFor(() => {
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });
}

describe("AuthPage password-manager compatibility", () => {
  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue(undefined);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes username / current-password autocomplete for sign-in", async () => {
    render(<AuthPage />);
    await readyFields();

    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("keeps password-manager DOM fills after a React re-render", async () => {
    render(<AuthPage />);
    await readyFields();

    const email = screen.getByLabelText(/^email$/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    nativeFill(email, "owner@example.com");
    nativeFill(password, "CorrectHorse1");

    // Force parent re-render via error path toggle (mode switch remounts forms by design).
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(signIn).toHaveBeenCalled());

    // After failed/successful submit busy flips — fields are unmanaged so values stick
    // until a mode switch. Re-query same sign-in form fields.
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("owner@example.com");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("CorrectHorse1");
  });

  it("submits credentials from FormData / the DOM, not React field state", async () => {
    render(<AuthPage />);
    await readyFields();

    const email = screen.getByLabelText(/^email$/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    nativeFill(email, "owner@example.com");
    nativeFill(password, "CorrectHorse1");

    fireEvent.submit(email.closest("form")!);

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    const formData = signIn.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("owner@example.com");
    expect(formData.get("password")).toBe("CorrectHorse1");
    expect(formData.get("flow")).toBe("signIn");
  });

  it("restores password-manager fills after the login form remounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = render(<AuthPage />);
    await readyFields();

    const email = screen.getByLabelText(/^email$/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    const proto = Object.getPrototypeOf(email);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(email, "owner@example.com");
    descriptor?.set?.call(password, "CorrectHorse1");

    vi.advanceTimersByTime(200);
    expect(sessionStorage.getItem(AUTH_DRAFT_KEY)).toContain("owner@example.com");

    first.unmount();
    render(<AuthPage />);
    await readyFields();

    expect(screen.getByLabelText(/^email$/i)).toHaveValue("owner@example.com");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("CorrectHorse1");
  });

  it("does not clobber a captured password draft with an empty password read", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AuthPage />);
    await readyFields();

    const email = screen.getByLabelText(/^email$/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    const proto = Object.getPrototypeOf(email);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(email, "owner@example.com");
    descriptor?.set?.call(password, "CorrectHorse1");
    vi.advanceTimersByTime(200);
    expect(sessionStorage.getItem(AUTH_DRAFT_KEY)).toContain("CorrectHorse1");

    descriptor?.set?.call(password, "");
    vi.advanceTimersByTime(200);

    expect(sessionStorage.getItem(AUTH_DRAFT_KEY)).toContain("CorrectHorse1");
    expect(password).toHaveValue("CorrectHorse1");
  });

  it("keeps the same password DOM node across busy/error re-renders", async () => {
    signIn.mockRejectedValueOnce(new Error("InvalidSecret"));
    render(<AuthPage />);
    await readyFields();

    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    nativeFill(password, "CorrectHorse1");
    const nodeBefore = password;

    fireEvent.submit(password.closest("form")!);
    await waitFor(() => expect(screen.getByText(/wrong password/i)).toBeInTheDocument());

    const nodeAfter = screen.getByLabelText(/^password$/i);
    expect(nodeAfter).toBe(nodeBefore);
    expect(nodeAfter).toHaveValue("CorrectHorse1");
  });
});
