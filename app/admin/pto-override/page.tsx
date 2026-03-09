"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";

type UserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role: AppUser["role"];
  active: boolean;
};

type UnavailabilityType = "pto" | "sick" | "unpaid" | "other";

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toIsoRange(startIso: string, endIso: string) {
  // returns array of YYYY-MM-DD from start..end inclusive
  const out: string[] = [];
  if (!startIso) return out;

  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${(endIso || startIso)}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  if (start > end) return out;

  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function AdminPtoOverridePage() {
  const { appUser } = useAuthContext();

  const canUse = appUser?.role === "admin" || appUser?.role === "manager";
  const createdByUid = appUser?.uid || "";

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersError, setUsersError] = useState("");

  const [selectedUid, setSelectedUid] = useState("");
  const [type, setType] = useState<UnavailabilityType>("pto");

  const [startDate, setStartDate] = useState(isoTodayLocal());
  const [endDate, setEndDate] = useState(isoTodayLocal());

  const [note, setNote] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("8");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadUsers() {
      setLoadingUsers(true);
      setUsersError("");

      try {
        const snap = await getDocs(collection(db, "users"));
        const items: UserOption[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: d.uid ?? docSnap.id,
            displayName: d.displayName ?? "Unnamed",
            email: d.email ?? undefined,
            role: d.role ?? "technician",
            active: d.active ?? false,
          };
        });

        // only active employees (tech/helper/apprentice/dispatcher/manager/billing/etc)
        const filtered = items.filter((u) => u.active);
        filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(filtered);
      } catch (err: unknown) {
        setUsersError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, []);

  const selectedUser = useMemo(() => {
    return users.find((u) => u.uid === selectedUid) ?? null;
  }, [users, selectedUid]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canUse) return;

    setError("");
    setSuccess("");

    if (!selectedUser) {
      setError("Please select an employee.");
      return;
    }

    const days = toIsoRange(startDate, endDate);
    if (days.length === 0) {
      setError("Please provide a valid date range.");
      return;
    }

    const hpd = Number(hoursPerDay);
    if (!Number.isFinite(hpd) || hpd <= 0) {
      setError("Hours per day must be a positive number.");
      return;
    }

    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      // 1) Create a PTO Request (admin-created)
      const ptoRequestDoc = {
        requesterUid: selectedUser.uid,
        requesterName: selectedUser.displayName,
        requesterEmail: selectedUser.email ?? null,

        source: "admin_override", // key difference vs employee-submitted
        type, // pto | sick | unpaid | other

        startDate,
        endDate,
        days, // store explicit days for quick UI + auditing

        hoursPerDay: hpd,
        totalHours: hpd * days.length,

        status: "approved", // admin override = already approved
        approvedByUid: createdByUid || null,
        approvedAt: nowIso,

        note: note.trim() || null,

        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const createdPtoRef = await addDoc(collection(db, "ptoRequests"), ptoRequestDoc);

      // 2) Create employeeUnavailability blocks (one per day)
      //    This blocks only the employee, not their helper.
      for (const day of days) {
        await addDoc(collection(db, "employeeUnavailability"), {
          uid: selectedUser.uid,
          displayName: selectedUser.displayName,

          date: day,
          type, // pto/sick/unpaid/other
          reason: note.trim() || null,

          source: "admin_override",
          ptoRequestId: createdPtoRef.id,

          active: true,
          createdAt: nowIso,
          createdByUid: createdByUid || null,
          updatedAt: nowIso,
          updatedByUid: createdByUid || null,
        });
      }

      setSuccess(
        `✅ Created ${type.toUpperCase()} override for ${selectedUser.displayName} (${days.length} day${
          days.length === 1 ? "" : "s"
        }). PTO Request ID: ${createdPtoRef.id}`
      );

      setNote("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create admin override.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Admin PTO Override">
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          Admin PTO / Sick Override
        </h1>

        {!canUse ? (
          <p style={{ color: "red" }}>
            You do not have access to this tool. (Admin/Manager only)
          </p>
        ) : null}

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "14px",
            background: "#fafafa",
            marginBottom: "16px",
            maxWidth: "900px",
          }}
        >
          <div style={{ fontWeight: 700 }}>What this does</div>
          <ul style={{ marginTop: "8px", marginBottom: 0, paddingLeft: "18px", color: "#555" }}>
            <li>Creates an approved PTO request (admin-created)</li>
            <li>Creates unavailability blocks for each day in the range</li>
            <li>Blocks only the selected employee; helpers can still be reassigned</li>
          </ul>
        </div>

        {loadingUsers ? <p>Loading employees...</p> : null}
        {usersError ? <p style={{ color: "red" }}>{usersError}</p> : null}

        {!loadingUsers && !usersError ? (
          <form
            onSubmit={handleCreate}
            style={{ display: "grid", gap: "12px", maxWidth: "900px" }}
          >
            <div>
              <label>Employee</label>
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                disabled={!canUse}
                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
              >
                <option value="">Select an employee...</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as UnavailabilityType)}
                disabled={!canUse}
                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
              >
                <option value="pto">PTO</option>
                <option value="sick">Sick</option>
                <option value="unpaid">Unpaid</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
              <div>
                <label>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!canUse}
                  style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                />
              </div>

              <div>
                <label>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={!canUse}
                  style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                />
              </div>
            </div>

            <div>
              <label>Hours per day (default 8)</label>
              <input
                type="number"
                min="1"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
                disabled={!canUse}
                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
              />
              <div style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
                We’ll later validate eligibility + balances from QuickBooks PTO bank. For now, this logs approved time off and blocks scheduling.
              </div>
            </div>

            <div>
              <label>Note / Reason</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!canUse}
                placeholder="Example: Out sick, family emergency, PTO day..."
                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
              />
            </div>

            {error ? <p style={{ color: "red" }}>{error}</p> : null}
            {success ? <p style={{ color: "green" }}>{success}</p> : null}

            <button
              type="submit"
              disabled={!canUse || saving}
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
              {saving ? "Creating..." : "Create Admin Override"}
            </button>
          </form>
        ) : null}

        {selectedUser ? (
          <div
            style={{
              marginTop: "18px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              background: "white",
              maxWidth: "900px",
            }}
          >
            <div style={{ fontWeight: 700 }}>Selected Employee</div>
            <div style={{ marginTop: "6px", fontSize: "13px", color: "#555" }}>
              {selectedUser.displayName} • {selectedUser.role} • {selectedUser.email || "No email"}
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}