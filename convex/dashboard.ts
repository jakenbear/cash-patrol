import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { todayInTimeZone } from "./dates";

export const getDashboard = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");

    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    accounts.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

    const bills = await ctx.db
      .query("bills")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    bills.sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name));

    const settings = await ctx.db
      .query("cashflowSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();

    const paychequeOverrides = await ctx.db
      .query("paychequeOverrides")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const incomeByPayday: Record<string, number> = {};
    for (const row of paychequeOverrides) {
      incomeByPayday[row.payday] = row.amount;
    }

    const events = await ctx.db
      .query("balanceEvents")
      .withIndex("by_owner_at", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);

    const latestDeltaByAccount: Record<string, { previous: number; next: number; at: number }> =
      {};
    for (const event of events) {
      if (!latestDeltaByAccount[event.accountId]) {
        latestDeltaByAccount[event.accountId] = {
          previous: event.previous,
          next: event.next,
          at: event.at,
        };
      }
    }

    const user = await ctx.db.get(ownerId);
    const timeZone = settings?.timeZone ?? "America/Toronto";
    let today: string;
    try {
      today = todayInTimeZone(timeZone);
    } catch {
      today = todayInTimeZone("UTC");
    }

    return {
      accounts,
      bills,
      settings,
      incomeByPayday,
      events: events.slice().reverse(),
      latestDeltaByAccount,
      profile: {
        email: user?.email,
        name: user?.name,
      },
      today,
      needsSeed: accounts.length === 0,
    };
  },
});
