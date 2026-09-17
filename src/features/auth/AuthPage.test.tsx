import { describe, expect, it, vi, beforeEach } from "vitest";
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

describe("AuthPage password-manager compatibility", () => {
  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue(undefined);
    sessionStorage.clear();
  });

  it("exposes username / current-password autocomplete for sign-in", () => {
    render(<AuthPage />);

    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("keeps password-manager DOM fills after a React re-render", () => {
    render(<AuthPage />);

    const email = screen.getByLabelText(/^email$/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    nativeFill(email, "owner@example.com");
    nativeFill(password, "CorrectHorse1");

    fireEvent.click(screen.getByRole("button", { name: /need an account/i }));
    fireEvent.click(screen.getByRole("button", { name: /have an account/i }));

    expect(email).toHaveValue("owner@example.com");
    expect(password).toHaveValue("CorrectHorse1");
  });

  it("submits credentials from FormData / the DOM, not React field state", async () => {
    render(<AuthPage />);

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

  it("restores password-manager fills after the login form remounts", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = render(<AuthPage />);
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

    expect(screen.getByLabelText(/^email$/i)).toHaveValue("owner@example.com");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("CorrectHorse1");
    vi.useRealTimers();
  });

  it("does not clobber a captured password draft with an empty password read", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AuthPage />);
    const email = screen.getByLabelText(/^email$/i) as HTMLInputElement;
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    const proto = Object.getPrototypeOf(email);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(email, "owner@example.com");
    descriptor?.set?.call(password, "CorrectHorse1");
    vi.advanceTimersByTime(200);
    expect(sessionStorage.getItem(AUTH_DRAFT_KEY)).toContain("CorrectHorse1");

    // Autofill quirk: password .value becomes "" while email stays readable.
    descriptor?.set?.call(password, "");
    vi.advanceTimersByTime(200);

    expect(sessionStorage.getItem(AUTH_DRAFT_KEY)).toContain("CorrectHorse1");
    expect(password).toHaveValue("CorrectHorse1");
    vi.useRealTimers();
  });
});
