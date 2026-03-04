// app/time-entries/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";
import type { TimeEntryCategory, TimeEntryStatus, TimeEntrySource } from "../../../src/types/time-entry";

type EmployeeOption = AppUser;

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPayrollWeekBounds(entryDate: string) {
  const date = new Date(`${entryDate}T12:00:00`);
  const day = date.getDay(); // Sun 0 ... Sat 6

  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    weekStartDate: toIsoDate(monday),
    weekEndDate: toIsoDate(friday),
  };
}

function defaultBillableForCategory(category: TimeEntryCategory) {
  return category === "service_ticket" || category === "project_stage";
}

export default function NewTimeEntryPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userOptions, setUserOptions] = useState<EmployeeOption[]>([]);
  const [loadError, setLoadError] = useState("");

  const canCreateForOthers =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const todayIso = toIsoDate(new Date());

  const [employeeId, setEmployeeId] = useState(appUser?.uid || "");
  const [entryDate, setEntryDate] = useState(todayIso);
  const [category, setCategory] = useState<TimeEntryCategory>("manual_other");
  const [hours, setHours] = useState(1);
  const [billable, setBillable] = useState(false);
  const [notes, setNotes] = useState("");
  const [serviceTicketId, setServiceTicketId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectStageKey, setProjectStageKey] = useState<"" | "roughIn" | "topOutVent" | "trimFinish">("");
  const [linkedTechnicianId, setLinkedTechnicianId] = useState("");
  const [linkedTechnicianName, setLinkedTechnicianName] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: EmployeeOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            uid: data.uid ?? docSnap.id,
            displayName: data.displayName ?? "Unnamed User",
            email: data.email ?? "",
            role: data.role ?? "technician",
            active: data.active ?? true,
            laborRoleType: data.laborRoleType ?? undefined,
            preferredTechnicianId: data.preferredTechnicianId ?? null,
            preferredTechnicianName: data.preferredTechnicianName ?? null,
            holidayEligible: data.holidayEligible ?? undefined,
            defaultDailyHolidayHours: data.defaultDailyHolidayHours ?? undefined,
          };
        });

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUserOptions(items);

        if (!employeeId && appUser?.uid) {
          setEmployeeId(appUser.uid);
        }
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, [appUser?.uid, employeeId]);

  const selectedEmployee = useMemo(() => {
    return userOptions.find((u) => u.uid === employeeId) ?? null;
  }, [userOptions, employeeId]);

  useEffect(() => {
    setBillable(defaultBillableForCategory(category));
  }, [category]);

  useEffect(() => {
    if (selectedEmployee && (selectedEmployee.role === "helper" || selectedEmployee.role === "apprentice")) {
      setLinkedTechnicianId(selectedEmployee.preferredTechnicianId || "");
      setLinkedTechnicianName(selectedEmployee.preferredTechnicianName || "");
    } else {
      setLinkedTechnicianId("");
      setLinkedTechnicianName("");
    }
  }, [selectedEmployee]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedEmployee) {
      setError("Please select an employee.");
      return;
    }

    if (!entryDate) {
      setError("Entry date is required.");
      return;
    }

    if (hours <= 0) {
      setError("Hours must be greater than 0.");
      return;
    }

    if (category === "service_ticket" && !serviceTicketId.trim()) {
      setError("Service Ticket ID is required for service ticket entries.");
      return;
    }

    if (category === "project_stage") {
      if (!projectId.trim()) {
        setError("Project ID is required for project stage entries.");
        return;
      }
      if (!projectStageKey) {
        setError("Project stage is required for project stage entries.");
        return;
      }
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

      const source: TimeEntrySource = "manual_entry";
      const entryStatus: TimeEntryStatus = "draft";

      await addDoc(collection(db, "timeEntries"), {
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        laborRoleType: selectedEmployee.laborRoleType ?? null,

        entryDate,
        weekStartDate,
        weekEndDate,

        category,
        hours,
        payType: "regular",
        billable,
        source,

        serviceTicketId: serviceTicketId.trim() || null,
        projectId: projectId.trim() || null,
        projectStageKey: projectStageKey || null,

        linkedTechnicianId: linkedTechnicianId || null,
        linkedTechnicianName: linkedTechnicianName || null,

        notes: notes.trim() || null,
        timesheetId: null,

        entryStatus,

        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push("/time-entries");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create time entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Time Entry">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              New Time Entry
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Manual worked-hours entry only. PTO, holiday, and overtime are system-controlled.
            </p>
          </div>

          <Link
            href="/time-entries"
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
            Back to Time Entries
          </Link>
        </div>

        {loadingUsers ? <p style={{ marginTop: "16px" }}>Loading users...</p> : null}
        {loadError ? <p style={{ marginTop: "16px", color: "red" }}>{loadError}</p> : null}

        {!loadingUsers && !loadError ? (
          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: "16px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              maxWidth: "840px",
              background: "#fafafa",
              display: "grid",
              gap: "12px",
            }}
          >
            <div>
              <label style={{ fontWeight: 700 }}>Employee</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={!canCreateForOthers}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              >
                <option value="">Select employee</option>
                {userOptions.map((user) => (
                  <option key={user.uid} value={user.uid}>
                    {user.displayName} ({user.role})
                  </option>
                ))}
              </select>

              {!canCreateForOthers ? (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                  Non-admin users can only create entries for themselves.
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              <div>
                <label style={{ fontWeight: 700 }}>Entry Date</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Hours Worked</label>
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              <div>
                <label style={{ fontWeight: 700 }}>Work Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TimeEntryCategory)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                  }}
                >
                  <option value="service_ticket">Service Ticket</option>
                  <option value="project_stage">Project Stage</option>
                  <option value="meeting">Meeting</option>
                  <option value="shop">Shop</option>
                  <option value="office">Office</option>
                  <option value="manual_other">Manual Other</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={billable}
                    onChange={(e) => setBillable(e.target.checked)}
                  />
                  Billable
                </label>
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
              <div style={{ fontWeight: 800, marginBottom: "6px" }}>Payroll Handling</div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Manual entries are always saved as <strong>regular worked hours</strong>.  
                PTO and holiday entries will be system-generated later, and overtime will be calculated in the weekly timesheet after 40+ regular worked hours.
              </div>
            </div>

            {category === "service_ticket" ? (
              <div>
                <label style={{ fontWeight: 700 }}>Service Ticket ID</label>
                <input
                  value={serviceTicketId}
                  onChange={(e) => setServiceTicketId(e.target.value)}
                  placeholder="Paste ticket document ID"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                  }}
                />
              </div>
            ) : null}

            {category === "project_stage" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Project ID</label>
                  <input
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="Paste project document ID"
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700 }}>Project Stage</label>
                  <select
                    value={projectStageKey}
                    onChange={(e) =>
                      setProjectStageKey(
                        e.target.value as "" | "roughIn" | "topOutVent" | "trimFinish"
                      )
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value="">Select stage</option>
                    <option value="roughIn">Rough-In</option>
                    <option value="topOutVent">Top-Out / Vent</option>
                    <option value="trimFinish">Trim / Finish</option>
                  </select>
                </div>
              </div>
            ) : null}

            {(selectedEmployee?.role === "helper" || selectedEmployee?.role === "apprentice") ? (
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
                <div style={{ fontWeight: 800 }}>Support Labor Link</div>

                <div style={{ fontSize: "12px", color: "#666" }}>
                  Auto-filled from this helper/apprentice’s preferred technician. You can override if needed.
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label style={{ fontWeight: 700 }}>Linked Technician ID</label>
                    <input
                      value={linkedTechnicianId}
                      onChange={(e) => setLinkedTechnicianId(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: "4px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 700 }}>Linked Technician Name</label>
                    <input
                      value={linkedTechnicianName}
                      onChange={(e) => setLinkedTechnicianName(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: "4px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label style={{ fontWeight: 700 }}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {entryDate ? (
              <div style={{ fontSize: "12px", color: "#666" }}>
                Payroll week will be: {getPayrollWeekBounds(entryDate).weekStartDate} through{" "}
                {getPayrollWeekBounds(entryDate).weekEndDate}
              </div>
            ) : null}

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
              {saving ? "Saving..." : "Create Time Entry"}
            </button>
          </form>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}