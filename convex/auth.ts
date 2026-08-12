import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

const OwnerPassword = Password({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();

    if (!ownerEmail) {
      throw new ConvexError("OWNER_EMAIL is not configured on this Convex deployment.");
    }
    if (email !== ownerEmail) {
      throw new ConvexError("Registration is restricted to the tracker owner.");
    }

    return {
      email,
      name: String(params.name ?? email.split("@")[0]),
    };
  },
  validatePasswordRequirements(password) {
    if (
      password.length < 12 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new ConvexError(
        "Use at least 12 characters with uppercase, lowercase, and a number.",
      );
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [OwnerPassword],
});
