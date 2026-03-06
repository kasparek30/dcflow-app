// app/admin/employee-profiles/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { EmployeeProfile, EmploymentStatus } from "../../../src/types/employee-profile";

type FilterMode = "current" | "inactive" | "all";

export default function EmployeeProfilesPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterMode>("current");

  useEffect(() => {
    async function loadProfiles() {
      setLoading(true);
      setError("");

      try {
        const q = query(collection(db, "employeeProfiles"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: EmployeeProfile[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();

          return {
            id: docSnap.id,
            userUid: d.userUid ?? undefined,
            displayName: d.displayName ?? "",
            email: d.email ?? undefined,
            phone: d.phone ?? undefined,
            employmentStatus: (d.employmentStatus ?? "current") as EmploymentStatus,
            laborRole: (d.laborRole ?? "other") as any,
            defaultPairedTechUid: d.defaultPairedTechUid ?? undefined,
            qboEmployeeId: d.qboEmployeeId ?? undefined,
            notes: d.notes ?? undefined,
            createdAt: d.createdAt ?? "",
            updatedAt: d.updatedAt ?? "",
          };
        });

        setProfiles(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load employee profiles.");
      } finally {
        setLoading(false);
      }
    }

    loadProfiles();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return profiles;
    return profiles.filter((p) => p.employmentStatus === filter);
  }, [profiles, filter]);

  return (
    <ProtectedPage fallbackTitle="Employee Profiles" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              Employee Profiles
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Operational roster truth for DCFlow (separate from QuickBooks active flags).
            </p>
          </div>

          <Link
            href="/admin/employee-profiles/new"
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              background: "white",
              textDecoration: "none",
              fontWeight: 800,
              color: "inherit",
            }}
          >
            New Employee Profile
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#666" }}>Filter:</span>

          <button
            onClick={() => setFilter("current")}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #ccc",
              background: filter === "current" ? "#111" : "white",
              color: filter === "current" ? "white" : "inherit",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Current
          </button>

          <button
            onClick={() => setFilter("inactive")}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #ccc",
              background: filter === "inactive" ? "#111" : "white",
              color: filter === "inactive" ? "white" : "inherit",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Inactive
          </button>

          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #ccc",
              background: filter === "all" ? "#111" : "white",
              color: filter === "all" ? "white" : "inherit",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            All
          </button>
        </div>

        {loading ? <p>Loading employee profiles...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && filtered.length === 0 ? (
          <p>No employee profiles found for this filter.</p>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/admin/employee-profiles/${p.id}`}
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{p.displayName}</div>
                    <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                      {p.email || "—"}
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                      Role: <strong>{p.laborRole}</strong> · Status:{" "}
                      <strong>{p.employmentStatus}</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", fontSize: "12px", color: "#777" }}>
                    <div>Linked User UID:</div>
                    <div style={{ fontWeight: 800 }}>{p.userUid || "—"}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}