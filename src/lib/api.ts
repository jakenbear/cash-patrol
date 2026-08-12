import { makeFunctionReference } from "convex/server";
import type { AccountKind } from "./paycheckPlan";

export type Account = {
  _id: string;
  name: string;
  kind: AccountKind;
  balance: number;
  apr?: number;
  minPayment?: number;
  priority: number;
  includeInPaydown: boolean;
  updatedAt: number;
};

export type Bill = {
  _id: string;
  name: string;
  amount: number;
  cadence: "biweekly" | "monthly";
  nextDue: string;
  active: boolean;
  cashAccountId?: string;
};

export type PaydownStrategy = "manual" | "avalanche" | "snowball";

export type CashflowSettings = {
  _id: string;
  biweeklyIncome: number;
  nextPayday: string;
  cashFloat: number;
  timeZone: string;
  configured: boolean;
  paydownStrategy?: PaydownStrategy;
};

export type BalanceEvent = {
  _id: string;
  accountId: string;
  previous: number;
  next: number;
  at: number;
};

export type DashboardData = {
  accounts: Account[];
  bills: Bill[];
  settings: CashflowSettings | null;
  incomeByPayday: Record<string, number>;
  events: BalanceEvent[];
  latestDeltaByAccount: Record<string, { previous: number; next: number; at: number }>;
  profile: { email?: string; name?: string };
  today: string;
  needsSeed: boolean;
};

export const patrolApi = {
  dashboard: makeFunctionReference<"query", Record<string, never>, DashboardData>(
    "dashboard:getDashboard",
  ),
  seedAccounts: makeFunctionReference<"mutation", Record<string, never>, { seeded: boolean }>(
    "accounts:seedDefaults",
  ),
  updateBalance: makeFunctionReference<
    "mutation",
    { accountId: string; balance: number },
    null
  >("accounts:updateBalance"),
  upsertAccount: makeFunctionReference<
    "mutation",
    {
      accountId?: string;
      name: string;
      kind: AccountKind;
      balance: number;
      apr?: number;
      minPayment?: number;
      includeInPaydown: boolean;
    },
    string
  >("accounts:upsert"),
  removeAccount: makeFunctionReference<"mutation", { accountId: string }, null>(
    "accounts:remove",
  ),
  reorderPaydown: makeFunctionReference<"mutation", { orderedIds: string[] }, null>(
    "accounts:reorderPaydown",
  ),
  sortByApr: makeFunctionReference<"mutation", Record<string, never>, { sorted: boolean }>(
    "accounts:sortByApr",
  ),
  saveSettings: makeFunctionReference<
    "mutation",
    {
      biweeklyIncome: number;
      nextPayday: string;
      cashFloat: number;
      timeZone: string;
      paydownStrategy?: PaydownStrategy;
    },
    string
  >("settings:save"),
  upsertBill: makeFunctionReference<
    "mutation",
    {
      billId?: string;
      name: string;
      amount: number;
      cadence: "biweekly" | "monthly";
      nextDue: string;
      active: boolean;
      cashAccountId?: string;
    },
    string
  >("bills:upsert"),
  removeBill: makeFunctionReference<"mutation", { billId: string }, null>("bills:remove"),
  upsertPaycheque: makeFunctionReference<
    "mutation",
    { payday: string; amount: number },
    string
  >("paycheques:upsert"),
  clearPaycheque: makeFunctionReference<"mutation", { payday: string }, null>(
    "paycheques:clear",
  ),
};
