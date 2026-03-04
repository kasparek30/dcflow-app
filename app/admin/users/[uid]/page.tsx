// app/admin/users/[uid]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { AppUser, AppUserRole, LaborRoleType } from "../../../../src/types/app-user";

type Props = {
  params: Promise<{ uid: string }>;
};

type TechnicianOption = { uid: string; displayName: string; active: boolean };

const ROLE_OPTIONS: AppUserRole[] = [
  "admin",
  "dispatcher",
  "manager",
  "billing",
  "technician",
  "helper",
  "apprentice",
  "office_display",
];

const LABOR_ROLE_OPTIONS: LaborRoleType[] = ["lead_field", "support_field", "office"];

export default function AdminUserDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [uid, setUid] = useState("");

  const [userDoc, setUserDoc] = useState<AppUser | null>(null);
  const [techOptions, setTechOptions] = useState<TechnicianOption[]>([]);

  // form fields
  const [role, setRole] = useState<AppUserRole>("technician");
  const [laborRoleType, setLaborRoleType] = useState<LaborRoleType>("lead_field");
  const [holidayEligible, setHolidayEligible] = useState(true);
  const [defaultDailyHolidayHours, setDefaultDailyHolidayHours] = useState<number>(8);

  const [preferredTechnicianId, setPreferredTechnicianId] = useState<string>("");

  const preferredTechName = useMemo(() => {
    const match = techOptions.find((t) => t.uid === preferredTechnicianId);
    return match?.displayName || "";
  }, [preferredTechnicianId, techOptions]);

  useEffect(() => {
    async function load() {
      try {
        const resolved = await params;
        setUid(resolved.uid);

        const [userSnap, usersSnap] = await Promise.all([
          getDoc(doc(db, "users", resolved.uid)),
          getDocs(query(collection(db, "users"), orderBy("displayName"))),
        ]);

        const techs: TechnicianOption[] = usersSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              uid: data.uid ?? d.id,
              displayName: data.displayName ?? "Unnamed Tech",
              active: data.active ?? false,
              role: data.role ?? "technician",
            };
          })
          .filter((u: any) => u.role === "technician" && u.active)
          .map((u: any) => ({ uid: u.uid, displayName: u.displayName, active: u.active }));

        setTechOptions(techs);

        if (!userSnap.exists()) {
          setError("User doc not found.");
          setLoading(false);
          return;
        }

        const data = userSnap.data();

        const u: AppUser = {
          uid: data.uid ?? userSnap.id,
          displayName: data.displayName ?? "—",
          email: data.email ?? "—",
          role: data.role ?? "technician",
          active: data.active ?? false,

          laborRoleType: data.laborRoleType ?? undefined,
          preferredTechnicianId: data.preferredTechnicianId ?? null,
          preferredTechnicianName: data.preferredTechnicianName ?? null,
          holidayEligible: typeof data.holidayEligible === "boolean" ? data.holidayEligible : undefined,
          defaultDailyHolidayHours:
            typeof data.defaultDailyHolidayHours === "number" ? data.defaultDailyHolidayHours : undefined,
        };

        setUserDoc(u);

        // hydrate form defaults
        setRole(u.role);
        setLaborRoleType(u.laborRoleType ?? (u.role === "helper" || u.role === "apprentice" ? "support_field" : "lead_field"));
        setHolidayEligible(typeof u.holidayEligible === "boolean" ? u.holidayEligible : true);
        setDefaultDailyHolidayHours(typeof u.defaultDailyHolidayHours === "number" ? u.defaultDailyHolidayHours : 8);

        setPreferredTechnicianId(u.preferredTechnicianId ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load user.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userDoc) return;

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const isSupport = role === "helper" || role === "apprentice";
      const finalLaborRoleType: LaborRoleType =
        role === "admin" ||
        role === "dispatcher" ||
        role === "manager" ||
        role === "billing" ||
        role === "office_display"
          ? "office"
          : isSupport
          ? "support_field"
          : laborRoleType;

      const preferredId = isSupport ? (preferredTechnicianId || null) : null;
      const preferredName = isSupport ? (preferredTechName || null) : null;

      await updateDoc(doc(db, "users", userDoc.uid), {
        role,
        laborRoleType: finalLaborRoleType,
        holidayEligible,
        defaultDailyHolidayHours,

        preferredTechnicianId: preferredId,
        preferredTechnicianName: preferredName,

        updatedAt: new Date().toISOString(),
      });

      setSaveMsg("Saved!");
      setUserDoc({
        ...userDoc,
        role,
        laborRoleType: finalLaborRoleType,
        holidayEligible,
        defaultDailyHolidayHours,
        preferredTechnicianId: preferredId,
        preferredTechnicianName: preferredName,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  const isSupportRole = role === "helper" || role === "apprentice";
  const isOfficeRole =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "billing" ||
    role === "office_display";

  return (
    <ProtectedPage fallbackTitle="Edit User">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>Edit User</h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              {userDoc ? (
                <>
                  <strong>{userDoc.displayName}</strong> • {userDoc.email}
                </>
              ) : (
                "—"
              )}
            </p>
          </div>

          <Link
            href="/admin/users"
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
              height: "fit-content",
            }}
          >
            Back to Users
          </Link>
        </div>

        <div style={{ marginTop: "16px" }}>
          {loading ? <p>Loading user...</p> : null}
          {error ? <p style={{ color: "red" }}>{error}</p> : null}
          {saveMsg ? <p style={{ color: "green" }}>{saveMsg}</p> : null}
        </div>

        {!loading && !error && userDoc ? (
          <form
            onSubmit={handleSave}
            style={{
              marginTop: "12px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              maxWidth: "720px",
              background: "#fafafa",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontWeight: 700 }}>Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AppUserRole)}
                style={{ padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Techs can be assigned. Helpers/apprentices ride along (support labor).
              </div>
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontWeight: 700 }}>Labor Role Type</label>
              <select
                value={isOfficeRole ? "office" : laborRoleType}
                onChange={(e) => setLaborRoleType(e.target.value as LaborRoleType)}
                disabled={isOfficeRole || isSupportRole}
                style={{ padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
              >
                {LABOR_ROLE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Office roles auto-lock to <strong>office</strong>. Helpers/apprentices auto-lock to{" "}
                <strong>support_field</strong>.
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e6e6e6",
                borderRadius: "12px",
                padding: "12px",
                background: "white",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                Helper / Apprentice Default Pairing
              </div>

              <div style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
                If this user is a helper/apprentice, select their usual technician. This reduces clicks in dispatch.
              </div>

              <select
                value={isSupportRole ? preferredTechnicianId : ""}
                onChange={(e) => setPreferredTechnicianId(e.target.value)}
                disabled={!isSupportRole}
                style={{ padding: "10px", borderRadius: "10px", border: "1px solid #ccc", width: "100%" }}
              >
                <option value="">— No default pairing —</option>
                {techOptions.map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.displayName}
                  </option>
                ))}
              </select>

              {isSupportRole ? (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                  Selected: <strong>{preferredTechName || "None"}</strong>
                </div>
              ) : (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "#999" }}>
                  (Only applies to helper/apprentice roles.)
                </div>
              )}
            </div>

            <div
              style={{
                border: "1px solid #e6e6e6",
                borderRadius: "12px",
                padding: "12px",
                background: "white",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontWeight: 800 }}>Holiday Pay Settings</div>

              <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  checked={holidayEligible}
                  onChange={(e) => setHolidayEligible(e.target.checked)}
                />
                Holiday Eligible
              </label>

              <div style={{ display: "grid", gap: "6px" }}>
                <label style={{ fontWeight: 700 }}>Default Daily Holiday Hours</label>
                <input
                  type="number"
                  step="0.25"
                  min={0}
                  value={defaultDailyHolidayHours}
                  onChange={(e) => setDefaultDailyHolidayHours(Number(e.target.value))}
                  style={{ padding: "10px", borderRadius: "10px", border: "1px solid #ccc", width: "200px" }}
                />
                <div style={{ fontSize: "12px", color: "#666" }}>
                  Common value is 8.0 hours.
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
                width: "fit-content",
                fontWeight: 800,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}