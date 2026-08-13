import { useMemo } from "react";
import type { DashboardData } from "../../lib/api";
import {
  buildDailyTrend,
  formatShortDate,
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
            Daily midnight snapshots in your timezone, plus today’s live balances. A rear-view
            mirror — not a transaction ledger.
          </p>
        </div>
      </header>

      {!first || !latest || trend.days.length < 2 ? (
        <section className="panel empty-state">
          <p>A trend appears after the first midnight snapshot, or after you overwrite a few balances.</p>
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

      <section className="panel chart-panel">
        <div className="section-heading">
          <h2>Debt vs cash</h2>
          <span>{rangeLabel}</span>
        </div>
        <Sparkline series={trend.days} />
        <p className="chart-footnote">
          {trend.source === "snapshots"
            ? `${trend.days.length} daily points`
            : `${trend.days.length} days reconstructed from overwrites until midnight snapshots catch up`}
        </p>
      </section>

      {trend.accounts.length > 0 && (
        <section className="panel stack-section">
          <div className="section-heading">
            <h2>Accounts going down</h2>
            <span>Debt</span>
          </div>
          <ul className="account-trend-list">
            {trend.accounts.map((account) => (
              <li key={account.id}>
                <div className="account-trend-copy">
                  <strong>{account.name}</strong>
                  <small>{account.kind === "loan" ? "Loan" : "Credit card"}</small>
                </div>
                <MiniSpark values={account.series} falling={account.delta <= 0} />
                <div className="account-trend-value">
                  <strong>{formatMoney(account.current)}</strong>
                  <span className={account.delta < 0 ? "delta down" : account.delta > 0 ? "delta up" : "delta"}>
                    {account.delta > 0 ? "+" : ""}
                    {formatMoney(account.delta)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
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

function MiniSpark({ values, falling }: { values: number[]; falling: boolean }) {
  const width = 72;
  const height = 28;
  const pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const d = values
    .map((value, index) => {
      const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={`mini-spark ${falling ? "is-down" : "is-up"}`}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path d={d} fill="none" />
    </svg>
  );
}
