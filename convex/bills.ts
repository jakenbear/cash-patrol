import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    bills.sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name));
    return bills;
  },
});

export const upsert = mutation({
  args: {
    billId: v.optional(v.id("bills")),
    name: v.string(),
    amount: v.number(),
    cadence: v.union(v.literal("biweekly"), v.literal("monthly")),
    nextDue: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");

    const name = args.name.trim();
    if (!name || name.length > 40) {
      throw new ConvexError("Bill name must be between 1 and 40 characters.");
    }
    if (!Number.isFinite(args.amount) || args.amount < 0) {
      throw new ConvexError("Bill amount must be zero or positive.");
    }
    if (!datePattern.test(args.nextDue) || Number.isNaN(Date.parse(`${args.nextDue}T00:00:00Z`))) {
      throw new ConvexError("Choose a valid next due date.");
    }

    if (args.billId) {
      const bill = await ctx.db.get(args.billId);
      if (!bill || bill.ownerId !== ownerId) throw new ConvexError("Bill not found.");
      await ctx.db.patch(bill._id, {
        name,
        amount: Math.round(args.amount * 100) / 100,
        cadence: args.cadence,
        nextDue: args.nextDue,
        active: args.active,
      });
      return bill._id;
    }

    return await ctx.db.insert("bills", {
      ownerId,
      name,
      amount: Math.round(args.amount * 100) / 100,
      cadence: args.cadence,
      nextDue: args.nextDue,
      active: args.active,
    });
  },
});

export const remove = mutation({
  args: { billId: v.id("bills") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");
    const bill = await ctx.db.get(args.billId);
    if (!bill || bill.ownerId !== ownerId) throw new ConvexError("Bill not found.");
    await ctx.db.delete(bill._id);
    return null;
  },
});
