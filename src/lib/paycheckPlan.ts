export type AccountKind = "cash" | "credit" | "loan" | "asset";

export type PlanAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  balance: number;
  apr?: number;
  minPayment?: number;
  priority: number;
  includeInPaydown: boolean;
};

export type PlanBill = {
  id: string;
  name: string;
  amount: number;
  cadence: "biweekly" | "monthly";
  nextDue: string;
  active: boolean;
  cashAccountId?: string;
};

export type PaydownStrategy = "manual" | "avalanche" | "snowball";

export type PlanSettings = {
  biweeklyIncome: number;
  nextPayday: string;
  cashFloat: number;
  timeZone: string;
  configured: boolean;
  paydownStrategy?: PaydownStrategy;
};

export type SuggestedPayment = {
  accountId: string;
  accountName: string;
  amount: number;
  reason: "minimum" | "focus";
};

export type PaycheckPlan = {
  ready: boolean;
  windowStart: string;
  windowEnd: string;
  income: number;
  float: number;
  floatTarget: number;
  billTotal: number;
  billsDue: Array<{ id: string; name: string; amount: number; due: string }>;
  minimums: SuggestedPayment[];
  minsTotal: number;
  focusPayment: SuggestedPayment | null;
  leftoverCash: number;
  availableForDebt: number;
  strategy: PaydownStrategy;
  summary: string;
  warnings: string[];
};

export const PAYDOWN_STRATEGY_LABEL: Record<PaydownStrategy, string> = {
  manual: "Manual order",
  avalanche: "Avalanche (highest APR)",
  snowball: "Snowball (smallest balance)",
};

export function normalizePaydownStrategy(value: PaydownStrategy | undefined | null): PaydownStrategy {
  if (value === "avalanche" || value === "snowball" || value === "manual") return value;
  return "manual";
}

const money = (value: number) =>
  value.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });

export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** If the target date is Sat/Sun, move to the prior Friday. */
export function adjustPayDateForWeekend(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const day = date.getUTCDay(); // 0 Sun … 6 Sat
  if (day === 6) date.setUTCDate(date.getUTCDate() - 1);
  else if (day === 0) date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Calendar month 1–12 → ISO date for the 15th. */
export function midMonthTarget(year: number, month: number): string {
  return `${year}-${pad2(month)}-15`;
}

/** Calendar month 1–12 → ISO date for the last day. */
export function monthEndTarget(year: number, month: number): string {
  // Day 0 of the next month (0-based month index = `month`) is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function paydaysForMonth(year: number, month: number): [string, string] {
  return [
    adjustPayDateForWeekend(midMonthTarget(year, month)),
    adjustPayDateForWeekend(monthEndTarget(year, month)),
  ];
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let nextYear = year;
  let nextMonth = month + delta;
  while (nextMonth < 1) {
    nextMonth += 12;
    nextYear -= 1;
  }
  while (nextMonth > 12) {
    nextMonth -= 12;
    nextYear += 1;
  }
  return { year: nextYear, month: nextMonth };
}

/** Next paycheque on/after asOfDate, and the following one (window end, exclusive for bills). */
export function upcomingPayWindow(asOfDate: string): { windowStart: string; windowEnd: string } {
  const paydays = listUpcomingPaydays(asOfDate, 2);
  if (paydays.length < 2) {
    return {
      windowStart: asOfDate,
      windowEnd: addDaysIso(asOfDate, 15),
    };
  }
  return {
    windowStart: paydays[0],
    windowEnd: paydays[1],
  };
}

/** Upcoming payday dates on/after asOfDate (15th & month-end, weekend-adjusted). */
export function listUpcomingPaydays(asOfDate: string, count = 6): string[] {
  const [year, month] = asOfDate.split("-").map(Number);
  const dates: string[] = [];
  for (let offset = -1; offset <= Math.ceil(count / 2) + 2; offset += 1) {
    const shifted = shiftMonth(year, month, offset);
    dates.push(...paydaysForMonth(shifted.year, shifted.month));
  }
  return [...new Set(dates)].filter((date) => date >= asOfDate).sort().slice(0, count);
}

export function effectivePaychequeAmount(
  payday: string,
  defaultAmount: number,
  incomeByPayday?: Record<string, number>,
): number {
  const override = incomeByPayday?.[payday];
  return Math.max(0, override ?? defaultAmount);
}

/** Bills due on or after windowStart and before windowEnd (exclusive end). */
export function billsDueInWindow(
  bills: PlanBill[],
  windowStart: string,
  windowEnd: string,
): Array<{ id: string; name: string; amount: number; due: string }> {
  const due: Array<{ id: string; name: string; amount: number; due: string }> = [];

  for (const bill of bills) {
    if (!bill.active) continue;
    for (const date of billOccurrencesInWindow(bill, windowStart, windowEnd)) {
      due.push({
        id: `${bill.id}:${date}`,
        name: bill.name,
        amount: bill.amount,
        due: date,
      });
    }
  }

  return due.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

/** Roll a bill's schedule forward and collect dates inside the pay window. */
export function billOccurrencesInWindow(
  bill: PlanBill,
  windowStart: string,
  windowEnd: string,
): string[] {
  let cursor = bill.nextDue;
  if (bill.cadence === "biweekly") {
    while (cursor < windowStart) cursor = addDaysIso(cursor, 14);
    const dates: string[] = [];
    while (cursor < windowEnd) {
      dates.push(cursor);
      cursor = addDaysIso(cursor, 14);
    }
    return dates;
  }

  // monthly
  while (cursor < windowStart) cursor = addMonthsIso(cursor, 1);
  return cursor < windowEnd ? [cursor] : [];
}

export function addMonthsIso(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/** Next occurrence on/after asOfDate for display in Setup. */
export function nextBillOccurrence(bill: PlanBill, asOfDate: string): string {
  const dates = billOccurrencesInWindow(bill, asOfDate, addDaysIso(asOfDate, 400));
  return dates[0] ?? bill.nextDue;
}

export type CashSeedAlert = {
  cashAccountId: string;
  cashAccountName: string;
  cashBalance: number;
  needed: number;
  shortfall: number;
  bills: Array<{ name: string; amount: number; due: string }>;
};

/**
 * Alerts when auto-withdraw bills are coming up and the linked cash account
 * does not hold enough to cover them.
 *
 * One paycheque cycle only:
 * - If anything auto-withdraws before the next payday, alert on that remainder.
 * - Otherwise alert on the next full payday→payday cycle.
 */
export function buildCashSeedAlerts(input: {
  accounts: PlanAccount[];
  bills: PlanBill[];
  asOfDate: string;
  /** Exclusive end date override for tests. */
  horizonEnd?: string;
}): CashSeedAlert[] {
  const onOrAfterToday = listUpcomingPaydays(input.asOfDate, 2);
  const remainderEnd =
    onOrAfterToday[0] === input.asOfDate
      ? (onOrAfterToday[1] ?? addDaysIso(input.asOfDate, 15))
      : (onOrAfterToday[0] ?? addDaysIso(input.asOfDate, 15));

  const remainderBills = collectLinkedDues(input.bills, input.asOfDate, remainderEnd);
  const useFullNextCycle = remainderBills.length === 0 && onOrAfterToday[0] !== input.asOfDate;
  const horizonStart = useFullNextCycle
    ? (onOrAfterToday[0] ?? input.asOfDate)
    : input.asOfDate;
  const horizonEnd =
    input.horizonEnd ??
    (useFullNextCycle
      ? (onOrAfterToday[1] ?? addDaysIso(horizonStart, 15))
      : remainderEnd);

  const cashById = new Map(
    input.accounts
      .filter((account) => account.kind === "cash")
      .map((account) => [account.id, account]),
  );

  const grouped = new Map<
    string,
    {
      account: PlanAccount;
      needed: number;
      bills: Array<{ name: string; amount: number; due: string }>;
    }
  >();

  for (const due of collectLinkedDues(input.bills, horizonStart, horizonEnd)) {
    const cashAccount = cashById.get(due.cashAccountId);
    if (!cashAccount) continue;

    let bucket = grouped.get(cashAccount.id);
    if (!bucket) {
      bucket = { account: cashAccount, needed: 0, bills: [] };
      grouped.set(cashAccount.id, bucket);
    }
    bucket.needed += due.amount;
    bucket.bills.push({ name: due.name, amount: due.amount, due: due.due });
  }

  const alerts: CashSeedAlert[] = [];
  for (const bucket of grouped.values()) {
    bucket.bills.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
    const shortfall = Math.max(0, Math.round((bucket.needed - bucket.account.balance) * 100) / 100);
    if (shortfall > 0) {
      alerts.push({
        cashAccountId: bucket.account.id,
        cashAccountName: bucket.account.name,
        cashBalance: bucket.account.balance,
        needed: Math.round(bucket.needed * 100) / 100,
        shortfall,
        bills: bucket.bills,
      });
    }
  }

  return alerts.sort((a, b) => b.shortfall - a.shortfall || a.cashAccountName.localeCompare(b.cashAccountName));
}

function collectLinkedDues(
  bills: PlanBill[],
  windowStart: string,
  windowEnd: string,
): Array<{ name: string; amount: number; due: string; cashAccountId: string }> {
  const dues: Array<{ name: string; amount: number; due: string; cashAccountId: string }> = [];
  for (const bill of bills) {
    if (!bill.active || !bill.cashAccountId) continue;
    for (const due of billOccurrencesInWindow(bill, windowStart, windowEnd)) {
      dues.push({
        name: bill.name,
        amount: bill.amount,
        due,
        cashAccountId: bill.cashAccountId,
      });
    }
  }
  return dues;
}

export function sortPaydownAccounts(
  accounts: PlanAccount[],
  strategy: PaydownStrategy = "manual",
): PlanAccount[] {
  const debt = accounts.filter(
    (account) =>
      account.includeInPaydown &&
      (account.kind === "credit" || account.kind === "loan") &&
      account.balance > 0,
  );

  return [...debt].sort((left, right) => {
    if (strategy === "avalanche") {
      const aprDiff = (right.apr ?? 0) - (left.apr ?? 0);
      if (Math.abs(aprDiff) >= 0.01) return aprDiff;
    }
    if (strategy === "snowball") {
      const balDiff = left.balance - right.balance;
      if (Math.abs(balDiff) >= 0.01) return balDiff;
    }
    if (left.priority !== right.priority) return left.priority - right.priority;
    return right.balance - left.balance || left.name.localeCompare(right.name);
  });
}

export function defaultPriorityOrder(accounts: PlanAccount[]): PlanAccount[] {
  return [...accounts]
    .filter(
      (account) =>
        account.includeInPaydown && (account.kind === "credit" || account.kind === "loan"),
    )
    .sort((left, right) => right.balance - left.balance || left.name.localeCompare(right.name));
}

export function buildPaycheckPlan(input: {
  accounts: PlanAccount[];
  bills: PlanBill[];
  settings: PlanSettings | null;
  asOfDate: string;
  incomeByPayday?: Record<string, number>;
}): PaycheckPlan {
  const warnings: string[] = [];
  const settings = input.settings;

  if (!settings || !settings.configured) {
    return {
      ready: false,
      windowStart: input.asOfDate,
      windowEnd: addDaysIso(input.asOfDate, 15),
      income: 0,
      float: 0,
      floatTarget: 0,
      billTotal: 0,
      billsDue: [],
      minimums: [],
      minsTotal: 0,
      focusPayment: null,
      leftoverCash: 0,
      availableForDebt: 0,
      strategy: normalizePaydownStrategy(settings?.paydownStrategy),
      summary: "Set your paycheque amount and cash float in Setup to get a plan.",
      warnings: ["Cash flow is not configured yet."],
    };
  }

  const strategy = normalizePaydownStrategy(settings.paydownStrategy);
  const { windowStart, windowEnd } = upcomingPayWindow(input.asOfDate);

  const income = effectivePaychequeAmount(
    windowStart,
    settings.biweeklyIncome,
    input.incomeByPayday,
  );
  const usingOverride =
    input.incomeByPayday !== undefined &&
    Object.prototype.hasOwnProperty.call(input.incomeByPayday, windowStart);
  if (usingOverride) {
    warnings.push(`Using a custom amount for ${windowStart} (default is ${money(settings.biweeklyIncome)}).`);
  }
  const floatTarget = Math.max(0, settings.cashFloat);
  const billsDue = billsDueInWindow(input.bills, windowStart, windowEnd);
  const billTotal = billsDue.reduce((sum, bill) => sum + bill.amount, 0);

  const debtAccounts = sortPaydownAccounts(input.accounts, strategy);
  const missingMins = debtAccounts.filter(
    (account) => account.minPayment === undefined || account.minPayment === null,
  );
  if (missingMins.length > 0) {
    warnings.push(
      `Missing minimums on: ${missingMins.map((account) => account.name).join(", ")}.`,
    );
  }

  // Order: bills → card/loan minimums (survive) → float → focus debt.
  let remaining = income - billTotal;
  if (remaining < 0) {
    warnings.push("Bills alone exceed this paycheck. Cover bills first.");
  }

  const minimums: SuggestedPayment[] = [];
  for (const account of debtAccounts) {
    const min = Math.max(0, Math.min(account.minPayment ?? 0, account.balance));
    if (min <= 0) continue;
    const amount = Math.min(min, Math.max(0, remaining));
    if (amount <= 0) {
      warnings.push(`Not enough left after bills to cover the ${account.name} minimum.`);
      break;
    }
    minimums.push({
      accountId: account.id,
      accountName: account.name,
      amount,
      reason: "minimum",
    });
    remaining -= amount;
    if (amount < min) {
      warnings.push(`Only part of the ${account.name} minimum fits this paycheck.`);
    }
  }

  const minsTotal = minimums.reduce((sum, item) => sum + item.amount, 0);
  const float = Math.min(floatTarget, Math.max(0, remaining));
  remaining -= float;
  if (float < floatTarget) {
    warnings.push(
      `Float short: keeping ${money(float)} of ${money(floatTarget)} so card minimums stay covered.`,
    );
  }

  const availableForDebt = Math.max(0, income - billTotal - float);
  let focusPayment: SuggestedPayment | null = null;
  const focus = debtAccounts.find((account) => {
    const alreadyMin = minimums.find((item) => item.accountId === account.id)?.amount ?? 0;
    return account.balance - alreadyMin > 0;
  });

  if (focus && remaining > 0) {
    const alreadyMin = minimums.find((item) => item.accountId === focus.id)?.amount ?? 0;
    const room = Math.max(0, focus.balance - alreadyMin);
    const amount = Math.min(remaining, room);
    if (amount > 0) {
      focusPayment = {
        accountId: focus.id,
        accountName: focus.name,
        amount,
        reason: "focus",
      };
      remaining -= amount;
    }
  }

  const leftoverCash = Math.max(0, remaining) + float;
  const minsLabel =
    minsTotal > 0 ? `pay ${money(minsTotal)} in card mins` : "no card mins entered yet";
  const billsLabel =
    billTotal > 0
      ? `pay ${money(billTotal)} in bills (${billsDue.map((bill) => bill.name).join(", ")})`
      : "no bills in this window";
  const focusLabel = focusPayment
    ? `put ${money(focusPayment.amount)} on ${focusPayment.accountName}`
    : debtAccounts.length === 0
      ? "no debt payments needed"
      : "no extra for focus this cheque";

  const summary = `${billsLabel}; ${minsLabel}; then ${focusLabel}; keep ${money(float)} float.`;

  return {
    ready: true,
    windowStart,
    windowEnd,
    income,
    float,
    floatTarget,
    billTotal,
    billsDue,
    minimums,
    minsTotal,
    focusPayment,
    leftoverCash,
    availableForDebt: Math.max(0, availableForDebt),
    strategy,
    summary,
    warnings,
  };
}

export function totalsFromAccounts(accounts: PlanAccount[]) {
  const cash = accounts
    .filter((account) => account.kind === "cash")
    .reduce((sum, account) => sum + account.balance, 0);
  const debt = accounts
    .filter((account) => account.kind === "credit" || account.kind === "loan")
    .reduce((sum, account) => sum + account.balance, 0);
  const assets = accounts
    .filter((account) => account.kind === "asset")
    .reduce((sum, account) => sum + account.balance, 0);
  return { cash, debt, assets, net: cash + assets - debt };
}

export function formatMoney(value: number): string {
  return money(value);
}

export type PaychequeForecast = {
  payday: string;
  windowEnd: string;
  income: number;
  billTotal: number;
  minsTotal: number;
  float: number;
  floatTarget: number;
  focusAmount: number;
  focusName: string | null;
  customIncome: boolean;
};

/** Forward look for the next N paycheques using the same plan rules. */
export function buildPaychequeForecasts(input: {
  accounts: PlanAccount[];
  bills: PlanBill[];
  settings: PlanSettings | null;
  asOfDate: string;
  incomeByPayday?: Record<string, number>;
  count?: number;
}): PaychequeForecast[] {
  if (!input.settings?.configured) return [];
  const paydays = listUpcomingPaydays(input.asOfDate, input.count ?? 6);
  return paydays.map((payday) => {
    const plan = buildPaycheckPlan({
      accounts: input.accounts,
      bills: input.bills,
      settings: input.settings,
      asOfDate: payday,
      incomeByPayday: input.incomeByPayday,
    });
    return {
      payday: plan.windowStart,
      windowEnd: plan.windowEnd,
      income: plan.income,
      billTotal: plan.billTotal,
      minsTotal: plan.minsTotal,
      float: plan.float,
      floatTarget: plan.floatTarget,
      focusAmount: plan.focusPayment?.amount ?? 0,
      focusName: plan.focusPayment?.accountName ?? null,
      customIncome:
        input.incomeByPayday !== undefined &&
        Object.prototype.hasOwnProperty.call(input.incomeByPayday, plan.windowStart),
    };
  });
}
