import { describe, expect, it } from "vitest";
import {
  buildDailyTrend,
  buildSnapshotCsv,
  buildSnapshotReport,
  formatShortDate,
  snapshotExportFilename,
} from "./balanceTrend";
import type { Account, BalanceEvent, BalanceSnapshot } from "./api";

const cash: Account = {
  _id: "moola",
  name: "Moola",
  kind: "cash",
  balance: 80,
  priority: 99,
  includeInPaydown: false,
  updatedAt: 0,
};

const card: Account = {
  _id: "cap",
  name: "Cap one",
  kind: "credit",
  balance: 4600,
  priority: 1,
  includeInPaydown: true,
  updatedAt: 0,
};

function event(
  accountId: string,
  previous: number,
  next: number,
  isoDate: string,
): BalanceEvent {
  return {
    _id: `${accountId}-${isoDate}`,
    accountId,
    previous,
    next,
    at: Date.parse(`${isoDate}T16:00:00Z`),
  };
}

describe("buildDailyTrend", () => {
  it("builds a calendar series from midnight snapshots and live today", () => {
    const snapshots: BalanceSnapshot[] = [
      { accountId: "moola", balance: 40, date: "2026-08-10", at: 1 },
      { accountId: "cap", balance: 4844, date: "2026-08-10", at: 1 },
      { accountId: "moola", balance: 40, date: "2026-08-11", at: 2 },
      { accountId: "cap", balance: 4700, date: "2026-08-11", at: 2 },
    ];

    const trend = buildDailyTrend({
      accounts: [cash, card],
      snapshots,
      events: [],
      today: "2026-08-12",
    });

    expect(trend.source).toBe("snapshots");
    expect(trend.days.map((day) => day.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
    expect(trend.days[0]).toMatchObject({ cash: 40, debt: 4844 });
    expect(trend.days[1]).toMatchObject({ cash: 40, debt: 4700 });
    expect(trend.days[2]).toMatchObject({ cash: 80, debt: 4600 });
    expect(trend.accounts[0]).toMatchObject({
      id: "cap",
      first: 4844,
      current: 4600,
      delta: -244,
      series: [4844, 4700, 4600],
      dates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    });
  });

  it("excludes cash accounts opted out of cash on hand from cash totals", () => {
    const reserved: Account = {
      _id: "meridian",
      name: "Meridian",
      kind: "cash",
      balance: 500,
      priority: 98,
      includeInPaydown: false,
      includeInCashOnHand: false,
      updatedAt: 0,
    };
    const snapshots: BalanceSnapshot[] = [
      { accountId: "moola", balance: 40, date: "2026-08-10", at: 1 },
      { accountId: "meridian", balance: 500, date: "2026-08-10", at: 1 },
      { accountId: "cap", balance: 4844, date: "2026-08-10", at: 1 },
    ];

    const trend = buildDailyTrend({
      accounts: [cash, reserved, card],
      snapshots,
      events: [],
      today: "2026-08-11",
    });

    expect(trend.days[0]).toMatchObject({ cash: 40, debt: 4844 });
    expect(trend.days[1]).toMatchObject({ cash: 80, debt: 4600 });
    expect(trend.days[0]?.byAccount.meridian).toBe(500);
  });

  it("fills quiet days from overwrite history when snapshots are not ready", () => {
    const trend = buildDailyTrend({
      accounts: [cash, card],
      snapshots: [],
      events: [event("cap", 4844, 4700, "2026-08-10")],
      today: "2026-08-12",
      timeZone: "UTC",
    });

    expect(trend.source).toBe("overwrites");
    expect(trend.days.map((day) => day.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
    expect(trend.days[0].debt).toBe(4844);
    expect(trend.days[1].debt).toBe(4700);
    expect(trend.days[2].debt).toBe(4600);
  });

  it("needs more than one day before a trend line exists", () => {
    const trend = buildDailyTrend({
      accounts: [cash, card],
      snapshots: [{ accountId: "cap", balance: 4600, date: "2026-08-12", at: 1 }],
      events: [],
      today: "2026-08-12",
    });
    expect(trend.days).toHaveLength(1);
    expect(trend.source).toBe("overwrites");
  });
});

describe("formatShortDate", () => {
  it("formats an ISO date without shifting the calendar day", () => {
    expect(formatShortDate("2026-08-13")).toBe("Aug 13");
  });
});

describe("snapshot export", () => {
  it("writes one CSV row per account per day", () => {
    const trend = buildDailyTrend({
      accounts: [cash, { ...card, name: "Cap, one" }],
      snapshots: [
        { accountId: "moola", balance: 40, date: "2026-08-10", at: 1 },
        { accountId: "cap", balance: 4844, date: "2026-08-10", at: 1 },
      ],
      events: [],
      today: "2026-08-11",
    });

    const csv = buildSnapshotCsv({ accounts: [cash, { ...card, name: "Cap, one" }], days: trend.days });
    expect(csv).toContain("date,account,kind,balance,cash_total,debt_total");
    expect(csv).toContain("2026-08-10,\"Cap, one\",credit,4844.00,40.00,4844.00");
    expect(csv).toContain("2026-08-11,Moola,cash,80.00,80.00,4600.00");
  });

  it("writes a readable per-account report", () => {
    const trend = buildDailyTrend({
      accounts: [cash, card],
      snapshots: [
        { accountId: "moola", balance: 40, date: "2026-08-10", at: 1 },
        { accountId: "cap", balance: 4844, date: "2026-08-10", at: 1 },
      ],
      events: [],
      today: "2026-08-11",
    });
    const report = buildSnapshotReport({
      accounts: [cash, card],
      days: trend.days,
      today: "2026-08-11",
    });
    expect(report).toContain("Cap one (credit)");
    expect(report).toContain("Change    -$244.00");
    expect(snapshotExportFilename("2026-08-13", "csv")).toBe("cash-patrol-snapshots-2026-08-13.csv");
  });
});
