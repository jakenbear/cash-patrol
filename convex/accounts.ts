import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { todayInTimeZone } from "./dates";
import { snapshotAccountsOnDate } from "./snapshots";

const SEED_ACCOUNTS = [
  { name: "Moola", kind: "cash" as const, balance: 40, includeInPaydown: false },
  { name: "WS", kind: "cash" as const, balance: 0, includeInPaydown: false },
  { name: "Cap one", kind: "credit" as const, balance: 4844, includeInPaydown: true },
  { name: "CC Card", kind: "credit" as const, balance: 8527, includeInPaydown: true },
  { name: "Tang CC", kind: "credit" as const, balance: 2447, includeInPaydown: true },
  { name: "LOC", kind: "loan" as const, balance: 2950, includeInPaydown: true },
  { name: "Tang (car)", kind: "loan" as const, balance: 210, includeInPaydown: true },
  { name: "WS TFSA", kind: "asset" as const, balance: 5900, includeInPaydown: false },
];

const accountKind = v.union(
  v.literal("cash"),
  v.literal("credit"),
  v.literal("loan"),
  v.literal("asset"),
);

async function requireOwner(ctx: MutationCtx) {
  const ownerId = await getAuthUserId(ctx);
  if (!ownerId) throw new ConvexError("You must be signed in.");
  return ownerId;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("You must be signed in.");
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    accounts.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    return accounts;
  },
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    if (existing) return { seeded: false };

    const debt = [...SEED_ACCOUNTS]
      .filter((account) => account.includeInPaydown)
      .sort((a, b) => b.balance - a.balance);
    const priorityByName = new Map(debt.map((account, index) => [account.name, index + 1]));

    const now = Date.now();
    for (const [index, account] of SEED_ACCOUNTS.entries()) {
      await ctx.db.insert("accounts", {
        ownerId,
        name: account.name,
        kind: account.kind,
        balance: account.balance,
        priority: priorityByName.get(account.name) ?? 100 + index,
        includeInPaydown: account.includeInPaydown,
        updatedAt: now,
      });
    }

    const settings = await ctx.db
      .query("cashflowSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    let timeZone = settings?.timeZone ?? "America/Toronto";
    if (!settings) {
      try {
        todayInTimeZone(timeZone);
      } catch {
        timeZone = "UTC";
      }
      await ctx.db.insert("cashflowSettings", {
        ownerId,
        biweeklyIncome: 0,
        nextPayday: todayInTimeZone(timeZone),
        cashFloat: 150,
        timeZone,
        configured: false,
        paydownStrategy: "manual",
      });
    }

    await snapshotAccountsOnDate(ctx, {
      ownerId,
      date: todayInTimeZone(timeZone),
      at: now,
      source: "seed",
    });

    return { seeded: true };
  },
});

export const updateBalance = mutation({
  args: {
    accountId: v.id("accounts"),
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const account = await ctx.db.get(args.accountId);
    if (!account || account.ownerId !== ownerId) {
      throw new ConvexError("Account not found.");
    }
    if (!Number.isFinite(args.balance) || args.balance < 0) {
      throw new ConvexError("Balance must be zero or a positive number.");
    }

    const previous = account.balance;
    const next = Math.round(args.balance * 100) / 100;
    if (previous === next) return null;

    const now = Date.now();
    await ctx.db.patch(account._id, { balance: next, updatedAt: now });
    await ctx.db.insert("balanceEvents", {
      ownerId,
      accountId: account._id,
      previous,
      next,
      at: now,
    });
    return null;
  },
});

export const upsert = mutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    name: v.string(),
    kind: accountKind,
    balance: v.number(),
    apr: v.optional(v.number()),
    minPayment: v.optional(v.number()),
    includeInPaydown: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const name = args.name.trim();
    if (!name || name.length > 40) {
      throw new ConvexError("Account name must be between 1 and 40 characters.");
    }
    if (!Number.isFinite(args.balance) || args.balance < 0) {
      throw new ConvexError("Balance must be zero or a positive number.");
    }
    if (args.apr !== undefined && (args.apr < 0 || args.apr > 100)) {
      throw new ConvexError("APR must be between 0 and 100.");
    }
    if (args.minPayment !== undefined && args.minPayment < 0) {
      throw new ConvexError("Minimum payment cannot be negative.");
    }

    const now = Date.now();
    const includeInPaydown =
      args.kind === "credit" || args.kind === "loan" ? args.includeInPaydown : false;

    if (args.accountId) {
      const account = await ctx.db.get(args.accountId);
      if (!account || account.ownerId !== ownerId) {
        throw new ConvexError("Account not found.");
      }
      const previous = account.balance;
      const next = Math.round(args.balance * 100) / 100;
      await ctx.db.patch(account._id, {
        name,
        kind: args.kind,
        balance: next,
        apr: args.apr,
        minPayment: args.minPayment,
        includeInPaydown,
        updatedAt: now,
      });
      if (previous !== next) {
        await ctx.db.insert("balanceEvents", {
          ownerId,
          accountId: account._id,
          previous,
          next,
          at: now,
        });
      }
      return account._id;
    }

    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const maxPriority = existing.reduce((max, item) => Math.max(max, item.priority), 0);
    const accountId = await ctx.db.insert("accounts", {
      ownerId,
      name,
      kind: args.kind,
      balance: Math.round(args.balance * 100) / 100,
      apr: args.apr,
      minPayment: args.minPayment,
      priority: maxPriority + 1,
      includeInPaydown,
      updatedAt: now,
    });
    const settings = await ctx.db
      .query("cashflowSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    let timeZone = settings?.timeZone ?? "America/Toronto";
    try {
      todayInTimeZone(timeZone);
    } catch {
      timeZone = "UTC";
    }
    await snapshotAccountsOnDate(ctx, {
      ownerId,
      date: todayInTimeZone(timeZone),
      at: now,
      source: "account",
      accounts: [{ _id: accountId, balance: Math.round(args.balance * 100) / 100 }],
    });
    return accountId;
  },
});

export const remove = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const account = await ctx.db.get(args.accountId);
    if (!account || account.ownerId !== ownerId) {
      throw new ConvexError("Account not found.");
    }
    await ctx.db.delete(account._id);
    return null;
  },
});

export const reorderPaydown = mutation({
  args: {
    orderedIds: v.array(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const byId = new Map(accounts.map((account) => [account._id, account]));

    let priority = 1;
    for (const id of args.orderedIds) {
      const account = byId.get(id);
      if (!account) throw new ConvexError("Account not found.");
      if (!(account.kind === "credit" || account.kind === "loan")) continue;
      await ctx.db.patch(account._id, { priority, includeInPaydown: true, updatedAt: Date.now() });
      priority += 1;
    }
    return null;
  },
});

export const sortByApr = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const debt = accounts
      .filter((account) => account.kind === "credit" || account.kind === "loan")
      .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0) || b.balance - a.balance);

    const hasApr = debt.some((account) => typeof account.apr === "number" && account.apr > 0);
    if (!hasApr) return { sorted: false };

    for (const [index, account] of debt.entries()) {
      await ctx.db.patch(account._id, { priority: index + 1, updatedAt: Date.now() });
    }
    return { sorted: true };
  },
});
