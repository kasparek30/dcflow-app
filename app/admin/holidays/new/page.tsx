// app/admin/holidays/new/page.tsx
"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { AppUserRole } from "../../../../src/types/app-user";

const ROLE_OPTIONS: AppUserRole[] = [
  "technician",
  "helper",
  "apprentice",
  "dispatcher",
  "manager",
  "billing",
  "admin",
  "office_display",
];

export default function NewHolidayPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [paid, setPaid] = useState(true);
  const [hoursPaid, setHoursPaid] = useState(8);
  const [isFullDay, setIsFullDay] = useState(true);
  const [scheduleBlocked, setScheduleBlocked] = useState(true);
  const [allowEmergencyOverride, setAllowEmergencyOverride] = useState(true);
  const [appliesToRoles, setAppliesToRoles] = useState<AppUserRole[]>([
    "technician",
    "helper",
    "apprentice",
  ]);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleRole(role: AppUserRole) {
    setAppliesToRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Holiday name is required.");
      return;
    }

    if (!holidayDate) {
      setError("Holiday date is required.");
      return;
    }

    if (appliesToRoles.length === 0) {
      setError("Select at least one role.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const docRef = await addDoc(collection(db, "companyHolidays"), {
        name: name.trim(),
        holidayDate,
        paid,
        hoursPaid,
        isFullDay,
        scheduleBlocked,
        allowEmergencyOverride,
        appliesToRoles,
        active,
        notes: notes.trim() || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push(`/admin/holidays/${docRef.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create holiday.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Holiday">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>New Holiday</h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Create a company holiday that can later drive schedule blocking and holiday pay.
            </p>
          </div>

          <Link
            href="/admin/holidays"
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
            Back to Holidays
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: "16px",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            maxWidth: "760px",
            background: "#fafafa",
            display: "grid",
            gap: "12px",
          }}
        >
          <div>
            <label style={{ fontWeight: 700 }}>Holiday Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example: Christmas Day"
              style={{
                display: "block",
                width: "100%",
                padding: "10px",
                marginTop: "4px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Holiday Date</label>
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              style={{
                display: "block",
                width: "240px",
                padding: "10px",
                marginTop: "4px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            />
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
            <div style={{ fontWeight: 800 }}>Pay Settings</div>

            <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
              />
              Paid Holiday
            </label>

            <div>
              <label style={{ fontWeight: 700 }}>Hours Paid</label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={hoursPaid}
                onChange={(e) => setHoursPaid(Number(e.target.value))}
                style={{
                  display: "block",
                  width: "200px",
                  padding: "10px",
                  marginTop: "4px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
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
            <div style={{ fontWeight: 800 }}>Scheduling Rules</div>

            <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                checked={isFullDay}
                onChange={(e) => setIsFullDay(e.target.checked)}
              />
              Full Day
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                checked={scheduleBlocked}
                onChange={(e) => setScheduleBlocked(e.target.checked)}
              />
              Block Scheduling
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                checked={allowEmergencyOverride}
                onChange={(e) => setAllowEmergencyOverride(e.target.checked)}
              />
              Allow Emergency Override
            </label>
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
            <div style={{ fontWeight: 800 }}>Applies To Roles</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: "8px" }}>
              {ROLE_OPTIONS.map((role) => (
                <label
                  key={role}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="checkbox"
                    checked={appliesToRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active
          </label>

          <div>
            <label style={{ fontWeight: 700 }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{
                display: "block",
                width: "100%",
                padding: "10px",
                marginTop: "4px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          {error ? <p style={{ color: "red" }}>{error}</p> : null}

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
            {saving ? "Saving..." : "Create Holiday"}
          </button>
        </form>
      </AppShell>
    </ProtectedPage>
  );
}