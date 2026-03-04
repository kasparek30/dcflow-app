// app/admin/users/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";

export default function AdminUsersPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const q = query(collection(db, "users"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: AppUser[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            uid: data.uid ?? docSnap.id,
            displayName: data.displayName ?? "—",
            email: data.email ?? "—",
            role: data.role ?? "technician",
            active: data.active ?? false,

            laborRoleType: data.laborRoleType ?? undefined,
            preferredTechnicianId: data.preferredTechnicianId ?? null,
            preferredTechnicianName: data.preferredTechnicianName ?? null,
            holidayEligible: data.holidayEligible ?? undefined,
            defaultDailyHolidayHours:
              typeof data.defaultDailyHolidayHours === "number"
                ? data.defaultDailyHolidayHours
                : undefined,
          };
        });

        setUsers(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  return (
    <ProtectedPage fallbackTitle="Admin Users">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>
              Users
            </h1>
            <p style={{ marginTop: "4px", color: "#666", fontSize: "13px" }}>
              Click a user to edit labor & payroll fields.
            </p>
          </div>

          <Link
            href="/admin"
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            Back to Admin
          </Link>
        </div>

        {loading ? <p>Loading users...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && users.length === 0 ? (
          <p>No users found.</p>
        ) : null}

        {!loading && !error && users.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {users.map((u) => (
              <Link
                key={u.uid}
                href={`/admin/users/${u.uid}`}
                style={{
                  display: "block",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "12px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ fontWeight: 800 }}>{u.displayName}</div>
                <div style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
                  {u.email}
                </div>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#444" }}>
                  Role: <strong>{u.role}</strong> • Active:{" "}
                  <strong>{String(u.active)}</strong>
                </div>

                <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                  LaborRoleType: {u.laborRoleType || "—"} • Holiday Eligible:{" "}
                  {typeof u.holidayEligible === "boolean"
                    ? String(u.holidayEligible)
                    : "—"}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Preferred Tech: {u.preferredTechnicianName || "—"}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}