import { useEffect, useMemo, useRef, useState } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Download,
  LineChart,
  LogOut,
  Settings2,
  Wallet,
  Banknote,
} from "lucide-react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./features/auth/AuthPage";
import { BalancesPage } from "./features/balances/BalancesPage";
import { PaycheckPage } from "./features/paycheck/PaycheckPage";
import { TrendPage } from "./features/trend/TrendPage";
import { SetupPage } from "./features/setup/SetupPage";
import { patrolApi, type DashboardData } from "./lib/api";
import {
  buildPaycheckPlan,
  buildPaychequeForecasts,
  totalsFromAccounts,
  type PlanAccount,
  type PlanBill,
} from "./lib/paycheckPlan";

export default function App() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <AuthPage />
      </Unauthenticated>
      <Authenticated>
        <Patrol />
      </Authenticated>
    </>
  );
}

function Patrol() {
  const dashboard = useQuery(patrolApi.dashboard);
  const seedAccounts = useMutation(patrolApi.seedAccounts);
  const { signOut } = useAuthActions();
  const [seeding, setSeeding] = useState(false);
  const seedAttempted = useRef(false);

  useEffect(() => {
    if (!dashboard?.needsSeed || seedAttempted.current) return;
    seedAttempted.current = true;
    setSeeding(true);
    void seedAccounts({})
      .catch(() => undefined)
      .finally(() => setSeeding(false));
  }, [dashboard?.needsSeed, seedAccounts]);

  if (dashboard === undefined || (dashboard.needsSeed && seeding)) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <NavLink to="/" className="wordmark">
            <span className="brand-mark small">
              <Wallet aria-hidden="true" />
            </span>
            <span>
              <strong>CASH PATROL</strong>
              <small>BALANCES</small>
            </span>
          </NavLink>
          <div className="topbar-actions">
            <InstallButton />
            <NavLink to="/setup" className="icon-button" aria-label="Setup">
              <Settings2 aria-hidden="true" />
            </NavLink>
            <button
              className="icon-button"
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<BalancesPage dashboard={dashboard} />} />
            <Route path="/paycheck" element={<PaycheckRoute dashboard={dashboard} />} />
            <Route path="/trend" element={<TrendPage dashboard={dashboard} />} />
            <Route path="/setup" element={<SetupPage dashboard={dashboard} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <nav className="bottom-nav" aria-label="Primary navigation">
          <NavItem to="/" end icon={Wallet} label="Balances" />
          <NavItem to="/paycheck" icon={Banknote} label="Paycheck" />
          <NavItem to="/trend" icon={LineChart} label="Trend" />
          <NavItem to="/setup" icon={Settings2} label="Setup" />
        </nav>
      </div>
    </BrowserRouter>
  );
}

function PaycheckRoute({ dashboard }: { dashboard: DashboardData }) {
  const planAccounts: PlanAccount[] = useMemo(
    () =>
      dashboard.accounts.map((account) => ({
        id: account._id,
        name: account.name,
        kind: account.kind,
        balance: account.balance,
        apr: account.apr,
        minPayment: account.minPayment,
        priority: account.priority,
        includeInPaydown: account.includeInPaydown,
      })),
    [dashboard.accounts],
  );
  const planBills: PlanBill[] = useMemo(
    () =>
      dashboard.bills.map((bill) => ({
        id: bill._id,
        name: bill.name,
        amount: bill.amount,
        cadence: bill.cadence,
        nextDue: bill.nextDue,
        active: bill.active,
      })),
    [dashboard.bills],
  );
  const plan = useMemo(
    () =>
      buildPaycheckPlan({
        accounts: planAccounts,
        bills: planBills,
        settings: dashboard.settings,
        asOfDate: dashboard.today,
        incomeByPayday: dashboard.incomeByPayday,
      }),
    [planAccounts, planBills, dashboard.settings, dashboard.today, dashboard.incomeByPayday],
  );
  const forecasts = useMemo(
    () =>
      buildPaychequeForecasts({
        accounts: planAccounts,
        bills: planBills,
        settings: dashboard.settings,
        asOfDate: dashboard.today,
        incomeByPayday: dashboard.incomeByPayday,
        count: 6,
      }),
    [planAccounts, planBills, dashboard.settings, dashboard.today, dashboard.incomeByPayday],
  );
  const totals = useMemo(() => totalsFromAccounts(planAccounts), [planAccounts]);

  return (
    <PaycheckPage
      plan={plan}
      forecasts={forecasts}
      totals={totals}
      today={dashboard.today}
      defaultIncome={dashboard.settings?.biweeklyIncome ?? 0}
      incomeByPayday={dashboard.incomeByPayday}
    />
  );
}

function NavItem({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: typeof Wallet;
  label: string;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? "active" : undefined)}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", ready);
    return () => window.removeEventListener("beforeinstallprompt", ready);
  }, []);

  if (!installPrompt) return null;

  return (
    <button
      className="install-button"
      type="button"
      onClick={() => {
        void installPrompt.prompt().then(() => setInstallPrompt(null));
      }}
    >
      <Download aria-hidden="true" />
      <span>Install</span>
    </button>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loader" aria-hidden="true" />
      <p>Loading Cash Patrol…</p>
    </main>
  );
}
