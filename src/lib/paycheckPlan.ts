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
};

export type PlanSettings = {
  biweeklyIncome: number;
  nextPayday: string;
  cashFloat: number;
  timeZone: string;
  configured: boolean;
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
  billTotal: number;
  billsDue: Array<{ id: string; name: string; amount: number; due: string }>;
  minimums: SuggestedPayment[];
  focusPayment: SuggestedPayment | null;
  leftoverCash: number;
  availableForDebt: number;
  summary: string;
  warnings: string[];
};

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

export function sortPaydownAccounts(accounts: PlanAccount[]): PlanAccount[] {
  const debt = accounts.filter(
    (account) =>
      account.includeInPaydown &&
      (account.kind === "credit" || account.kind === "loan") &&
      account.balance > 0,
  );
  const hasApr = debt.some((account) => typeof account.apr === "number" && account.apr > 0);
  return [...debt].sort((left, right) => {
    if (hasApr) {
      const aprDiff = (right.apr ?? 0) - (left.apr ?? 0);
      if (aprDiff !== 0) return aprDiff;
    }
    if (left.priority !== right.priority) return left.priority - right.priority;
    return right.balance - left.balance;
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
      billTotal: 0,
      billsDue: [],
      minimums: [],
      focusPayment: null,
      leftoverCash: 0,
      availableForDebt: 0,
      summary: "Set your paycheque amount and cash float in Setup to get a plan.",
      warnings: ["Cash flow is not configured yet."],
    };
  }

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
  const float = Math.max(0, settings.cashFloat);
  const billsDue = billsDueInWindow(input.bills, windowStart, windowEnd);
  const billTotal = billsDue.reduce((sum, bill) => sum + bill.amount, 0);

  const debtAccounts = sortPaydownAccounts(input.accounts);
  const missingMins = debtAccounts.filter(
    (account) => account.minPayment === undefined || account.minPayment === null,
  );
  if (missingMins.length > 0) {
    warnings.push("No minimums entered on some debts — mins treated as $0.");
  }

  let remaining = income - billTotal - float;
  if (remaining < 0) {
    warnings.push("Bills plus float exceed this paycheck. Cover bills first; float may dip.");
  }

  const minimums: SuggestedPayment[] = [];
  for (const account of debtAccounts) {
    const min = Math.max(0, Math.min(account.minPayment ?? 0, account.balance));
    if (min <= 0) continue;
    const amount = Math.min(min, Math.max(0, remaining));
    if (amount <= 0) {
      warnings.push(`Not enough left after bills/float to cover the ${account.name} minimum.`);
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
  const focusLabel = focusPayment
    ? `put ${money(focusPayment.amount)} on ${focusPayment.accountName}`
    : debtAccounts.length === 0
      ? "no debt payments needed"
      : "cover minimums only";

  const summary = `After float, ${focusLabel}; keep ${money(float)} in cash.`;

  return {
    ready: true,
    windowStart,
    windowEnd,
    income,
    float,
    billTotal,
    billsDue,
    minimums,
    focusPayment,
    leftoverCash,
    availableForDebt: Math.max(0, availableForDebt),
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
