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
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          Admin
        </h1>

        <div style={{ display: "grid", gap: "12px", maxWidth: "720px" }}>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              background: "#fafafa",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
              Tools
            </h2>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Admin & operations tools for DCFlow.
            </p>
          </div>

          <Link
            href="/admin/users"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>Users</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Create/update DCFlow users (roles, active status).
            </div>
          </Link>

          <Link
            href="/admin/employee-profiles"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>Employee Profiles</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Labor roles, pairing defaults, payroll metadata.
            </div>
          </Link>

          <Link
            href="/admin/daily-crew-overrides"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>Daily Crew Overrides</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Reassign a helper/apprentice to a different technician for a specific day.
            </div>
          </Link>

          <Link
            href="/admin/unavailability"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>Employee Unavailability</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Mark sick/PTO/holiday days (blocks only that person; helpers can still work).
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
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>Company Holidays</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Maintain holiday calendar for scheduling + timesheets.
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
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>Auto-Suggest Time Sync</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Admin utility for time suggestion/testing.
            </div>
          </Link>

          <Link
            href="/admin/qbo-employee-sync"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>QBO Employee Sync</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Pull employees from QuickBooks into Firestore (qboEmployees).
            </div>
          </Link>

          <Link
            href="/admin/qbo-link-users"
            style={{
              display: "block",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700 }}>QBO Link Users</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Link DCFlow users to QBO employees by email.
            </div>
          </Link>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}