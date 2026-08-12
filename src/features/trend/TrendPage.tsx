import { useMemo } from "react";
import type { DashboardData } from "../../lib/api";
import { formatMoney } from "../../lib/paycheckPlan";

type Point = { at: number; cash: number; debt: number };

export function TrendPage({ dashboard }: { dashboard: DashboardData }) {
  const series = useMemo(() => buildSeries(dashboard), [dashboard]);
  const latest = series[series.length - 1];
  const first = series[0];
  const debtDelta = latest && first ? latest.debt - first.debt : 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Trend</h1>
          <p className="muted">
            Built from balance overwrites. Informational only — not a transaction ledger.
          </p>
        </div>
      </header>

      {series.length < 2 ? (
        <section className="panel empty-state">
          <p>Update a few balances and a trend will appear here.</p>
        </section>
      ) : (
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
                <span>Debt since first snapshot</span>
              </div>
            </div>
          </div>

          <section className="panel chart-panel">
            <div className="section-heading">
              <h2>Debt vs cash</h2>
              <span>{series.length} points</span>
            </div>
            <Sparkline series={series} />
          </section>
        </>
      )}
    </div>
  );
}

function buildSeries(dashboard: DashboardData): Point[] {
  const balances = new Map(dashboard.accounts.map((account) => [account._id, account.balance]));
  const kinds = new Map(dashboard.accounts.map((account) => [account._id, account.kind]));

  // Replay events oldest → newest onto a running state, sampling after each event.
  const events = [...dashboard.events].sort((a, b) => a.at - b.at);
  if (events.length === 0) {
    return [
      {
        at: Date.now(),
        cash: sumBy(balances, kinds, "cash"),
        debt: sumBy(balances, kinds, "debt"),
      },
    ];
  }

  // Reconstruct starting balances by walking events backward.
  const start = new Map(balances);
  for (const event of [...events].reverse()) {
    start.set(event.accountId, event.previous);
  }

  const running = new Map(start);
  const points: Point[] = [
    {
      at: events[0].at,
      cash: sumBy(running, kinds, "cash"),
      debt: sumBy(running, kinds, "debt"),
    },
  ];

  for (const event of events) {
    running.set(event.accountId, event.next);
    points.push({
      at: event.at,
      cash: sumBy(running, kinds, "cash"),
      debt: sumBy(running, kinds, "debt"),
    });
  }

  return points;
}

function sumBy(
  balances: Map<string, number>,
  kinds: Map<string, string>,
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

function Sparkline({ series }: { series: Point[] }) {
  const width = 320;
  const height = 140;
  const pad = 12;
  const maxValue = Math.max(...series.flatMap((point) => [point.cash, point.debt]), 1);

  const path = (key: "cash" | "debt") =>
    series
      .map((point, index) => {
        const x =
          pad + (index / Math.max(series.length - 1, 1)) * (width - pad * 2);
        const y = height - pad - (point[key] / maxValue) * (height - pad * 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Debt and cash trend">
        <path d={path("debt")} className="spark debt" fill="none" />
        <path d={path("cash")} className="spark cash" fill="none" />
      </svg>
      <div className="spark-legend">
        <span className="debt">Debt</span>
        <span className="cash">Cash</span>
      </div>
    </div>
  );
}
