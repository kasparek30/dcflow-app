// app/admin/employee-profiles/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type {
  EmployeeProfile,
  EmploymentStatus,
} from "../../../src/types/employee-profile";

type FilterMode = "current" | "inactive" | "all";

type DcflowUser = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;
};

export default function EmployeeProfilesPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterMode>("current");

  const [creatingUid, setCreatingUid] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    setCreateError("");
    setCreateMessage("");

    try {
      const profilesQ = query(
        collection(db, "employeeProfiles"),
        orderBy("displayName")
      );
      const profilesSnap = await getDocs(profilesQ);

      const profileItems: EmployeeProfile[] = profilesSnap.docs.map((docSnap) => {
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

      const usersQ = query(collection(db, "users"), orderBy("displayName"));
      const usersSnap = await getDocs(usersQ);

      const userItems: DcflowUser[] = usersSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          uid: docSnap.id,
          displayName: d.displayName ?? "",
          email: d.email ?? "",
          role: d.role ?? "",
          active: d.active ?? true,
        };
      });

      setProfiles(profileItems);
      setUsers(userItems);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load employee profiles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProfiles = useMemo(() => {
    if (filter === "all") return profiles;
    return profiles.filter((p) => p.employmentStatus === filter);
  }, [profiles, filter]);

  const profileUserUids = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) {
      if (p.userUid) set.add(p.userUid);
    }
    return set;
  }, [profiles]);

  const usersMissingProfiles = useMemo(() => {
    // Only show active DCFlow users by default
    const activeUsers = users.filter((u) => u.active !== false);

    return activeUsers.filter((u) => !profileUserUids.has(u.uid));
  }, [users, profileUserUids]);

  async function handleCreateFromUser(userUid: string) {
    setCreatingUid(userUid);
    setCreateError("");
    setCreateMessage("");

    try {
      const res = await fetch("/api/employee-profiles/create-from-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userUid }),
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data?.error || "Create profile failed.");
        return;
      }

      if (data?.existed) {
        setCreateMessage("Profile already existed — opening it.");
      } else {
        setCreateMessage("Profile created — opening it.");
      }

      const id = data?.profileId;
      if (id) {
        window.location.href = `/admin/employee-profiles/${id}`;
        return;
      }

      // fallback refresh
      await loadAll();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Create profile failed.");
    } finally {
      setCreatingUid(null);
    }
  }

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
              Your operational roster truth (separate from QuickBooks active flags).
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

        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            {/* ✅ Quick Create Section */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "white",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Quick Create from DCFlow Users</h2>
              <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
                These are active DCFlow users who do not yet have an Employee Profile.
                Click <strong>Create Profile</strong> to generate the profile automatically.
              </p>

              {createError ? <p style={{ color: "red" }}>{createError}</p> : null}
              {createMessage ? <p style={{ color: "#0a7" }}>{createMessage}</p> : null}

              {usersMissingProfiles.length === 0 ? (
                <p style={{ marginTop: "10px" }}>
                  ✅ All active users already have employee profiles.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                  {usersMissingProfiles.map((u) => (
                    <div
                      key={u.uid}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: "12px",
                        padding: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {u.displayName || "Unnamed"}
                        </div>
                        <div style={{ fontSize: "13px", color: "#555", marginTop: "4px" }}>
                          {u.email || "no email"} · role: {u.role || "—"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
                          UID: {u.uid}
                        </div>
                      </div>

                      <button
                        onClick={() => handleCreateFromUser(u.uid)}
                        disabled={creatingUid === u.uid}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "12px",
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        {creatingUid === u.uid ? "Creating..." : "Create Profile"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filter Buttons */}
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

            {/* Profiles List */}
            {filteredProfiles.length === 0 ? (
              <p>No employee profiles found for this filter.</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {filteredProfiles.map((p) => (
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
            )}
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}