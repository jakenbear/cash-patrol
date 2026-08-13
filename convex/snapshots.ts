import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { addDaysIso, dateInTimeZone, eachIsoDate, todayInTimeZone } from "./dates";

const DEFAULT_TIME_ZONE = "America/Toronto";

type SnapshotSource = "cron" | "seed" | "backfill" | "account";

function resolveTimeZone(timeZone: string | undefined): string {
  const value = timeZone?.trim() || DEFAULT_TIME_ZONE;
  try {
    todayInTimeZone(value);
    return value;
  } catch {
    return "UTC";
  }
}

async function existingPairs(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  fromDate?: string,
) {
  const rows = fromDate
    ? await ctx.db
        .query("balanceSnapshots")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId).gte("date", fromDate))
        .collect()
    : await ctx.db
        .query("balanceSnapshots")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect();
  return new Set(rows.map((row) => `${row.accountId}:${row.date}`));
}

async function writeMissing(
  ctx: MutationCtx,
  args: {
    ownerId: Id<"users">;
    date: string;
    at: number;
    source: SnapshotSource;
    balances: Map<Id<"accounts">, number>;
    seen: Set<string>;
  },
) {
  let wrote = 0;
  for (const [accountId, balance] of args.balances) {
    const key = `${accountId}:${args.date}`;
    if (args.seen.has(key)) continue;
    await ctx.db.insert("balanceSnapshots", {
      ownerId: args.ownerId,
      accountId,
      balance,
      date: args.date,
      at: args.at,
      source: args.source,
    });
    args.seen.add(key);
    wrote += 1;
  }
  return wrote;
}

export async function snapshotAccountsOnDate(
  ctx: MutationCtx,
  args: {
    ownerId: Id<"users">;
    date: string;
    at?: number;
    source: SnapshotSource;
    accounts?: Array<{ _id: Id<"accounts">; balance: number }>;
  },
) {
  const accounts =
    args.accounts ??
    (await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect());
  const seen = await existingPairs(ctx, args.ownerId, args.date);
  const balances = new Map(accounts.map((account) => [account._id, account.balance]));
  return await writeMissing(ctx, {
    ownerId: args.ownerId,
    date: args.date,
    at: args.at ?? Date.now(),
    source: args.source,
    balances,
    seen,
  });
}

async function backfillFromEvents(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  timeZone: string,
  today: string,
  at: number,
) {
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  if (accounts.length === 0) return 0;

  const events = await ctx.db
    .query("balanceEvents")
    .withIndex("by_owner_at", (q) => q.eq("ownerId", ownerId))
    .collect();
  events.sort((a, b) => a.at - b.at);

  const firstDate = events.length > 0 ? dateInTimeZone(timeZone, events[0].at) : today;
  const seen = await existingPairs(ctx, ownerId, firstDate);

  const running = new Map(accounts.map((account) => [account._id, account.balance]));
  for (const event of [...events].reverse()) {
    running.set(event.accountId, event.previous);
  }

  const startDate = new Map<Id<"accounts">, string>();
  for (const account of accounts) startDate.set(account._id, today);
  for (const event of events) {
    const eventDate = dateInTimeZone(timeZone, event.at);
    const current = startDate.get(event.accountId) ?? today;
    if (eventDate < current) startDate.set(event.accountId, eventDate);
  }

  const eventsByDate = new Map<string, typeof events>();
  for (const event of events) {
    const eventDate = dateInTimeZone(timeZone, event.at);
    const list = eventsByDate.get(eventDate) ?? [];
    list.push(event);
    eventsByDate.set(eventDate, list);
  }

  let wrote = 0;
  for (const date of eachIsoDate(firstDate, today)) {
    const balances = new Map<Id<"accounts">, number>();
    for (const account of accounts) {
      if ((startDate.get(account._id) ?? today) > date) continue;
      balances.set(account._id, running.get(account._id) ?? account.balance);
    }
    wrote += await writeMissing(ctx, {
      ownerId,
      date,
      at,
      source: date === today ? "cron" : "backfill",
      balances,
      seen,
    });
    for (const event of eventsByDate.get(date) ?? []) {
      running.set(event.accountId, event.next);
    }
  }
  return wrote;
}

export async function syncOwnerSnapshots(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  timeZone: string,
  at = Date.now(),
) {
  const zone = resolveTimeZone(timeZone);
  const today = dateInTimeZone(zone, at);
  const yesterday = addDaysIso(today, -1);

  const recent = await ctx.db
    .query("balanceSnapshots")
    .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId).gte("date", yesterday))
    .collect();
  const latest = recent.reduce((max, row) => (row.date > max ? row.date : max), "");

  if (latest >= today) return { daysTouched: 0, wrote: 0 };

  if (!latest || latest < yesterday) {
    const wrote = await backfillFromEvents(ctx, ownerId, zone, today, at);
    return { daysTouched: wrote > 0 ? 1 : 0, wrote };
  }

  const wrote = await snapshotAccountsOnDate(ctx, {
    ownerId,
    date: today,
    at,
    source: "cron",
  });
  return { daysTouched: wrote > 0 ? 1 : 0, wrote };
}

export const captureDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settingsRows = await ctx.db.query("cashflowSettings").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const ownerIds = new Set<Id<"users">>();
    for (const row of settingsRows) ownerIds.add(row.ownerId);
    for (const account of accounts) ownerIds.add(account.ownerId);

    const settingsByOwner = new Map(settingsRows.map((row) => [row.ownerId, row]));
    let wrote = 0;
    let owners = 0;
    const at = Date.now();
    for (const ownerId of ownerIds) {
      const result = await syncOwnerSnapshots(
        ctx,
        ownerId,
        settingsByOwner.get(ownerId)?.timeZone ?? DEFAULT_TIME_ZONE,
        at,
      );
      wrote += result.wrote;
      if (result.wrote > 0) owners += 1;
    }
    return { owners, wrote };
  },
});
