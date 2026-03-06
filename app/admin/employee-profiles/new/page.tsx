"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { EmploymentStatus, LaborRole } from "../../../../src/types/employee-profile";

type DcflowUser = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;
};

const laborRoles: LaborRole[] = [
  "technician",
  "helper",
  "apprentice",
  "dispatcher",
  "billing",
  "admin",
  "manager",
  "other",
];

const employmentStatuses: EmploymentStatus[] = ["current", "inactive", "seasonal"];

// Removes any undefined values (Firestore rejects undefined)
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep) as unknown as T;
  }

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }

  return value;
}

export default function NewEmployeeProfilePage() {
  const { appUser } = useAuthContext();

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedUid, setSelectedUid] = useState("");
  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedUid),
    [users, selectedUid]
  );

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [employmentStatus, setEmploymentStatus] =
    useState<EmploymentStatus>("current");
  const [laborRole, setLaborRole] = useState<LaborRole>("technician");

  const [defaultPairedTechUid, setDefaultPairedTechUid] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function loadUsers() {
      setLoadingUsers(true);
      setError("");

      try {
        const q = query(collection(db, "users"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: DcflowUser[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: docSnap.id,
            displayName: d.displayName ?? "",
            email: d.email ?? "",
            role: d.role ?? "",
            active: d.active ?? true,
          };
        });

        setUsers(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load DCFlow users.");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, []);

  useEffect(() => {
    // Auto-fill from selected user (only if blank)
    if (!selectedUser) return;
    if (!displayName) setDisplayName(selectedUser.displayName || "");
    if (!email) setEmail(selectedUser.email || "");
  }, [selectedUser, displayName, email]);

  const techUsers = useMemo(() => {
    return users.filter(
      (u) =>
        (u.role || "").toLowerCase() === "technician" ||
        (u.role || "").toLowerCase() === "admin"
    );
  }, [users]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const nowIso = new Date().toISOString();

      const displayNameClean = displayName.trim();
      if (!displayNameClean) {
        setError("Display name is required.");
        setSaving(false);
        return;
      }

      const selectedUidClean = selectedUid.trim();
      const emailClean = email.trim();
      const phoneClean = phone.trim();
      const pairedTechClean = defaultPairedTechUid.trim();
      const notesClean = notes.trim();

      // IMPORTANT: Use null (not undefined) for optional Firestore fields
      const payload = stripUndefinedDeep({
        userUid: selectedUidClean ? selectedUidClean : null,
        displayName: displayNameClean,
        email: emailClean ? emailClean : null,
        phone: phoneClean ? phoneClean : null,
        employmentStatus,
        laborRole,
        defaultPairedTechUid: pairedTechClean ? pairedTechClean : null,
        qboEmployeeId: null,
        notes: notesClean ? notesClean : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const ref = await addDoc(collection(db, "employeeProfiles"), payload);
      window.location.href = `/admin/employee-profiles/${ref.id}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create employee profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Employee Profile" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <h1 style={{ fontSize: "24px", fontWeight: 900, marginTop: 0 }}>
            New Employee Profile
          </h1>

          <Link
            href="/admin/employee-profiles"
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
            Back
          </Link>
        </div>

        {loadingUsers ? <p>Loading DCFlow users...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loadingUsers ? (
          <form
            onSubmit={handleCreate}
            style={{ maxWidth: "860px", display: "grid", gap: "12px" }}
          >
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "white" }}>
              <h2 style={{ marginTop: 0 }}>Link to DCFlow User (optional)</h2>

              <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                Select User
              </label>
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
              >
                <option value="">— No user linked —</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName || "Unnamed"} — {u.email || "no email"} ({u.role || "no role"})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "white" }}>
              <h2 style={{ marginTop: 0 }}>Profile</h2>

              <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                Display Name *
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                required
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "white" }}>
              <h2 style={{ marginTop: 0 }}>Employment</h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>Employment Status</label>
                  <select
                    value={employmentStatus}
                    onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatus)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  >
                    {employmentStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>Labor Role</label>
                  <select
                    value={laborRole}
                    onChange={(e) => setLaborRole(e.target.value as LaborRole)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  >
                    {laborRoles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                  Default Paired Technician (helpers/apprentices)
                </label>
                <select
                  value={defaultPairedTechUid}
                  onChange={(e) => setDefaultPairedTechUid(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                >
                  <option value="">— None —</option>
                  {techUsers.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName || "Unnamed"} — {u.email || "no email"}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
                fontWeight: 900,
                width: "fit-content",
              }}
            >
              {saving ? "Creating..." : "Create Employee Profile"}
            </button>
          </form>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}