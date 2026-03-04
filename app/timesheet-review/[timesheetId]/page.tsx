// app/timesheet-review/[timesheetId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { TimeEntry } from "../../../src/types/time-entry";
import type { WeeklyTimesheet, WeeklyTimesheetStatus } from "../../../src/types/weekly-timesheet";

type Props = {
  params: Promise<{ timesheetId: string }>;
};

type PayrollDay = {
  label: string;
  isoDate: string;
};

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

function formatTimesheetStatus(status: WeeklyTimesheetStatus) {
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

function formatDisplayDate(isoDate: string) {
  const safeDate = new Date(`${isoDate}T12:00:00`);
  return safeDate.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function buildPayrollWeekDays(weekStart: string): PayrollDay[] {
  const monday = new Date(`${weekStart}T12:00:00`);

  return [
    { label: "Monday", isoDate: weekStart },
    {
      label: "Tuesday",
      isoDate: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1)
        .toISOString()
        .slice(0, 10),
    },
    {
      label: "Wednesday",
      isoDate: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2)
        .toISOString()
        .slice(0, 10),
    },
    {
      label: "Thursday",
      isoDate: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)
        .toISOString()
        .slice(0, 10),
    },
    {
      label: "Friday",
      isoDate: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)
        .toISOString()
        .slice(0, 10),
    },
  ];
}

export default function TimesheetReviewDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timesheetId, setTimesheetId] = useState("");
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  const [managerNote, setManagerNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    async function loadReviewDetail() {
      try {
        const resolved = await params;
        const nextId = resolved.timesheetId;
        setTimesheetId(nextId);

        const tsSnap = await getDoc(doc(db, "weeklyTimesheets", nextId));

        if (!tsSnap.exists()) {
          setError("Weekly timesheet not found.");
          setLoading(false);
          return;
        }

        const tsData = tsSnap.data();

        const ts: WeeklyTimesheet = {
          id: tsSnap.id,
          employeeId: tsData.employeeId ?? "",
          employeeName: tsData.employeeName ?? "",
          employeeRole: tsData.employeeRole ?? "",
          weekStartDate: tsData.weekStartDate ?? "",
          weekEndDate: tsData.weekEndDate ?? "",
          timeEntryIds: Array.isArray(tsData.timeEntryIds) ? tsData.timeEntryIds : [],
          totalHours: typeof tsData.totalHours === "number" ? tsData.totalHours : 0,
          regularHours: typeof tsData.regularHours === "number" ? tsData.regularHours : 0,
          overtimeHours: typeof tsData.overtimeHours === "number" ? tsData.overtimeHours : 0,
          ptoHours: typeof tsData.ptoHours === "number" ? tsData.ptoHours : 0,
          holidayHours: typeof tsData.holidayHours === "number" ? tsData.holidayHours : 0,
          billableHours: typeof tsData.billableHours === "number" ? tsData.billableHours : 0,
          nonBillableHours:
            typeof tsData.nonBillableHours === "number" ? tsData.nonBillableHours : 0,
          status: tsData.status ?? "draft",
          submittedAt: tsData.submittedAt ?? undefined,
          submittedById: tsData.submittedById ?? undefined,
          approvedAt: tsData.approvedAt ?? undefined,
          approvedById: tsData.approvedById ?? undefined,
          approvedByName: tsData.approvedByName ?? undefined,
          rejectedAt: tsData.rejectedAt ?? undefined,
          rejectedById: tsData.rejectedById ?? undefined,
          rejectionReason: tsData.rejectionReason ?? undefined,
          quickbooksExportStatus: tsData.quickbooksExportStatus ?? "not_ready",
          quickbooksExportedAt: tsData.quickbooksExportedAt ?? undefined,
          quickbooksPayrollBatchId: tsData.quickbooksPayrollBatchId ?? undefined,
          employeeNote: tsData.employeeNote ?? undefined,
          managerNote: tsData.managerNote ?? undefined,
          createdAt: tsData.createdAt ?? undefined,
          updatedAt: tsData.updatedAt ?? undefined,
        };

        setTimesheet(ts);
        setManagerNote(ts.managerNote ?? "");
        setRejectionReason(ts.rejectionReason ?? "");

        const entryQ = query(
          collection(db, "timeEntries"),
          where("employeeId", "==", ts.employeeId),
          where("weekStartDate", "==", ts.weekStartDate),
          where("weekEndDate", "==", ts.weekEndDate)
        );

        const entrySnap = await getDocs(entryQ);

        const entryItems: TimeEntry[] = entrySnap.docs.map((docSnap) => {
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

        entryItems.sort((a, b) => {
          const byDate = a.entryDate.localeCompare(b.entryDate);
          if (byDate !== 0) return byDate;
          return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        });

        setEntries(entryItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load timesheet review detail.");
      } finally {
        setLoading(false);
      }
    }

    loadReviewDetail();
  }, [params]);

  const payrollWeekDays = useMemo(() => {
    if (!timesheet) return [];
    return buildPayrollWeekDays(timesheet.weekStartDate);
  }, [timesheet]);

  const entriesByDay = useMemo(() => {
    const result: Record<string, TimeEntry[]> = {};

    for (const day of payrollWeekDays) {
      result[day.isoDate] = [];
    }

    for (const entry of entries) {
      if (!result[entry.entryDate]) continue;
      result[entry.entryDate].push(entry);
    }

    return result;
  }, [entries, payrollWeekDays]);

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

  const canTakeAction =
    !!timesheet &&
    timesheet.status !== "approved" &&
    timesheet.status !== "exported_to_quickbooks";

  async function setAllEntryStatuses(nextStatus: TimeEntry["entryStatus"]) {
    const updates = entries.map((entry) =>
      updateDoc(doc(db, "timeEntries", entry.id), {
        entryStatus: nextStatus,
        timesheetId: timesheetId,
        updatedAt: new Date().toISOString(),
      })
    );

    await Promise.all(updates);
  }

  async function handleApprove() {
    if (!timesheet || !appUser) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || null,
        rejectionReason: null,
        updatedAt: nowIso,
      });

      await setAllEntryStatuses("approved");

      setTimesheet({
        ...timesheet,
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || undefined,
        rejectionReason: undefined,
        updatedAt: nowIso,
      });

      setEntries((prev) =>
        prev.map((entry) => ({
          ...entry,
          entryStatus: "approved",
          timesheetId: timesheet.id,
          updatedAt: nowIso,
        }))
      );

      setSaveMsg("Timesheet approved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve timesheet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!timesheet || !appUser) return;

    if (!rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || null,
        updatedAt: nowIso,
      });

      await setAllEntryStatuses("rejected");

      setTimesheet({
        ...timesheet,
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || undefined,
        updatedAt: nowIso,
      });

      setEntries((prev) =>
        prev.map((entry) => ({
          ...entry,
          entryStatus: "rejected",
          timesheetId: timesheet.id,
          updatedAt: nowIso,
        }))
      );

      setSaveMsg("Timesheet rejected.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject timesheet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Timesheet Review Detail">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              Timesheet Review Detail
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Review entries, then approve or reject the employee’s weekly timesheet.
            </p>
          </div>

          <Link
            href="/timesheet-review"
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
            Back to Review Queue
          </Link>
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading timesheet review...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ marginTop: "16px", color: "green" }}>{saveMsg}</p> : null}

        {!loading && timesheet ? (
          <>
            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "920px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                {timesheet.employeeName} ({timesheet.employeeRole})
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Week: {timesheet.weekStartDate} through {timesheet.weekEndDate}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Status: {formatTimesheetStatus(timesheet.status)}
              </div>
              {timesheet.submittedAt ? (
                <div style={{ fontSize: "12px", color: "#666" }}>
                  Submitted At: {timesheet.submittedAt}
                </div>
              ) : null}
              {timesheet.approvedAt ? (
                <div style={{ fontSize: "12px", color: "#666" }}>
                  Approved At: {timesheet.approvedAt}
                </div>
              ) : null}
              {timesheet.rejectedAt ? (
                <div style={{ fontSize: "12px", color: "#666" }}>
                  Rejected At: {timesheet.rejectedAt}
                </div>
              ) : null}
            </div>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "920px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>Weekly Summary</div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Total Paid Hours: {timesheet.totalHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Regular: {timesheet.regularHours.toFixed(2)} • OT:{" "}
                {timesheet.overtimeHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                PTO: {timesheet.ptoHours.toFixed(2)} • Holiday:{" "}
                {timesheet.holidayHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Billable: {timesheet.billableHours.toFixed(2)} • Non-Billable:{" "}
                {timesheet.nonBillableHours.toFixed(2)}
              </div>
            </div>

            {timesheet.employeeNote ? (
              <div
                style={{
                  marginTop: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#fafafa",
                  maxWidth: "920px",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "8px" }}>Employee Note</div>
                <div style={{ fontSize: "13px", color: "#555", whiteSpace: "pre-wrap" }}>
                  {timesheet.employeeNote}
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: "16px", display: "grid", gap: "16px" }}>
              {payrollWeekDays.map((day) => {
                const dayEntries = entriesByDay[day.isoDate] ?? [];
                const total = dayTotals[day.isoDate] ?? 0;

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "16px",
                      background: "#fafafa",
                      maxWidth: "920px",
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
                        Daily Total: {total.toFixed(2)} hr
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
                              Billable: {String(entry.billable)} • Source:{" "}
                              {entry.source === "auto_suggested" ? "Auto-Suggested" : "Manual"}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Entry Status: {entry.entryStatus}
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
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "920px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                Manager Review
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Manager Note</label>
                <textarea
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  rows={4}
                  disabled={!canTakeAction || saving}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: canTakeAction ? "white" : "#f1f1f1",
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Rejection Reason</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  disabled={!canTakeAction || saving}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: canTakeAction ? "white" : "#f1f1f1",
                  }}
                />
              </div>

              {canTakeAction ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleApprove}
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
                    {saving ? "Saving..." : "Approve Timesheet"}
                  </button>

                  <button
                    type="button"
                    onClick={handleReject}
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
                    {saving ? "Saving..." : "Reject Timesheet"}
                  </button>
                </div>
              ) : (
                <span
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ddd",
                    background: "#f1f1f1",
                    color: "#777",
                    width: "fit-content",
                    fontWeight: 800,
                  }}
                >
                  Review Locked
                </span>
              )}
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}