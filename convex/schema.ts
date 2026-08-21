import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const accountKind = v.union(
  v.literal("cash"),
  v.literal("credit"),
  v.literal("loan"),
  v.literal("asset"),
);

export default defineSchema({
  ...authTables,
  accounts: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    kind: accountKind,
    balance: v.number(),
    apr: v.optional(v.number()),
    minPayment: v.optional(v.number()),
    /** Optional spending ceiling for credit cards; drawn as a line on the trend chart. */
    softCap: v.optional(v.number()),
    priority: v.number(),
    includeInPaydown: v.boolean(),
    /** When false, excluded from cash-on-hand totals. Missing means true for cash. */
    includeInCashOnHand: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_priority", ["ownerId", "priority"]),
  balanceEvents: defineTable({
    ownerId: v.id("users"),
    accountId: v.id("accounts"),
    previous: v.number(),
    next: v.number(),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_at", ["ownerId", "at"])
    .index("by_account", ["accountId"]),
  /** One row per account per local calendar day (midnight in the owner's timezone). */
  balanceSnapshots: defineTable({
    ownerId: v.id("users"),
    accountId: v.id("accounts"),
    balance: v.number(),
    date: v.string(),
    at: v.number(),
    source: v.optional(
      v.union(
        v.literal("cron"),
        v.literal("seed"),
        v.literal("backfill"),
        v.literal("account"),
      ),
    ),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_date", ["ownerId", "date"])
    .index("by_account_date", ["accountId", "date"]),
  bills: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    amount: v.number(),
    cadence: v.union(v.literal("biweekly"), v.literal("monthly")),
    nextDue: v.string(),
    active: v.boolean(),
    /** Cash account this bill auto-withdraws from (optional). */
    cashAccountId: v.optional(v.id("accounts")),
  }).index("by_owner", ["ownerId"]),
  cashflowSettings: defineTable({
    ownerId: v.id("users"),
    biweeklyIncome: v.number(),
    nextPayday: v.string(),
    cashFloat: v.number(),
    timeZone: v.string(),
    configured: v.boolean(),
    /** How leftover cash picks the focus debt after mins. */
    paydownStrategy: v.optional(
      v.union(v.literal("manual"), v.literal("avalanche"), v.literal("snowball")),
    ),
  }).index("by_owner", ["ownerId"]),
  paychequeOverrides: defineTable({
    ownerId: v.id("users"),
    payday: v.string(),
    amount: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_payday", ["ownerId", "payday"]),
});
