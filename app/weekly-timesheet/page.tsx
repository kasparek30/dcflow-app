// app/weekly-timesheet/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SummarizeRoundedIcon from "@mui/icons-material/SummarizeRounded";

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

type ServiceTicketMini = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
};

type ProjectMini = {
  id: string;
  projectName: string;
};

type CompanyHoliday = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

type DisplayTimeEntry = TimeEntry & {
  synthetic?: boolean;
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
    c === "service_ticket" ||
    c === "project_stage"
  );
}

function normalizeCategory(raw: unknown) {
  const c = safeTrim(raw).toLowerCase();

  if (c === "service_ticket") return "service";
  if (c === "project_stage") return "project";

  if (c === "service") return "service";
  if (c === "project") return "project";
  if (c === "meeting") return "meeting";
  if (c === "shop") return "shop";
  if (c === "office") return "office";
  if (c === "pto") return "pto";
  if (c === "holiday") return "holiday";
  if (c === "manual_other") return "manual_other";

  return c || "other";
}

function getEntryKind(entry: TimeEntry | DisplayTimeEntry) {
  const category = normalizeCategory((entry as any).category);
  const payType = safeTrim((entry as any).payType).toLowerCase();

  if (category === "holiday" || payType === "holiday") return "holiday";
  if (category === "pto" || payType === "pto") return "pto";
  return "worked";
}

function isHolidayEligibleUser(user: AppUser | null | undefined) {
  if (!user) return false;

  if (typeof user.holidayEligible === "boolean") {
    return user.holidayEligible;
  }

  const role = safeTrim(user.role).toLowerCase();
  return role === "technician" || role === "helper" || role === "apprentice";
}

function getDefaultHolidayHours(user: AppUser | null | undefined) {
  const n = Number((user as any)?.defaultDailyHolidayHours);
  if (Number.isFinite(n) && n > 0) return n;
  return 8;
}

function nowIso() {
  return new Date().toISOString();
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

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

function getStatusChipColor(status: WeeklyTimesheetStatus) {
  switch (status) {
    case "draft":
      return "default";
    case "submitted":
      return "info";
    case "approved":
      return "success";
    case "rejected":
      return "warning";
    case "exported_to_quickbooks":
      return "secondary";
    default:
      return "default";
  }
}

function getCategoryChipColor(category: string) {
  switch (category) {
    case "service":
      return "primary";
    case "project":
      return "secondary";
    case "meeting":
      return "info";
    case "shop":
      return "warning";
    case "office":
      return "default";
    case "pto":
      return "success";
    case "holiday":
      return "success";
    default:
      return "default";
  }
}

export default function WeeklyTimesheetPage() {
  const { appUser } = useAuthContext();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [holidayByDate, setHolidayByDate] = useState<Record<string, CompanyHoliday>>({});

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [weekOffset, setWeekOffset] = useState(-1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(appUser?.uid || "");
  const [employeeNote, setEmployeeNote] = useState("");

  const canSelectOtherEmployee =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const isOwnTimesheet =
    Boolean(appUser?.uid) && selectedEmployeeId === appUser?.uid;

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

  useEffect(() => {
    async function loadHolidays() {
      if (!weekStart || !weekEnd) {
        setHolidayByDate({});
        return;
      }

      try {
        const snap = await getDocs(collection(db, "companyHolidays"));
        const map: Record<string, CompanyHoliday> = {};

        for (const ds of snap.docs) {
          const d = ds.data() as any;

          const active = typeof d.active === "boolean" ? d.active : true;
          if (!active) continue;

          const rawDate = String(d.date ?? d.holidayDate ?? d.holiday_date ?? "").trim();
          if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue;
          if (rawDate < weekStart || rawDate > weekEnd) continue;

          map[rawDate] = {
            id: ds.id,
            date: rawDate,
            name: String(d.name ?? d.title ?? "Holiday"),
            active: true,
          };
        }

        setHolidayByDate(map);
      } catch {
        setHolidayByDate({});
      }
    }

    loadHolidays();
  }, [weekStart, weekEnd]);

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

  const rawWeekEntries = useMemo(() => {
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

  const syntheticHolidayEntries = useMemo<DisplayTimeEntry[]>(() => {
    if (!selectedEmployee) return [];
    if (!isHolidayEligibleUser(selectedEmployee)) return [];

    const out: DisplayTimeEntry[] = [];

    for (const day of payrollWeekDays) {
      const holiday = holidayByDate[day.isoDate];
      if (!holiday) continue;

      const alreadyHasHolidayEntry = rawWeekEntries.some((entry) => {
        return (
          entry.employeeId === selectedEmployee.uid &&
          entry.entryDate === day.isoDate &&
          getEntryKind(entry) === "holiday"
        );
      });

      if (alreadyHasHolidayEntry) continue;

      out.push({
        id: `synthetic_holiday_${selectedEmployee.uid}_${day.isoDate}`,
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        laborRoleType: selectedEmployee.laborRoleType ?? undefined,
        entryDate: day.isoDate,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        category: "holiday" as TimeEntry["category"],
        hours: getDefaultHolidayHours(selectedEmployee),
        payType: "holiday",
        billable: false,
        source: "system_generated_holiday",
        serviceTicketId: undefined,
        projectId: undefined,
        projectStageKey: undefined,
        linkedTechnicianId: undefined,
        linkedTechnicianName: undefined,
        notes: holiday.name || "Company Holiday",
        timesheetId: undefined,
        entryStatus: "draft",
        createdAt: undefined,
        updatedAt: undefined,
        synthetic: true,
      });
    }

    return out;
  }, [holidayByDate, payrollWeekDays, rawWeekEntries, selectedEmployee, weekEnd, weekStart]);

  const weekEntries = useMemo<DisplayTimeEntry[]>(() => {
    return [...rawWeekEntries, ...syntheticHolidayEntries].sort((a, b) => {
      const byDate = a.entryDate.localeCompare(b.entryDate);
      if (byDate !== 0) return byDate;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
  }, [rawWeekEntries, syntheticHolidayEntries]);

  const persistedTimeEntryIds = useMemo(() => {
    return weekEntries.filter((entry) => !entry.synthetic).map((entry) => entry.id);
  }, [weekEntries]);

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

  function renderTitleAndSubtitle(entry: DisplayTimeEntry) {
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

    if (cat === "pto") {
      return {
        title: "Paid Time Off",
        subtitle:
          truncateLine(firstMeaningfulLine((entry as any).notes), 60) ||
          "Approved PTO for this day",
      };
    }

    if (cat === "holiday") {
      return {
        title: "Company Holiday",
        subtitle:
          truncateLine(firstMeaningfulLine((entry as any).notes), 60) ||
          "Paid holiday time",
      };
    }

    if (cat === "shop") {
      return {
        title: "Shop Time",
        subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 60),
      };
    }

    if (cat === "office") {
      return {
        title: "Office Time",
        subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 60),
      };
    }

    return {
      title: safeTrim((entry as any).category) || "Entry",
      subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 60),
    };
  }

  const entriesByDay = useMemo(() => {
    const result: Record<string, DisplayTimeEntry[]> = {};
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
        (sum, entry) => sum + Number(entry.hours || 0),
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
      const kind = getEntryKind(entry);

      if (kind === "worked" && isWorkedHoursCategory(entry.category)) {
        workedHours += Number(entry.hours || 0);
      }

      if (kind === "pto") ptoHours += Number(entry.hours || 0);
      if (kind === "holiday") holidayHours += Number(entry.hours || 0);

      if (entry.billable) billableHours += Number(entry.hours || 0);
      else nonBillableHours += Number(entry.hours || 0);
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

  const canSaveDraftOrNote = !isLocked;
  const canSubmit =
    Boolean(selectedEmployee) &&
    isOwnTimesheet &&
    !isLocked &&
    currentStatus !== "submitted";

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
        timeEntryIds: persistedTimeEntryIds,
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
        timeEntryIds: persistedTimeEntryIds,
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

      setSaveMsg("Weekly timesheet submitted.");
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
          timeEntryIds: persistedTimeEntryIds,
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
        timeEntryIds: persistedTimeEntryIds,
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
          ? "Note saved. Timesheet remains submitted."
          : "Draft saved."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  }

  const handleEmployeeChange = (event: SelectChangeEvent<string>) => {
    setSelectedEmployeeId(event.target.value);
  };

  return (
    <ProtectedPage fallbackTitle="Weekly Timesheet">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1240, mx: "auto", pb: 6 }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 4,
                border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                background: `linear-gradient(135deg, ${alpha(
                  theme.palette.primary.main,
                  0.08
                )} 0%, ${alpha(theme.palette.secondary.main, 0.06)} 100%)`,
              }}
            >
              <Stack
                direction={{ xs: "column", lg: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", lg: "center" }}
              >
                <Stack spacing={1.25} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 3,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                        color: "primary.main",
                      }}
                    >
                      <SummarizeRoundedIcon />
                    </Box>
                    <Box>
                      <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                        Weekly Timesheet
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Review, total, and submit one payroll week at a time.
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    useFlexGap
                    flexWrap="wrap"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Chip
                      icon={<CalendarMonthRoundedIcon />}
                      label={`Week of ${weekStart} through ${weekEnd}`}
                      color="primary"
                      variant="filled"
                    />
                    <Chip
                      icon={<CheckCircleRoundedIcon />}
                      label={formatStatus(currentStatus)}
                      color={getStatusChipColor(currentStatus) as any}
                      variant="outlined"
                    />
                  </Stack>
                </Stack>

                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ width: { xs: "100%", lg: "auto" } }}
                >
                  <Button
                    variant="outlined"
                    startIcon={<ChevronLeftRoundedIcon />}
                    onClick={() => setWeekOffset((p) => p - 1)}
                  >
                    Previous Week
                  </Button>

                  <Button
                    variant="contained"
                    onClick={() => setWeekOffset(0)}
                    sx={{
                      bgcolor: alpha(theme.palette.primary.main, 0.10),
                      color: theme.palette.primary.main,
                      boxShadow: "none",
                      "&:hover": {
                        bgcolor: alpha(theme.palette.primary.main, 0.16),
                        boxShadow: "none",
                      },
                    }}
                  >
                    This Week
                  </Button>

                  <Button
                    variant="outlined"
                    endIcon={<ChevronRightRoundedIcon />}
                    onClick={() => setWeekOffset((p) => p + 1)}
                  >
                    Next Week
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 4,
                border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                bgcolor: "background.paper",
              }}
            >
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ color: "text.secondary" }}
                >
                  <DescriptionRoundedIcon fontSize="small" />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
                    Payroll Week Details
                  </Typography>
                </Stack>

                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "stretch", md: "center" }}
                >
                  <Box sx={{ flex: 1 }}>
                    {canSelectOtherEmployee ? (
                      <FormControl fullWidth>
                        <InputLabel id="timesheet-employee-label">Employee</InputLabel>
                        <Select
                          labelId="timesheet-employee-label"
                          value={selectedEmployeeId}
                          label="Employee"
                          onChange={handleEmployeeChange}
                        >
                          <MenuItem value="">Select employee</MenuItem>
                          {users.map((u) => (
                            <MenuItem key={u.uid} value={u.uid}>
                              {u.displayName} ({u.role})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                          bgcolor: alpha(theme.palette.primary.main, 0.04),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PersonRoundedIcon fontSize="small" color="primary" />
                          <Typography variant="body2" color="text.secondary">
                            Employee:
                          </Typography>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {selectedEmployee?.displayName || "—"}
                          </Typography>
                        </Stack>
                      </Paper>
                    )}
                  </Box>

                  {timesheet?.submittedAt ? (
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        minWidth: { xs: "100%", md: 280 },
                        borderRadius: 3,
                        border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                        bgcolor: alpha(theme.palette.secondary.main, 0.05),
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ScheduleRoundedIcon fontSize="small" color="action" />
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Submitted At
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {timesheet.submittedAt}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ) : null}
                </Stack>

                {currentStatus === "rejected" && timesheet?.rejectionReason ? (
                  <Alert severity="warning" variant="outlined">
                    <strong>Rejected:</strong> {timesheet.rejectionReason}
                  </Alert>
                ) : null}
              </Stack>
            </Paper>

            {loading ? (
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  borderRadius: 4,
                  border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={22} />
                  <Typography>Loading weekly timesheet...</Typography>
                </Stack>
              </Paper>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}
            {saveMsg ? <Alert severity="success">{saveMsg}</Alert> : null}

            {!loading && selectedEmployee ? (
              <>
                <Stack spacing={2}>
                  {payrollWeekDays.map((day) => {
                    const dayEntries = entriesByDay[day.isoDate] ?? [];
                    const dayTotal = dayTotals[day.isoDate] ?? 0;

                    return (
                      <Paper
                        key={day.isoDate}
                        elevation={0}
                        sx={{
                          p: { xs: 2, md: 2.25 },
                          borderRadius: 4,
                          border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                          overflow: "hidden",
                        }}
                      >
                        <Stack spacing={2}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            spacing={1.5}
                          >
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {day.label} {formatDisplayDate(day.isoDate)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {day.isoDate}
                              </Typography>
                            </Box>

                            <Chip
                              label={`Daily Total: ${dayTotal.toFixed(2)} hr`}
                              color="primary"
                              variant="outlined"
                              sx={{ fontWeight: 700 }}
                            />
                          </Stack>

                          {dayEntries.length === 0 ? (
                            <Paper
                              elevation={0}
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                border: `1px dashed ${alpha(theme.palette.divider, 0.9)}`,
                                bgcolor: alpha(theme.palette.grey[500], 0.06),
                              }}
                            >
                              <Typography variant="body2" color="text.secondary">
                                No entries for this day.
                              </Typography>
                            </Paper>
                          ) : (
                            <Stack spacing={1.25}>
                              {dayEntries.map((entry) => {
                                const { title, subtitle } = renderTitleAndSubtitle(entry);
                                const pill = categoryPillLabel((entry as any).category);

                                return (
                                  <Paper
                                    key={entry.id}
                                    elevation={0}
                                    sx={{
                                      p: 2,
                                      borderRadius: 3,
                                      border: `1px solid ${alpha(theme.palette.divider, 0.55)}`,
                                      bgcolor: alpha(theme.palette.background.default, 0.7),
                                    }}
                                  >
                                    <Stack spacing={1.5}>
                                      <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="flex-start"
                                        spacing={2}
                                      >
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                          <Typography
                                            variant="subtitle1"
                                            sx={{
                                              fontWeight: 800,
                                              lineHeight: 1.2,
                                              wordBreak: "break-word",
                                            }}
                                          >
                                            {title}
                                          </Typography>

                                          {subtitle ? (
                                            <Typography
                                              variant="body2"
                                              color="text.secondary"
                                              sx={{ mt: 0.75, fontWeight: 500 }}
                                            >
                                              {subtitle}
                                            </Typography>
                                          ) : null}
                                        </Box>

                                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                          <Typography
                                            variant="subtitle1"
                                            sx={{ fontWeight: 900 }}
                                          >
                                            {Number(entry.hours).toFixed(2)} hr
                                          </Typography>
                                        </Box>
                                      </Stack>

                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1}
                                        alignItems={{ xs: "flex-start", sm: "center" }}
                                        justifyContent="space-between"
                                      >
                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                          <Chip
                                            size="small"
                                            label={pill}
                                            color={getCategoryChipColor(pill) as any}
                                            variant="filled"
                                            sx={{ textTransform: "capitalize", fontWeight: 700 }}
                                          />
                                          <Chip
                                            size="small"
                                            label={entry.billable ? "Billable" : "Non-billable"}
                                            variant="outlined"
                                            sx={{ fontWeight: 600 }}
                                          />
                                          {entry.synthetic ? (
                                            <Chip
                                              size="small"
                                              label="Calendar holiday"
                                              color="success"
                                              variant="outlined"
                                              sx={{ fontWeight: 600 }}
                                            />
                                          ) : null}
                                        </Stack>
                                      </Stack>
                                    </Stack>
                                  </Paper>
                                );
                              })}
                            </Stack>
                          )}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>

                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 3 },
                    borderRadius: 4,
                    border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                  }}
                >
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <SummarizeRoundedIcon color="primary" />
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Weekly Summary
                      </Typography>
                    </Stack>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(2, minmax(0, 1fr))",
                          lg: "repeat(3, minmax(0, 1fr))",
                        },
                        gap: 1.5,
                      }}
                    >
                      {[
                        ["Worked Hours", computedTotals.workedHours],
                        ["Regular Hours", computedTotals.regularHours],
                        ["Overtime Hours", computedTotals.overtimeHours],
                        ["PTO Hours", computedTotals.ptoHours],
                        ["Holiday Hours", computedTotals.holidayHours],
                        ["Billable Hours", computedTotals.billableHours],
                      ].map(([label, value]) => (
                        <Paper
                          key={String(label)}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${alpha(theme.palette.divider, 0.55)}`,
                            bgcolor: alpha(theme.palette.primary.main, 0.035),
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {label}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                            {Number(value).toFixed(2)}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>

                    <Divider />

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        Total Paid Hours
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900 }}>
                        {computedTotals.totalHours.toFixed(2)}
                      </Typography>
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      Overtime is calculated only from worked-hour categories above 40.
                      PTO and holiday do not count toward the 40-hour threshold.
                    </Typography>
                  </Stack>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 3 },
                    borderRadius: 4,
                    border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                  }}
                >
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <NotesRoundedIcon color="primary" />
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Employee Note
                      </Typography>
                    </Stack>

                    <TextField
                      value={employeeNote}
                      onChange={(e) => setEmployeeNote(e.target.value)}
                      multiline
                      minRows={4}
                      fullWidth
                      disabled={isLocked}
                      placeholder="Add any payroll note, clarification, or context for this week..."
                    />

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.25}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      {canSaveDraftOrNote ? (
                        <Button
                          variant="outlined"
                          onClick={handleSaveDraftOrNote}
                          disabled={saving}
                        >
                          {saving
                            ? "Saving..."
                            : currentStatus === "submitted"
                            ? "Save Note"
                            : "Save Draft"}
                        </Button>
                      ) : null}

                      {canSubmit ? (
                        <Button
                          variant="contained"
                          onClick={handleSubmitTimesheet}
                          disabled={saving}
                        >
                          {saving ? "Submitting..." : "Submit Timesheet"}
                        </Button>
                      ) : (
                        <Chip
                          label={
                            isOwnTimesheet
                              ? currentStatus === "submitted"
                                ? "Already Submitted"
                                : currentStatus === "approved"
                                ? "Approved"
                                : currentStatus === "exported_to_quickbooks"
                                ? "Exported"
                                : "Submission Unavailable"
                              : "View Only"
                          }
                          variant="outlined"
                          sx={{ fontWeight: 700, alignSelf: "flex-start" }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}