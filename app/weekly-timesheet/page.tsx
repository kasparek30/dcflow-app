// app/weekly-timesheet/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { AppUser } from "../../src/types/app-user";
import type { TimeEntry } from "../../src/types/time-entry";
import type { WeeklyTimesheet, WeeklyTimesheetStatus } from "../../src/types/weekly-timesheet";

type PayrollDay = {
  label: string;
  isoDate: string;
};

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMondayForWeekOffset(weekOffset: number) {
  const today = new Date();
  const base = new Date(today);
  base.setHours(12, 0, 0, 0);
  base.setDate(today.getDate() + weekOffset * 7);

  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);

  return monday;
}

function buildPayrollWeekDays(weekOffset: number): PayrollDay[] {
  const monday = getMondayForWeekOffset(weekOffset);

  return [
    { label: "Monday", isoDate: toIsoDate(monday) },
    {
      label: "Tuesday",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1)),
    },
    {
      label: "Wednesday",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2)),
    },
    {
      label: "Thursday",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)),
    },
    {
      label: "Friday",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)),
    },
  ];
}

function formatDisplayDate(isoDate: string) {
  const safeDate = new Date(`${isoDate}T12:00:00`);
  return safeDate.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function formatCategory(category: TimeEntry["category"]) {
  switch (category) {
    case "service_ticket":
      return "Service Ticket";
    case "project_stage":
      return "Project Stage";
    case "meeting":
      return "Meeting";
    case "shop":
      return "Shop";
    case "office":
      return "Office";
    case "pto":
      return "PTO";
    case "holiday":
      return "Holiday";
    case "manual_other":
      return "Manual Other";
    default:
      return category;
  }
}

function formatStatus(status: WeeklyTimesheetStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported_to_quickbooks":
      return "Exported to QuickBooks";
    default:
      return status;
  }
}

function isWorkedHoursCategory(category: TimeEntry["category"]) {
  return (
    category === "service_ticket" ||
    category === "project_stage" ||
    category === "meeting" ||
    category === "shop" ||
    category === "office" ||
    category === "manual_other"
  );
}

export default function WeeklyTimesheetPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [weekOffset, setWeekOffset] = useState(-1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(appUser?.uid || "");
  const [employeeNote, setEmployeeNote] = useState("");

  const canSelectOtherEmployee =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    if (!selectedEmployeeId && appUser?.uid) {
      setSelectedEmployeeId(appUser.uid);
    }
  }, [appUser?.uid, selectedEmployeeId]);

  useEffect(() => {
    async function loadBaseData() {
      try {
        const [entriesSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "timeEntries")),
          getDocs(collection(db, "users")),
        ]);

        const timeEntryItems: TimeEntry[] = entriesSnap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            employeeRole: data.employeeRole ?? "",
            laborRoleType: data.laborRoleType ?? undefined,

            entryDate: data.entryDate ?? "",
            weekStartDate: data.weekStartDate ?? "",
            weekEndDate: data.weekEndDate ?? "",

            category: data.category ?? "manual_other",
            hours: typeof data.hours === "number" ? data.hours : 0,
            payType: data.payType ?? "regular",
            billable: data.billable ?? false,
            source: data.source ?? "manual_entry",

            serviceTicketId: data.serviceTicketId ?? undefined,
            projectId: data.projectId ?? undefined,
            projectStageKey: data.projectStageKey ?? undefined,

            linkedTechnicianId: data.linkedTechnicianId ?? undefined,
            linkedTechnicianName: data.linkedTechnicianName ?? undefined,

            notes: data.notes ?? undefined,
            timesheetId: data.timesheetId ?? undefined,

            entryStatus: data.entryStatus ?? "draft",

            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        const userItems: AppUser[] = usersSnap.docs.map((docSnap) => {
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

        userItems.sort((a, b) => a.displayName.localeCompare(b.displayName));

        setEntries(timeEntryItems);
        setUsers(userItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load weekly timesheet data.");
      } finally {
        setLoading(false);
      }
    }

    loadBaseData();
  }, []);

  const payrollWeekDays = useMemo(() => buildPayrollWeekDays(weekOffset), [weekOffset]);
  const weekStart = payrollWeekDays[0]?.isoDate ?? "";
  const weekEnd = payrollWeekDays[4]?.isoDate ?? "";

  const selectedEmployee = useMemo(() => {
    return users.find((u) => u.uid === selectedEmployeeId) ?? null;
  }, [users, selectedEmployeeId]);

  useEffect(() => {
    async function loadTimesheetDoc() {
      if (!selectedEmployeeId || !weekStart || !weekEnd) {
        setTimesheet(null);
        setEmployeeNote("");
        return;
      }

      try {
        const q = query(
          collection(db, "weeklyTimesheets"),
          where("employeeId", "==", selectedEmployeeId),
          where("weekStartDate", "==", weekStart),
          where("weekEndDate", "==", weekEnd)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setTimesheet(null);
          setEmployeeNote("");
          return;
        }

        const docSnap = snap.docs[0];
        const data = docSnap.data();

        const item: WeeklyTimesheet = {
          id: docSnap.id,
          employeeId: data.employeeId ?? "",
          employeeName: data.employeeName ?? "",
          employeeRole: data.employeeRole ?? "",
          weekStartDate: data.weekStartDate ?? "",
          weekEndDate: data.weekEndDate ?? "",
          timeEntryIds: Array.isArray(data.timeEntryIds) ? data.timeEntryIds : [],
          totalHours: typeof data.totalHours === "number" ? data.totalHours : 0,
          regularHours: typeof data.regularHours === "number" ? data.regularHours : 0,
          overtimeHours: typeof data.overtimeHours === "number" ? data.overtimeHours : 0,
          ptoHours: typeof data.ptoHours === "number" ? data.ptoHours : 0,
          holidayHours: typeof data.holidayHours === "number" ? data.holidayHours : 0,
          billableHours: typeof data.billableHours === "number" ? data.billableHours : 0,
          nonBillableHours: typeof data.nonBillableHours === "number" ? data.nonBillableHours : 0,
          status: data.status ?? "draft",
          submittedAt: data.submittedAt ?? undefined,
          submittedById: data.submittedById ?? undefined,
          approvedAt: data.approvedAt ?? undefined,
          approvedById: data.approvedById ?? undefined,
          approvedByName: data.approvedByName ?? undefined,
          rejectedAt: data.rejectedAt ?? undefined,
          rejectedById: data.rejectedById ?? undefined,
          rejectionReason: data.rejectionReason ?? undefined,
          quickbooksExportStatus: data.quickbooksExportStatus ?? "not_ready",
          quickbooksExportedAt: data.quickbooksExportedAt ?? undefined,
          quickbooksPayrollBatchId: data.quickbooksPayrollBatchId ?? undefined,
          employeeNote: data.employeeNote ?? undefined,
          managerNote: data.managerNote ?? undefined,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        };

        setTimesheet(item);
        setEmployeeNote(item.employeeNote ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load weekly timesheet record.");
      }
    }

    loadTimesheetDoc();
  }, [selectedEmployeeId, weekStart, weekEnd]);

  const weekEntries = useMemo(() => {
    if (!selectedEmployeeId) return [];

    return entries
      .filter(
        (entry) =>
          entry.employeeId === selectedEmployeeId &&
          entry.entryDate >= weekStart &&
          entry.entryDate <= weekEnd
      )
      .sort((a, b) => {
        const byDate = a.entryDate.localeCompare(b.entryDate);
        if (byDate !== 0) return byDate;
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      });
  }, [entries, selectedEmployeeId, weekStart, weekEnd]);

  const entriesByDay = useMemo(() => {
    const result: Record<string, TimeEntry[]> = {};

    for (const day of payrollWeekDays) {
      result[day.isoDate] = [];
    }

    for (const entry of weekEntries) {
      if (!result[entry.entryDate]) continue;
      result[entry.entryDate].push(entry);
    }

    return result;
  }, [weekEntries, payrollWeekDays]);

  const dayTotals = useMemo(() => {
    const result: Record<string, number> = {};

    for (const day of payrollWeekDays) {
      result[day.isoDate] = (entriesByDay[day.isoDate] ?? []).reduce(
        (sum, entry) => sum + entry.hours,
        0
      );
    }

    return result;
  }, [entriesByDay, payrollWeekDays]);

  const computedTotals = useMemo(() => {
    let workedHours = 0;
    let ptoHours = 0;
    let holidayHours = 0;
    let billableHours = 0;
    let nonBillableHours = 0;

    for (const entry of weekEntries) {
      if (isWorkedHoursCategory(entry.category)) {
        workedHours += entry.hours;
      }

      if (entry.category === "pto") {
        ptoHours += entry.hours;
      }

      if (entry.category === "holiday") {
        holidayHours += entry.hours;
      }

      if (entry.billable) {
        billableHours += entry.hours;
      } else {
        nonBillableHours += entry.hours;
      }
    }

    const regularHours = Math.min(workedHours, 40);
    const overtimeHours = Math.max(workedHours - 40, 0);
    const totalHours = regularHours + overtimeHours + ptoHours + holidayHours;

    return {
      workedHours,
      regularHours,
      overtimeHours,
      ptoHours,
      holidayHours,
      billableHours,
      nonBillableHours,
      totalHours,
    };
  }, [weekEntries]);

  const currentStatus: WeeklyTimesheetStatus = timesheet?.status ?? "draft";

  const canSubmit =
    !!selectedEmployee &&
    currentStatus !== "approved" &&
    currentStatus !== "exported_to_quickbooks" &&
    currentStatus !== "submitted";

  async function handleSubmitTimesheet() {
    if (!selectedEmployee || !appUser) {
      setError("Missing employee context.");
      return;
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const docId = `${selectedEmployee.uid}_${weekStart}`;

      const nextStatus: WeeklyTimesheetStatus = "submitted";

      const payload = {
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,

        weekStartDate: weekStart,
        weekEndDate: weekEnd,

        timeEntryIds: weekEntries.map((entry) => entry.id),

        totalHours: computedTotals.totalHours,
        regularHours: computedTotals.regularHours,
        overtimeHours: computedTotals.overtimeHours,
        ptoHours: computedTotals.ptoHours,
        holidayHours: computedTotals.holidayHours,

        billableHours: computedTotals.billableHours,
        nonBillableHours: computedTotals.nonBillableHours,

        status: nextStatus,

        submittedAt: nowIso,
        submittedById: appUser.uid,

        quickbooksExportStatus: "not_ready",

        employeeNote: employeeNote.trim() || null,
        updatedAt: nowIso,
      };

      await setDoc(
        doc(db, "weeklyTimesheets", docId),
        {
          ...payload,
          createdAt: timesheet?.createdAt ?? nowIso,
        },
        { merge: true }
      );

      setTimesheet({
        id: docId,
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        timeEntryIds: weekEntries.map((entry) => entry.id),
        totalHours: computedTotals.totalHours,
        regularHours: computedTotals.regularHours,
        overtimeHours: computedTotals.overtimeHours,
        ptoHours: computedTotals.ptoHours,
        holidayHours: computedTotals.holidayHours,
        billableHours: computedTotals.billableHours,
        nonBillableHours: computedTotals.nonBillableHours,
        status: nextStatus,
        submittedAt: nowIso,
        submittedById: appUser.uid,
        quickbooksExportStatus: "not_ready",
        employeeNote: employeeNote.trim() || undefined,
        createdAt: timesheet?.createdAt ?? nowIso,
        updatedAt: nowIso,
      });

      setSaveMsg("Weekly timesheet submitted.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit weekly timesheet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!selectedEmployee) {
      setError("Missing employee context.");
      return;
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const docId = `${selectedEmployee.uid}_${weekStart}`;

      const nextStatus: WeeklyTimesheetStatus =
        timesheet?.status === "submitted" ? "submitted" : "draft";

      await setDoc(
        doc(db, "weeklyTimesheets", docId),
        {
          employeeId: selectedEmployee.uid,
          employeeName: selectedEmployee.displayName,
          employeeRole: selectedEmployee.role,

          weekStartDate: weekStart,
          weekEndDate: weekEnd,

          timeEntryIds: weekEntries.map((entry) => entry.id),

          totalHours: computedTotals.totalHours,
          regularHours: computedTotals.regularHours,
          overtimeHours: computedTotals.overtimeHours,
          ptoHours: computedTotals.ptoHours,
          holidayHours: computedTotals.holidayHours,

          billableHours: computedTotals.billableHours,
          nonBillableHours: computedTotals.nonBillableHours,

          status: nextStatus,

          quickbooksExportStatus: timesheet?.quickbooksExportStatus ?? "not_ready",

          employeeNote: employeeNote.trim() || null,
          createdAt: timesheet?.createdAt ?? nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      setTimesheet({
        id: docId,
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        timeEntryIds: weekEntries.map((entry) => entry.id),
        totalHours: computedTotals.totalHours,
        regularHours: computedTotals.regularHours,
        overtimeHours: computedTotals.overtimeHours,
        ptoHours: computedTotals.ptoHours,
        holidayHours: computedTotals.holidayHours,
        billableHours: computedTotals.billableHours,
        nonBillableHours: computedTotals.nonBillableHours,
        status: nextStatus,
        submittedAt: timesheet?.submittedAt,
        submittedById: timesheet?.submittedById,
        quickbooksExportStatus: timesheet?.quickbooksExportStatus ?? "not_ready",
        employeeNote: employeeNote.trim() || undefined,
        createdAt: timesheet?.createdAt ?? nowIso,
        updatedAt: nowIso,
      });

      setSaveMsg(nextStatus === "submitted" ? "Note saved." : "Draft saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Weekly Timesheet">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>
              Weekly Timesheet
            </h1>
            <p style={{ marginTop: "4px", color: "#666", fontSize: "13px" }}>
              Review, total, and submit one payroll week at a time.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Previous Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Next Week
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            background: "#fafafa",
            display: "grid",
            gap: "12px",
            maxWidth: "760px",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            Week of {weekStart} through {weekEnd}
          </div>

          {canSelectOtherEmployee ? (
            <div>
              <label style={{ fontWeight: 700 }}>Employee</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
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
                {users.map((user) => (
                  <option key={user.uid} value={user.uid}>
                    {user.displayName} ({user.role})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "#555" }}>
              Employee: <strong>{selectedEmployee?.displayName || "—"}</strong>
            </div>
          )}

          <div style={{ fontSize: "13px", color: "#555" }}>
            Current Status: <strong>{formatStatus(currentStatus)}</strong>
          </div>

          {timesheet?.submittedAt ? (
            <div style={{ fontSize: "12px", color: "#666" }}>
              Submitted At: {timesheet.submittedAt}
            </div>
          ) : null}
        </div>

        {loading ? <p>Loading weekly timesheet...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ color: "green" }}>{saveMsg}</p> : null}

        {!loading && selectedEmployee ? (
          <>
            <div style={{ display: "grid", gap: "16px" }}>
              {payrollWeekDays.map((day) => {
                const dayEntries = entriesByDay[day.isoDate] ?? [];
                const dayTotal = dayTotals[day.isoDate] ?? 0;

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "16px",
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "18px" }}>
                          {day.label} {formatDisplayDate(day.isoDate)}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                          {day.isoDate}
                        </div>
                      </div>

                      <div style={{ fontSize: "13px", color: "#666", fontWeight: 700 }}>
                        Daily Total: {dayTotal.toFixed(2)} hr
                      </div>
                    </div>

                    {dayEntries.length === 0 ? (
                      <div
                        style={{
                          border: "1px dashed #ccc",
                          borderRadius: "10px",
                          padding: "10px",
                          background: "white",
                          color: "#666",
                          fontSize: "13px",
                        }}
                      >
                        No entries for this day.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {dayEntries.map((entry) => (
                          <div
                            key={entry.id}
                            style={{
                              border: "1px solid #ddd",
                              borderRadius: "10px",
                              padding: "10px",
                              background: "white",
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>
                              {formatCategory(entry.category)}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                              {entry.hours} hr
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Billable: {String(entry.billable)}
                            </div>

                            {entry.linkedTechnicianName ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                Linked Technician: {entry.linkedTechnicianName}
                              </div>
                            ) : null}

                            {entry.serviceTicketId ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                Service Ticket ID: {entry.serviceTicketId}
                              </div>
                            ) : null}

                            {entry.projectId ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                Project ID: {entry.projectId}
                                {entry.projectStageKey ? ` • Stage: ${entry.projectStageKey}` : ""}
                              </div>
                            ) : null}

                            {entry.notes ? (
                              <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                                Notes: {entry.notes}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "18px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "760px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>Weekly Summary</div>

              <div style={{ fontSize: "14px", color: "#444" }}>
                Worked Hours: {computedTotals.workedHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Regular Hours: {computedTotals.regularHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Overtime Hours: {computedTotals.overtimeHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                PTO Hours: {computedTotals.ptoHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Holiday Hours: {computedTotals.holidayHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Billable Hours: {computedTotals.billableHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Non-Billable Hours: {computedTotals.nonBillableHours.toFixed(2)}
              </div>

              <div
                style={{
                  marginTop: "4px",
                  paddingTop: "8px",
                  borderTop: "1px solid #e3e3e3",
                  fontSize: "15px",
                  fontWeight: 800,
                }}
              >
                Total Paid Hours: {computedTotals.totalHours.toFixed(2)}
              </div>

              <div style={{ fontSize: "12px", color: "#666" }}>
                Overtime is calculated only from worked-hour categories above 40. PTO and holiday do not count toward the 40-hour threshold.
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "760px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                Employee Note
              </div>

              <textarea
                value={employeeNote}
                onChange={(e) => setEmployeeNote(e.target.value)}
                rows={4}
                disabled={
                  currentStatus === "approved" ||
                  currentStatus === "exported_to_quickbooks"
                }
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                  background:
                    currentStatus === "approved" ||
                    currentStatus === "exported_to_quickbooks"
                      ? "#f7f7f7"
                      : "white",
                }}
              />

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {currentStatus !== "approved" &&
                currentStatus !== "exported_to_quickbooks" ? (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {saving ? "Saving..." : "Save Draft"}
                  </button>
                ) : null}

                {canSubmit ? (
                  <button
                    type="button"
                    onClick={handleSubmitTimesheet}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {saving ? "Submitting..." : "Submit Timesheet"}
                  </button>
                ) : (
                  <span
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #ddd",
                      background: "#f7f7f7",
                      color: "#777",
                      fontWeight: 700,
                    }}
                  >
                    {currentStatus === "submitted"
                      ? "Already Submitted"
                      : currentStatus === "approved"
                      ? "Approved"
                      : currentStatus === "exported_to_quickbooks"
                      ? "Exported"
                      : "Submission Unavailable"}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}