import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  adjustPayDateForWeekend,
  billsDueInWindow,
  buildPaycheckPlan,
  defaultPriorityOrder,
  monthEndTarget,
  paydaysForMonth,
  sortPaydownAccounts,
  totalsFromAccounts,
  upcomingPayWindow,
  type PlanAccount,
} from "./paycheckPlan";

const accounts: PlanAccount[] = [
  {
    id: "moola",
    name: "Moola",
    kind: "cash",
    balance: 40,
    priority: 99,
    includeInPaydown: false,
  },
  {
    id: "cap",
    name: "Cap one",
    kind: "credit",
    balance: 4844,
    minPayment: 100,
    priority: 2,
    includeInPaydown: true,
  },
  {
    id: "cc",
    name: "CC Card",
    kind: "credit",
    balance: 8527,
    minPayment: 150,
    priority: 1,
    includeInPaydown: true,
  },
  {
    id: "tfsa",
    name: "WS TFSA",
    kind: "asset",
    balance: 5900,
    priority: 100,
    includeInPaydown: false,
  },
];

describe("paycheckPlan", () => {
  it("adds days on ISO dates", () => {
    expect(addDaysIso("2026-08-12", 14)).toBe("2026-08-26");
  });

  it("moves weekend pay dates to the prior Friday", () => {
    // Aug 15 2026 is Saturday → Friday Aug 14
    expect(adjustPayDateForWeekend("2026-08-15")).toBe("2026-08-14");
    // Aug 16 2026 is Sunday → Friday Aug 14
    expect(adjustPayDateForWeekend("2026-08-16")).toBe("2026-08-14");
    // Aug 31 2026 is Monday → unchanged
    expect(adjustPayDateForWeekend("2026-08-31")).toBe("2026-08-31");
  });

  it("builds 15th and month-end paydays with weekend rules", () => {
    expect(monthEndTarget(2026, 8)).toBe("2026-08-31");
    expect(paydaysForMonth(2026, 8)).toEqual(["2026-08-14", "2026-08-31"]);
  });

  it("finds the upcoming semi-monthly pay window", () => {
    // Before mid-August payday
    expect(upcomingPayWindow("2026-08-12")).toEqual({
      windowStart: "2026-08-14",
      windowEnd: "2026-08-31",
    });
    // After mid payday, before month-end
    expect(upcomingPayWindow("2026-08-20")).toEqual({
      windowStart: "2026-08-31",
      windowEnd: "2026-09-15",
    });
  });

  it("filters bills in the pay window", () => {
    const due = billsDueInWindow(
      [
        {
          id: "1",
          name: "Rent",
          amount: 1200,
          cadence: "monthly",
          nextDue: "2026-08-15",
          active: true,
        },
        {
          id: "2",
          name: "Phone",
          amount: 60,
          cadence: "monthly",
          nextDue: "2026-09-01",
          active: true,
        },
      ],
      "2026-08-14",
      "2026-08-31",
    );
    expect(due).toHaveLength(1);
    expect(due[0].name).toBe("Rent");
  });

  it("repeats every-2-weeks bills inside the pay window", () => {
    // Anchor Friday 2026-07-17; window Aug 14–31 includes Aug 14 and Aug 28
    const due = billsDueInWindow(
      [
        {
          id: "car",
          name: "Car",
          amount: 210,
          cadence: "biweekly",
          nextDue: "2026-07-17",
          active: true,
        },
      ],
      "2026-08-14",
      "2026-08-31",
    );
    expect(due.map((item) => item.due)).toEqual(["2026-08-14", "2026-08-28"]);
    expect(due[0].amount).toBe(210);
  });

  it("defaults priority by highest balance", () => {
    const ordered = defaultPriorityOrder(accounts);
    expect(ordered.map((account) => account.name)).toEqual(["CC Card", "Cap one"]);
  });

  it("builds a ready plan with mins then focus", () => {
    const plan = buildPaycheckPlan({
      accounts,
      bills: [
        {
          id: "rent",
          name: "Rent",
          amount: 1200,
          cadence: "monthly",
          nextDue: "2026-08-20",
          active: true,
        },
      ],
      settings: {
        biweeklyIncome: 2400,
        nextPayday: "2026-08-14",
        cashFloat: 150,
        timeZone: "America/Toronto",
        configured: true,
      },
      asOfDate: "2026-08-12",
    });

    expect(plan.ready).toBe(true);
    expect(plan.windowStart).toBe("2026-08-14");
    expect(plan.windowEnd).toBe("2026-08-31");
    expect(plan.billTotal).toBe(1200);
    expect(plan.minimums).toHaveLength(2);
    expect(plan.focusPayment?.accountName).toBe("CC Card");
    // 2400 - 1200 bills - 150 float - 150 min CC - 100 min Cap = 800 focus
    expect(plan.focusPayment?.amount).toBe(800);
    expect(plan.summary).toContain("CC Card");
  });

  it("uses a custom paycheque amount for the upcoming payday", () => {
    const plan = buildPaycheckPlan({
      accounts,
      bills: [],
      settings: {
        biweeklyIncome: 2400,
        nextPayday: "2026-08-14",
        cashFloat: 150,
        timeZone: "America/Toronto",
        configured: true,
      },
      asOfDate: "2026-08-12",
      incomeByPayday: { "2026-08-14": 3000 },
    });
    expect(plan.income).toBe(3000);
    expect(plan.focusPayment?.amount).toBe(2600); // 3000 - 150 float - 150 - 100 mins
    expect(plan.warnings.some((warning) => /custom amount/i.test(warning))).toBe(true);
  });

  it("funds card minimums before float so accounts stay current", () => {
    const plan = buildPaycheckPlan({
      accounts,
      bills: [
        {
          id: "rent",
          name: "Rent",
          amount: 2700,
          cadence: "monthly",
          nextDue: "2026-08-20",
          active: true,
        },
      ],
      settings: {
        biweeklyIncome: 3250,
        nextPayday: "2026-08-14",
        cashFloat: 500,
        timeZone: "America/Toronto",
        configured: true,
      },
      asOfDate: "2026-08-12",
    });
    // 3250 - 2700 bills = 550 → mins 250 → float only 300 of 500 → no focus
    expect(plan.minsTotal).toBe(250);
    expect(plan.float).toBe(300);
    expect(plan.floatTarget).toBe(500);
    expect(plan.focusPayment).toBeNull();
    expect(plan.warnings.some((warning) => /Float short/i.test(warning))).toBe(true);
  });

  it("returns setup prompt when not configured", () => {
    const plan = buildPaycheckPlan({
      accounts,
      bills: [],
      settings: null,
      asOfDate: "2026-08-12",
    });
    expect(plan.ready).toBe(false);
    expect(plan.warnings[0]).toMatch(/not configured/i);
  });

  it("sorts by APR when present", () => {
    const withApr = accounts.map((account) =>
      account.id === "cap"
        ? { ...account, apr: 22 }
        : account.id === "cc"
          ? { ...account, apr: 19 }
          : account,
    );
    const ordered = sortPaydownAccounts(withApr);
    expect(ordered[0].name).toBe("Cap one");
  });

  it("computes totals", () => {
    expect(totalsFromAccounts(accounts)).toEqual({
      cash: 40,
      debt: 13371,
      assets: 5900,
      net: 40 + 5900 - 13371,
    });
  });
});
