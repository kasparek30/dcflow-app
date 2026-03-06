"use client";

// app/admin/daily-crew-overrides/page.tsx

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";
import type { DailyCrewOverride } from "../../../src/types/daily-crew-override";

export const dynamic = "force-dynamic";

type UserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role: AppUser["role"];
  active: boolean;
};

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

export default function AdminDailyCrewOverridesPage() {
  const { appUser } = useAuthContext();

  const canEdit =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersError, setUsersError] = useState("");

  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<DailyCrewOverride[]>([]);
  const [listError, setListError] = useState("");

  const [date, setDate] = useState(isoTodayLocal());
  const [helperUid, setHelperUid] = useState("");
  const [assignedTechUid, setAssignedTechUid] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    async function loadUsers() {
      setUsersLoading(true);
      setUsersError("");

      try {
        const snap = await getDocs(collection(db, "users"));
        const rows: UserOption[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: (d.uid ?? docSnap.id) as string,
            displayName: (d.displayName ?? "Unnamed") as string,
            email: (d.email ?? undefined) as string | undefined,
            role: (d.role ?? "technician") as AppUser["role"],
            active: Boolean(d.active ?? false),
          };
        });

        rows.sort((a, b) => {
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return 1;
          return a.displayName.localeCompare(b.displayName);
        });

        setUsers(rows);
      } catch (err: unknown) {
        setUsersError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
  }, []);

  async function reloadList() {
    setListLoading(true);
    setListError("");

    try {
      const q = query(collection(db, "dailyCrewOverrides"), orderBy("date", "desc"));
      const snap = await getDocs(q);

      const rows: DailyCrewOverride[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          date: (d.date ?? "") as string,
          helperUid: (d.helperUid ?? "") as string,
          assignedTechUid: (d.assignedTechUid ?? "") as string,
          note: (d.note ?? undefined) as string | undefined,
          active: Boolean(d.active ?? true),
          createdAt: (d.createdAt ?? undefined) as string | undefined,
          createdByUid: (d.createdByUid ?? undefined) as string | undefined,
          updatedAt: (d.updatedAt ?? undefined) as string | undefined,
          updatedByUid: (d.updatedByUid ?? undefined) as string | undefined,
        };
      });

      setItems(rows);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : "Failed to load overrides.");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    reloadList();
  }, []);

  const userNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.uid, u.displayName);
    return m;
  }, [users]);

  const helperOptions = useMemo(() => {
    return users
      .filter((u) => u.active)
      .filter((u) => {
        const r = normalizeRole(u.role);
        return r === "helper" || r === "apprentice";
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  const techOptions = useMemo(() => {
    return users
      .filter((u) => u.active)
      .filter((u) => normalizeRole(u.role) === "technician")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;

    const d = date.trim();
    const h = helperUid.trim();
    const t = assignedTechUid.trim();

    if (!d) {
      setSaveError("Choose a date.");
      return;
    }
    if (!h) {
      setSaveError("Select a helper/apprentice.");
      return;
    }
    if (!t) {
      setSaveError("Select an assigned technician for today.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const nowIso = new Date().toISOString();

      await addDoc(collection(db, "dailyCrewOverrides"), {
        date: d,
        helperUid: h,
        assignedTechUid: t,
        note: note.trim() || null,
        active: true,
        createdAt: nowIso,
        createdByUid: appUser?.uid || null,
        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
      });

      setSaveSuccess("Daily crew override created.");
      setNote("");
      await reloadList();
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to create override."
      );
    } finally {
      setSaving(false);
    }
  }

  async function setActive(docId: string, nextActive: boolean) {
    if (!canEdit) return;

    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "dailyCrewOverrides", docId), {
        active: nextActive,
        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
      });

      setItems((prev) =>
        prev.map((x) =>
          x.id === docId ? { ...x, active: nextActive, updatedAt: nowIso } : x
        )
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update override.");
    }
  }

  return (
    <ProtectedPage fallbackTitle="Daily Crew Overrides">
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          Daily Crew Overrides
        </h1>

        <p style={{ marginTop: 0, color: "#666", maxWidth: "900px" }}>
          Use this when a <strong>helper/apprentice</strong> should work with a different
          tech for <strong>one specific day</strong> (e.g., their usual tech is sick).
          This does <strong>not</strong> change the project/ticket assignment — it’s just a
          day-of pairing override.
        </p>

        <div style={{ display: "grid", gap: "12px", maxWidth: "900px" }}>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              background: "#fafafa",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginTop: 0,
                marginBottom: "10px",
              }}
            >
              Create Override
            </h2>

            {usersLoading ? <p>Loading users...</p> : null}
            {usersError ? <p style={{ color: "red" }}>{usersError}</p> : null}

            <form onSubmit={handleCreate} style={{ display: "grid", gap: "10px" }}>
              <div>
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "260px",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                />
              </div>

              <div>
                <label>Helper / Apprentice</label>
                <select
                  value={helperUid}
                  onChange={(e) => setHelperUid(e.target.value)}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                >
                  <option value="">Select helper/apprentice...</option>
                  {helperOptions.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Assigned Technician (for that day)</label>
                <select
                  value={assignedTechUid}
                  onChange={(e) => setAssignedTechUid(e.target.value)}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                >
                  <option value="">Select technician...</option>
                  {techOptions.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Note (optional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g., ‘Tech out sick; helper moved to Daniel for the day’"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                />
              </div>

              {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
              {saveSuccess ? <p style={{ color: "green" }}>{saveSuccess}</p> : null}

              <button
                type="submit"
                disabled={saving || !canEdit}
                style={{
                  padding: "10px 16px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  width: "fit-content",
                }}
              >
                {saving ? "Saving..." : canEdit ? "Create Override" : "Read Only"}
              </button>
            </form>
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              background: "white",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginTop: 0,
                marginBottom: "10px",
              }}
            >
              Recent Overrides
            </h2>

            {listLoading ? <p>Loading overrides...</p> : null}
            {listError ? <p style={{ color: "red" }}>{listError}</p> : null}

            {!listLoading && !listError && items.length === 0 ? (
              <p>No overrides yet.</p>
            ) : null}

            {!listLoading && !listError && items.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {items.slice(0, 60).map((it) => (
                  <div
                    key={it.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: "10px",
                      padding: "10px",
                      background: it.active ? "#fff" : "#fafafa",
                      opacity: it.active ? 1 : 0.7,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {it.date} • Helper: {userNameMap.get(it.helperUid) || it.helperUid} → Tech:{" "}
                      {userNameMap.get(it.assignedTechUid) || it.assignedTechUid}
                      {!it.active ? " (inactive)" : ""}
                    </div>

                    {it.note ? (
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                        Note: {it.note}
                      </div>
                    ) : null}

                    {canEdit ? (
                      <div
                        style={{
                          marginTop: "8px",
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {it.active ? (
                          <button
                            type="button"
                            onClick={() => setActive(it.id, false)}
                            style={{
                              padding: "6px 10px",
                              border: "1px solid #ccc",
                              borderRadius: "10px",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            Mark Inactive
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActive(it.id, true)}
                            style={{
                              padding: "6px 10px",
                              border: "1px solid #ccc",
                              borderRadius: "10px",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

export {};