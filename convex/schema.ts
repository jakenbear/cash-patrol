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
    priority: v.number(),
    includeInPaydown: v.boolean(),
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
  bills: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    amount: v.number(),
    cadence: v.union(v.literal("biweekly"), v.literal("monthly")),
    nextDue: v.string(),
    active: v.boolean(),
  }).index("by_owner", ["ownerId"]),
  cashflowSettings: defineTable({
    ownerId: v.id("users"),
    biweeklyIncome: v.number(),
    nextPayday: v.string(),
    cashFloat: v.number(),
    timeZone: v.string(),
    configured: v.boolean(),
  }).index("by_owner", ["ownerId"]),
  paychequeOverrides: defineTable({
    ownerId: v.id("users"),
    payday: v.string(),
    amount: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_payday", ["ownerId", "payday"]),
});
