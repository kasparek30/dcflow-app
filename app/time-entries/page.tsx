"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Fab,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { AppUser } from "../../src/types/app-user";
import type { TimeEntry } from "../../src/types/time-entry";

type PayrollDay = {
  label: string;
  shortLabel: string;
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

type DayBreakdown = {
  worked: number;
  pto: number;
  holiday: number;
  paid: number;
};

type CategoryFilterValue =
  | "all"
  | "service"
  | "project"
  | "meeting"
  | "shop"
  | "office"
  | "pto"
  | "holiday"
  | "manual_other"
  | "other";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getMondayForWeekOffset(weekOffset: number) {
  const today = new Date();
  const base = new Date(today);
  base.setHours(12, 0, 0, 0);
  base.setDate(today.getDate() + weekOffset * 7);

  const day = base.getDay(); // Sun 0 ... Sat 6
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  monday.setHours(12, 0, 0, 0);

  return monday;
}

function buildPayrollWeekDays(weekOffset: number): PayrollDay[] {
  const monday = getMondayForWeekOffset(weekOffset);

  return [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);

    const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const shortLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    return {
      label: labels[offset],
      shortLabel: shortLabels[offset],
      isoDate: toIsoDate(d),
    };
  });
}

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function formatDisplayDate(isoDate: string) {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function firstMeaningfulLine(notes?: string) {
  const raw = safeTrim(notes);
  if (!raw) return "";
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const preferred = lines.find((line) => !line.startsWith("AUTO_TIME_FROM_TRIP:"));
  return preferred || lines[0] || "";
}

function truncateLine(value: string, max = 90) {
  const clean = safeTrim(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
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

function formatCategoryLabel(raw: unknown) {
  const c = normalizeCategory(raw);
  switch (c) {
    case "service":
      return "Service";
    case "project":
      return "Project";
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
      return "Manual";
    default:
      return "Other";
  }
}

function formatPayType(payType: TimeEntry["payType"]) {
  switch (payType) {
    case "regular":
      return "Regular";
    case "overtime":
      return "Overtime";
    case "pto":
      return "PTO";
    case "holiday":
      return "Holiday";
    default:
      return String(payType || "—");
  }
}

function formatStatus(status: TimeEntry["entryStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported":
      return "Exported";
    default:
      return String(status || "—");
  }
}

function formatSourceLabel(source?: string) {
  const s = safeTrim(source).toLowerCase();
  switch (s) {
    case "manual_entry":
      return "Manual";
    case "auto_suggested":
      return "Auto";
    case "system_generated_pto":
      return "PTO";
    case "system_generated_meeting":
      return "Meeting";
    case "system_generated_holiday":
      return "Holiday";
    case "trip_timer":
      return "Trip";
    case "company_meeting":
      return "Meeting";
    default:
      return s ? s.replace(/_/g, " ") : "Source";
  }
}

function stageLabel(stage?: string) {
  const s = safeTrim(stage).toLowerCase();
  if (!s) return "";
  if (s === "roughin" || s === "rough_in") return "Rough-In";
  if (s === "topoutvent" || s === "top_out_vent") return "Top-Out / Vent";
  if (s === "trimfinish" || s === "trim_finish") return "Trim / Finish";
  return safeTrim(stage);
}

function isTimesheetLockedStatus(status: unknown) {
  const s = safeTrim(status).toLowerCase();
  return s === "submitted" || s === "approved" || s === "exported" || s === "exported_to_quickbooks";
}

function getEntryKind(entry: TimeEntry) {
  const category = normalizeCategory((entry as any).category);
  const payType = safeTrim(entry.payType).toLowerCase();

  if (category === "holiday" || payType === "holiday") return "holiday";
  if (category === "pto" || payType === "pto") return "pto";
  return "worked";
}

function getStatusChipColor(
  status: TimeEntry["entryStatus"]
): "default" | "warning" | "success" | "error" | "info" {
  switch (status) {
    case "draft":
      return "warning";
    case "submitted":
      return "info";
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "exported":
      return "default";
    default:
      return "default";
  }
}

function getKindChipColor(
  kind: "worked" | "pto" | "holiday"
): "default" | "info" | "success" | "secondary" {
  switch (kind) {
    case "pto":
      return "secondary";
    case "holiday":
      return "success";
    default:
      return "info";
  }
}

function buildWeekRangeLabel(weekStart: string, weekEnd: string) {
  if (!weekStart || !weekEnd) return "—";
  return `${formatDisplayDate(weekStart)} – ${formatDisplayDate(weekEnd)}`;
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

function isSyntheticHolidayEntry(entry: DisplayTimeEntry) {
  return Boolean(entry.synthetic);
}

export default function TimeEntriesPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [holidayByDate, setHolidayByDate] = useState<Record<string, CompanyHoliday>>({});
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | TimeEntry["entryStatus"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>("all");
  const [weekOffset, setWeekOffset] = useState(0);

  const [myWeekLocked, setMyWeekLocked] = useState(false);
  const [myWeekStatus, setMyWeekStatus] = useState<string>("");

  const [ticketMiniById, setTicketMiniById] = useState<Record<string, ServiceTicketMini>>({});
  const [projectMiniById, setProjectMiniById] = useState<Record<string, ProjectMini>>({});

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadBaseData() {
      try {
        setLoading(true);
        setError("");

        const [entriesSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, "timeEntries"), orderBy("entryDate", "desc"))),
          getDocs(collection(db, "users")),
        ]);

        const entryItems: TimeEntry[] = entriesSnap.docs.map((docSnap) => {
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
            billable: Boolean(data.billable),
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

        setEntries(entryItems);
        setUsers(userItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load time entries.");
      } finally {
        setLoading(false);
      }
    }

    loadBaseData();
  }, []);

  const payrollWeekDays = useMemo(() => buildPayrollWeekDays(weekOffset), [weekOffset]);
  const weekStart = payrollWeekDays[0]?.isoDate ?? "";
  const weekEnd = payrollWeekDays[4]?.isoDate ?? "";
  const isCurrentWeek = weekOffset === 0;

  useEffect(() => {
    async function loadHolidays() {
      if (!weekStart || !weekEnd) {
        setHolidayByDate({});
        return;
      }

      try {
        let snap;
        try {
          snap = await getDocs(query(collection(db, "companyHolidays"), where("active", "==", true)));
        } catch {
          snap = await getDocs(collection(db, "companyHolidays"));
        }

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
  }, [weekEnd, weekStart]);

  useEffect(() => {
    if (canSeeAll) {
      setMyWeekLocked(false);
      setMyWeekStatus("");
      return;
    }

    const uid = safeTrim(appUser?.uid);
    if (!uid || !weekStart || !weekEnd) {
      setMyWeekLocked(false);
      setMyWeekStatus("");
      return;
    }

    const qTs = query(
      collection(db, "weeklyTimesheets"),
      where("employeeId", "==", uid),
      where("weekStartDate", "==", weekStart),
      where("weekEndDate", "==", weekEnd),
      limit(1)
    );

    const unsub = onSnapshot(
      qTs,
      (snap) => {
        if (snap.empty) {
          setMyWeekLocked(false);
          setMyWeekStatus("");
          return;
        }

        const d: any = snap.docs[0].data();
        const status = safeTrim(d.status);
        setMyWeekStatus(status);
        setMyWeekLocked(isTimesheetLockedStatus(status));
      },
      () => {
        setMyWeekLocked(false);
        setMyWeekStatus("");
      }
    );

    return () => unsub();
  }, [appUser?.uid, canSeeAll, weekEnd, weekStart]);

  const currentUserRecord = useMemo(() => {
    const uid = safeTrim(appUser?.uid);
    if (!uid) return null;
    return users.find((u) => u.uid === uid) ?? null;
  }, [appUser?.uid, users]);

  const employeeScope = useMemo(() => {
    if (canSeeAll) {
      return users.filter((u) => u.active !== false);
    }
    return currentUserRecord ? [currentUserRecord] : [];
  }, [canSeeAll, currentUserRecord, users]);

  const syntheticHolidayEntries = useMemo<DisplayTimeEntry[]>(() => {
    if (employeeScope.length === 0) return [];

    const out: DisplayTimeEntry[] = [];

    for (const day of payrollWeekDays) {
      const holiday = holidayByDate[day.isoDate];
      if (!holiday) continue;

      for (const user of employeeScope) {
        if (!isHolidayEligibleUser(user)) continue;

        const alreadyHasHolidayEntry = entries.some((entry) => {
          return (
            entry.employeeId === user.uid &&
            entry.entryDate === day.isoDate &&
            getEntryKind(entry) === "holiday"
          );
        });

        if (alreadyHasHolidayEntry) continue;

        out.push({
          id: `synthetic_holiday_${user.uid}_${day.isoDate}`,
          employeeId: user.uid,
          employeeName: user.displayName,
          employeeRole: user.role,
          laborRoleType: user.laborRoleType ?? undefined,

          entryDate: day.isoDate,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,

          category: "holiday" as TimeEntry["category"],
          hours: getDefaultHolidayHours(user),
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
    }

    return out;
  }, [employeeScope, entries, holidayByDate, payrollWeekDays, weekEnd, weekStart]);

  const mergedEntries = useMemo<DisplayTimeEntry[]>(() => {
    return [...entries, ...syntheticHolidayEntries];
  }, [entries, syntheticHolidayEntries]);

  const visibleEntries = useMemo<DisplayTimeEntry[]>(() => {
    let items = mergedEntries;

    if (!canSeeAll && appUser?.uid) {
      items = items.filter((entry) => entry.employeeId === appUser.uid);
    }

    items = items.filter((entry) => entry.entryDate >= weekStart && entry.entryDate <= weekEnd);

    if (statusFilter !== "all") {
      items = items.filter((entry) => entry.entryStatus === statusFilter);
    }

    if (categoryFilter !== "all") {
      items = items.filter((entry) => normalizeCategory((entry as any).category) === categoryFilter);
    }

    return [...items].sort((a, b) => {
      if (a.entryDate !== b.entryDate) return a.entryDate.localeCompare(b.entryDate);
      if (canSeeAll && a.employeeName !== b.employeeName) {
        return safeTrim(a.employeeName).localeCompare(safeTrim(b.employeeName));
      }
      return safeTrim(a.createdAt).localeCompare(safeTrim(b.createdAt));
    });
  }, [appUser?.uid, canSeeAll, categoryFilter, mergedEntries, statusFilter, weekEnd, weekStart]);

  useEffect(() => {
    async function hydrate() {
      const needTicketIds = new Set<string>();
      const needProjectIds = new Set<string>();

      for (const entry of visibleEntries) {
        const cat = normalizeCategory((entry as any).category);

        if (cat === "service") {
          const tid = safeTrim((entry as any).serviceTicketId);
          if (tid && !ticketMiniById[tid]) needTicketIds.add(tid);
        }

        if (cat === "project") {
          const pid = safeTrim((entry as any).projectId);
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
            projectName: safeTrim(d.projectName) || safeTrim(d.name) || "Project",
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
      for (const t of ticketResults) {
        if (t?.id) nextTickets[t.id] = t;
      }

      const nextProjects: Record<string, ProjectMini> = {};
      for (const p of projectResults) {
        if (p?.id) nextProjects[p.id] = p;
      }

      if (Object.keys(nextTickets).length) {
        setTicketMiniById((prev) => ({ ...prev, ...nextTickets }));
      }

      if (Object.keys(nextProjects).length) {
        setProjectMiniById((prev) => ({ ...prev, ...nextProjects }));
      }
    }

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries]);

  const entriesByDay = useMemo(() => {
    const result: Record<string, DisplayTimeEntry[]> = {};
    for (const day of payrollWeekDays) {
      result[day.isoDate] = [];
    }

    for (const entry of visibleEntries) {
      if (!result[entry.entryDate]) continue;
      result[entry.entryDate].push(entry);
    }

    return result;
  }, [payrollWeekDays, visibleEntries]);

  const dayBreakdowns = useMemo(() => {
    const totals: Record<string, DayBreakdown> = {};

    for (const day of payrollWeekDays) {
      const rows = entriesByDay[day.isoDate] ?? [];
      const breakdown: DayBreakdown = {
        worked: 0,
        pto: 0,
        holiday: 0,
        paid: 0,
      };

      for (const entry of rows) {
        const kind = getEntryKind(entry);
        if (kind === "holiday") {
          breakdown.holiday += Number(entry.hours || 0);
        } else if (kind === "pto") {
          breakdown.pto += Number(entry.hours || 0);
        } else {
          breakdown.worked += Number(entry.hours || 0);
        }
      }

      breakdown.paid = breakdown.worked + breakdown.pto + breakdown.holiday;
      totals[day.isoDate] = breakdown;
    }

    return totals;
  }, [entriesByDay, payrollWeekDays]);

  const weekBreakdown = useMemo(() => {
    return visibleEntries.reduce(
      (acc, entry) => {
        const kind = getEntryKind(entry);
        const hrs = Number(entry.hours || 0);

        if (kind === "holiday") acc.holiday += hrs;
        else if (kind === "pto") acc.pto += hrs;
        else acc.worked += hrs;

        acc.paid += hrs;
        return acc;
      },
      { worked: 0, pto: 0, holiday: 0, paid: 0 }
    );
  }, [visibleEntries]);

  function renderTitleAndSubtitle(entry: DisplayTimeEntry) {
    const cat = normalizeCategory((entry as any).category);

    if (cat === "service") {
      const tid = safeTrim((entry as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      return {
        title: mini?.customerDisplayName || "Service Ticket",
        subtitle: mini?.issueSummary || truncateLine(firstMeaningfulLine((entry as any).notes), 70),
      };
    }

    if (cat === "project") {
      const pid = safeTrim((entry as any).projectId);
      const mini = pid ? projectMiniById[pid] : null;
      const stage = stageLabel((entry as any).projectStageKey);
      return {
        title: mini?.projectName || "Project",
        subtitle: stage ? `Stage: ${stage}` : truncateLine(firstMeaningfulLine((entry as any).notes), 70),
      };
    }

    if (cat === "meeting") {
      return {
        title: "Meeting",
        subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 70),
      };
    }

    if (cat === "pto") {
      return {
        title: "Paid Time Off",
        subtitle:
          truncateLine(firstMeaningfulLine((entry as any).notes), 70) || "Approved PTO for this day",
      };
    }

    if (cat === "holiday") {
      return {
        title: "Company Holiday",
        subtitle:
          truncateLine(firstMeaningfulLine((entry as any).notes), 70) || "Paid holiday time",
      };
    }

    if (cat === "shop") {
      return {
        title: "Shop Time",
        subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 70),
      };
    }

    if (cat === "office") {
      return {
        title: "Office Time",
        subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 70),
      };
    }

    return {
      title: "Manual Entry",
      subtitle: truncateLine(firstMeaningfulLine((entry as any).notes), 70),
    };
  }

  return (
    <ProtectedPage fallbackTitle="Time Entries">
      <AppShell appUser={appUser}>
        <Stack spacing={2.5}>
          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack spacing={2.5}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  spacing={2}
                >
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                      {isCurrentWeek ? "This Week’s Time Entries" : "Weekly Time Entries"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      {buildWeekRangeLabel(weekStart, weekEnd)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {canSeeAll
                        ? "Viewing weekly entries across employees."
                        : "Review worked time, PTO, and holiday hours before weekly submission."}
                    </Typography>
                  </Box>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.25}
                    width={{ xs: "100%", md: "auto" }}
                  >
                    <Button
                      variant="outlined"
                      startIcon={<ChevronLeftRoundedIcon />}
                      onClick={() => setWeekOffset((prev) => prev - 1)}
                      fullWidth={false}
                    >
                      Previous
                    </Button>

                    <Button
                      variant={isCurrentWeek ? "contained" : "outlined"}
                      startIcon={<TodayRoundedIcon />}
                      onClick={() => setWeekOffset(0)}
                    >
                      This Week
                    </Button>

                    <Button
                      variant="outlined"
                      endIcon={<ChevronRightRoundedIcon />}
                      onClick={() => setWeekOffset((prev) => prev + 1)}
                    >
                      Next
                    </Button>
                  </Stack>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {!canSeeAll && myWeekStatus ? (
                    <Chip
                      color={getStatusChipColor(myWeekStatus as TimeEntry["entryStatus"])}
                      label={`Timesheet: ${formatStatus(myWeekStatus as TimeEntry["entryStatus"])}`}
                    />
                  ) : null}

                  {!canSeeAll ? (
                    <Chip
                      color={myWeekLocked ? "warning" : "success"}
                      label={myWeekLocked ? "Week locked" : "Week editable"}
                      variant={myWeekLocked ? "filled" : "outlined"}
                    />
                  ) : (
                    <Chip label="All employees" variant="outlined" />
                  )}
                </Stack>

                {!canSeeAll && myWeekLocked ? (
                  <Alert severity="warning" sx={{ borderRadius: 3 }}>
                    This payroll week is locked because your weekly timesheet has already been submitted, approved, or exported.
                  </Alert>
                ) : null}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                  <Button
                    variant="contained"
                    onClick={() => router.push("/weekly-timesheet")}
                    endIcon={<ArrowForwardRoundedIcon />}
                  >
                    Review Weekly Timesheet
                  </Button>

                  <Button
                    variant="outlined"
                    onClick={() => router.push("/time-entries/new")}
                    disabled={!canSeeAll && myWeekLocked}
                    startIcon={<EditNoteRoundedIcon />}
                  >
                    Add Time Entry
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(4, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <AccessTimeRoundedIcon color="primary" fontSize="small" />
                    <Typography variant="overline" color="text.secondary">
                      Worked
                    </Typography>
                  </Stack>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {weekBreakdown.worked.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Work hours this week
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <BeachAccessRoundedIcon color="secondary" fontSize="small" />
                    <Typography variant="overline" color="text.secondary">
                      PTO
                    </Typography>
                  </Stack>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {weekBreakdown.pto.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Paid time off hours
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CelebrationRoundedIcon color="success" fontSize="small" />
                    <Typography variant="overline" color="text.secondary">
                      Holiday
                    </Typography>
                  </Stack>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {weekBreakdown.holiday.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Paid holiday hours
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <TodayRoundedIcon color="info" fontSize="small" />
                    <Typography variant="overline" color="text.secondary">
                      Total Paid
                    </Typography>
                  </Stack>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {weekBreakdown.paid.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Worked + PTO + holiday
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Box>

          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Filters
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    gap: 2,
                    maxWidth: 760,
                  }}
                >
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      label="Status"
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as "all" | TimeEntry["entryStatus"])
                      }
                    >
                      <MenuItem value="all">All statuses</MenuItem>
                      <MenuItem value="draft">Draft</MenuItem>
                      <MenuItem value="submitted">Submitted</MenuItem>
                      <MenuItem value="approved">Approved</MenuItem>
                      <MenuItem value="rejected">Rejected</MenuItem>
                      <MenuItem value="exported">Exported</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      label="Category"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value as CategoryFilterValue)}
                    >
                      <MenuItem value="all">All categories</MenuItem>
                      <MenuItem value="service">Service</MenuItem>
                      <MenuItem value="project">Project</MenuItem>
                      <MenuItem value="meeting">Meeting</MenuItem>
                      <MenuItem value="shop">Shop</MenuItem>
                      <MenuItem value="office">Office</MenuItem>
                      <MenuItem value="pto">PTO</MenuItem>
                      <MenuItem value="holiday">Holiday</MenuItem>
                      <MenuItem value="manual_other">Manual</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Typography variant="body2" color="text.secondary">
                  Showing {visibleEntries.length} {visibleEntries.length === 1 ? "entry" : "entries"} for this payroll week.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {loading ? (
            <Stack spacing={2}>
              {[0, 1, 2].map((i) => (
                <Card key={i} variant="outlined" sx={{ borderRadius: 4 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                    <Stack spacing={1.5}>
                      <Skeleton variant="text" width={220} height={36} />
                      <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 3 }} />
                      <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 3 }} />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ) : null}

          {!loading && error ? (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {error}
            </Alert>
          ) : null}

          {!loading && !error ? (
            <Stack spacing={2.5}>
              {payrollWeekDays.map((day) => {
                const rows = entriesByDay[day.isoDate] ?? [];
                const holiday = holidayByDate[day.isoDate] ?? null;
                const breakdown = dayBreakdowns[day.isoDate] ?? {
                  worked: 0,
                  pto: 0,
                  holiday: 0,
                  paid: 0,
                };

                return (
                  <Card key={day.isoDate} variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", md: "center" }}
                          spacing={1.5}
                        >
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                              {day.label} • {formatDisplayDate(day.isoDate)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {day.isoDate}
                            </Typography>

                            {holiday ? (
                              <Chip
                                size="small"
                                color="success"
                                variant="outlined"
                                label={holiday.name || "Company Holiday"}
                                sx={{ mt: 1 }}
                              />
                            ) : null}
                          </Box>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`Worked ${breakdown.worked.toFixed(2)}`} variant="outlined" />
                            <Chip
                              label={`PTO ${breakdown.pto.toFixed(2)}`}
                              color="secondary"
                              variant="outlined"
                            />
                            <Chip
                              label={`Holiday ${breakdown.holiday.toFixed(2)}`}
                              color="success"
                              variant="outlined"
                            />
                            <Chip label={`Paid ${breakdown.paid.toFixed(2)}`} color="info" />
                          </Stack>
                        </Stack>

                        <Divider />

                        {rows.length === 0 ? (
                          <Card
                            variant="outlined"
                            sx={{
                              borderRadius: 3,
                              borderStyle: "dashed",
                              bgcolor: "background.default",
                            }}
                          >
                            <CardContent>
                              <Stack spacing={1.5} alignItems="flex-start">
                                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                  {holiday ? "No time entries, but this is a company holiday" : "No entries for this day"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {holiday
                                    ? `${holiday.name || "Company Holiday"} is on the company holiday calendar for this payroll day.`
                                    : "Worked time, approved PTO, and paid holidays will all appear here for review."}
                                </Typography>
                                {!canSeeAll && !myWeekLocked ? (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<EditNoteRoundedIcon />}
                                    onClick={() => router.push("/time-entries/new")}
                                  >
                                    Add entry
                                  </Button>
                                ) : null}
                              </Stack>
                            </CardContent>
                          </Card>
                        ) : (
                          <Stack spacing={1.5}>
                            {rows.map((entry) => {
                              const { title, subtitle } = renderTitleAndSubtitle(entry);
                              const categoryLabel = formatCategoryLabel((entry as any).category);
                              const kind = getEntryKind(entry);
                              const synthetic = isSyntheticHolidayEntry(entry);

                              const cardBody = (
                                <Card
                                  variant="outlined"
                                  sx={{
                                    borderRadius: 3,
                                    transition: synthetic
                                      ? undefined
                                      : "transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease",
                                    "&:hover": synthetic
                                      ? undefined
                                      : {
                                          transform: "translateY(-1px)",
                                          boxShadow: 2,
                                          borderColor: "primary.main",
                                        },
                                  }}
                                >
                                  <CardContent sx={{ p: { xs: 2, sm: 2.25 } }}>
                                    <Stack spacing={1.5}>
                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        justifyContent="space-between"
                                        alignItems={{ xs: "flex-start", sm: "flex-start" }}
                                        spacing={1.5}
                                      >
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography
                                            variant="subtitle1"
                                            sx={{ fontWeight: 900, lineHeight: 1.2 }}
                                          >
                                            {canSeeAll ? `${safeTrim(entry.employeeName) || "Employee"} • ` : ""}
                                            {title}
                                          </Typography>

                                          {subtitle ? (
                                            <Typography
                                              variant="body2"
                                              color="text.secondary"
                                              sx={{ mt: 0.5 }}
                                            >
                                              {subtitle}
                                            </Typography>
                                          ) : null}
                                        </Box>

                                        <Box
                                          sx={{
                                            textAlign: { xs: "left", sm: "right" },
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          <Typography variant="h6" sx={{ fontWeight: 900 }}>
                                            {Number(entry.hours || 0).toFixed(2)} hr
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            {formatPayType(entry.payType)}
                                          </Typography>
                                        </Box>
                                      </Stack>

                                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Chip size="small" label={categoryLabel} variant="outlined" />
                                        <Chip
                                          size="small"
                                          label={formatSourceLabel(entry.source)}
                                          variant="outlined"
                                        />
                                        <Chip
                                          size="small"
                                          label={formatStatus(entry.entryStatus)}
                                          color={getStatusChipColor(entry.entryStatus)}
                                        />
                                        <Chip
                                          size="small"
                                          label={
                                            kind === "holiday"
                                              ? "Holiday pay"
                                              : kind === "pto"
                                              ? "PTO pay"
                                              : "Worked"
                                          }
                                          color={getKindChipColor(kind)}
                                          variant={kind === "worked" ? "outlined" : "filled"}
                                        />
                                        {synthetic ? (
                                          <Chip
                                            size="small"
                                            label="Calendar holiday"
                                            color="success"
                                            variant="outlined"
                                          />
                                        ) : null}
                                      </Stack>

                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        justifyContent="space-between"
                                        alignItems={{ xs: "flex-start", sm: "center" }}
                                        spacing={1}
                                      >
                                        <Typography variant="caption" color="text.secondary">
                                          Billable: <strong>{entry.billable ? "Yes" : "No"}</strong>
                                        </Typography>

                                        <Typography
                                          variant="body2"
                                          color={synthetic ? "text.secondary" : "primary.main"}
                                          sx={{ fontWeight: 800 }}
                                        >
                                          {synthetic ? "Calendar-based holiday display" : "Open entry →"}
                                        </Typography>
                                      </Stack>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              );

                              if (synthetic) {
                                return <Box key={entry.id}>{cardBody}</Box>;
                              }

                              return (
                                <Link
                                  key={entry.id}
                                  href={`/time-entries/${entry.id}`}
                                  style={{ textDecoration: "none", color: "inherit" }}
                                >
                                  {cardBody}
                                </Link>
                              );
                            })}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : null}
        </Stack>

        {!canSeeAll && !myWeekLocked ? (
          <Fab
            color="primary"
            variant="extended"
            onClick={() => router.push("/time-entries/new")}
            sx={{
              position: "fixed",
              right: 24,
              bottom: 24,
              zIndex: 20,
            }}
          >
            <EditNoteRoundedIcon sx={{ mr: 1 }} />
            Add Entry
          </Fab>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}