import { addDaysIso } from "./paycheckPlan";
import type { Account, BalanceEvent, BalanceSnapshot } from "./api";

export type DailyPoint = {
  date: string;
  cash: number;
  debt: number;
  byAccount: Record<string, number>;
};

export type AccountTrend = {
  id: string;
  name: string;
  kind: Account["kind"];
  current: number;
  first: number;
  delta: number;
  series: number[];
  dates: string[];
};

export type DailyTrend = {
  days: DailyPoint[];
  source: "snapshots" | "overwrites";
  accounts: AccountTrend[];
};

function eachIsoDate(from: string, to: string): string[] {
  if (from > to) return [];
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
    if (dates.length >= 4000) break;
  }
  return dates;
}

function dateFromTimestamp(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function sumMode(
  balances: Map<string, number>,
  kinds: Map<string, Account["kind"]>,
  mode: "cash" | "debt",
) {
  let total = 0;
  for (const [id, balance] of balances) {
    const kind = kinds.get(id);
    if (mode === "cash" && kind === "cash") total += balance;
    if (mode === "debt" && (kind === "credit" || kind === "loan")) total += balance;
  }
  return total;
}

function pointFrom(
  date: string,
  balances: Map<string, number>,
  kinds: Map<string, Account["kind"]>,
): DailyPoint {
  const byAccount: Record<string, number> = {};
  for (const [id, balance] of balances) byAccount[id] = balance;
  return {
    date,
    cash: sumMode(balances, kinds, "cash"),
    debt: sumMode(balances, kinds, "debt"),
    byAccount,
  };
}

function liveBalances(accounts: Account[]) {
  return new Map(accounts.map((account) => [account._id, account.balance]));
}

function accountTrends(accounts: Account[], days: DailyPoint[]): AccountTrend[] {
  return accounts
    .filter((account) => account.kind === "credit" || account.kind === "loan")
    .map((account) => {
      const series: number[] = [];
      const dates: string[] = [];
      for (const day of days) {
        const value = day.byAccount[account._id];
        if (typeof value !== "number") continue;
        series.push(value);
        dates.push(day.date);
      }
      const first = series[0] ?? account.balance;
      const current = account.balance;
      return {
        id: account._id,
        name: account.name,
        kind: account.kind,
        current,
        first,
        delta: current - first,
        series: series.length > 0 ? series : [current],
        dates: dates.length > 0 ? dates : days[days.length - 1] ? [days[days.length - 1].date] : [],
      };
    });
}

function fromSnapshots(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  today: string,
): DailyPoint[] {
  const kinds = new Map(accounts.map((account) => [account._id, account.kind]));
  const known = new Set(accounts.map((account) => account._id));
  const byDate = new Map<string, Map<string, number>>();
  for (const snapshot of snapshots) {
    if (!known.has(snapshot.accountId) || snapshot.date > today) continue;
    const day = byDate.get(snapshot.date) ?? new Map<string, number>();
    day.set(snapshot.accountId, snapshot.balance);
    byDate.set(snapshot.date, day);
  }

  const dates = [...byDate.keys()].sort();
  const running = new Map<string, number>();
  const points: DailyPoint[] = [];
  for (const date of dates) {
    if (date >= today) continue;
    const day = byDate.get(date);
    if (!day) continue;
    for (const [id, balance] of day) running.set(id, balance);
    points.push(pointFrom(date, running, kinds));
  }
  points.push(pointFrom(today, liveBalances(accounts), kinds));
  return points;
}

function fromOverwrites(
  accounts: Account[],
  events: BalanceEvent[],
  today: string,
  timeZone: string,
): DailyPoint[] {
  const kinds = new Map(accounts.map((account) => [account._id, account.kind]));
  const known = new Set(accounts.map((account) => account._id));
  const relevant = events
    .filter((event) => known.has(event.accountId))
    .sort((a, b) => a.at - b.at);

  const running = liveBalances(accounts);
  for (const event of [...relevant].reverse()) {
    running.set(event.accountId, event.previous);
  }

  if (relevant.length === 0) {
    return [pointFrom(today, liveBalances(accounts), kinds)];
  }

  const firstDate = dateFromTimestamp(relevant[0].at, timeZone);
  const eventsByDate = new Map<string, BalanceEvent[]>();
  for (const event of relevant) {
    const date = dateFromTimestamp(event.at, timeZone);
    const list = eventsByDate.get(date) ?? [];
    list.push(event);
    eventsByDate.set(date, list);
  }

  const points: DailyPoint[] = [];
  for (const date of eachIsoDate(firstDate, today)) {
    if (date < today) {
      points.push(pointFrom(date, running, kinds));
    }
    for (const event of eventsByDate.get(date) ?? []) {
      running.set(event.accountId, event.next);
    }
  }
  points.push(pointFrom(today, liveBalances(accounts), kinds));
  return points;
}

export function buildDailyTrend(args: {
  accounts: Account[];
  snapshots: BalanceSnapshot[];
  events: BalanceEvent[];
  today: string;
  timeZone?: string;
}): DailyTrend {
  const timeZone = args.timeZone || "America/Toronto";
  const historicalSnapshots = args.snapshots.filter((row) => row.date < args.today);
  const days =
    historicalSnapshots.length > 0
      ? fromSnapshots(args.accounts, args.snapshots, args.today)
      : fromOverwrites(args.accounts, args.events, args.today, timeZone);
  return {
    days,
    source: historicalSnapshots.length > 0 ? "snapshots" : "overwrites",
    accounts: accountTrends(args.accounts, days),
  };
}

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function csvField(value: string | number): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function moneyPlain(value: number): string {
  return value.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Long-form CSV: one row per account per day, plus rolled-up cash/debt. */
export function buildSnapshotCsv(args: {
  accounts: Account[];
  days: DailyPoint[];
}): string {
  const header = ["date", "account", "kind", "balance", "cash_total", "debt_total"];
  const lines = [header.join(",")];
  for (const day of args.days) {
    for (const account of args.accounts) {
      const balance = day.byAccount[account._id];
      if (typeof balance !== "number") continue;
      lines.push(
        [
          csvField(day.date),
          csvField(account.name),
          csvField(account.kind),
          csvField(balance.toFixed(2)),
          csvField(day.cash.toFixed(2)),
          csvField(day.debt.toFixed(2)),
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Readable snapshot report for copy/share. Cards and loans first, then cash. */
export function buildSnapshotReport(args: {
  accounts: Account[];
  days: DailyPoint[];
  today: string;
}): string {
  const first = args.days[0];
  const latest = args.days[args.days.length - 1];
  const lines = [
    "Cash Patrol snapshot report",
    first && latest ? `${first.date} to ${latest.date}` : args.today,
    "One midnight close per account. Today's row is live.",
    "",
  ];

  const ordered = [...args.accounts].sort((a, b) => {
    const rank = (kind: Account["kind"]) =>
      kind === "credit" || kind === "loan" ? 0 : kind === "cash" ? 1 : 2;
    return rank(a.kind) - rank(b.kind) || a.priority - b.priority || a.name.localeCompare(b.name);
  });

  for (const account of ordered) {
    const points = args.days
      .map((day) => ({ date: day.date, balance: day.byAccount[account._id] }))
      .filter((point): point is { date: string; balance: number } => typeof point.balance === "number");
    if (points.length === 0) continue;
    const start = points[0].balance;
    const end = points[points.length - 1].balance;
    const delta = end - start;
    const sign = delta > 0 ? "+" : "";
    lines.push(`${account.name} (${account.kind})`);
    for (const point of points) {
      lines.push(`  ${point.date}  ${moneyPlain(point.balance)}`);
    }
    lines.push(`  Change    ${sign}${moneyPlain(delta)}`);
    lines.push("");
  }

  if (latest) {
    lines.push(`Cash total  ${moneyPlain(latest.cash)}`);
    lines.push(`Debt total  ${moneyPlain(latest.debt)}`);
  }
  return `${lines.join("\n").trim()}\n`;
}

export function snapshotExportFilename(today: string, extension: "csv" | "txt"): string {
  return `cash-patrol-snapshots-${today}.${extension}`;
}
