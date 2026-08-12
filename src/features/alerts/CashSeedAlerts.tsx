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
