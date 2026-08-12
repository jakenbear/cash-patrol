import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const upsert = mutation({
  args: {
    payday: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");
    if (!datePattern.test(args.payday) || Number.isNaN(Date.parse(`${args.payday}T00:00:00Z`))) {
      throw new ConvexError("Choose a valid payday.");
    }
    if (!Number.isFinite(args.amount) || args.amount < 0) {
      throw new ConvexError("Paycheque amount must be zero or positive.");
    }

    const amount = Math.round(args.amount * 100) / 100;
    const existing = await ctx.db
      .query("paychequeOverrides")
      .withIndex("by_owner_payday", (q) => q.eq("ownerId", ownerId).eq("payday", args.payday))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { amount });
      return existing._id;
    }
    return await ctx.db.insert("paychequeOverrides", {
      ownerId,
      payday: args.payday,
      amount,
    });
  },
});

export const clear = mutation({
  args: { payday: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");
    const existing = await ctx.db
      .query("paychequeOverrides")
      .withIndex("by_owner_payday", (q) => q.eq("ownerId", ownerId).eq("payday", args.payday))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
