// app/admin/page.tsx
"use client";

import Link from "next/link";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

export default function AdminHomePage() {
  const { appUser } = useAuthContext();

  return (
    <ProtectedPage fallbackTitle="Admin">
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "10px" }}>
          Admin
        </h1>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          Manage users, holidays, payroll-related settings, and system sync tools.
        </p>

        <div style={{ display: "grid", gap: "12px", maxWidth: "560px" }}>
          <Link
            href="/admin/users"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "#fafafa",
            }}
          >
            <div style={{ fontWeight: 700 }}>Users</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Set role, labor role type, helper pairing, and holiday eligibility.
            </div>
          </Link>

          <Link
            href="/admin/holidays"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "#fafafa",
            }}
          >
            <div style={{ fontWeight: 700 }}>Company Holidays</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Define paid holidays, schedule blocking, and emergency override rules.
            </div>
          </Link>

          <Link
            href="/admin/auto-suggest-sync"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "#fafafa",
            }}
          >
            <div style={{ fontWeight: 700 }}>Auto-Suggest Time Sync</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Generate or refresh auto-suggested time entries from ticket visits and project stages.
            </div>
          </Link>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}