import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { todayInTimeZone } from "./dates";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");
    return await ctx.db
      .query("cashflowSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
  },
});

export const save = mutation({
  args: {
    biweeklyIncome: v.number(),
    nextPayday: v.string(),
    cashFloat: v.number(),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");

    if (!Number.isFinite(args.biweeklyIncome) || args.biweeklyIncome < 0) {
      throw new ConvexError("Paycheque amount must be zero or positive.");
    }
    if (!Number.isFinite(args.cashFloat) || args.cashFloat < 0) {
      throw new ConvexError("Cash float must be zero or positive.");
    }
    if (!datePattern.test(args.nextPayday) || Number.isNaN(Date.parse(`${args.nextPayday}T00:00:00Z`))) {
      throw new ConvexError("Choose a valid payday.");
    }

    const timeZone = args.timeZone.trim() || "UTC";
    try {
      todayInTimeZone(timeZone);
    } catch {
      throw new ConvexError("The browser supplied an invalid time zone.");
    }

    const existing = await ctx.db
      .query("cashflowSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();

    const payload = {
      ownerId,
      biweeklyIncome: Math.round(args.biweeklyIncome * 100) / 100,
      nextPayday: args.nextPayday,
      cashFloat: Math.round(args.cashFloat * 100) / 100,
      timeZone,
      configured: args.biweeklyIncome > 0,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("cashflowSettings", payload);
  },
});
