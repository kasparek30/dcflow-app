"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";

type UserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role?: string;
  active: boolean;
};

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminMyDayPickerPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [dateIso, setDateIso] = useState(isoTodayLocal());

  const canView = appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      setError("");

      try {
        const snap = await getDocs(collection(db, "users"));
        const items: UserOption[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: d.uid ?? docSnap.id,
            displayName: d.displayName ?? "Unnamed",
            email: d.email ?? undefined,
            role: d.role ?? undefined,
            active: d.active ?? false,
          };
        });

        items.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        setUsers(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;

    return users.filter((u) => {
      const blob = [
        u.displayName,
        u.email,
        u.role,
        u.uid,
        u.active ? "active" : "inactive",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return blob.includes(s);
    });
  }, [users, search]);

  if (!canView) {
    return (
      <ProtectedPage fallbackTitle="Admin My Day">
        <AppShell appUser={appUser}>
          <p style={{ color: "red" }}>You do not have permission to view Admin My Day.</p>
        </AppShell>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Admin My Day">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Admin: View My Day</h1>
            <p style={{ marginTop: "6px", color: "#666" }}>
              Pick an employee and a date to view their schedule feed.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#666" }}>Date</label>
              <input
                type="date"
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
                style={{ display: "block", padding: "8px", border: "1px solid #ccc", borderRadius: "10px" }}
              />
            </div>

            <div style={{ minWidth: "260px" }}>
              <label style={{ fontSize: "12px", color: "#666" }}>Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, role, uid..."
                style={{ display: "block", width: "100%", padding: "8px", border: "1px solid #ccc", borderRadius: "10px" }}
              />
            </div>
          </div>
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading users...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <div style={{ marginTop: "16px", display: "grid", gap: "10px", maxWidth: "900px" }}>
            {filtered.length === 0 ? (
              <div style={{ border: "1px dashed #ccc", borderRadius: "12px", padding: "14px", background: "white", color: "#666" }}>
                No matching users.
              </div>
            ) : (
              filtered.map((u) => (
                <Link
                  key={u.uid}
                  href={`/admin/my-day/${u.uid}?date=${encodeURIComponent(dateIso)}`}
                  style={{
                    display: "block",
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    padding: "12px",
                    background: "white",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{u.displayName}</div>
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                        {u.email || "—"} • {u.role || "—"}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                        UID: {u.uid}
                      </div>
                    </div>

                    <div style={{ fontSize: "12px", color: u.active ? "#1b7f3a" : "#999" }}>
                      {u.active ? "Active" : "Inactive"}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}