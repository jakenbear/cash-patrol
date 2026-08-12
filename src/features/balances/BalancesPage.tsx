import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { patrolApi, type Account, type DashboardData } from "../../lib/api";
import { formatMoney, totalsFromAccounts, type PlanAccount } from "../../lib/paycheckPlan";

export function BalancesPage({ dashboard }: { dashboard: DashboardData }) {
  const updateBalance = useMutation(patrolApi.updateBalance);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const accounts: PlanAccount[] = dashboard.accounts.map((account) => ({
    id: account._id,
    name: account.name,
    kind: account.kind,
    balance: account.balance,
    apr: account.apr,
    minPayment: account.minPayment,
    priority: account.priority,
    includeInPaydown: account.includeInPaydown,
  }));
  const totals = totalsFromAccounts(accounts);

  const cashAccounts = useMemo(
    () => dashboard.accounts.filter((account) => account.kind === "cash"),
    [dashboard.accounts],
  );
  const debtAccounts = useMemo(
    () =>
      [...dashboard.accounts]
        .filter((account) => account.kind === "credit" || account.kind === "loan")
        .sort((a, b) => a.priority - b.priority || b.balance - a.balance),
    [dashboard.accounts],
  );
  const watchAccounts = useMemo(
    () => dashboard.accounts.filter((account) => account.kind === "asset"),
    [dashboard.accounts],
  );

  async function save(accountId: string) {
    const value = Number(draft.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a valid balance.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateBalance({ accountId, balance: value });
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update balance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your notepad</p>
          <h1>Balances</h1>
          <p className="muted">Cash on top. Credit cards and loans below. Tap a number to overwrite it.</p>
        </div>
      </header>

      <div className="summary-grid balances-summary">
        <div className="summary-card tone-green">
          <div>
            <strong>{formatMoney(totals.cash)}</strong>
            <span>Cash</span>
          </div>
        </div>
        <div className="summary-card tone-orange">
          <div>
            <strong>{formatMoney(totals.debt)}</strong>
            <span>Debt</span>
          </div>
        </div>
        <div className="summary-card tone-blue">
          <div>
            <strong>{formatMoney(totals.net)}</strong>
            <span>Net</span>
          </div>
        </div>
      </div>

      <section className="notepad panel">
        <div className="notepad-section-label">Cash</div>
        {cashAccounts.map((account) => (
          <AccountRow
            key={account._id}
            account={account}
            delta={dashboard.latestDeltaByAccount[account._id]}
            isEditing={editingId === account._id}
            draft={draft}
            saving={saving}
            onDraft={setDraft}
            onStartEdit={() => {
              setEditingId(account._id);
              setDraft(String(account.balance));
              setError("");
            }}
            onCancel={() => {
              setEditingId(null);
              setError("");
            }}
            onSave={() => void save(account._id)}
          />
        ))}
        {cashAccounts.length === 0 && <p className="notepad-empty">No cash accounts yet.</p>}

        <div className="notepad-divider" role="separator" aria-label="Debt section" />

        <div className="notepad-section-label">Credit cards & loans</div>
        {debtAccounts.map((account) => (
          <AccountRow
            key={account._id}
            account={account}
            delta={dashboard.latestDeltaByAccount[account._id]}
            isEditing={editingId === account._id}
            draft={draft}
            saving={saving}
            onDraft={setDraft}
            onStartEdit={() => {
              setEditingId(account._id);
              setDraft(String(account.balance));
              setError("");
            }}
            onCancel={() => {
              setEditingId(null);
              setError("");
            }}
            onSave={() => void save(account._id)}
          />
        ))}
        {debtAccounts.length === 0 && <p className="notepad-empty">No credit cards or loans yet.</p>}

        {watchAccounts.length > 0 && (
          <>
            <div className="notepad-divider soft" role="separator" aria-label="Watch-only assets" />
            <div className="notepad-section-label muted-label">Watch only</div>
            {watchAccounts.map((account) => (
              <AccountRow
                key={account._id}
                account={account}
                delta={dashboard.latestDeltaByAccount[account._id]}
                isEditing={editingId === account._id}
                draft={draft}
                saving={saving}
                onDraft={setDraft}
                onStartEdit={() => {
                  setEditingId(account._id);
                  setDraft(String(account.balance));
                  setError("");
                }}
                onCancel={() => {
                  setEditingId(null);
                  setError("");
                }}
                onSave={() => void save(account._id)}
              />
            ))}
          </>
        )}
      </section>

      <p className="notice">
        Monthly bills (rent, cable, etc.) live in <strong>Setup → Bills</strong>. They show up on{" "}
        <strong>This paycheck</strong> when due.
      </p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function AccountRow({
  account,
  delta,
  isEditing,
  draft,
  saving,
  onDraft,
  onStartEdit,
  onCancel,
  onSave,
}: {
  account: Account;
  delta?: { previous: number; next: number; at: number };
  isEditing: boolean;
  draft: string;
  saving: boolean;
  onDraft: (value: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const change = delta ? delta.next - delta.previous : null;
  return (
    <div className="notepad-row">
      <div className="notepad-label">
        <strong>{account.name}</strong>
        <small>{kindLabel(account.kind)}</small>
      </div>
      <div className="notepad-value">
        {isEditing ? (
          <form
            className="inline-edit"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <input
              inputMode="decimal"
              value={draft}
              autoFocus
              onChange={(event) => onDraft(event.target.value)}
              aria-label={`${account.name} balance`}
            />
            <button className="primary-button compact" type="submit" disabled={saving}>
              Save
            </button>
            <button className="text-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          </form>
        ) : (
          <button className="balance-button" type="button" onClick={onStartEdit}>
            {formatMoney(account.balance)}
          </button>
        )}
        {change !== null && change !== 0 && !isEditing && (
          <span className={change < 0 ? "delta down" : "delta up"}>
            {change > 0 ? "+" : ""}
            {formatMoney(change)}
          </span>
        )}
      </div>
    </div>
  );
}

function kindLabel(kind: string) {
  switch (kind) {
    case "cash":
      return "Cash";
    case "credit":
      return "Credit";
    case "loan":
      return "Loan";
    case "asset":
      return "Asset · watch only";
    default:
      return kind;
  }
}
