import { useMemo } from "react";
import type { DashboardData } from "../../lib/api";
import {
  buildDailyTrend,
  formatShortDate,
  type AccountTrend,
  type DailyPoint,
  type DailyTrend,
} from "../../lib/balanceTrend";
import { formatMoney } from "../../lib/paycheckPlan";

export function TrendPage({ dashboard }: { dashboard: DashboardData }) {
  const trend = useMemo(
    () =>
      buildDailyTrend({
        accounts: dashboard.accounts,
        snapshots: dashboard.snapshots ?? [],
        events: dashboard.events,
        today: dashboard.today,
        timeZone: dashboard.settings?.timeZone,
      }),
    [dashboard],
  );
  const first = trend.days[0];
  const latest = trend.days[trend.days.length - 1];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Trend</h1>
          <p className="muted">
            One midnight snapshot per account in your timezone. Overwrites during the day wait
            until tonight’s close — then each card and loan gets its own line.
          </p>
        </div>
      </header>

      {!first || !latest || trend.days.length < 2 ? (
        <section className="panel empty-state">
          <p>
            A trend appears after the first midnight snapshot, or after you overwrite a few
            balances.
          </p>
        </section>
      ) : (
        <TrendReady first={first} latest={latest} trend={trend} />
      )}
    </div>
  );
}

function TrendReady({
  first,
  latest,
  trend,
}: {
  first: DailyPoint;
  latest: DailyPoint;
  trend: DailyTrend;
}) {
  const debtDelta = latest.debt - first.debt;
  const rangeLabel =
    first.date !== latest.date
      ? `${formatShortDate(first.date)} – ${formatShortDate(latest.date)}`
      : formatShortDate(latest.date);

  return (
    <>
      <div className="summary-grid balances-summary trend-summary">
        <div className="summary-card tone-orange">
          <div>
            <strong>{formatMoney(latest.debt)}</strong>
            <span>Debt now</span>
          </div>
        </div>
        <div className="summary-card tone-green">
          <div>
            <strong>{formatMoney(latest.cash)}</strong>
            <span>Cash now</span>
          </div>
        </div>
        <div className={`summary-card ${debtDelta <= 0 ? "tone-green" : "tone-orange"}`}>
          <div>
            <strong>
              {debtDelta > 0 ? "+" : ""}
              {formatMoney(debtDelta)}
            </strong>
            <span>Debt since {formatShortDate(first.date)}</span>
          </div>
        </div>
      </div>

      {trend.accounts.length > 0 && (
        <section className="account-progress-stack">
          <div className="section-heading">
            <h2>Each account</h2>
            <span>{rangeLabel}</span>
          </div>
          {trend.accounts.map((account) => (
            <AccountProgress key={account.id} account={account} days={trend.days} />
          ))}
        </section>
      )}

      <section className="panel chart-panel">
        <div className="section-heading">
          <h2>All debt vs cash</h2>
          <span>{rangeLabel}</span>
        </div>
        <Sparkline series={trend.days} />
        <p className="chart-footnote">
          {trend.source === "snapshots"
            ? `${trend.days.length} daily closes`
            : `${trend.days.length} days reconstructed from overwrites until midnight snapshots catch up`}
        </p>
      </section>
    </>
  );
}

function AccountProgress({ account, days }: { account: AccountTrend; days: DailyPoint[] }) {
  const falling = account.delta <= 0;
  return (
    <section className="panel chart-panel account-progress">
      <div className="account-progress-head">
        <div>
          <strong>{account.name}</strong>
          <small>{account.kind === "loan" ? "Loan" : "Credit card"}</small>
        </div>
        <div className="account-progress-value">
          <strong>{formatMoney(account.current)}</strong>
          <span className={account.delta < 0 ? "delta down" : account.delta > 0 ? "delta up" : "delta"}>
            {account.delta > 0 ? "+" : ""}
            {formatMoney(account.delta)} since {formatShortDate(account.dates[0] ?? days[0]?.date ?? "")}
          </span>
        </div>
      </div>
      <AccountSpark values={account.series} dates={account.dates} falling={falling} />
    </section>
  );
}

function Sparkline({ series }: { series: DailyPoint[] }) {
  const width = 320;
  const height = 148;
  const padX = 12;
  const padTop = 10;
  const padBottom = 22;
  const maxValue = Math.max(...series.flatMap((point) => [point.cash, point.debt]), 1);
  const innerHeight = height - padTop - padBottom;

  const path = (key: "cash" | "debt") =>
    series
      .map((point, index) => {
        const x = padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
        const y = padTop + innerHeight - (point[key] / maxValue) * innerHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const labels = [series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]]
    .filter((point): point is DailyPoint => !!point)
    .filter((point, index, list) => list.findIndex((item) => item.date === point.date) === index);

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Debt and cash trend">
        <path d={path("debt")} className="spark debt" fill="none" />
        <path d={path("cash")} className="spark cash" fill="none" />
        {labels.map((point) => {
          const index = series.findIndex((item) => item.date === point.date);
          const x = padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
          const anchor = index === 0 ? "start" : index === series.length - 1 ? "end" : "middle";
          return (
            <text key={point.date} x={x} y={height - 4} textAnchor={anchor} className="chart-date">
              {formatShortDate(point.date)}
            </text>
          );
        })}
      </svg>
      <div className="spark-legend">
        <span className="debt">Debt</span>
        <span className="cash">Cash</span>
      </div>
    </div>
  );
}

function AccountSpark({
  values,
  dates,
  falling,
}: {
  values: number[];
  dates: string[];
  falling: boolean;
}) {
  const width = 320;
  const height = 88;
  const padX = 12;
  const padTop = 8;
  const padBottom = 20;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const innerHeight = height - padTop - padBottom;
  const d = values
    .map((value, index) => {
      const x = padX + (index / Math.max(values.length - 1, 1)) * (width - padX * 2);
      const y = padTop + innerHeight - ((value - min) / span) * innerHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const labelDates = [dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]].filter(
    (date, index, list): date is string => !!date && list.indexOf(date) === index,
  );

  return (
    <svg
      className={`account-spark ${falling ? "is-down" : "is-up"}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Daily balance"
    >
      <path d={d} fill="none" />
      {labelDates.map((date) => {
        const index = dates.indexOf(date);
        const x = padX + (index / Math.max(dates.length - 1, 1)) * (width - padX * 2);
        const anchor = index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle";
        return (
          <text key={date} x={x} y={height - 4} textAnchor={anchor} className="chart-date">
            {formatShortDate(date)}
          </text>
        );
      })}
    </svg>
  );
}
