// app/time-entries/[timeEntryId]/page.tsx
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
import type { WeeklyTimesheet } from "../../../src/types/weekly-timesheet";

type Props = {
  params: Promise<{ timeEntryId: string }>;
};

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentWeekMondayIso() {
  const today = new Date();
  const base = new Date(today);
  base.setHours(12, 0, 0, 0);

  const day = base.getDay(); // Sun 0 ... Sat 6
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);

  return toIsoDate(monday);
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

export default function TimeEntryDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timeEntryId, setTimeEntryId] = useState("");
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [matchingTimesheet, setMatchingTimesheet] = useState<WeeklyTimesheet | null>(null);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [hours, setHours] = useState(0);
  const [billable, setBillable] = useState(false);
  const [serviceTicketId, setServiceTicketId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectStageKey, setProjectStageKey] = useState<"" | "roughIn" | "topOutVent" | "trimFinish">("");
  const [linkedTechnicianId, setLinkedTechnicianId] = useState("");
  const [linkedTechnicianName, setLinkedTechnicianName] = useState("");
  const [notes, setNotes] = useState("");

  const canEditOtherUsers =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadEntry() {
      try {
        const resolved = await params;
        const nextId = resolved.timeEntryId;
        setTimeEntryId(nextId);

        const entrySnap = await getDoc(doc(db, "timeEntries", nextId));

        if (!entrySnap.exists()) {
          setError("Time entry not found.");
          setLoading(false);
          return;
        }

        const data = entrySnap.data();

        const item: TimeEntry = {
          id: entrySnap.id,
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

        setEntry(item);

        setHours(item.hours);
        setBillable(item.billable);
        setServiceTicketId(item.serviceTicketId ?? "");
        setProjectId(item.projectId ?? "");
        setProjectStageKey(
          (item.projectStageKey as "" | "roughIn" | "topOutVent" | "trimFinish") ?? ""
        );
        setLinkedTechnicianId(item.linkedTechnicianId ?? "");
        setLinkedTechnicianName(item.linkedTechnicianName ?? "");
        setNotes(item.notes ?? "");

        const weeklyQ = query(
          collection(db, "weeklyTimesheets"),
          where("employeeId", "==", item.employeeId),
          where("weekStartDate", "==", item.weekStartDate),
          where("weekEndDate", "==", item.weekEndDate)
        );

        const weeklySnap = await getDocs(weeklyQ);

        if (!weeklySnap.empty) {
          const tsDoc = weeklySnap.docs[0];
          const tsData = tsDoc.data();

          const ts: WeeklyTimesheet = {
            id: tsDoc.id,
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
            nonBillableHours: typeof tsData.nonBillableHours === "number" ? tsData.nonBillableHours : 0,
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

          setMatchingTimesheet(ts);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load time entry.");
      } finally {
        setLoading(false);
      }
    }

    loadEntry();
  }, [params]);

  const isOwnEntry = useMemo(() => {
    if (!entry || !appUser?.uid) return false;
    return entry.employeeId === appUser.uid;
  }, [entry, appUser?.uid]);

  const isHistoricalWeek = useMemo(() => {
    if (!entry) return true;
    return entry.weekStartDate < getCurrentWeekMondayIso();
  }, [entry]);

  const isTimesheetLocked = useMemo(() => {
    if (!matchingTimesheet) return false;

    return (
      matchingTimesheet.status === "submitted" ||
      matchingTimesheet.status === "approved" ||
      matchingTimesheet.status === "exported_to_quickbooks"
    );
  }, [matchingTimesheet]);

  const canEdit = useMemo(() => {
    if (!entry || !appUser) return false;
    if (!isOwnEntry && !canEditOtherUsers) return false;
    if (isHistoricalWeek) return false;
    if (isTimesheetLocked) return false;
    return true;
  }, [entry, appUser, isOwnEntry, canEditOtherUsers, isHistoricalWeek, isTimesheetLocked]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!entry) {
      setError("Missing time entry.");
      return;
    }

    if (!canEdit) {
      setError("This time entry is read-only.");
      return;
    }

    if (hours <= 0) {
      setError("Hours must be greater than 0.");
      return;
    }

    if (entry.category === "service_ticket" && !serviceTicketId.trim()) {
      setError("Service Ticket ID is required for service ticket entries.");
      return;
    }

    if (entry.category === "project_stage") {
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
    setSaveMsg("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "timeEntries", entry.id), {
        hours,
        billable,

        serviceTicketId: serviceTicketId.trim() || null,
        projectId: projectId.trim() || null,
        projectStageKey: projectStageKey || null,

        linkedTechnicianId: linkedTechnicianId.trim() || null,
        linkedTechnicianName: linkedTechnicianName.trim() || null,

        notes: notes.trim() || null,
        updatedAt: nowIso,
      });

      setEntry({
        ...entry,
        hours,
        billable,
        serviceTicketId: serviceTicketId.trim() || undefined,
        projectId: projectId.trim() || undefined,
        projectStageKey: projectStageKey || undefined,
        linkedTechnicianId: linkedTechnicianId.trim() || undefined,
        linkedTechnicianName: linkedTechnicianName.trim() || undefined,
        notes: notes.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveMsg("Time entry saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save time entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Edit Time Entry">
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
              Edit Time Entry
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Open-week entries can be adjusted before payroll is finalized.
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

        {loading ? <p style={{ marginTop: "16px" }}>Loading time entry...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ marginTop: "16px", color: "green" }}>{saveMsg}</p> : null}

        {!loading && entry ? (
          <>
            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "900px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                {formatCategory(entry.category)}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Employee: {entry.employeeName}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Entry Date: {entry.entryDate}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Payroll Week: {entry.weekStartDate} through {entry.weekEndDate}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Source: {entry.source === "auto_suggested" ? "Auto-Suggested" : "Manual"}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Pay Type: {entry.payType}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Time Entry ID: {timeEntryId}
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: canEdit ? "#fafafa" : "#f7f7f7",
                maxWidth: "900px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                Edit Rules
              </div>

              <div style={{ fontSize: "13px", color: "#555" }}>
                Your entry is {canEdit ? "currently editable." : "currently read-only."}
              </div>

              {isHistoricalWeek ? (
                <div style={{ fontSize: "12px", color: "#8a5a00" }}>
                  This entry belongs to a historical week, so it is locked in v1.
                </div>
              ) : null}

              {isTimesheetLocked ? (
                <div style={{ fontSize: "12px", color: "#8a5a00" }}>
                  The matching weekly timesheet is already {matchingTimesheet?.status}, so this entry is locked.
                </div>
              ) : null}

              {!isOwnEntry && !canEditOtherUsers ? (
                <div style={{ fontSize: "12px", color: "#8a5a00" }}>
                  You can only edit your own entries.
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSave}
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: canEdit ? "#fafafa" : "#f7f7f7",
                maxWidth: "900px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: "18px" }}>
                Entry Details
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Hours</label>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: canEdit ? "white" : "#f1f1f1",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="checkbox"
                      checked={billable}
                      onChange={(e) => setBillable(e.target.checked)}
                      disabled={!canEdit}
                    />
                    Billable
                  </label>
                </div>
              </div>

              {entry.category === "service_ticket" ? (
                <div>
                  <label style={{ fontWeight: 700 }}>Service Ticket ID</label>
                  <input
                    value={serviceTicketId}
                    onChange={(e) => setServiceTicketId(e.target.value)}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: canEdit ? "white" : "#f1f1f1",
                    }}
                  />
                </div>
              ) : null}

              {entry.category === "project_stage" ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label style={{ fontWeight: 700 }}>Project ID</label>
                    <input
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={!canEdit}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: "4px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                        background: canEdit ? "white" : "#f1f1f1",
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
                      disabled={!canEdit}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: "4px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                        background: canEdit ? "white" : "#f1f1f1",
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

              {(entry.linkedTechnicianId || entry.linkedTechnicianName || entry.employeeRole === "helper" || entry.employeeRole === "apprentice") ? (
                <div
                  style={{
                    border: "1px solid #e6e6e6",
                    borderRadius: "12px",
                    padding: "12px",
                    background: canEdit ? "white" : "#f1f1f1",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>Support Labor Link</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label style={{ fontWeight: 700 }}>Linked Technician ID</label>
                      <input
                        value={linkedTechnicianId}
                        onChange={(e) => setLinkedTechnicianId(e.target.value)}
                        disabled={!canEdit}
                        style={{
                          display: "block",
                          width: "100%",
                          marginTop: "4px",
                          padding: "10px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                          background: canEdit ? "white" : "#f1f1f1",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 700 }}>Linked Technician Name</label>
                      <input
                        value={linkedTechnicianName}
                        onChange={(e) => setLinkedTechnicianName(e.target.value)}
                        disabled={!canEdit}
                        style={{
                          display: "block",
                          width: "100%",
                          marginTop: "4px",
                          padding: "10px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                          background: canEdit ? "white" : "#f1f1f1",
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
                  rows={5}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: canEdit ? "white" : "#f1f1f1",
                  }}
                />
              </div>

              <div
                style={{
                  border: "1px solid #e6e6e6",
                  borderRadius: "12px",
                  padding: "12px",
                  background: canEdit ? "white" : "#f1f1f1",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "6px" }}>
                  Good to know
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  This is what lets an employee adjust an auto-suggested project-stage entry from a default 8.0 hours down to the real worked time for that day.
                </div>
              </div>

              {canEdit ? (
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
                  {saving ? "Saving..." : "Save Time Entry"}
                </button>
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
                  Read-Only Entry
                </span>
              )}
            </form>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}