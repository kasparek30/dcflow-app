// app/admin/employee-profiles/[profileId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { EmployeeProfile, EmploymentStatus, LaborRole } from "../../../../src/types/employee-profile";

type DcflowUser = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;
};

type PageProps = {
  params: Promise<{ profileId: string }>;
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

export default function EmployeeProfileDetailPage({ params }: PageProps) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profileId, setProfileId] = useState("");
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [error, setError] = useState("");

  // Form state
  const [userUid, setUserUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>("current");
  const [laborRole, setLaborRole] = useState<LaborRole>("technician");
  const [defaultPairedTechUid, setDefaultPairedTechUid] = useState("");
  const [notes, setNotes] = useState("");

  const selectedUser = useMemo(() => users.find((u) => u.uid === userUid), [users, userUid]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const resolved = await params;
        const id = resolved.profileId;
        setProfileId(id);

        // Load profile
        const ref = doc(db, "employeeProfiles", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Employee profile not found.");
          setLoading(false);
          return;
        }

        const d = snap.data();

        const item: EmployeeProfile = {
          id: snap.id,
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

        setProfile(item);

        // Seed form values
        setUserUid(item.userUid || "");
        setDisplayName(item.displayName);
        setEmail(item.email || "");
        setPhone(item.phone || "");
        setEmploymentStatus(item.employmentStatus);
        setLaborRole(item.laborRole);
        setDefaultPairedTechUid(item.defaultPairedTechUid || "");
        setNotes(item.notes || "");

        // Load users for dropdown
        const qUsers = query(collection(db, "users"), orderBy("displayName"));
        const snapUsers = await getDocs(qUsers);

        const userItems: DcflowUser[] = snapUsers.docs.map((docSnap) => {
          const u = docSnap.data();
          return {
            uid: docSnap.id,
            displayName: u.displayName ?? "",
            email: u.email ?? "",
            role: u.role ?? "",
            active: u.active ?? true,
          };
        });

        setUsers(userItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load employee profile.");
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [params]);

  useEffect(() => {
    // Optional helper: if a user is selected and fields are empty, auto-fill
    if (!selectedUser) return;

    if (!displayName) setDisplayName(selectedUser.displayName || "");
    if (!email) setEmail(selectedUser.email || "");
  }, [selectedUser, displayName, email]);

  const techUsers = useMemo(() => {
    return users.filter((u) => (u.role || "").toLowerCase() === "technician" || (u.role || "").toLowerCase() === "admin");
  }, [users]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError("");

    try {
      const nowIso = new Date().toISOString();

      const payload: Partial<EmployeeProfile> = {
        userUid: userUid.trim() || undefined,
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        employmentStatus,
        laborRole,
        defaultPairedTechUid: defaultPairedTechUid.trim() || undefined,
        notes: notes.trim() || undefined,
        updatedAt: nowIso,
      };

      if (!payload.displayName) {
        setError("Display name is required.");
        setSaving(false);
        return;
      }

      await updateDoc(doc(db, "employeeProfiles", profile.id), {
        ...payload,
        // never write undefined into Firestore
        userUid: payload.userUid ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        defaultPairedTechUid: payload.defaultPairedTechUid ?? null,
        notes: payload.notes ?? null,
      });

      setProfile({
        ...profile,
        ...payload,
      } as EmployeeProfile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save employee profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    const ok = window.confirm("Delete this employee profile? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    setError("");

    try {
      await deleteDoc(doc(db, "employeeProfiles", profile.id));
      window.location.href = "/admin/employee-profiles";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete employee profile.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profile" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, marginTop: 0 }}>
              Employee Profile
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Profile ID: {profileId}
            </p>
          </div>

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

        {loading ? <p>Loading...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && profile ? (
          <form onSubmit={handleSave} style={{ maxWidth: "860px", display: "grid", gap: "12px" }}>
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "white" }}>
              <h2 style={{ marginTop: 0 }}>Link to DCFlow User (optional)</h2>

              <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                Linked User
              </label>
              <select
                value={userUid}
                onChange={(e) => setUserUid(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
              >
                <option value="">— No user linked —</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName || "Unnamed"} — {u.email || "no email"} ({u.role || "no role"})
                  </option>
                ))}
              </select>

              <p style={{ marginTop: "8px", color: "#666", fontSize: "13px" }}>
                This controls who logs in. Operational truth is stored on the profile itself.
              </p>
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
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                    Email
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                    Phone
                  </label>
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
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                    Employment Status
                  </label>
                  <select
                    value={employmentStatus}
                    onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatus)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  >
                    {employmentStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                    Labor Role
                  </label>
                  <select
                    value={laborRole}
                    onChange={(e) => setLaborRole(e.target.value as LaborRole)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                  >
                    {laborRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
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
                <label style={{ display: "block", fontWeight: 800, marginBottom: "6px" }}>
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
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
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {deleting ? "Deleting..." : "Delete Profile"}
              </button>
            </div>
          </form>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}