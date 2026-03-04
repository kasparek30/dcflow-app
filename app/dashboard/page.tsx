"use client";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

export default function DashboardPage() {
  const { authUser, appUser } = useAuthContext();

  return (
    <ProtectedPage fallbackTitle="Dashboard">
      <AppShell appUser={appUser}>
        <h1 className="text-2xl font-bold mb-6">DCFlow Dashboard</h1>

        <div className="space-y-2 text-sm">
          <p>
            <strong>Authenticated UID:</strong> {authUser?.uid || "—"}
          </p>
          <p>
            <strong>Display Name:</strong> {appUser?.displayName || "—"}
          </p>
          <p>
            <strong>Email:</strong> {appUser?.email || "—"}
          </p>
          <p>
            <strong>Role:</strong> {appUser?.role || "—"}
          </p>
          <p>
            <strong>Active:</strong> {appUser ? String(appUser.active) : "—"}
          </p>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}