import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { patrolApi, type DashboardData } from "../../lib/api";
import {
  formatMoney,
  nextBillOccurrence,
  upcomingPayWindow,
  type AccountKind,
} from "../../lib/paycheckPlan";

export function SetupPage({ dashboard }: { dashboard: DashboardData }) {
  const saveSettings = useMutation(patrolApi.saveSettings);
  const upsertBill = useMutation(patrolApi.upsertBill);
  const removeBill = useMutation(patrolApi.removeBill);
  const upsertAccount = useMutation(patrolApi.upsertAccount);
  const removeAccount = useMutation(patrolApi.removeAccount);
  const reorderPaydown = useMutation(patrolApi.reorderPaydown);
  const sortByApr = useMutation(patrolApi.sortByApr);

  const settings = dashboard.settings;
  const settingsFormKey = settings?._id ?? "new-settings";
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const debtAccounts = useMemo(
    () =>
      [...dashboard.accounts]
        .filter((account) => account.kind === "credit" || account.kind === "loan")
        .sort((a, b) => a.priority - b.priority || b.balance - a.balance),
    [dashboard.accounts],
  );

  async function onSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    const form = new FormData(event.currentTarget);
    try {
      const nextWindow = upcomingPayWindow(dashboard.today);
      await saveSettings({
        biweeklyIncome: Number(form.get("biweeklyIncome")),
        nextPayday: nextWindow.windowStart,
        cashFloat: Number(form.get("cashFloat")),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setStatus("Cash flow saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save settings.");
    }
  }

  async function movePriority(index: number, direction: -1 | 1) {
    const next = [...debtAccounts];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    await reorderPaydown({ orderedIds: next.map((account) => account._id) });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Setup</h1>
          <p className="muted">Income, float, bills, accounts, and paydown priority. Paycheques land on the 15th and month-end (Friday if weekend).</p>
        </div>
      </header>

      <section className="panel stack-section">
        <div className="section-heading">
          <h2>Cash flow</h2>
        </div>
        <form className="setup-form" key={settingsFormKey} onSubmit={onSaveSettings}>
          <label>
            Paycheque amount
            <input
              name="biweeklyIncome"
              inputMode="decimal"
              defaultValue={settings?.biweeklyIncome ?? ""}
              required
            />
            <small className="field-hint">
              Paid on the 15th and month-end (Friday if weekend). Override individual upcoming
              cheques on the Paycheck page when amounts change.
            </small>
          </label>
          <label>
            Cash float to keep
            <input
              name="cashFloat"
              inputMode="decimal"
              defaultValue={settings?.cashFloat ?? 150}
              required
            />
            <small className="field-hint">Reserved after each paycheque (e.g. keep $150 in Moola).</small>
          </label>
          <button className="primary-button compact" type="submit">
            Save cash flow
          </button>
        </form>
      </section>

      <BillsEditor
        bills={dashboard.bills}
        cashAccounts={dashboard.accounts.filter((account) => account.kind === "cash")}
        today={dashboard.today}
        onUpsert={upsertBill}
        onRemove={removeBill}
      />

      <section className="panel stack-section">
        <div className="section-heading">
          <h2>Paydown priority</h2>
          <button
            className="text-button"
            type="button"
            onClick={() => void sortByApr({}).then((result) => {
              setStatus(
                result.sorted
                  ? "Priority sorted by highest APR."
                  : "Add APRs first to auto-sort.",
              );
            })}
          >
            Sort by APR
          </button>
        </div>
        <p className="muted">
          Minimums are covered first. Leftover cash goes to priority #1.
        </p>
        <ul className="priority-list">
          {debtAccounts.map((account, index) => (
            <li key={account._id}>
              <div>
                <strong>
                  #{index + 1} {account.name}
                </strong>
                <small>
                  {formatMoney(account.balance)}
                  {account.apr !== undefined ? ` · ${account.apr}% APR` : ""}
                  {account.minPayment !== undefined ? ` · min ${formatMoney(account.minPayment)}` : ""}
                </small>
              </div>
              <div className="priority-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Move up"
                  onClick={() => void movePriority(index, -1)}
                  disabled={index === 0}
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Move down"
                  onClick={() => void movePriority(index, 1)}
                  disabled={index === debtAccounts.length - 1}
                >
                  <ArrowDown aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <AccountsEditor
        accounts={dashboard.accounts}
        onUpsert={upsertAccount}
        onRemove={removeAccount}
      />

      {status && <p className="notice">{status}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function BillsEditor({
  bills,
  cashAccounts,
  today,
  onUpsert,
  onRemove,
}: {
  bills: DashboardData["bills"];
  cashAccounts: DashboardData["accounts"];
  today: string;
  onUpsert: (args: {
    billId?: string;
    name: string;
    amount: number;
    cadence: "biweekly" | "monthly";
    nextDue: string;
    active: boolean;
    cashAccountId?: string;
  }) => Promise<string>;
  onRemove: (args: { billId: string }) => Promise<null>;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<"biweekly" | "monthly">("monthly");
  const [nextDue, setNextDue] = useState(today);
  const [cashAccountId, setCashAccountId] = useState("");
  const [error, setError] = useState("");

  const cashNameById = useMemo(
    () => new Map(cashAccounts.map((account) => [account._id, account.name])),
    [cashAccounts],
  );

  function startNew() {
    setEditingId("new");
    setName("");
    setAmount("");
    setCadence("biweekly");
    setNextDue(today);
    setCashAccountId("");
    setError("");
  }

  function startEdit(billId: string) {
    const bill = bills.find((item) => item._id === billId);
    if (!bill) return;
    setEditingId(billId);
    setName(bill.name);
    setAmount(String(bill.amount));
    setCadence(bill.cadence);
    setNextDue(bill.nextDue);
    setCashAccountId(bill.cashAccountId ?? "");
    setError("");
  }

  async function saveBill(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onUpsert({
        billId: editingId === "new" ? undefined : editingId ?? undefined,
        name,
        amount: Number(amount),
        cadence,
        nextDue,
        active: true,
        cashAccountId: cashAccountId || undefined,
      });
      setEditingId(null);
      setName("");
      setAmount("");
      setCashAccountId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save bill.");
    }
  }

  return (
    <section className="panel stack-section">
      <div className="section-heading">
        <h2>Bills</h2>
        <button className="text-button" type="button" onClick={startNew}>
          Add bill
        </button>
      </div>
      <p className="muted">
        Link auto-withdraw bills to a cash account (e.g. Car Payment → Meridian). Cash Patrol will
        alert you if that cash isn’t seeded before the due date.
      </p>
      <ul className="simple-list">
        {bills.map((bill) => (
          <li key={bill._id}>
            <button
              className="text-button account-edit-trigger"
              type="button"
              onClick={() => startEdit(bill._id)}
            >
              <span>
                {bill.name}
                <small>
                  {cadenceLabel(bill.cadence)} · next{" "}
                  {nextBillOccurrence(
                    {
                      id: bill._id,
                      name: bill.name,
                      amount: bill.amount,
                      cadence: bill.cadence,
                      nextDue: bill.nextDue,
                      active: bill.active,
                      cashAccountId: bill.cashAccountId,
                    },
                    today,
                  )}
                  {bill.cashAccountId
                    ? ` · from ${cashNameById.get(bill.cashAccountId) ?? "cash"}`
                    : ""}
                  {!bill.active ? " · paused" : ""}
                </small>
              </span>
            </button>
            <span className="row-actions">
              <strong>{formatMoney(bill.amount)}</strong>
              <button
                className="icon-button"
                type="button"
                aria-label={`Edit ${bill.name}`}
                onClick={() => startEdit(bill._id)}
              >
                <Pencil aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Delete ${bill.name}`}
                onClick={() => void onRemove({ billId: bill._id })}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {editingId && (
        <form className="setup-form account-edit-form" onSubmit={saveBill}>
          <p className="eyebrow">{editingId === "new" ? "New bill" : "Edit bill"}</p>
          <label>
            Bill name
            <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </label>
          <label>
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label>
            Frequency
            <select
              value={cadence}
              onChange={(event) => setCadence(event.target.value as "biweekly" | "monthly")}
            >
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
            {cadence === "biweekly" && (
              <small className="field-hint">
                Repeats every 14 days from the next due date (e.g. Fridays).
              </small>
            )}
          </label>
          <label>
            Next due
            <input
              type="date"
              value={nextDue}
              onChange={(event) => setNextDue(event.target.value)}
              required
            />
          </label>
          <label>
            Auto-withdraws from
            <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)}>
              <option value="">Not linked</option>
              {cashAccounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name}
                </option>
              ))}
            </select>
            <small className="field-hint">
              If this bill pulls from a bank account automatically, pick that cash account so you get
              a seed alert when it’s short.
            </small>
          </label>
          <div className="form-actions">
            <button className="primary-button compact" type="submit">
              Save bill
            </button>
            <button className="text-button" type="button" onClick={() => setEditingId(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function cadenceLabel(cadence: "biweekly" | "monthly") {
  return cadence === "biweekly" ? "Every 2 weeks" : "Monthly";
}

function AccountsEditor({
  accounts,
  onUpsert,
  onRemove,
}: {
  accounts: DashboardData["accounts"];
  onUpsert: (args: {
    accountId?: string;
    name: string;
    kind: AccountKind;
    balance: number;
    apr?: number;
    minPayment?: number;
    includeInPaydown: boolean;
  }) => Promise<string>;
  onRemove: (args: { accountId: string }) => Promise<null>;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("credit");
  const [balance, setBalance] = useState("0");
  const [apr, setApr] = useState("");
  const [minPayment, setMinPayment] = useState("");
  const [error, setError] = useState("");

  function startEdit(accountId: string) {
    const account = accounts.find((item) => item._id === accountId);
    if (!account) return;
    setEditingId(accountId);
    setName(account.name);
    setKind(account.kind);
    setBalance(String(account.balance));
    setApr(account.apr !== undefined ? String(account.apr) : "");
    setMinPayment(account.minPayment !== undefined ? String(account.minPayment) : "");
    setError("");
  }

  function startNew() {
    setEditingId("new");
    setName("");
    setKind("credit");
    setBalance("0");
    setApr("");
    setMinPayment("");
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await onUpsert({
        accountId: editingId === "new" ? undefined : editingId ?? undefined,
        name,
        kind,
        balance: Number(balance),
        apr: apr === "" ? undefined : Number(apr),
        minPayment: minPayment === "" ? undefined : Number(minPayment),
        includeInPaydown: kind === "credit" || kind === "loan",
      });
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save account.");
    }
  }

  return (
    <section className="panel stack-section">
      <div className="section-heading">
        <h2>Accounts</h2>
        <button className="text-button" type="button" onClick={startNew}>
          Add account
        </button>
      </div>
      <ul className="account-list">
        {accounts.map((account) => (
          <li key={account._id} className="account-list-item">
            <div className="account-list-row">
              <div className="account-list-copy">
                <strong>{account.name}</strong>
                <small>
                  {account.kind}
                  {account.apr !== undefined ? ` · ${account.apr}%` : ""}
                  {account.minPayment !== undefined
                    ? ` · min ${formatMoney(account.minPayment)}`
                    : ""}
                </small>
              </div>
              <div className="row-actions">
                <strong>{formatMoney(account.balance)}</strong>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Edit ${account.name}`}
                  onClick={() => startEdit(account._id)}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Delete ${account.name}`}
                  onClick={() => void onRemove({ accountId: account._id })}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
            {editingId === account._id && (
              <AccountForm
                title={`Rename / edit ${account.name}`}
                name={name}
                kind={kind}
                balance={balance}
                apr={apr}
                minPayment={minPayment}
                error={error}
                onName={setName}
                onKind={setKind}
                onBalance={setBalance}
                onApr={setApr}
                onMinPayment={setMinPayment}
                onSave={save}
                onCancel={() => setEditingId(null)}
              />
            )}
          </li>
        ))}
      </ul>

      {editingId === "new" && (
        <AccountForm
          title="New account"
          name={name}
          kind={kind}
          balance={balance}
          apr={apr}
          minPayment={minPayment}
          error={error}
          onName={setName}
          onKind={setKind}
          onBalance={setBalance}
          onApr={setApr}
          onMinPayment={setMinPayment}
          onSave={save}
          onCancel={() => setEditingId(null)}
        />
      )}
    </section>
  );
}

function AccountForm({
  title,
  name,
  kind,
  balance,
  apr,
  minPayment,
  error,
  onName,
  onKind,
  onBalance,
  onApr,
  onMinPayment,
  onSave,
  onCancel,
}: {
  title: string;
  name: string;
  kind: AccountKind;
  balance: string;
  apr: string;
  minPayment: string;
  error: string;
  onName: (value: string) => void;
  onKind: (value: AccountKind) => void;
  onBalance: (value: string) => void;
  onApr: (value: string) => void;
  onMinPayment: (value: string) => void;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form className="setup-form account-edit-form" onSubmit={onSave}>
      <p className="eyebrow">{title}</p>
      <label>
        Name
        <input value={name} onChange={(event) => onName(event.target.value)} required autoFocus />
      </label>
      <label>
        Type
        <select value={kind} onChange={(event) => onKind(event.target.value as AccountKind)}>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
          <option value="loan">Loan</option>
          <option value="asset">Asset (watch only)</option>
        </select>
      </label>
      <label>
        Balance
        <input
          inputMode="decimal"
          value={balance}
          onChange={(event) => onBalance(event.target.value)}
          required
        />
      </label>
      {(kind === "credit" || kind === "loan") && (
        <>
          <label>
            APR % (optional)
            <input inputMode="decimal" value={apr} onChange={(event) => onApr(event.target.value)} />
          </label>
          <label>
            Minimum payment (optional)
            <input
              inputMode="decimal"
              value={minPayment}
              onChange={(event) => onMinPayment(event.target.value)}
            />
          </label>
        </>
      )}
      <div className="form-actions">
        <button className="primary-button compact" type="submit">
          Save account
        </button>
        <button className="text-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
