// app/admin/page.tsx
"use client";

import Link from "next/link";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

type AdminCard = {
  title: string;
  description: string;
  href: string;
};

export default function AdminHomePage() {
  const { appUser } = useAuthContext();

  const cards: AdminCard[] = [
    {
      title: "Users",
      description:
        "Manage DCFlow login users (roles, active status, labor role fields, etc).",
      href: "/admin/users",
    },
    {
      title: "Employee Profiles",
      description:
        "Operational roster truth for DCFlow (employment status, labor role, pairing, and QBO linking).",
      href: "/admin/employee-profiles",
    },
    {
      title: "Company Holidays",
      description:
        "Create and manage company holidays that block scheduling and impact timesheets.",
      href: "/admin/holidays",
    },
    {
      title: "Auto-Suggest Time Sync",
      description:
        "Admin tool to test time entry auto-suggestions from ticket visits and project stages.",
      href: "/admin/auto-suggest-sync",
    },
  ];

  return (
    <ProtectedPage fallbackTitle="Admin" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginTop: 0 }}>
          Admin
        </h1>
        <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
          Admin tools for managing DCFlow settings and company data.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              style={{
                display: "block",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "14px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: "16px" }}>{c.title}</div>
              <div style={{ marginTop: "8px", color: "#666", fontSize: "13px" }}>
                {c.description}
              </div>
              <div style={{ marginTop: "10px", fontWeight: 800, fontSize: "13px" }}>
                Open →
              </div>
            </Link>
          ))}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}