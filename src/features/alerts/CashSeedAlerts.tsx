import { Link } from "react-router-dom";
import { formatMoney, type CashSeedAlert } from "../../lib/paycheckPlan";

export function CashSeedAlerts({ alerts }: { alerts: CashSeedAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="panel alert-panel" aria-live="polite">
      <div className="section-heading">
        <h2>Cash seed alerts</h2>
      </div>
      <p className="muted">
        Seed these cash accounts for auto-withdraws in this pay cycle only.
      </p>
      <ul className="alert-list">
        {alerts.map((alert) => (
          <li key={alert.cashAccountId}>
            <div className="alert-head">
              <strong>{alert.cashAccountName}</strong>
              <span className="alert-shortfall">Seed {formatMoney(alert.shortfall)} more</span>
            </div>
            <small>
              Has {formatMoney(alert.cashBalance)} · upcoming auto-withdraws{" "}
              {formatMoney(alert.needed)}
            </small>
            <ul className="alert-bills">
              {alert.bills.map((bill) => (
                <li key={`${bill.name}-${bill.due}`}>
                  {bill.name} · {bill.due} · {formatMoney(bill.amount)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Compact home nudge — full detail lives on Paycheck. */
export function CashSeedBanner({ alerts }: { alerts: CashSeedAlert[] }) {
  if (alerts.length === 0) return null;

  const totalShortfall = alerts.reduce((sum, alert) => sum + alert.shortfall, 0);
  const label =
    alerts.length === 1
      ? `Seed ${alerts[0]!.cashAccountName} · ${formatMoney(alerts[0]!.shortfall)}`
      : `Seed ${alerts.length} cash accounts · ${formatMoney(totalShortfall)}`;

  return (
    <Link className="seed-banner" to="/paycheck" aria-live="polite">
      <span className="seed-banner-copy">
        <strong>Cash seed</strong>
        <span>{label}</span>
      </span>
      <span className="seed-banner-action">Paycheck</span>
    </Link>
  );
}
