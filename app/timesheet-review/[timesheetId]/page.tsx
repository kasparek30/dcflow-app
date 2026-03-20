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
import type { WeeklyTimesheet } from "../../../src/types/weekly-timesheet";
import type { TimeEntry } from "../../../src/types/time-entry";

type Props = {
  params: Promise<{ timesheetId: string }>;
};

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function formatStatus(status: WeeklyTimesheet["status"]) {
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
      return String(status || "");
  }
}

function numOr0(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function stageLabel(stage?: string) {
  const s = safeTrim(stage);
  if (!s) return "";
  if (s === "roughIn") return "Rough-In";
  if (s === "topOutVent") return "Top-Out / Vent";
  if (s === "trimFinish") return "Trim / Finish";
  return s;
}

function isWorkedHoursCategory(category: TimeEntry["category"]) {
  const c = safeTrim(category).toLowerCase();

  // ✅ New schema (what you’re using now)
  if (
    c === "service" ||
    c === "project" ||
    c === "meeting" ||
    c === "shop" ||
    c === "office" ||
    c === "manual_other"
  ) {
    return true;
  }

  // ✅ Legacy schema support (still exists in older records)
  if (c === "service_ticket" || c === "project_stage") return true;

  return false;
}

type ServiceTicketMini = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
};

type ProjectMini = {
  id: string;
  projectName: string;
};

export default function TimesheetReviewDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const canReview =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timesheetId, setTimesheetId] = useState("");
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // Admin Adjust state (hours edits + lock)
  const [editedHoursByEntryId, setEditedHoursByEntryId] = useState<
    Record<string, number>
  >({});
  const [lockByEntryId, setLockByEntryId] = useState<Record<string, boolean>>(
    {}
  );

  // Reject / notes
  const [rejectionReason, setRejectionReason] = useState("");
  const [managerNote, setManagerNote] = useState("");

  // ✅ mini lookups for nicer cards
  const [ticketMiniById, setTicketMiniById] = useState<
    Record<string, ServiceTicketMini>
  >({});
  const [projectMiniById, setProjectMiniById] = useState<
    Record<string, ProjectMini>
  >({});

  // -----------------------------
  // Load timesheet + entries
  // -----------------------------
  useEffect(() => {
    async function load() {
      setError("");
      setOk("");
      setLoading(true);

      try {
        const resolved = await params;
        const id = resolved.timesheetId;
        setTimesheetId(id);

        const tsSnap = await getDoc(doc(db, "weeklyTimesheets", id));
        if (!tsSnap.exists()) {
          setError("Timesheet not found.");
          setLoading(false);
          return;
        }

        const d: any = tsSnap.data();

        const ts: WeeklyTimesheet = {
          id: tsSnap.id,
          employeeId: d.employeeId ?? "",
          employeeName: d.employeeName ?? "",
          employeeRole: d.employeeRole ?? "",
          weekStartDate: d.weekStartDate ?? "",
          weekEndDate: d.weekEndDate ?? "",
          timeEntryIds: Array.isArray(d.timeEntryIds) ? d.timeEntryIds : [],
          totalHours: typeof d.totalHours === "number" ? d.totalHours : 0,
          regularHours: typeof d.regularHours === "number" ? d.regularHours : 0,
          overtimeHours:
            typeof d.overtimeHours === "number" ? d.overtimeHours : 0,
          ptoHours: typeof d.ptoHours === "number" ? d.ptoHours : 0,
          holidayHours:
            typeof d.holidayHours === "number" ? d.holidayHours : 0,
          billableHours:
            typeof d.billableHours === "number" ? d.billableHours : 0,
          nonBillableHours:
            typeof d.nonBillableHours === "number" ? d.nonBillableHours : 0,
          status: d.status ?? "draft",
          submittedAt: d.submittedAt ?? undefined,
          submittedById: d.submittedById ?? undefined,
          approvedAt: d.approvedAt ?? undefined,
          approvedById: d.approvedById ?? undefined,
          approvedByName: d.approvedByName ?? undefined,
          rejectedAt: d.rejectedAt ?? undefined,
          rejectedById: d.rejectedById ?? undefined,
          rejectionReason: d.rejectionReason ?? undefined,
          quickbooksExportStatus: d.quickbooksExportStatus ?? "not_ready",
          quickbooksExportedAt: d.quickbooksExportedAt ?? undefined,
          quickbooksPayrollBatchId: d.quickbooksPayrollBatchId ?? undefined,
          employeeNote: d.employeeNote ?? undefined,
          managerNote: d.managerNote ?? undefined,
          createdAt: d.createdAt ?? undefined,
          updatedAt: d.updatedAt ?? undefined,
        };

        setTimesheet(ts);
        setRejectionReason(safeTrim(ts.rejectionReason));
        setManagerNote(safeTrim(ts.managerNote));

        // ✅ Load entries AUTHORITATIVELY:
        // 1) By timeEntryIds if present
        // 2) Fallback to employee/week query if empty
        const byIds: TimeEntry[] = [];

        if (Array.isArray(ts.timeEntryIds) && ts.timeEntryIds.length > 0) {
          const snaps = await Promise.all(
            ts.timeEntryIds.map(async (eid) => {
              try {
                return await getDoc(doc(db, "timeEntries", eid));
              } catch {
                return null;
              }
            })
          );

          for (const s of snaps) {
            if (!s || !s.exists()) continue;
            const x: any = s.data();
            byIds.push({
              id: s.id,
              employeeId: x.employeeId ?? "",
              employeeName: x.employeeName ?? "",
              employeeRole: x.employeeRole ?? "",
              laborRoleType: x.laborRoleType ?? undefined,
              entryDate: x.entryDate ?? "",
              weekStartDate: x.weekStartDate ?? "",
              weekEndDate: x.weekEndDate ?? "",
              category: x.category ?? "manual_other",
              hours: typeof x.hours === "number" ? x.hours : 0,
              payType: x.payType ?? "regular",
              billable: x.billable ?? false,
              source: x.source ?? "manual_entry",
              serviceTicketId: x.serviceTicketId ?? undefined,
              projectId: x.projectId ?? undefined,
              projectStageKey: x.projectStageKey ?? undefined,
              linkedTechnicianId: x.linkedTechnicianId ?? undefined,
              linkedTechnicianName: x.linkedTechnicianName ?? undefined,
              notes: x.notes ?? undefined,
              timesheetId: x.timesheetId ?? undefined,
              entryStatus: x.entryStatus ?? "draft",
              createdAt: x.createdAt ?? undefined,
              updatedAt: x.updatedAt ?? undefined,
            });
          }
        }

        let items: TimeEntry[] = byIds;

        if (items.length === 0) {
          const qEntries = query(
            collection(db, "timeEntries"),
            where("employeeId", "==", ts.employeeId),
            where("entryDate", ">=", ts.weekStartDate),
            where("entryDate", "<=", ts.weekEndDate)
          );

          const eSnap = await getDocs(qEntries);

          items = eSnap.docs.map((docSnap) => {
            const x: any = docSnap.data();
            return {
              id: docSnap.id,
              employeeId: x.employeeId ?? "",
              employeeName: x.employeeName ?? "",
              employeeRole: x.employeeRole ?? "",
              laborRoleType: x.laborRoleType ?? undefined,
              entryDate: x.entryDate ?? "",
              weekStartDate: x.weekStartDate ?? "",
              weekEndDate: x.weekEndDate ?? "",
              category: x.category ?? "manual_other",
              hours: typeof x.hours === "number" ? x.hours : 0,
              payType: x.payType ?? "regular",
              billable: x.billable ?? false,
              source: x.source ?? "manual_entry",
              serviceTicketId: x.serviceTicketId ?? undefined,
              projectId: x.projectId ?? undefined,
              projectStageKey: x.projectStageKey ?? undefined,
              linkedTechnicianId: x.linkedTechnicianId ?? undefined,
              linkedTechnicianName: x.linkedTechnicianName ?? undefined,
              notes: x.notes ?? undefined,
              timesheetId: x.timesheetId ?? undefined,
              entryStatus: x.entryStatus ?? "draft",
              createdAt: x.createdAt ?? undefined,
              updatedAt: x.updatedAt ?? undefined,
            };
          });
        }

        items.sort(
          (a, b) =>
            a.entryDate.localeCompare(b.entryDate) ||
            (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
        );

        setEntries(items);

        // seed admin adjust fields + locks
        const nextHours: Record<string, number> = {};
        const nextLocks: Record<string, boolean> = {};

        if (items.length && byIds.length) {
          // We loaded with getDoc; we need locks by a second fetch per entry (only if you actually use hoursLocked)
          // BUT: many of your timeEntries already include hoursLocked field. We'll read it safely from doc data.
          for (const it of items) {
            nextHours[it.id] = numOr0(it.hours);
            nextLocks[it.id] = Boolean((it as any)?.hoursLocked);
          }
        } else {
          // We loaded via getDocs; hoursLocked is in those docs (if present)
          for (const it of items) {
            nextHours[it.id] = numOr0(it.hours);
            nextLocks[it.id] = Boolean((it as any)?.hoursLocked);
          }
        }

        setEditedHoursByEntryId(nextHours);
        setLockByEntryId(nextLocks);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load timesheet.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  // -----------------------------
  // Hydrate display names (service ticket / project)
  // -----------------------------
  useEffect(() => {
    async function hydrate() {
      const needTicketIds = new Set<string>();
      const needProjectIds = new Set<string>();

      for (const e of entries) {
        const cat = safeTrim((e as any).category).toLowerCase();

        if (cat === "service" || cat === "service_ticket") {
          const tid = safeTrim((e as any).serviceTicketId);
          if (tid && !ticketMiniById[tid]) needTicketIds.add(tid);
        }

        if (cat === "project" || cat === "project_stage") {
          const pid = safeTrim((e as any).projectId);
          if (pid && !projectMiniById[pid]) needProjectIds.add(pid);
        }
      }

      if (needTicketIds.size === 0 && needProjectIds.size === 0) return;

      const ticketFetches = Array.from(needTicketIds).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "serviceTickets", id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            id,
            customerDisplayName: safeTrim(d.customerDisplayName) || "Customer",
            issueSummary: safeTrim(d.issueSummary) || "Service Ticket",
          } as ServiceTicketMini;
        } catch {
          return null;
        }
      });

      const projectFetches = Array.from(needProjectIds).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "projects", id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            id,
            projectName: safeTrim(d.projectName) || "Project",
          } as ProjectMini;
        } catch {
          return null;
        }
      });

      const [ticketResults, projectResults] = await Promise.all([
        Promise.all(ticketFetches),
        Promise.all(projectFetches),
      ]);

      const nextTickets: Record<string, ServiceTicketMini> = {};
      for (const t of ticketResults) if (t?.id) nextTickets[t.id] = t;

      const nextProjects: Record<string, ProjectMini> = {};
      for (const p of projectResults) if (p?.id) nextProjects[p.id] = p;

      if (Object.keys(nextTickets).length) {
        setTicketMiniById((prev) => ({ ...prev, ...nextTickets }));
      }
      if (Object.keys(nextProjects).length) {
        setProjectMiniById((prev) => ({ ...prev, ...nextProjects }));
      }
    }

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function formatEntryPrimary(e: TimeEntry) {
    const cat = safeTrim((e as any).category).toLowerCase();

    if (cat === "service" || cat === "service_ticket") {
      const tid = safeTrim((e as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      return mini?.customerDisplayName || "Service";
    }

    if (cat === "project" || cat === "project_stage") {
      const pid = safeTrim((e as any).projectId);
      const mini = pid ? projectMiniById[pid] : null;
      return mini?.projectName || "Project";
    }

    return safeTrim((e as any).category) || "Entry";
  }

  function formatEntrySecondary(e: TimeEntry) {
    const cat = safeTrim((e as any).category).toLowerCase();

    if (cat === "service" || cat === "service_ticket") {
      const tid = safeTrim((e as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      return mini?.issueSummary ? `Issue: ${mini.issueSummary}` : "";
    }

    if (cat === "project" || cat === "project_stage") {
      const stage = stageLabel((e as any).projectStageKey);
      return stage ? `Stage: ${stage}` : "";
    }

    return "";
  }

  // -----------------------------
  // Computed totals
  // -----------------------------
  const computed = useMemo(() => {
    let workedHours = 0;
    let ptoHours = 0;
    let holidayHours = 0;
    let billableHours = 0;
    let nonBillableHours = 0;

    for (const e of entries) {
      const hours = numOr0(editedHoursByEntryId[e.id] ?? e.hours);

      if (isWorkedHoursCategory(e.category)) workedHours += hours;

      const cat = safeTrim(e.category).toLowerCase();
      if (cat === "pto") ptoHours += hours;
      if (cat === "holiday") holidayHours += hours;

      if (e.billable) billableHours += hours;
      else nonBillableHours += hours;
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
  }, [entries, editedHoursByEntryId]);

  const status = (timesheet?.status ?? "draft") as WeeklyTimesheet["status"];

  const canApproveReject = canReview && status === "submitted";
  const canAdminAdjust =
    canReview && (status === "submitted" || status === "rejected");

  async function handleSaveAdminAdjust() {
    if (!timesheet) return;
    if (!canAdminAdjust) {
      setError("Admin Adjust is only allowed for Submitted/Rejected timesheets.");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    try {
      const now = nowIso();

      // 1) Update timeEntries (hours + optional lock)
      for (const e of entries) {
        const nextHours = numOr0(editedHoursByEntryId[e.id] ?? e.hours);
        const locked = Boolean(lockByEntryId[e.id]);

        if (!Number.isFinite(nextHours) || nextHours < 0) {
          throw new Error(`Invalid hours for entry ${e.id}.`);
        }

        await updateDoc(doc(db, "timeEntries", e.id), {
          hours: nextHours,
          hoursLocked: locked,
          updatedAt: now,
          updatedByUid: appUser?.uid || null,
          updatedByName: appUser?.displayName || null,
          adminAdjustedAt: now,
        } as any);
      }

      // 2) Update weeklyTimesheet totals + manager note (still submitted/rejected)
      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        totalHours: computed.totalHours,
        regularHours: computed.regularHours,
        overtimeHours: computed.overtimeHours,
        ptoHours: computed.ptoHours,
        holidayHours: computed.holidayHours,
        billableHours: computed.billableHours,
        nonBillableHours: computed.nonBillableHours,
        managerNote: managerNote.trim() || null,
        updatedAt: now,
        updatedById: appUser?.uid || null,
      } as any);

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              totalHours: computed.totalHours,
              regularHours: computed.regularHours,
              overtimeHours: computed.overtimeHours,
              ptoHours: computed.ptoHours,
              holidayHours: computed.holidayHours,
              billableHours: computed.billableHours,
              nonBillableHours: computed.nonBillableHours,
              managerNote: managerNote.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      // reflect hours in UI list
      setEntries((prev) =>
        prev.map((x) => ({
          ...x,
          hours: numOr0(editedHoursByEntryId[x.id] ?? x.hours),
          updatedAt: now,
        }))
      );

      setOk("✅ Admin adjustments saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save adjustments.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!timesheet) return;
    if (!canApproveReject) {
      setError("Only submitted timesheets can be approved.");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    try {
      const now = nowIso();

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        status: "approved",
        approvedAt: now,
        approvedById: appUser?.uid || null,
        approvedByName: appUser?.displayName || null,

        // clear rejection fields
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,

        managerNote: managerNote.trim() || null,
        updatedAt: now,
      } as any);

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "approved",
              approvedAt: now,
              approvedById: appUser?.uid || undefined,
              approvedByName: appUser?.displayName || undefined,
              rejectedAt: undefined,
              rejectedById: undefined,
              rejectionReason: undefined,
              managerNote: managerNote.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      setOk("✅ Approved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve timesheet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!timesheet) return;
    if (!canApproveReject) {
      setError("Only submitted timesheets can be rejected.");
      return;
    }

    const reason = safeTrim(rejectionReason);
    if (!reason) {
      setError("Rejection reason is required.");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    try {
      const now = nowIso();

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        status: "rejected",
        rejectedAt: now,
        rejectedById: appUser?.uid || null,
        rejectionReason: reason,
        managerNote: managerNote.trim() || null,
        updatedAt: now,
      } as any);

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "rejected",
              rejectedAt: now,
              rejectedById: appUser?.uid || undefined,
              rejectionReason: reason,
              managerNote: managerNote.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      setOk(
        "🟡 Rejected (employee will see the rejection reason on their Weekly Timesheet page)."
      );
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
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>
              Timesheet Review
            </h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              Timesheet ID: {timesheetId}
            </div>
          </div>

          <Link
            href="/timesheet-review"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "white",
              textDecoration: "none",
              color: "inherit",
              fontWeight: 900,
              height: "fit-content",
            }}
          >
            Back to Review Queue
          </Link>
        </div>

        {loading ? <p style={{ marginTop: 16 }}>Loading timesheet...</p> : null}
        {error ? (
          <p style={{ marginTop: 16, color: "red" }}>{error}</p>
        ) : null}
        {ok ? <p style={{ marginTop: 16, color: "green" }}>{ok}</p> : null}

        {!loading && timesheet ? (
          <>
            <div
              style={{
                marginTop: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                maxWidth: 980,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 18 }}>
                {timesheet.employeeName}{" "}
                <span style={{ color: "#666" }}>({timesheet.employeeRole})</span>
              </div>

              <div style={{ fontSize: 13, color: "#555" }}>
                Week: <strong>{timesheet.weekStartDate}</strong> →{" "}
                <strong>{timesheet.weekEndDate}</strong>
              </div>

              <div style={{ fontSize: 13, color: "#555" }}>
                Status: <strong>{formatStatus(timesheet.status)}</strong>
                {timesheet.submittedAt ? (
                  <span style={{ color: "#777" }}>
                    {" "}
                    • Submitted: {timesheet.submittedAt}
                  </span>
                ) : null}
                {timesheet.approvedAt ? (
                  <span style={{ color: "#777" }}>
                    {" "}
                    • Approved: {timesheet.approvedAt}
                  </span>
                ) : null}
              </div>

              {timesheet.employeeNote ? (
                <div
                  style={{
                    marginTop: 8,
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    Employee Note
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#555",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {timesheet.employeeNote}
                  </div>
                </div>
              ) : null}
            </div>

            <div
              style={{
                marginTop: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                maxWidth: 980,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 18 }}>Admin Adjust</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                You can edit hours and optionally lock entries to prevent later
                automation overwrites.
                <br />
                Allowed when status is <strong>Submitted</strong> or{" "}
                <strong>Rejected</strong>.
              </div>

              <textarea
                value={managerNote}
                onChange={(e) => setManagerNote(e.target.value)}
                rows={3}
                disabled={!canReview}
                placeholder="Manager note (optional)…"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: !canReview ? "#f1f1f1" : "white",
                }}
              />

              {!canReview ? (
                <div style={{ fontSize: 12, color: "#8a5a00" }}>
                  You do not have permission to review timesheets.
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 10 }}>
                {entries.length === 0 ? (
                  <div
                    style={{
                      border: "1px dashed #ccc",
                      borderRadius: 12,
                      padding: 12,
                      background: "white",
                      color: "#666",
                    }}
                  >
                    No time entries found for this employee/week.
                  </div>
                ) : (
                  entries.map((e) => {
                    const hours = numOr0(
                      editedHoursByEntryId[e.id] ?? e.hours ?? 0
                    );
                    const locked = Boolean(lockByEntryId[e.id]);

                    const primary = formatEntryPrimary(e);
                    const secondary = formatEntrySecondary(e);

                    return (
                      <div
                        key={e.id}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 12,
                          padding: 12,
                          background: "white",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 950 }}>
                              {e.entryDate} • {primary}
                            </div>
                            {secondary ? (
                              <div
                                style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  color: "#555",
                                  fontWeight: 800,
                                }}
                              >
                                {secondary}
                              </div>
                            ) : null}

                            <div
                              style={{ marginTop: 6, fontSize: 12, color: "#777" }}
                            >
                              Category: <strong>{safeTrim(e.category)}</strong>{" "}
                              • Billable: <strong>{String(e.billable)}</strong>
                              {e.linkedTechnicianName
                                ? ` • Linked Tech: ${e.linkedTechnicianName}`
                                : ""}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <label style={{ fontSize: 12, fontWeight: 900 }}>
                              Hours
                            </label>
                            <input
                              type="number"
                              step={0.25}
                              min={0}
                              value={hours}
                              onChange={(evt) =>
                                setEditedHoursByEntryId((prev) => ({
                                  ...prev,
                                  [e.id]: numOr0(evt.target.value),
                                }))
                              }
                              disabled={!canAdminAdjust || saving}
                              style={{
                                width: 110,
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #ccc",
                              }}
                            />

                            <label
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                fontSize: 12,
                                fontWeight: 900,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={locked}
                                onChange={(evt) =>
                                  setLockByEntryId((prev) => ({
                                    ...prev,
                                    [e.id]: evt.target.checked,
                                  }))
                                }
                                disabled={!canAdminAdjust || saving}
                              />
                              Lock
                            </label>
                          </div>
                        </div>

                        <div style={{ marginTop: 6, fontSize: 11, color: "#999" }}>
                          Entry ID: {e.id}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  borderTop: "1px solid #e6e6e6",
                  paddingTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 13, color: "#555" }}>
                  <strong>Recomputed Totals:</strong> Total{" "}
                  {computed.totalHours.toFixed(2)} • Regular{" "}
                  {computed.regularHours.toFixed(2)} • OT{" "}
                  {computed.overtimeHours.toFixed(2)}
                </div>

                <button
                  type="button"
                  onClick={handleSaveAdminAdjust}
                  disabled={!canAdminAdjust || saving}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: canAdminAdjust ? "pointer" : "not-allowed",
                    fontWeight: 900,
                  }}
                >
                  {saving ? "Saving..." : "Save Admin Adjustments"}
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                maxWidth: 980,
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 18 }}>
                Approve / Reject
              </div>

              <div style={{ fontSize: 12, color: "#666" }}>
                Approve/Reject is only enabled while the timesheet is{" "}
                <strong>Submitted</strong>.
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ fontWeight: 900, fontSize: 12 }}>
                  Rejection Reason (required to reject)
                </label>
                <input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  disabled={!canApproveReject || saving}
                  placeholder="Example: Please correct Tuesday hours; missing job note…"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    background: !canApproveReject ? "#f1f1f1" : "white",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={!canApproveReject || saving}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #1f6b1f",
                    background: "#1f8f3a",
                    color: "white",
                    cursor: canApproveReject ? "pointer" : "not-allowed",
                    fontWeight: 1000,
                  }}
                >
                  {saving ? "Working..." : "Approve"}
                </button>

                <button
                  type="button"
                  onClick={handleReject}
                  disabled={!canApproveReject || saving}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #b91c1c",
                    background: "#fee2e2",
                    cursor: canApproveReject ? "pointer" : "not-allowed",
                    fontWeight: 1000,
                  }}
                >
                  {saving ? "Working..." : "Reject"}
                </button>

                <div style={{ fontSize: 12, color: "#777", alignSelf: "center" }}>
                  Current: <strong>{formatStatus(status)}</strong>
                </div>
              </div>

              {status !== "submitted" ? (
                <div style={{ fontSize: 12, color: "#8a5a00" }}>
                  This timesheet is not in Submitted status, so approve/reject is
                  disabled.
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}