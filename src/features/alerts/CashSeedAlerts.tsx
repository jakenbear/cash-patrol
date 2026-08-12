import { Link } from "react-router-dom";
import { formatMoney, type CashSeedAlert } from "../../lib/paycheckPlan";

export function CashSeedAlerts({ alerts }: { alerts: CashSeedAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="panel alert-panel" aria-live="polite">
      <div className="section-heading">
        <h2>Cash seed alerts</h2>
        <Link className="text-button" to="/setup">
          Fix in Setup
        </Link>
      </div>
      <p className="muted">
        These bills auto-withdraw soon, but the cash account doesn’t hold enough yet.
      </p>
      <ul className="alert-list">
        {alerts.map((alert) => (
          <li key={alert.cashAccountId}>
            <div className="alert-head">
              <strong>{alert.cashAccountName}</strong>
              <span className="alert-shortfall">Need {formatMoney(alert.shortfall)} more</span>
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
