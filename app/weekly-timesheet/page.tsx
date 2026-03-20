// app/weekly-timesheet/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
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
import type {
  WeeklyTimesheet,
  WeeklyTimesheetStatus,
} from "../../src/types/weekly-timesheet";

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
      isoDate: toIsoDate(
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1)
      ),
    },
    {
      label: "Wednesday",
      isoDate: toIsoDate(
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2)
      ),
    },
    {
      label: "Thursday",
      isoDate: toIsoDate(
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)
      ),
    },
    {
      label: "Friday",
      isoDate: toIsoDate(
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)
      ),
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
      return String(status || "");
  }
}

function isWorkedHoursCategory(category: TimeEntry["category"]) {
  const c = String(category || "").toLowerCase();
  return (
    c === "service" ||
    c === "project" ||
    c === "meeting" ||
    c === "shop" ||
    c === "office" ||
    c === "manual_other" ||
    // legacy support
    c === "service_ticket" ||
    c === "project_stage"
  );
}

function nowIso() {
  return new Date().toISOString();
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

// ---------------------------
// Display helpers (NEW)
// ---------------------------
function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function truncateLine(s: string, max = 70) {
  const x = safeTrim(s);
  if (x.length <= max) return x;
  return x.slice(0, max - 1) + "…";
}

function firstMeaningfulLine(notes?: string) {
  const raw = safeTrim(notes);
  if (!raw) return "";
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer a human line, not the AUTO_TIME header
  const preferred =
    lines.find((l) => l.startsWith("Customer:")) ||
    lines.find((l) => l.startsWith("Issue:")) ||
    lines.find((l) => l.startsWith("Outcome:")) ||
    lines.find((l) => !l.startsWith("AUTO_TIME_FROM_TRIP:"));

  return preferred || lines[0] || "";
}

function categoryPillLabel(cat: unknown) {
  const c = safeTrim(cat).toLowerCase();
  if (c === "service" || c === "service_ticket") return "service";
  if (c === "project" || c === "project_stage") return "project";
  if (c === "meeting") return "meeting";
  if (c === "shop") return "shop";
  if (c === "office") return "office";
  if (c === "pto") return "pto";
  if (c === "holiday") return "holiday";
  if (c === "manual_other") return "other";
  return c || "other";
}

function stageLabel(stage?: unknown) {
  const s = safeTrim(stage);
  if (!s) return "";
  if (s === "roughIn") return "Rough-In";
  if (s === "topOutVent") return "Top-Out / Vent";
  if (s === "trimFinish") return "Trim / Finish";
  return s;
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

export default function WeeklyTimesheetPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  // Default to last week (what employees will usually submit)
  const [weekOffset, setWeekOffset] = useState(-1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(appUser?.uid || "");
  const [employeeNote, setEmployeeNote] = useState("");

  const canSelectOtherEmployee =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const isOwnTimesheet =
    Boolean(appUser?.uid) && selectedEmployeeId === appUser?.uid;

  // ✅ lookup caches (id -> display)
  const [ticketMiniById, setTicketMiniById] = useState<
    Record<string, ServiceTicketMini>
  >({});
  const [projectMiniById, setProjectMiniById] = useState<
    Record<string, ProjectMini>
  >({});

  useEffect(() => {
    if (!selectedEmployeeId && appUser?.uid) setSelectedEmployeeId(appUser.uid);
  }, [appUser?.uid, selectedEmployeeId]);

  useEffect(() => {
    async function loadBaseData() {
      try {
        const [entriesSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "timeEntries")),
          getDocs(collection(db, "users")),
        ]);

        const timeEntryItems: TimeEntry[] = entriesSnap.docs.map((docSnap) => {
          const data: any = docSnap.data();
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
          const data: any = docSnap.data();
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
        setError(
          err instanceof Error ? err.message : "Failed to load weekly timesheet data."
        );
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

  // Load timesheet doc directly using standardized ID
  useEffect(() => {
    async function loadTimesheetDoc() {
      setError("");
      setSaveMsg("");

      if (!selectedEmployeeId || !weekStart) {
        setTimesheet(null);
        setEmployeeNote("");
        return;
      }

      try {
        const id = buildWeeklyTimesheetId(selectedEmployeeId, weekStart);
        const snap = await getDoc(doc(db, "weeklyTimesheets", id));

        if (!snap.exists()) {
          setTimesheet(null);
          setEmployeeNote("");
          return;
        }

        const data: any = snap.data();

        const item: WeeklyTimesheet = {
          id: snap.id,
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
        setError(
          err instanceof Error ? err.message : "Failed to load weekly timesheet record."
        );
      }
    }

    loadTimesheetDoc();
  }, [selectedEmployeeId, weekStart]);

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

  // ✅ Hydrate ticket/project display info for this week
  useEffect(() => {
    async function hydrate() {
      const needTicketIds = new Set<string>();
      const needProjectIds = new Set<string>();

      for (const e of weekEntries) {
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
  }, [weekEntries]);

  function renderTitleAndSubtitle(entry: TimeEntry) {
    const cat = safeTrim((entry as any).category).toLowerCase();

    if (cat === "service" || cat === "service_ticket") {
      const tid = safeTrim((entry as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      const title = mini?.customerDisplayName || "Service";
      const subtitle = mini?.issueSummary || "";
      return { title, subtitle };
    }

    if (cat === "project" || cat === "project_stage") {
      const pid = safeTrim((entry as any).projectId);
      const mini = pid ? projectMiniById[pid] : null;
      const title = mini?.projectName || "Project";
      const stage = stageLabel((entry as any).projectStageKey);
      const subtitle = stage ? `Stage: ${stage}` : "";
      return { title, subtitle };
    }

    if (cat === "meeting") {
      const title = "Meeting";
      const subtitle = truncateLine(firstMeaningfulLine((entry as any).notes), 60);
      return { title, subtitle };
    }

    // everything else (office/shop/pto/holiday/etc)
    return {
      title: safeTrim((entry as any).category) || "Entry",
      subtitle: "",
    };
  }

  const entriesByDay = useMemo(() => {
    const result: Record<string, TimeEntry[]> = {};
    for (const day of payrollWeekDays) result[day.isoDate] = [];
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
      const cat = String(entry.category || "").toLowerCase();
      if (isWorkedHoursCategory(entry.category)) workedHours += entry.hours;
      if (cat === "pto") ptoHours += entry.hours;
      if (cat === "holiday") holidayHours += entry.hours;
      if (entry.billable) billableHours += entry.hours;
      else nonBillableHours += entry.hours;
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

  const isLocked =
    currentStatus === "approved" || currentStatus === "exported_to_quickbooks";

  const canSaveDraftOrNote = !isLocked; // allow save draft/note even when submitted (note-only)
  const canSubmit =
    Boolean(selectedEmployee) &&
    isOwnTimesheet &&
    !isLocked &&
    currentStatus !== "submitted"; // allow submit from draft/rejected

  async function handleSubmitTimesheet() {
    if (!selectedEmployee || !appUser?.uid) {
      setError("Missing employee context.");
      return;
    }
    if (!isOwnTimesheet) {
      setError("You can only submit your own timesheet.");
      return;
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const now = nowIso();
      const docId = buildWeeklyTimesheetId(selectedEmployee.uid, weekStart);

      const nextStatus: WeeklyTimesheetStatus = "submitted";

      const payload: any = {
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
        submittedAt: now,
        submittedById: appUser.uid,

        // clear rejection on resubmit
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,

        quickbooksExportStatus: "not_ready",

        employeeNote: employeeNote.trim() || null,
        updatedAt: now,
        updatedById: appUser.uid,
      };

      await setDoc(
        doc(db, "weeklyTimesheets", docId),
        {
          ...payload,
          createdAt: timesheet?.createdAt ?? now,
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
        submittedAt: now,
        submittedById: appUser.uid,
        quickbooksExportStatus: "not_ready",
        employeeNote: employeeNote.trim() || undefined,
        createdAt: timesheet?.createdAt ?? now,
        updatedAt: now,
      });

      setSaveMsg("✅ Weekly timesheet submitted.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit weekly timesheet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraftOrNote() {
    if (!selectedEmployee || !appUser?.uid) {
      setError("Missing employee context.");
      return;
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const now = nowIso();
      const docId = buildWeeklyTimesheetId(selectedEmployee.uid, weekStart);

      // If it's already submitted, keep it submitted (notes-only)
      const nextStatus: WeeklyTimesheetStatus =
        currentStatus === "submitted" ? "submitted" : "draft";

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
          createdAt: timesheet?.createdAt ?? now,
          updatedAt: now,
          updatedById: appUser.uid,
        },
        { merge: true }
      );

      setTimesheet((prev) => ({
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
        submittedAt: prev?.submittedAt,
        submittedById: prev?.submittedById,
        quickbooksExportStatus: prev?.quickbooksExportStatus ?? "not_ready",
        employeeNote: employeeNote.trim() || undefined,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      }));

      setSaveMsg(
        nextStatus === "submitted"
          ? "✅ Note saved (timesheet already submitted)."
          : "✅ Draft saved."
      );
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
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
              Weekly Timesheet
            </h1>
            <p style={{ marginTop: 4, color: "#666", fontSize: 13 }}>
              Review, total, and submit one payroll week at a time.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((p) => p - 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 10,
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
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
              }}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((p) => p + 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 10,
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
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            background: "#fafafa",
            display: "grid",
            gap: 12,
            maxWidth: 760,
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
                  marginTop: 4,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              >
                <option value="">Select employee</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#555" }}>
              Employee: <strong>{selectedEmployee?.displayName || "—"}</strong>
            </div>
          )}

          <div style={{ fontSize: 13, color: "#555" }}>
            Current Status: <strong>{formatStatus(currentStatus)}</strong>
          </div>

          {currentStatus === "rejected" && timesheet?.rejectionReason ? (
            <div
              style={{
                fontSize: 12,
                color: "#8a5a00",
                border: "1px solid #f2d9a6",
                background: "#fff7e6",
                padding: 10,
                borderRadius: 10,
              }}
            >
              <strong>Rejected:</strong> {timesheet.rejectionReason}
            </div>
          ) : null}

          {timesheet?.submittedAt ? (
            <div style={{ fontSize: 12, color: "#666" }}>
              Submitted At: {timesheet.submittedAt}
            </div>
          ) : null}
        </div>

        {loading ? <p>Loading weekly timesheet...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ color: "green" }}>{saveMsg}</p> : null}

        {!loading && selectedEmployee ? (
          <>
            <div style={{ display: "grid", gap: 16 }}>
              {payrollWeekDays.map((day) => {
                const dayEntries = entriesByDay[day.isoDate] ?? [];
                const dayTotal = dayTotals[day.isoDate] ?? 0;

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      padding: 16,
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>
                          {day.label} {formatDisplayDate(day.isoDate)}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                          {day.isoDate}
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
                        Daily Total: {dayTotal.toFixed(2)} hr
                      </div>
                    </div>

                    {dayEntries.length === 0 ? (
                      <div
                        style={{
                          border: "1px dashed #ccc",
                          borderRadius: 10,
                          padding: 10,
                          background: "white",
                          color: "#666",
                          fontSize: 13,
                        }}
                      >
                        No entries for this day.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {dayEntries.map((entry) => {
                          const { title, subtitle } = renderTitleAndSubtitle(entry);
                          const pill = categoryPillLabel((entry as any).category);

                          return (
                            <div
                              key={entry.id}
                              style={{
                                border: "1px solid #ddd",
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
                                  alignItems: "flex-start",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 950,
                                      fontSize: 16,
                                      lineHeight: 1.15,
                                    }}
                                  >
                                    {title}
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 8,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #e6e6e6",
                                        background: "#fafafa",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        textTransform: "lowercase",
                                      }}
                                    >
                                      {pill}
                                    </span>
                                  </div>

                                  {subtitle ? (
                                    <div
                                      style={{
                                        marginTop: 8,
                                        fontSize: 13,
                                        color: "#555",
                                        fontWeight: 700,
                                      }}
                                    >
                                      {subtitle}
                                    </div>
                                  ) : null}
                                </div>

                                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 1000, fontSize: 16 }}>
                                    {Number(entry.hours).toFixed(2)} hr
                                  </div>
                                </div>
                              </div>

                              <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
                                Billable: <strong>{String(entry.billable)}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 18,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                maxWidth: 760,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18 }}>Weekly Summary</div>

              <div style={{ fontSize: 14, color: "#444" }}>
                Worked Hours: {computedTotals.workedHours.toFixed(2)}
              </div>
              <div style={{ fontSize: 14, color: "#444" }}>
                Regular Hours: {computedTotals.regularHours.toFixed(2)}
              </div>
              <div style={{ fontSize: 14, color: "#444" }}>
                Overtime Hours: {computedTotals.overtimeHours.toFixed(2)}
              </div>
              <div style={{ fontSize: 14, color: "#444" }}>
                PTO Hours: {computedTotals.ptoHours.toFixed(2)}
              </div>
              <div style={{ fontSize: 14, color: "#444" }}>
                Holiday Hours: {computedTotals.holidayHours.toFixed(2)}
              </div>

              <div
                style={{
                  marginTop: 4,
                  paddingTop: 8,
                  borderTop: "1px solid #e3e3e3",
                  fontSize: 15,
                  fontWeight: 800,
                }}
              >
                Total Paid Hours: {computedTotals.totalHours.toFixed(2)}
              </div>

              <div style={{ fontSize: 12, color: "#666" }}>
                Overtime is calculated only from worked-hour categories above 40.
                PTO and holiday do not count toward the 40-hour threshold.
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
                maxWidth: 760,
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18 }}>Employee Note</div>

              <textarea
                value={employeeNote}
                onChange={(e) => setEmployeeNote(e.target.value)}
                rows={4}
                disabled={isLocked}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: isLocked ? "#f7f7f7" : "white",
                }}
              />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canSaveDraftOrNote ? (
                  <button
                    type="button"
                    onClick={handleSaveDraftOrNote}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {saving
                      ? "Saving..."
                      : currentStatus === "submitted"
                      ? "Save Note"
                      : "Save Draft"}
                  </button>
                ) : null}

                {canSubmit ? (
                  <button
                    type="button"
                    onClick={handleSubmitTimesheet}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #1f6b1f",
                      background: "#1f8f3a",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {saving ? "Submitting..." : "Submit Timesheet"}
                  </button>
                ) : (
                  <span
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#f7f7f7",
                      color: "#777",
                      fontWeight: 700,
                    }}
                  >
                    {isOwnTimesheet
                      ? currentStatus === "submitted"
                        ? "Already Submitted"
                        : currentStatus === "approved"
                        ? "Approved"
                        : currentStatus === "exported_to_quickbooks"
                        ? "Exported"
                        : "Submission Unavailable"
                      : "View Only"}
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