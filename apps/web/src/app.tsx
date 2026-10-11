import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/app-shell";
import { ErrorBlock, LoadingBlock } from "./components/page";
import { useStatus } from "./lib/queries";
import { AccountsPage } from "./pages/accounts";
import { DashboardPage } from "./pages/dashboard";
import { HistoryPage } from "./pages/history";
import { LoginPage } from "./pages/login";
import { RuleEditorPage } from "./pages/rule-editor";
import { RulesPage } from "./pages/rules";
import { RunsPage } from "./pages/runs";
import { SettingsPage } from "./pages/settings";
import { SetupPage } from "./pages/setup";

export function App() {
  const status = useStatus();

  if (status.data === undefined) {
    return status.isError ? (
      <div className="mx-auto max-w-md p-6">
        <ErrorBlock error={status.error} onRetry={() => void status.refetch()} />
      </div>
    ) : (
      <LoadingBlock />
    );
  }

  const { initialized, setupTokenRequired, user } = status.data;

  // Until an owner exists, every URL leads to the setup page.
  if (!initialized) {
    return (
      <Routes>
        <Route element={<SetupPage tokenRequired={setupTokenRequired} />} path="/setup" />
        <Route element={<Navigate replace to="/setup" />} path="*" />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<Navigate replace to="/login" />} path="*" />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell username={user.username} />}>
        <Route element={<DashboardPage />} index />
        <Route element={<AccountsPage />} path="accounts" />
        <Route element={<RulesPage />} path="rules" />
        <Route element={<RuleEditorPage />} path="rules/new" />
        <Route element={<RuleEditorPage />} path="rules/:id" />
        <Route element={<HistoryPage />} path="history" />
        <Route element={<RunsPage />} path="runs" />
        <Route element={<SettingsPage />} path="settings" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
  );
}
