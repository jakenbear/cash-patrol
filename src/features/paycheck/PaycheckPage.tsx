import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { patrolApi } from "../../lib/api";
import {
  effectivePaychequeAmount,
  formatMoney,
  listUpcomingPaydays,
  PAYDOWN_STRATEGY_LABEL,
  type CashSeedAlert,
  type PaycheckPlan,
  type PaychequeForecast,
  type PayoffRunway,
} from "../../lib/paycheckPlan";
import { CashSeedAlerts } from "../alerts/CashSeedAlerts";

export function PaycheckPage({
  plan,
  forecasts,
  runway,
  totals,
  today,
  defaultIncome,
  incomeByPayday,
  cashSeedAlerts,
}: {
  plan: PaycheckPlan;
  forecasts: PaychequeForecast[];
  runway: PayoffRunway | null;
  totals: { cash: number; debt: number };
  today: string;
  defaultIncome: number;
  incomeByPayday: Record<string, number>;
  cashSeedAlerts: CashSeedAlert[];
}) {
  if (!plan.ready) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">This paycheck</p>
            <h1>Plan your pay</h1>
          </div>
        </header>
        <section className="panel empty-state">
          <p>{plan.summary}</p>
          <Link className="primary-button" to="/setup">
            Open Setup
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {plan.windowStart} → {plan.windowEnd}
          </p>
          <h1>This paycheck</h1>
          <p className="muted">
            Plan what to do with this deposit. Pay in order, then update Balances yourself.
          </p>
        </div>
      </header>

      <CashSeedAlerts alerts={cashSeedAlerts} />

      <section className="panel stack-section plan-primary">
        <div className="section-heading">
          <h2>Do this with the cheque</h2>
          <span>{formatMoney(plan.income)} in</span>
        </div>
        <p className="muted plan-strategy">
          Focus: {PAYDOWN_STRATEGY_LABEL[plan.strategy]}
        </p>
        <ul className="simple-list">
          {plan.billsDue.length === 0 ? (
            <li>
              <span>
                Bills
                <small>None due in this window</small>
              </span>
              <strong>{formatMoney(0)}</strong>
            </li>
          ) : (
            plan.billsDue.map((bill) => (
              <li key={bill.id}>
                <span>
                  {bill.name}
                  <small>Bill · due {bill.due}</small>
                </span>
                <strong>{formatMoney(bill.amount)}</strong>
              </li>
            ))
          )}
          {plan.minimums.length === 0 ? (
            <li>
              <span>
                Card minimums
                <small>Add each minimum in Setup → Accounts</small>
              </span>
              <strong>{formatMoney(0)}</strong>
            </li>
          ) : (
            plan.minimums.map((payment) => (
              <li key={`min-${payment.accountId}`}>
                <span>
                  {payment.accountName}
                  <small>Minimum · survive</small>
                </span>
                <strong>{formatMoney(payment.amount)}</strong>
              </li>
            ))
          )}
          <li>
            <span>
              Cash float
              <small>Live until next cheque</small>
            </span>
            <strong>{formatMoney(plan.float)}</strong>
          </li>
          {plan.focusPayment ? (
            <li className="focus-row">
              <span>
                {plan.focusPayment.accountName}
                <small>Focus · pay down</small>
              </span>
              <strong>{formatMoney(plan.focusPayment.amount)}</strong>
            </li>
          ) : (
            <li>
              <span>
                Focus payment
                <small>None left after bills / mins / float</small>
              </span>
              <strong>{formatMoney(0)}</strong>
            </li>
          )}
        </ul>
        <div className="plan-totals">
          <span>Bills {formatMoney(plan.billTotal)}</span>
          <span>Mins {formatMoney(plan.minsTotal)}</span>
          <span>
            Float {formatMoney(plan.float)}
            {plan.float < plan.floatTarget ? ` / ${formatMoney(plan.floatTarget)}` : ""}
          </span>
          <span>
            Focus {formatMoney(plan.focusPayment?.amount ?? 0)}
          </span>
        </div>
      </section>

      {runway && (
        <section className="panel stack-section runway-panel">
          <div className="section-heading">
            <h2>Payoff runway</h2>
            <span>{runway.accountName}</span>
          </div>
          {runway.cheques !== null ? (
            <>
              <p className="runway-hero">
                <strong>~{runway.cheques}</strong> cheques
                {runway.monthsApprox !== null ? (
                  <>
                    {" "}
                    <span className="muted">(~{runway.monthsApprox} mo)</span>
                  </>
                ) : null}
              </p>
              <p className="muted">
                {formatMoney(runway.balance)} on {runway.accountName} · ~{formatMoney(runway.avgAttackPerCheque)}{" "}
                avg attack / cheque
                {runway.projectedPayday ? ` · clears around ${runway.projectedPayday}` : ""}
              </p>
            </>
          ) : (
            <p className="muted">{runway.note}</p>
          )}
          {runway.cheques !== null && <p className="notice">{runway.note}</p>}
        </section>
      )}

      {plan.warnings.length > 0 && (
        <section className="panel warnings">
          {plan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </section>
      )}

      <details className="panel stack-section plan-secondary">
        <summary>
          <h2>Upcoming pay amounts</h2>
          <p className="muted">Adjust a cheque for bonuses or one-off income.</p>
        </summary>
        <UpcomingPaycheques
          today={today}
          defaultIncome={defaultIncome}
          incomeByPayday={incomeByPayday}
          currentPayday={plan.windowStart}
          embedded
        />
      </details>

      <details className="panel stack-section plan-secondary">
        <summary>
          <h2>Looking ahead</h2>
          <p className="muted">Next cheques after bills, mins, and float.</p>
        </summary>
        <LookAhead forecasts={forecasts} currentPayday={plan.windowStart} embedded />
      </details>

      <p className="notice">
        Cash on hand {formatMoney(totals.cash)} · Debt {formatMoney(totals.debt)}
      </p>
    </div>
  );
}

function LookAhead({
  forecasts,
  currentPayday,
  embedded = false,
}: {
  forecasts: PaychequeForecast[];
  currentPayday: string;
  embedded?: boolean;
}) {
  if (forecasts.length === 0) return null;
  const maxIncome = Math.max(...forecasts.map((item) => item.income), 1);

  const body = (
    <ul className="forecast-list">
      {forecasts.map((item) => {
        const focusPct = Math.max(0, Math.min(100, (item.focusAmount / maxIncome) * 100));
        const isCurrent = item.payday === currentPayday;
        return (
          <li key={item.payday} className={isCurrent ? "is-current" : undefined}>
            <div className="forecast-top">
              <div className="forecast-meta">
                <strong>{item.payday}</strong>
                <small>
                  → {item.windowEnd}
                  {isCurrent ? " · this cheque" : ""}
                  {item.customIncome ? " · bonus/custom" : ""}
                </small>
              </div>
              <div className="forecast-focus">
                <strong>{formatMoney(item.focusAmount)}</strong>
                <small>{item.focusName ? `to ${item.focusName}` : "to focus"}</small>
              </div>
            </div>
            <div
              className="forecast-bar"
              role="img"
              aria-label={`Focus ${formatMoney(item.focusAmount)} of ${formatMoney(item.income)} income`}
            >
              <span style={{ width: `${focusPct}%` }} />
            </div>
            <div className="forecast-breakdown">
              <span>In {formatMoney(item.income)}</span>
              <span>Bills {formatMoney(item.billTotal)}</span>
              <span>Mins {formatMoney(item.minsTotal)}</span>
              <span>
                Float {formatMoney(item.float)}
                {item.float < item.floatTarget ? `/${formatMoney(item.floatTarget)}` : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (embedded) return body;

  return (
    <section className="panel stack-section">
      <div className="section-heading">
        <h2>Looking ahead</h2>
      </div>
      <p className="muted">
        What each upcoming cheque can do after bills, card mins, and float. Bonuses you set above
        are included.
      </p>
      {body}
    </section>
  );
}

function UpcomingPaycheques({
  today,
  defaultIncome,
  incomeByPayday,
  currentPayday,
  embedded = false,
}: {
  today: string;
  defaultIncome: number;
  incomeByPayday: Record<string, number>;
  currentPayday: string;
  embedded?: boolean;
}) {
  const upsertPaycheque = useMutation(patrolApi.upsertPaycheque);
  const clearPaycheque = useMutation(patrolApi.clearPaycheque);
  const paydays = useMemo(() => listUpcomingPaydays(today, 6), [today]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busyPayday, setBusyPayday] = useState<string | null>(null);

  function draftFor(payday: string) {
    if (drafts[payday] !== undefined) return drafts[payday];
    return String(effectivePaychequeAmount(payday, defaultIncome, incomeByPayday));
  }

  async function save(payday: string, event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");
    const amount = Number(draftFor(payday).replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid paycheque amount.");
      return;
    }
    setBusyPayday(payday);
    try {
      if (amount === defaultIncome) {
        await clearPaycheque({ payday });
        setStatus(`${payday} reset to default (${formatMoney(defaultIncome)}).`);
      } else {
        await upsertPaycheque({ payday, amount });
        setStatus(`${payday} set to ${formatMoney(amount)}.`);
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[payday];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save paycheque amount.");
    } finally {
      setBusyPayday(null);
    }
  }

  async function reset(payday: string) {
    setBusyPayday(payday);
    setError("");
    try {
      await clearPaycheque({ payday });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[payday];
        return next;
      });
      setStatus(`${payday} reset to default.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset amount.");
    } finally {
      setBusyPayday(null);
    }
  }

  const body = (
    <>
      {!embedded && (
        <p className="muted">
          Default is {formatMoney(defaultIncome)}. Change a future cheque when income shifts (e.g.
          after a tax is paid off or a bonus). Saving the default clears that cheque’s custom
          amount.
        </p>
      )}
      <ul className="paycheque-list">
        {paydays.map((payday) => {
          const isCustom = Object.prototype.hasOwnProperty.call(incomeByPayday, payday);
          const isCurrent = payday === currentPayday;
          return (
            <li key={payday} className={isCurrent ? "is-current" : undefined}>
              <div className="paycheque-meta">
                <strong>{payday}</strong>
                <small>
                  {isCurrent ? "This cheque · " : ""}
                  {isCustom ? "Custom" : "Default"}
                </small>
              </div>
              <form className="paycheque-edit" onSubmit={(event) => void save(payday, event)}>
                <input
                  inputMode="decimal"
                  value={draftFor(payday)}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [payday]: event.target.value }))
                  }
                  aria-label={`Paycheque amount for ${payday}`}
                />
                <button
                  className="primary-button compact"
                  type="submit"
                  disabled={busyPayday === payday}
                >
                  Save
                </button>
                {isCustom && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busyPayday === payday}
                    onClick={() => void reset(payday)}
                  >
                    Reset
                  </button>
                )}
              </form>
            </li>
          );
        })}
      </ul>
      {status && <p className="notice">{status}</p>}
      {error && <p className="form-error">{error}</p>}
    </>
  );

  if (embedded) return body;

  return (
    <section className="panel stack-section">
      <div className="section-heading">
        <h2>Upcoming paycheques</h2>
      </div>
      {body}
    </section>
  );
}
