"use client";

// app/admin/unavailability/page.tsx

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  doc,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";
import type {
  EmployeeUnavailability,
  UnavailabilityType,
} from "../../../src/types/unavailability";

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

function formatType(t: UnavailabilityType) {
  switch (t) {
    case "sick":
      return "Sick";
    case "pto":
      return "PTO";
    case "unpaid":
      return "Unpaid";
    case "holiday":
      return "Holiday";
    case "other":
      return "Other";
    default:
      return t;
  }
}

export default function AdminUnavailabilityPage() {
  const { appUser } = useAuthContext();

  const canEdit =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersError, setUsersError] = useState("");

  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<EmployeeUnavailability[]>([]);
  const [listError, setListError] = useState("");

  const [selectedUid, setSelectedUid] = useState("");
  const [date, setDate] = useState(isoTodayLocal());
  const [type, setType] = useState<UnavailabilityType>("sick");
  const [reason, setReason] = useState("");

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

        if (!selectedUid && appUser?.uid) {
          setSelectedUid(appUser.uid);
        }
      } catch (err: unknown) {
        setUsersError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadList() {
    setListLoading(true);
    setListError("");

    try {
      const q = query(collection(db, "employeeUnavailability"), orderBy("date", "desc"));
      const snap = await getDocs(q);

      const rows: EmployeeUnavailability[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          userUid: (d.userUid ?? "") as string,
          date: (d.date ?? "") as string,
          type: (d.type ?? "other") as UnavailabilityType,
          reason: (d.reason ?? undefined) as string | undefined,
          active: Boolean(d.active ?? true),
          createdAt: (d.createdAt ?? undefined) as string | undefined,
          createdByUid: (d.createdByUid ?? undefined) as string | undefined,
          updatedAt: (d.updatedAt ?? undefined) as string | undefined,
          updatedByUid: (d.updatedByUid ?? undefined) as string | undefined,
        };
      });

      setItems(rows);
    } catch (err: unknown) {
      setListError(
        err instanceof Error ? err.message : "Failed to load unavailability list."
      );
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

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;

    if (!selectedUid.trim()) {
      setSaveError("Select an employee.");
      return;
    }
    if (!date.trim()) {
      setSaveError("Choose a date.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const nowIso = new Date().toISOString();

      await addDoc(collection(db, "employeeUnavailability"), {
        userUid: selectedUid.trim(),
        date: date.trim(),
        type,
        reason: reason.trim() || null,
        active: true,
        createdAt: nowIso,
        createdByUid: appUser?.uid || null,
        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
      });

      setSaveSuccess("Unavailability created.");
      setReason("");
      await reloadList();
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to create unavailability."
      );
    } finally {
      setSaving(false);
    }
  }

  async function setActive(docId: string, nextActive: boolean) {
    if (!canEdit) return;

    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "employeeUnavailability", docId), {
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
      alert(err instanceof Error ? err.message : "Failed to update record.");
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profiles" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          Employee Unavailability
        </h1>

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
              Create Unavailability (Sick / PTO / Holiday)
            </h2>

            {usersLoading ? <p>Loading users...</p> : null}
            {usersError ? <p style={{ color: "red" }}>{usersError}</p> : null}

            <form onSubmit={handleCreate} style={{ display: "grid", gap: "10px" }}>
              <div>
                <label>Employee</label>
                <select
                  value={selectedUid}
                  onChange={(e) => setSelectedUid(e.target.value)}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                >
                  <option value="">Select...</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} {u.active ? "" : "(inactive)"} — {u.role}
                    </option>
                  ))}
                </select>
              </div>

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
                <label>Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as UnavailabilityType)}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "260px",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                >
                  <option value="sick">Sick</option>
                  <option value="pto">PTO</option>
                  <option value="holiday">Holiday</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label>Reason (optional)</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={!canEdit}
                  placeholder="Employee-only availability note"
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
                {saving ? "Saving..." : canEdit ? "Create Unavailability" : "Read Only"}
              </button>

              <p style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
                ✅ This blocks ONLY the selected person. Helpers remain available unless they have their own unavailability record.
              </p>
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
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: 0, marginBottom: "10px" }}>
              Recent Unavailability
            </h2>

            {listLoading ? <p>Loading list...</p> : null}
            {listError ? <p style={{ color: "red" }}>{listError}</p> : null}

            {!listLoading && !listError && items.length === 0 ? <p>No records yet.</p> : null}

            {!listLoading && !listError && items.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {items.slice(0, 50).map((it) => (
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
                      {it.date} • {userNameMap.get(it.userUid) || it.userUid} • {formatType(it.type)}
                      {!it.active ? " (inactive)" : ""}
                    </div>

                    {it.reason ? (
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                        Reason: {it.reason}
                      </div>
                    ) : null}

                    {canEdit ? (
                      <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                            Mark Inactive (Cancel)
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

// Safety: forces TS to treat this file as a module in weird edge cases.
export {};