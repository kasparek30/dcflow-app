// app/schedule/page.tsx
// app/schedule/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  addDoc,
  writeBatch,
  updateDoc,
  limit,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded";
import ViewDayRoundedIcon from "@mui/icons-material/ViewDayRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import SharedTripCard from "../../components/trips/SharedTripCard";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type ViewMode = "week" | "month" | "day";

type TripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

type TripLink = {
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TripConfirmedEntry = {
  hours: number;
  note?: string | null;
  confirmedAt: string;
};

type TripDoc = {
  id: string;
  active: boolean;
  type?: "service" | "project" | string;
  status?: string;
  date?: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string;
  endTime?: string;
  crew?: TripCrew | null;
  link?: TripLink | null;
  outcome?: string | null;
  readyToBillAt?: string | null;
  confirmedBy?: Record<string, TripConfirmedEntry> | null;
  createdAt?: string;
  updatedAt?: string;
};

type TechRow = {
  uid: string;
  name: string;
};

type TicketSummary = {
  id: string;
  issueSummary: string;
  customerDisplayName: string;
  serviceAddressLine1: string;
  serviceCity: string;
};

type ProjectSummary = {
  id: string;
  name: string;
};

type TechFilterValue = "ALL" | "UNASSIGNED" | string;
type AddTripType = "service" | "project";
type SlotKey = "am" | "pm";

type CompanyHoliday = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

type PtoDay = {
  uid: string;
  employeeName: string;
  date: string;
  hours?: number | null;
  requestId: string;
  reason?: string | null;
};

type CompanyEvent = {
  id: string;
  active: boolean;
  type: "meeting" | string;
  title: string;
  date: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  appliesToRoles?: string[] | null;
  appliesToUids?: string[] | null;
  blocksSchedule?: boolean;
  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

type MeetingTimeEntryLite = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  entryDate: string;
  weekStartDate: string;
  weekEndDate: string;
  timesheetId?: string | null;
  entryStatus?: string;
};

type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  metaRight?: string;
  metaLeft?: string;
  preview?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromIsoDate(iso: string) {
  const [y, m, day] = iso.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, day || 1);
}

function isWeekend(d: Date) {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}

function startOfWorkWeek(d: Date) {
  const wd = d.getDay();
  const diffToMon = (wd + 6) % 7;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - diffToMon);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function workWeekDays(weekStartMonday: Date) {
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStartMonday, i));
}

function formatDow(d: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatShort(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayIsoLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toIsoDate(d);
}

function normalizeStatus(s?: string) {
  return (s || "").trim().toLowerCase();
}

function normalizeTicketStatus(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "")
    .replaceAll("-", "_");
}

function ticketIsSchedulableByStatus(d: any) {
  const st = normalizeTicketStatus(d?.status);
  return st === "new" || st === "followup" || st === "follow_up";
}

function isCompletedStatus(status?: string) {
  const s = normalizeStatus(status);
  return s === "complete" || s === "completed";
}

function primaryTechUid(t: TripDoc) {
  return String(t.crew?.primaryTechUid || "").trim();
}

function isTechOnTrip(t: TripDoc, techUid: string) {
  const uid = String(techUid || "").trim();
  if (!uid) return false;
  const primary = String(t.crew?.primaryTechUid || "").trim();
  const secondary = String(t.crew?.secondaryTechUid || "").trim();
  return primary === uid || secondary === uid;
}

function tripRowUids(t: TripDoc): string[] {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
  ].filter(Boolean);
  return Array.from(new Set(uids));
}

function formatWindowLabel(w?: string) {
  const x = (w || "").toLowerCase();
  if (x === "am") return "AM";
  if (x === "pm") return "PM";
  if (x === "all_day") return "All Day";
  if (x === "custom") return "Custom";
  return w || "—";
}

function parseHHMM(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return { hh, mm };
}

function minutesFromHHMM(hhmm?: string) {
  const p = parseHHMM(hhmm);
  if (!p) return null;
  return p.hh * 60 + p.mm;
}

function formatTime12h(hhmm?: string) {
  const p = parseHHMM(hhmm);
  if (!p) return "—";
  let hh = p.hh;
  const mm = p.mm;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mm === 0) return `${hh}${ampm}`;
  return `${hh}:${pad2(mm)}${ampm}`;
}

function compactTimeLabel(start?: string | null, end?: string | null) {
  const s = String(start || "").trim();
  const e = String(end || "").trim();

  if (!s || !e) return "";

  const sParsed = parseHHMM(s);
  const eParsed = parseHHMM(e);
  if (!sParsed || !eParsed) return "";

  const startText = formatTime12h(s);
  const endText = formatTime12h(e);

  const startHasMinutes = sParsed.mm !== 0;
  const endHasMinutes = eParsed.mm !== 0;

  const startCompact = startHasMinutes
    ? startText.replace("AM", "").replace("PM", "")
    : startText.replace(":00", "").replace("AM", "").replace("PM", "");

  const endCompact = endHasMinutes
    ? endText
    : endText.replace(":00", "");

  return `${startCompact}–${endCompact}`;
}

function meetingChipLabel(e: CompanyEvent) {
  const w = String(e.timeWindow || "").toLowerCase();

  if (w === "all_day") return `${e.title} • All Day`;
  if (w === "am") return `${e.title} • AM`;
  if (w === "pm") return `${e.title} • PM`;

  if (w === "custom" && e.startTime && e.endTime) {
    return `${e.title} • ${compactTimeLabel(e.startTime, e.endTime)}`;
  }

  return e.title;
}

function getPtoSummaryForDate(
  dateIso: string,
  ptoByUidByDate: Record<string, Record<string, PtoDay>>
) {
  let count = 0;
  let totalHours = 0;

  for (const uid of Object.keys(ptoByUidByDate)) {
    const day = ptoByUidByDate[uid]?.[dateIso];
    if (!day) continue;

    count += 1;
    const hrs = Number(day.hours);
    if (Number.isFinite(hrs) && hrs > 0) totalHours += hrs;
  }

  return {
    count,
    totalHours,
  };
}

function formatTimeRangeForCard(t: TripDoc) {
  const w = (t.timeWindow || "").toLowerCase();
  if (w === "all_day") return "All Day • All Day";
  if (w === "am") return "8AM–12Noon • AM";
  if (w === "pm") return "1PM–5PM • PM";
  const start = t.startTime ? formatTime12h(t.startTime) : "—";
  const end = t.endTime ? formatTime12h(t.endTime) : "—";
  const label = formatWindowLabel(t.timeWindow);
  return `${start}–${end} • ${label}`;
}

function compareTripTime(a: TripDoc, b: TripDoc) {
  const aKey = `${a.startTime || "99:99"}_${a.endTime || "99:99"}_${a.id}`;
  const bKey = `${b.startTime || "99:99"}_${b.endTime || "99:99"}_${b.id}`;
  return aKey.localeCompare(bKey);
}

function nextWorkday(d: Date) {
  let cur = addDays(d, 1);
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur;
}

function prevWorkday(d: Date) {
  let cur = addDays(d, -1);
  while (isWeekend(cur)) cur = addDays(cur, -1);
  return cur;
}

function getPayrollWeekBounds(entryDateIso: string) {
  const [y, m, d] = entryDateIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);

  const wd = dt.getDay();
  const diffToMon = (wd + 6) % 7;
  const weekStart = new Date(dt);
  weekStart.setDate(weekStart.getDate() - diffToMon);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return { weekStartDate: toIsoDate(weekStart), weekEndDate: toIsoDate(weekEnd) };
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function defaultMeetingHours(window: string, startTime?: string | null, endTime?: string | null) {
  const w = String(window || "").toLowerCase();
  if (w === "all_day") return 8;
  if (w === "am") return 4;
  if (w === "pm") return 4;

  const sMin = minutesFromHHMM(String(startTime || "")) ?? null;
  const eMin = minutesFromHHMM(String(endTime || "")) ?? null;
  if (sMin != null && eMin != null && eMin > sMin) {
    return Math.round(((eMin - sMin) / 60) * 4) / 4;
  }
  return 1;
}

function isLockedWeeklyTimesheetStatus(status?: string) {
  const s = String(status || "").toLowerCase().trim();
  return s === "submitted" || s === "approved" || s === "exported_to_quickbooks" || s === "exported";
}

async function createPaidMeetingEntries(args: {
  eventId: string;
  dateIso: string;
  title: string;
  timeWindow: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  appliesToRoles: string[];
  appliesToUids?: string[];
  createdByUid: string | null;
}) {
  const {
    eventId,
    dateIso,
    title,
    timeWindow,
    startTime,
    endTime,
    location,
    appliesToRoles,
    appliesToUids,
    createdByUid,
  } = args;

  const now = nowIso();
  const hours = defaultMeetingHours(timeWindow, startTime, endTime);
  const { weekStartDate, weekEndDate } = getPayrollWeekBounds(dateIso);

  const usersSnap = await getDocs(collection(db, "users"));

  const recipients = usersSnap.docs
    .map((ds) => {
      const d = ds.data() as any;
      return {
        uid: String(d.uid ?? ds.id),
        displayName: String(d.displayName ?? "Employee"),
        role: String(d.role ?? ""),
        active: Boolean(d.active ?? false),
      };
    })
    .filter((u) => u.active)
    .filter((u) => {
      if (Array.isArray(appliesToUids) && appliesToUids.length > 0) {
        return appliesToUids.includes(u.uid);
      }

      return appliesToRoles
        .map((r) => r.toLowerCase())
        .includes((u.role || "").toLowerCase());
    });

  if (recipients.length === 0) return;

  const batch = writeBatch(db);

  for (const u of recipients) {
    const timesheetId = buildWeeklyTimesheetId(u.uid, weekStartDate);

    batch.set(
      doc(db, "weeklyTimesheets", timesheetId),
      {
        employeeId: u.uid,
        employeeName: u.displayName,
        employeeRole: u.role || "employee",
        weekStartDate,
        weekEndDate,
        status: "draft",
        submittedAt: null,
        submittedByUid: null,
        createdAt: now,
        createdByUid,
        updatedAt: now,
        updatedByUid: createdByUid,
      },
      { merge: true }
    );

    const timeEntryId = `meeting_${eventId}_${u.uid}`;

    batch.set(
      doc(db, "timeEntries", timeEntryId),
      {
        employeeId: u.uid,
        employeeName: u.displayName,
        employeeRole: u.role || "employee",
        entryDate: dateIso,
        weekStartDate,
        weekEndDate,
        timesheetId,
        category: "meeting",
        payType: "regular",
        billable: false,
        source: "company_meeting",
        hours,
        hoursSource: hours,
        hoursLocked: true,
        companyEventId: eventId,
        title,
        location: location || null,
        entryStatus: "draft",
        notes: null,
        createdAt: now,
        createdByUid,
        updatedAt: now,
        updatedByUid: createdByUid,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

function monthCalendarWorkWeeks(anchor: Date) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  const firstOfMonth = new Date(y, m, 1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const lastOfMonth = new Date(y, m + 1, 0);
  lastOfMonth.setHours(0, 0, 0, 0);

  const gridStart = startOfWorkWeek(firstOfMonth);

  let gridEnd = new Date(lastOfMonth);
  const wd = gridEnd.getDay();
  const diffToFri = (5 - wd + 7) % 7;
  gridEnd = addDays(gridEnd, diffToFri);

  const weeks: Array<Array<Date | null>> = [];
  let cur = new Date(gridStart);

  while (cur <= gridEnd) {
    const row: Array<Date | null> = [];
    for (let i = 0; i < 5; i++) {
      const d = addDays(cur, i);
      row.push(d.getMonth() === m ? d : null);
    }
    weeks.push(row);
    cur = addDays(cur, 7);
  }

  return weeks;
}

function crewConfirmUids(t: TripDoc) {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.helperUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
    String(t.crew?.secondaryHelperUid || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(uids));
}

function confirmationProgress(t: TripDoc) {
  const required = crewConfirmUids(t);
  const confirmedBy = t.confirmedBy || {};
  const confirmedCount = required.filter((uid) => Boolean((confirmedBy as any)[uid])).length;
  return { confirmedCount, requiredCount: required.length };
}

const SLOT_AM_START = 8 * 60;
const SLOT_AM_END = 12 * 60;
const SLOT_PM_START = 13 * 60;
const SLOT_PM_END = 17 * 60;

function tripBlocksSlot(t: TripDoc, slot: SlotKey) {
  const w = String(t.timeWindow || "").toLowerCase();
  if (t.active === false) return false;
  if (normalizeStatus(t.status) === "cancelled") return false;

  if (w === "all_day") return true;
  if (w === "am") return slot === "am";
  if (w === "pm") return slot === "pm";

  const stMin = minutesFromHHMM(t.startTime) ?? null;
  const etMin = minutesFromHHMM(t.endTime) ?? null;
  if (stMin == null || etMin == null || etMin <= stMin) return true;

  const [slotStart, slotEnd] = slot === "am" ? [SLOT_AM_START, SLOT_AM_END] : [SLOT_PM_START, SLOT_PM_END];
  return stMin < slotEnd && etMin > slotStart;
}

function eventBlocksSlot(e: CompanyEvent, slot: SlotKey) {
  if (!e.active || !e.blocksSchedule) return false;

  const w = String(e.timeWindow || "").toLowerCase();
  if (w === "all_day") return true;
  if (w === "am") return slot === "am";
  if (w === "pm") return slot === "pm";

  const stMin = minutesFromHHMM(String(e.startTime || "")) ?? null;
  const etMin = minutesFromHHMM(String(e.endTime || "")) ?? null;
  if (stMin == null || etMin == null || etMin <= stMin) return true;

  const [slotStart, slotEnd] = slot === "am" ? [SLOT_AM_START, SLOT_AM_END] : [SLOT_PM_START, SLOT_PM_END];
  return stMin < slotEnd && etMin > slotStart;
}

function looksApprovedPto(d: any) {
  const status = String(d.status ?? d.requestStatus ?? "").toLowerCase().trim();
  const approvedBool = Boolean(d.approved ?? d.isApproved ?? false);
  return approvedBool || status === "approved";
}

function extractEmployeeUid(d: any) {
  return String(d.employeeId ?? d.employeeUid ?? d.uid ?? d.userId ?? "").trim();
}

function extractEmployeeName(d: any) {
  return String(d.employeeName ?? d.displayName ?? d.name ?? "").trim();
}

function extractPtoDates(d: any): string[] {
  const single = String(d.date ?? d.ptoDate ?? d.day ?? d.requestDate ?? "").trim();
  if (single && /^\d{4}-\d{2}-\d{2}$/.test(single)) return [single];

  const start = String(d.startDate ?? d.fromDate ?? d.start ?? "").trim();
  const end = String(d.endDate ?? d.toDate ?? d.end ?? "").trim();

  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const s = fromIsoDate(start);
    const e = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? fromIsoDate(end) : s;

    const out: string[] = [];
    const cur = new Date(s);
    cur.setHours(0, 0, 0, 0);
    const endDt = new Date(e);
    endDt.setHours(0, 0, 0, 0);

    while (cur <= endDt) {
      out.push(toIsoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  return [];
}

function eventAppliesToRoleOrAll(e: CompanyEvent, role: string) {
  const roles = (e.appliesToRoles || []) as string[];
  if (!roles || roles.length === 0) return true;
  return roles.map((x) => String(x).toLowerCase()).includes(String(role || "").toLowerCase());
}

function splitTripsBySlot(cellTrips: TripDoc[]) {
  const am: TripDoc[] = [];
  const pm: TripDoc[] = [];

  for (const t of cellTrips) {
    const w = String(t.timeWindow || "").toLowerCase();
    if (w === "pm") {
      pm.push(t);
      continue;
    }
    if (w === "am" || w === "all_day") {
      am.push(t);
      continue;
    }

    const stMin = minutesFromHHMM(t.startTime) ?? null;
    if (stMin == null) {
      am.push(t);
      continue;
    }
    if (stMin >= SLOT_PM_START) pm.push(t);
    else am.push(t);
  }

  am.sort(compareTripTime);
  pm.sort(compareTripTime);

  const amIds = new Set(am.map((x) => x.id));
  return { amTrips: am, pmTrips: pm.filter((x) => !amIds.has(x.id)) };
}

function InfoChip({
  icon,
  label,
  color = "default",
}: {
  icon?: React.ReactElement | undefined;
  label: string;
  color?: "default" | "primary" | "secondary" | "warning" | "success";
}) {
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      color={color}
      variant="outlined"
      sx={{ borderRadius: 1.5, fontWeight: 500 }}
    />
  );
}

function ScheduleSlotButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<AddRoundedIcon />}
      onClick={onClick}
      sx={{
        alignSelf: "flex-start",
        minHeight: 36,
        px: 1.5,
        borderRadius: 5,
        fontWeight: 500,
        textTransform: "none",
        borderColor: alpha("#47B8FF", 0.28),
        color: "text.primary",
        backgroundColor: "transparent",
        "&:hover": {
          borderColor: alpha("#47B8FF", 0.42),
          backgroundColor: alpha("#47B8FF", 0.08),
        },
      }}
    >
      {label}
    </Button>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          fontSize: { xs: "1rem", md: "1.05rem" },
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </Typography>
      {subtitle ? (
        <Typography
          sx={{
            mt: 0.5,
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

export default function SchedulePage() {
  const theme = useTheme();
  const router = useRouter();
  const { appUser } = useAuthContext();

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "office_display";

  const canEditSchedule =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [view, setView] = useState<ViewMode>("week");
  const [anchorIso, setAnchorIso] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toIsoDate(startOfWorkWeek(d));
  });

  const [isMobile, setIsMobile] = useState(false);
  const didApplyMobileDefaultRef = useRef(false);
  const todayIso = useMemo(() => todayIsoLocal(), []);

  const [techFilter, setTechFilter] = useState<TechFilterValue>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);

  const [loading, setLoading] = useState(true);

  const [techsLoading, setTechsLoading] = useState(true);
  const [techsError, setTechsError] = useState("");
  const [techs, setTechs] = useState<TechRow[]>([]);

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [holidaysError, setHolidaysError] = useState("");
  const [holidayByDate, setHolidayByDate] = useState<Record<string, CompanyHoliday>>({});

  const [ptoLoading, setPtoLoading] = useState(true);
  const [ptoError, setPtoError] = useState("");
  const [ptoByUidByDate, setPtoByUidByDate] = useState<Record<string, Record<string, PtoDay>>>({});
  const [ptoNamesByDate, setPtoNamesByDate] = useState<Record<string, string[]>>({});

  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [eventsByDate, setEventsByDate] = useState<Record<string, CompanyEvent[]>>({});

  const [ticketMap, setTicketMap] = useState<Record<string, TicketSummary>>({});
  const [projectMap, setProjectMap] = useState<Record<string, ProjectSummary>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [addTechUid, setAddTechUid] = useState("");
  const [addDateIso, setAddDateIso] = useState("");
  const [addSlot, setAddSlot] = useState<SlotKey>("am");
  const [addTripType, setAddTripType] = useState<AddTripType>("service");
  const [addSearch, setAddSearch] = useState("");
  const [addSelectedId, setAddSelectedId] = useState("");
  const [addAdvancedId, setAddAdvancedId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [openTicketsLoading, setOpenTicketsLoading] = useState(false);
  const [openTicketsErr, setOpenTicketsErr] = useState("");
  const [openTicketItems, setOpenTicketItems] = useState<PickerItem[]>([]);

  const [openProjectsLoading, setOpenProjectsLoading] = useState(false);
  const [openProjectsErr, setOpenProjectsErr] = useState("");
  const [openProjectItems, setOpenProjectItems] = useState<PickerItem[]>([]);

  const [meetOpen, setMeetOpen] = useState(false);
  const [editingMeetId, setEditingMeetId] = useState<string | null>(null);
  const [editingMeetOriginalDate, setEditingMeetOriginalDate] = useState<string>("");
  const [meetDateIso, setMeetDateIso] = useState("");
  const [meetTitle, setMeetTitle] = useState("");
  const [meetWindow, setMeetWindow] = useState<"all_day" | "am" | "pm" | "custom">("am");
  const [meetStart, setMeetStart] = useState("08:00");
  const [meetEnd, setMeetEnd] = useState("09:00");
  const [meetLocation, setMeetLocation] = useState("");
  const [meetNotes, setMeetNotes] = useState("");
  const [meetBlocks, setMeetBlocks] = useState(true);
  const [meetSaving, setMeetSaving] = useState(false);
  const [meetErr, setMeetErr] = useState("");
  const [meetMsg, setMeetMsg] = useState("");

  function findTechName(uid: string) {
    const t = techs.find((x) => x.uid === uid);
    return t?.name || "";
  }

  function slotDefaults(slot: SlotKey) {
    if (slot === "am") return { timeWindow: "am" as const, startTime: "08:00", endTime: "12:00" };
    return { timeWindow: "pm" as const, startTime: "13:00", endTime: "17:00" };
  }

  async function loadOpenTicketsIfNeeded() {
    setOpenTicketsLoading(true);
    setOpenTicketsErr("");

    try {
      const scheduledTicketIds = new Set<string>();

      try {
        const startIso = todayIsoLocal();
        const endDt = addDays(fromIsoDate(startIso), 90);
        const endIso = toIsoDate(endDt);

        const tripsSnap = await getDocs(
          query(
            collection(db, "trips"),
            where("active", "==", true),
            where("type", "==", "service"),
            where("date", ">=", startIso),
            where("date", "<=", endIso),
            orderBy("date", "asc"),
            limit(1500)
          )
        );

        tripsSnap.docs.forEach((ds) => {
          const t = ds.data() as any;
          const tripStatus = String(t?.status || "").toLowerCase().trim();
          const active = typeof t?.active === "boolean" ? t.active : true;
          if (!active) return;
          if (tripStatus === "cancelled" || tripStatus === "canceled") return;
          const stid = String(t?.link?.serviceTicketId || "").trim();
          if (!stid) return;
          scheduledTicketIds.add(stid);
        });
      } catch {}

      const snap = await getDocs(
        query(collection(db, "serviceTickets"), orderBy("createdAt", "desc"), limit(400))
      );

      const items: PickerItem[] = snap.docs
        .map((ds) => {
          const d = ds.data() as any;
          const id = ds.id;
          const active = typeof d.active === "boolean" ? d.active : true;
          if (!active) return null;
          if (!ticketIsSchedulableByStatus(d)) return null;
          if (scheduledTicketIds.has(id)) return null;

          const issue = String(d.issueSummary ?? d.summary ?? "Service Ticket").trim();
          const customer = String(d.customerDisplayName ?? d.customerName ?? "").trim();
          const line1 = String(d.serviceAddressLine1 ?? "").trim();
          const city = String(d.serviceCity ?? "").trim();

          const estHoursRaw =
            d.estimatedHours ??
            d.estimatedDurationHours ??
            d.estHours ??
            d.durationHours ??
            null;

          const estHoursNum = Number(estHoursRaw);
          const estHours = Number.isFinite(estHoursNum) && estHoursNum > 0 ? estHoursNum : null;

          const detailsRaw =
            d.issueDetails ??
            d.details ??
            d.description ??
            d.problemDescription ??
            d.notes ??
            null;

          const details = String(detailsRaw ?? "").trim();
          const preview = details.length > 0 ? (details.length > 140 ? details.slice(0, 139) + "…" : details) : "";

          const label = issue || "Service Ticket";
          const sub = `${customer || "Customer"}${line1 ? ` — ${line1}` : ""}${city ? `, ${city}` : ""}`;

          const stNorm = normalizeTicketStatus(d?.status);
          const statusLabel = stNorm === "followup" || stNorm === "follow_up" ? "Follow Up" : "New";

          return {
            id,
            label,
            sublabel: sub,
            metaLeft: statusLabel,
            metaRight: estHours ? `Est. ${estHours}h` : "Est. —",
            preview,
          } as PickerItem;
        })
        .filter(Boolean) as PickerItem[];

      setOpenTicketItems(items);
    } catch (e: any) {
      setOpenTicketsErr(e?.message || "Failed to load schedulable service tickets.");
      setOpenTicketItems([]);
    } finally {
      setOpenTicketsLoading(false);
    }
  }

  async function loadOpenProjectsIfNeeded() {
    if (openProjectItems.length) return;

    setOpenProjectsLoading(true);
    setOpenProjectsErr("");

    try {
      const snap = await getDocs(query(collection(db, "projects"), orderBy("updatedAt", "desc"), limit(250)));

      const items: PickerItem[] = snap.docs
        .map((ds) => {
          const d = ds.data() as any;
          const id = ds.id;
          const active = typeof d.active === "boolean" ? d.active : true;
          if (!active) return null;

          const name = String(d.projectName ?? d.name ?? d.title ?? "Project").trim();
          const customer = String(d.customerDisplayName ?? "").trim();
          const line1 = String(d.serviceAddressLine1 ?? "").trim();
          const city = String(d.serviceCity ?? "").trim();

          return {
            id,
            label: name || "Project",
            sublabel: `${customer || "Customer"}${line1 ? ` — ${line1}` : ""}${city ? `, ${city}` : ""}`,
          } as PickerItem;
        })
        .filter(Boolean) as PickerItem[];

      setOpenProjectItems(items);
    } catch (e: any) {
      setOpenProjectsErr(e?.message || "Failed to load projects.");
      setOpenProjectItems([]);
    } finally {
      setOpenProjectsLoading(false);
    }
  }

  function openAddModal(args: { techUid: string; dateIso: string; slot: SlotKey }) {
    setAddErr("");
    setAddTechUid(args.techUid);
    setAddDateIso(args.dateIso);
    setAddSlot(args.slot);
    setAddTripType("service");
    setAddSearch("");
    setAddSelectedId("");
    setAddAdvancedId("");
    setAddNotes("");
    setAddOpen(true);
    loadOpenTicketsIfNeeded();
  }

  function closeAddModal() {
    if (addSaving) return;
    setAddOpen(false);
    setAddErr("");
    setAddSaving(false);
    setAddSearch("");
    setAddSelectedId("");
    setAddAdvancedId("");
    setAddNotes("");
  }

  function currentPickerItems(): PickerItem[] {
    const base = addTripType === "service" ? openTicketItems : openProjectItems;
    const q = addSearch.trim().toLowerCase();
    if (!q) return base.slice(0, 60);

    return base
      .filter((x) => {
        const a = `${x.label || ""} ${x.sublabel || ""} ${x.id || ""}`.toLowerCase();
        return a.includes(q);
      })
      .slice(0, 80);
  }

  async function submitAddTrip() {
    if (!canEditSchedule) {
      setAddErr("Only Admin/Dispatcher/Manager can schedule trips.");
      return;
    }

    const techUid = String(addTechUid || "").trim();
    const dateIso = String(addDateIso || "").trim();

    if (!techUid) return setAddErr("Missing technician.");
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return setAddErr("Missing/invalid date.");
    if (dateIso < todayIso) return setAddErr("You can’t schedule trips in the past.");

    const chosenId = String(addSelectedId || "").trim();
    const advancedId = String(addAdvancedId || "").trim();
    const linkId = chosenId || advancedId;

    if (!linkId) {
      return setAddErr(addTripType === "service" ? "Choose an open Service Ticket." : "Choose a Project.");
    }

    if (holidayByDate[dateIso]) return setAddErr(`That date is a company holiday (${holidayByDate[dateIso].name}).`);
    if (ptoByUidByDate[techUid]?.[dateIso]) return setAddErr(`That technician is on approved PTO for ${dateIso}.`);

    const todaysEvents = eventsByDate[dateIso] || [];
    const anyBlocking = todaysEvents.some((e) => eventBlocksSlot(e, addSlot));
    if (anyBlocking) return setAddErr("That slot is blocked by a company meeting/event.");

    setAddSaving(true);
    setAddErr("");

    try {
      const now = nowIso();
      const techName = findTechName(techUid) || "Technician";
      const slot = slotDefaults(addSlot);

      const payload: any = {
        active: true,
        type: addTripType,
        status: "planned",
        date: dateIso,
        timeWindow: slot.timeWindow,
        startTime: slot.startTime,
        endTime: slot.endTime,
        crew: {
          primaryTechUid: techUid,
          primaryTechName: techName,
          helperUid: null,
          helperName: null,
          secondaryTechUid: null,
          secondaryTechName: null,
          secondaryHelperUid: null,
          secondaryHelperName: null,
        },
        link: {
          serviceTicketId: addTripType === "service" ? linkId : null,
          projectId: addTripType === "project" ? linkId : null,
          projectStageKey: null,
        },
        notes: addNotes.trim() || null,
        cancelReason: null,
        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      const created = await addDoc(collection(db, "trips"), payload);
      const newTrip: TripDoc = { id: created.id, ...(payload as any) };
      setTrips((prev) => [...prev, newTrip].sort(compareTripTime));

      closeAddModal();
    } catch (e: any) {
      setAddErr(e?.message || "Failed to add trip.");
    } finally {
      setAddSaving(false);
    }
  }

  function resetMeetingForm() {
    setEditingMeetId(null);
    setEditingMeetOriginalDate("");
    setMeetDateIso("");
    setMeetTitle("");
    setMeetWindow("am");
    setMeetStart("08:00");
    setMeetEnd("09:00");
    setMeetLocation("");
    setMeetNotes("");
    setMeetBlocks(true);
    setMeetErr("");
    setMeetMsg("");
  }

  function openMeetingModal(defaultDateIso: string) {
    resetMeetingForm();
    setMeetDateIso(defaultDateIso);
    setMeetOpen(true);
  }

  function openEditMeetingModal(e: CompanyEvent) {
    resetMeetingForm();
    setEditingMeetId(e.id);
    setEditingMeetOriginalDate(e.date);
    setMeetDateIso(e.date);
    setMeetTitle(String(e.title || ""));
    const w = String(e.timeWindow || "am").toLowerCase();
    setMeetWindow(w === "all_day" ? "all_day" : w === "pm" ? "pm" : w === "custom" ? "custom" : "am");

    if (w === "custom") {
      setMeetStart(String(e.startTime || "08:00"));
      setMeetEnd(String(e.endTime || "09:00"));
    } else if (w === "pm") {
      setMeetStart("13:00");
      setMeetEnd("14:00");
    } else if (w === "all_day") {
      setMeetStart("08:00");
      setMeetEnd("17:00");
    } else {
      setMeetStart("08:00");
      setMeetEnd("09:00");
    }

    setMeetLocation(String(e.location || ""));
    setMeetNotes(String(e.notes || ""));
    setMeetBlocks(Boolean(e.blocksSchedule ?? true));
    setMeetOpen(true);
  }

  function closeMeetingModal() {
    if (meetSaving) return;
    setMeetOpen(false);
    setMeetSaving(false);
    setMeetErr("");
    setMeetMsg("");
  }

  async function getMeetingTimeEntries(eventId: string): Promise<MeetingTimeEntryLite[]> {
    const snap = await getDocs(query(collection(db, "timeEntries"), where("companyEventId", "==", eventId)));
    return snap.docs.map((ds) => {
      const d = ds.data() as any;
      return {
        id: ds.id,
        employeeId: String(d.employeeId ?? ""),
        employeeName: String(d.employeeName ?? ""),
        employeeRole: String(d.employeeRole ?? ""),
        entryDate: String(d.entryDate ?? ""),
        weekStartDate: String(d.weekStartDate ?? ""),
        weekEndDate: String(d.weekEndDate ?? ""),
        timesheetId: d.timesheetId ?? null,
        entryStatus: d.entryStatus ?? "draft",
      };
    });
  }

  async function assertMeetingEntriesNotLocked(entries: MeetingTimeEntryLite[]) {
    const locked: Array<{ employeeName: string; weekStartDate: string; status: string }> = [];

    await Promise.all(
      entries.map(async (e) => {
        const wsId = buildWeeklyTimesheetId(e.employeeId, e.weekStartDate);
        try {
          const tsSnap = await getDoc(doc(db, "weeklyTimesheets", wsId));
          if (!tsSnap.exists()) return;
          const d = tsSnap.data() as any;
          const status = String(d.status ?? "").toLowerCase().trim();
          if (isLockedWeeklyTimesheetStatus(status)) {
            locked.push({ employeeName: e.employeeName || e.employeeId, weekStartDate: e.weekStartDate, status });
          }
        } catch {}
      })
    );

    if (locked.length) {
      const first = locked[0];
      const more = locked.length > 1 ? ` (+${locked.length - 1} more)` : "";
      throw new Error(
        `This meeting cannot be changed because it has time entries in a locked weekly timesheet. Example: ${first.employeeName} • week ${first.weekStartDate} • status ${first.status}${more}`
      );
    }
  }

  async function updateMeetingAndEntries(args: {
    eventId: string;
    originalDateIso: string;
    payload: any;
  }) {
    const { eventId, originalDateIso, payload } = args;
    const entries = await getMeetingTimeEntries(eventId);
    await assertMeetingEntriesNotLocked(entries);

    const now = nowIso();
    await updateDoc(doc(db, "companyEvents", eventId), {
      ...payload,
      updatedAt: now,
      updatedByUid: appUser?.uid || null,
    });

    const hours = defaultMeetingHours(payload.timeWindow, payload.startTime, payload.endTime);
    const { weekStartDate, weekEndDate } = getPayrollWeekBounds(payload.date);
    const batch = writeBatch(db);

    for (const te of entries) {
      const timesheetId = buildWeeklyTimesheetId(te.employeeId, weekStartDate);

      batch.set(
        doc(db, "weeklyTimesheets", timesheetId),
        {
          employeeId: te.employeeId,
          employeeName: te.employeeName,
          employeeRole: te.employeeRole || "employee",
          weekStartDate,
          weekEndDate,
          status: "draft",
          submittedAt: null,
          submittedByUid: null,
          updatedAt: now,
          updatedByUid: appUser?.uid || null,
        },
        { merge: true }
      );

      batch.set(
        doc(db, "timeEntries", te.id),
        {
          employeeId: te.employeeId,
          employeeName: te.employeeName,
          employeeRole: te.employeeRole || "employee",
          entryDate: payload.date,
          weekStartDate,
          weekEndDate,
          timesheetId,
          category: "meeting",
          payType: "regular",
          billable: false,
          source: "company_meeting",
          hours,
          hoursSource: hours,
          hoursLocked: true,
          companyEventId: eventId,
          title: payload.title,
          location: payload.location || null,
          entryStatus: "draft",
          notes: null,
          updatedAt: now,
          updatedByUid: appUser?.uid || null,
        },
        { merge: true }
      );
    }

    await batch.commit();

    const updatedEvent: CompanyEvent = {
      id: eventId,
      active: true,
      type: "meeting",
      title: String(payload.title || "Meeting"),
      date: String(payload.date || ""),
      timeWindow: payload.timeWindow ?? "am",
      startTime: payload.startTime ?? null,
      endTime: payload.endTime ?? null,
      location: payload.location ?? null,
      notes: payload.notes ?? null,
      appliesToRoles: payload.appliesToRoles ?? null,
      appliesToUids: payload.appliesToUids ?? null,
      blocksSchedule: Boolean(payload.blocksSchedule),
      updatedAt: now,
      updatedByUid: appUser?.uid || null,
    };

    setEventsByDate((prev) => {
      const next = { ...prev };
      const oldList = [...(next[originalDateIso] || [])].filter((x) => x.id !== eventId);
      if (oldList.length) next[originalDateIso] = oldList;
      else delete next[originalDateIso];

      const newList = [...(next[updatedEvent.date] || [])].filter((x) => x.id !== eventId);
      newList.push(updatedEvent);
      next[updatedEvent.date] = newList;

      return next;
    });
  }

  async function deleteMeetingAndEntries(eventId: string, dateIso: string) {
    const entries = await getMeetingTimeEntries(eventId);
    await assertMeetingEntriesNotLocked(entries);

    const now = nowIso();
    await updateDoc(doc(db, "companyEvents", eventId), {
      active: false,
      updatedAt: now,
      updatedByUid: appUser?.uid || null,
    });

    const batch = writeBatch(db);
    for (const te of entries) batch.delete(doc(db, "timeEntries", te.id));
    await batch.commit();

    setEventsByDate((prev) => {
      const next = { ...prev };
      const list = [...(next[dateIso] || [])].filter((x) => x.id !== eventId);
      if (list.length) next[dateIso] = list;
      else delete next[dateIso];
      return next;
    });
  }

  async function submitMeeting() {
    if (!canEditSchedule) {
      setMeetErr("Only Admin/Dispatcher/Manager can schedule meetings.");
      return;
    }

    setMeetErr("");
    setMeetMsg("");

    const dateIso = String(meetDateIso || "").trim();
    const title = String(meetTitle || "").trim();
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return setMeetErr("Missing/invalid date.");
    if (!title) return setMeetErr("Meeting title is required.");

    if (holidayByDate[dateIso]) return setMeetErr(`That date is a company holiday (${holidayByDate[dateIso].name}).`);

    if (meetWindow === "custom") {
      const st = String(meetStart || "").trim();
      const et = String(meetEnd || "").trim();
      if (!/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(et)) return setMeetErr("Custom start/end must be HH:mm.");
      const sMin = minutesFromHHMM(st);
      const eMin = minutesFromHHMM(et);
      if (sMin == null || eMin == null || eMin <= sMin) return setMeetErr("End time must be after start time.");
    }

    setMeetSaving(true);

    try {
      const now = nowIso();

      const payload: any = {
        active: true,
        type: "meeting",
        title,
        date: dateIso,
        timeWindow: meetWindow,
        startTime: meetWindow === "custom" ? meetStart : null,
        endTime: meetWindow === "custom" ? meetEnd : null,
        location: meetLocation.trim() || null,
        notes: meetNotes.trim() || null,
        appliesToRoles: ["technician", "helper", "apprentice", "manager", "dispatcher", "admin"],
        appliesToUids: [],
        blocksSchedule: Boolean(meetBlocks),
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      if (editingMeetId) {
        await updateMeetingAndEntries({
          eventId: editingMeetId,
          originalDateIso: editingMeetOriginalDate || dateIso,
          payload,
        });
        closeMeetingModal();
        return;
      }

      const createPayload: any = {
        ...payload,
        createdAt: now,
        createdByUid: appUser?.uid || null,
      };

      const created = await addDoc(collection(db, "companyEvents"), createPayload);

      await createPaidMeetingEntries({
        eventId: created.id,
        dateIso: createPayload.date,
        title: createPayload.title,
        timeWindow: createPayload.timeWindow,
        startTime: createPayload.startTime,
        endTime: createPayload.endTime,
        location: createPayload.location,
        appliesToRoles: createPayload.appliesToRoles || [],
        appliesToUids: createPayload.appliesToUids || [],
        createdByUid: appUser?.uid || null,
      });

      const newEvent: CompanyEvent = { id: created.id, ...(createPayload as any) };
      setEventsByDate((prev) => {
        const next = { ...prev };
        const list = [...(next[dateIso] || [])];
        list.push(newEvent);
        next[dateIso] = list;
        return next;
      });

      closeMeetingModal();
    } catch (e: any) {
      setMeetErr(e?.message || "Failed to schedule/update meeting.");
    } finally {
      setMeetSaving(false);
    }
  }

  async function handleDeleteMeeting() {
    if (!canEditSchedule || !editingMeetId) return;
    const ok = window.confirm("Delete this meeting? This will remove the schedule block and delete the meeting time entries.");
    if (!ok) return;

    setMeetSaving(true);
    setMeetErr("");

    try {
      await deleteMeetingAndEntries(editingMeetId, editingMeetOriginalDate || meetDateIso);
      closeMeetingModal();
    } catch (e: any) {
      setMeetErr(e?.message || "Failed to delete meeting.");
    } finally {
      setMeetSaving(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 860px)");
    const apply = () => setIsMobile(Boolean(mq.matches));
    apply();

    try {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const v = (url.searchParams.get("view") || "").toLowerCase();
      const d = (url.searchParams.get("date") || "").trim();

      if (v === "day" || v === "week" || v === "month") setView(v);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchorIso(d);

      const hide = url.searchParams.get("hideCompleted");
      if (hide === "0") setHideCompleted(false);

      const tf = url.searchParams.get("tech");
      if (tf) setTechFilter(tf);

      const sf = url.searchParams.get("status");
      if (sf) setStatusFilter(sf);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    if (didApplyMobileDefaultRef.current) return;

    try {
      const url = new URL(window.location.href);
      const v = (url.searchParams.get("view") || "").toLowerCase();
      if (!v) setView("day");
    } catch {
      setView("day");
    }

    didApplyMobileDefaultRef.current = true;
  }, [isMobile]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      url.searchParams.set("date", anchorIso);
      url.searchParams.set("hideCompleted", hideCompleted ? "1" : "0");
      url.searchParams.set("tech", techFilter);
      url.searchParams.set("status", statusFilter);
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }, [view, anchorIso, hideCompleted, techFilter, statusFilter]);

  const anchorDate = useMemo(() => fromIsoDate(anchorIso), [anchorIso]);

  const range = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      const iso = toIsoDate(d);
      return { startIso: iso, endIso: iso };
    }

    if (view === "month") {
      const y = anchorDate.getFullYear();
      const m = anchorDate.getMonth();
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      first.setHours(0, 0, 0, 0);
      last.setHours(0, 0, 0, 0);
      return { startIso: toIsoDate(first), endIso: toIsoDate(last) };
    }

    const weekStart = startOfWorkWeek(anchorDate);
    const weekDays = workWeekDays(weekStart);
    return { startIso: toIsoDate(weekDays[0]), endIso: toIsoDate(weekDays[weekDays.length - 1]) };
  }, [view, anchorIso, anchorDate]);

  useEffect(() => {
    async function loadHolidays() {
      setHolidaysLoading(true);
      setHolidaysError("");

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
          if (rawDate < range.startIso || rawDate > range.endIso) continue;

          map[rawDate] = {
            id: ds.id,
            date: rawDate,
            name: String(d.name ?? d.title ?? "Holiday"),
            active: true,
          };
        }

        setHolidayByDate(map);
      } catch (e: any) {
        setHolidaysError(e?.message || "Failed to load company holidays.");
        setHolidayByDate({});
      } finally {
        setHolidaysLoading(false);
      }
    }

    loadHolidays();
  }, [range.startIso, range.endIso]);

  useEffect(() => {
    async function loadPto() {
      setPtoLoading(true);
      setPtoError("");

      try {
        const snap = await getDocs(collection(db, "ptoRequests"));

        const byUid: Record<string, Record<string, PtoDay>> = {};
        const namesByDate: Record<string, Set<string>> = {};

        for (const ds of snap.docs) {
          const d = ds.data() as any;
          if (!looksApprovedPto(d)) continue;

          const uid = extractEmployeeUid(d);
          if (!uid) continue;

          const dates = extractPtoDates(d);
          if (dates.length === 0) continue;

          const employeeName = extractEmployeeName(d) || findTechName(uid) || uid;
          const hours = d.hours ?? d.hoursPaid ?? d.requestedHours ?? null;
          const reason = d.reason ?? d.notes ?? d.note ?? null;

          for (const date of dates) {
            if (date < range.startIso || date > range.endIso) continue;

            if (!byUid[uid]) byUid[uid] = {};
            byUid[uid][date] = {
              uid,
              employeeName,
              date,
              hours: Number.isFinite(Number(hours)) ? Number(hours) : null,
              requestId: ds.id,
              reason: reason ? String(reason) : null,
            };

            if (!namesByDate[date]) namesByDate[date] = new Set<string>();
            namesByDate[date].add(employeeName);
          }
        }

        const outNames: Record<string, string[]> = {};
        for (const date of Object.keys(namesByDate)) {
          outNames[date] = Array.from(namesByDate[date].values()).sort((a, b) => a.localeCompare(b));
        }

        setPtoByUidByDate(byUid);
        setPtoNamesByDate(outNames);
      } catch (e: any) {
        setPtoError(e?.message || "Failed to load PTO requests.");
        setPtoByUidByDate({});
        setPtoNamesByDate({});
      } finally {
        setPtoLoading(false);
      }
    }

    loadPto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.startIso, range.endIso, techs.map((t) => t.uid).join("|")]);

  useEffect(() => {
    async function loadEvents() {
      setEventsLoading(true);
      setEventsError("");

      try {
        let snap;
        try {
          snap = await getDocs(
            query(
              collection(db, "companyEvents"),
              where("active", "==", true),
              where("date", ">=", range.startIso),
              where("date", "<=", range.endIso),
              orderBy("date", "asc")
            )
          );
        } catch {
          snap = await getDocs(collection(db, "companyEvents"));
        }

        const map: Record<string, CompanyEvent[]> = {};
        for (const ds of snap.docs) {
          const d = ds.data() as any;
          const date = String(d.date || "").trim();
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          if (date < range.startIso || date > range.endIso) continue;

          const ev: CompanyEvent = {
            id: ds.id,
            active: typeof d.active === "boolean" ? d.active : true,
            type: String(d.type ?? "meeting"),
            title: String(d.title ?? d.name ?? "Meeting"),
            date,
            timeWindow: d.timeWindow ?? "am",
            startTime: d.startTime ?? null,
            endTime: d.endTime ?? null,
            location: d.location ?? null,
            notes: d.notes ?? null,
            appliesToRoles: d.appliesToRoles ?? null,
            appliesToUids: d.appliesToUids ?? null,
            blocksSchedule: typeof d.blocksSchedule === "boolean" ? d.blocksSchedule : true,
            createdAt: d.createdAt ?? undefined,
            createdByUid: d.createdByUid ?? null,
            updatedAt: d.updatedAt ?? undefined,
            updatedByUid: d.updatedByUid ?? null,
          };

          if (!ev.active) continue;
          if (!map[date]) map[date] = [];
          map[date].push(ev);
        }

        setEventsByDate(map);
      } catch (e: any) {
        setEventsError(e?.message || "Failed to load meetings/events.");
        setEventsByDate({});
      } finally {
        setEventsLoading(false);
      }
    }

    loadEvents();
  }, [range.startIso, range.endIso]);

  useEffect(() => {
    async function loadTechs() {
      setTechsLoading(true);
      setTechsError("");
      try {
        const snap = await getDocs(collection(db, "users"));
        const items: TechRow[] = snap.docs
          .map((ds) => {
            const d = ds.data() as any;
            return {
              uid: String(d.uid ?? ds.id),
              name: String(d.displayName ?? "Unnamed"),
              role: String(d.role ?? ""),
              active: Boolean(d.active),
            };
          })
          .filter((x) => x.active && x.role === "technician")
          .map((x) => ({ uid: x.uid, name: x.name }));

        items.sort((a, b) => a.name.localeCompare(b.name));
        setTechs(items);
      } catch (e: any) {
        setTechsError(e?.message || "Failed to load technicians.");
      } finally {
        setTechsLoading(false);
      }
    }
    loadTechs();
  }, []);

  useEffect(() => {
    async function loadTrips() {
      setTripsLoading(true);
      setTripsError("");

      try {
        const qTrips = query(
          collection(db, "trips"),
          where("active", "==", true),
          where("date", ">=", range.startIso),
          where("date", "<=", range.endIso),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        );

        const snap = await getDocs(qTrips);
        const items: TripDoc[] = snap.docs.map((ds) => {
          const d = ds.data() as any;
          return {
            id: ds.id,
            active: typeof d.active === "boolean" ? d.active : true,
            type: d.type ?? undefined,
            status: d.status ?? undefined,
            date: d.date ?? undefined,
            timeWindow: d.timeWindow ?? undefined,
            startTime: d.startTime ?? undefined,
            endTime: d.endTime ?? undefined,
            crew: d.crew ?? null,
            link: d.link ?? null,
            outcome: d.outcome ?? null,
            readyToBillAt: d.readyToBillAt ?? null,
            confirmedBy: d.confirmedBy ?? null,
            createdAt: d.createdAt ?? undefined,
            updatedAt: d.updatedAt ?? undefined,
          };
        });

        setTrips(items);
      } catch (e: any) {
        setTripsError(e?.message || "Failed to load trips.");
      } finally {
        setTripsLoading(false);
      }
    }

    loadTrips();
  }, [range.startIso, range.endIso]);

  useEffect(() => {
    setLoading(tripsLoading || techsLoading || holidaysLoading || ptoLoading || eventsLoading);
  }, [tripsLoading, techsLoading, holidaysLoading, ptoLoading, eventsLoading]);

  const serviceTicketIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const id = String(t.link?.serviceTicketId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  const projectIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const id = String(t.link?.projectId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  useEffect(() => {
    let cancelled = false;

    async function loadTicketSummaries() {
      if (serviceTicketIdsInRange.length === 0) return;
      const missing = serviceTicketIdsInRange.filter((id) => !ticketMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, TicketSummary> = {};
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, "serviceTickets", id));
            if (!snap.exists()) return;
            const d = snap.data() as any;
            next[id] = {
              id,
              issueSummary: String(d.issueSummary ?? "Service Ticket"),
              customerDisplayName: String(d.customerDisplayName ?? ""),
              serviceAddressLine1: String(d.serviceAddressLine1 ?? ""),
              serviceCity: String(d.serviceCity ?? ""),
            };
          })
        );
      } catch {}

      if (!cancelled && Object.keys(next).length) setTicketMap((prev) => ({ ...prev, ...next }));
    }

    loadTicketSummaries();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTicketIdsInRange.join("|")]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectSummaries() {
      if (projectIdsInRange.length === 0) return;
      const missing = projectIdsInRange.filter((id) => !projectMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, ProjectSummary> = {};
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, "projects", id));
            if (!snap.exists()) return;
            const d = snap.data() as any;
            next[id] = { id, name: String(d.name ?? d.projectName ?? d.title ?? "Project") };
          })
        );
      } catch {}

      if (!cancelled && Object.keys(next).length) setProjectMap((prev) => ({ ...prev, ...next }));
    }

    loadProjectSummaries();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsInRange.join("|")]);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const s = normalizeStatus(t.status);
      if (hideCompleted && isCompletedStatus(s)) return false;

      if (statusFilter !== "ALL" && normalizeStatus(statusFilter) !== s) return false;

      if (techFilter === "ALL") return true;

      if (techFilter === "UNASSIGNED") {
        const hasPrimary = Boolean(String(t.crew?.primaryTechUid || "").trim());
        const hasSecondary = Boolean(String(t.crew?.secondaryTechUid || "").trim());
        return !(hasPrimary || hasSecondary);
      }

      return isTechOnTrip(t, techFilter);
    });
  }, [trips, hideCompleted, statusFilter, techFilter]);

  const rows = useMemo(() => {
    const out: Array<{ key: string; label: string; uid: string | null }> = [];

    const unassignedHasTrips = filteredTrips.some((t) => !primaryTechUid(t));
    if (unassignedHasTrips || techFilter === "UNASSIGNED") {
      out.push({ key: "UNASSIGNED", label: "Unassigned", uid: null });
    }

    if (techFilter !== "ALL" && techFilter !== "UNASSIGNED") {
      const match = techs.find((t) => t.uid === techFilter);
      if (match) out.push({ key: match.uid, label: match.name, uid: match.uid });
      return out;
    }

    for (const t of techs) out.push({ key: t.uid, label: t.name, uid: t.uid });
    return out;
  }, [techs, filteredTrips, techFilter]);

  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const t of filteredTrips) {
      const d = String(t.date || "").trim();
      if (!d) continue;

      const rowUids = tripRowUids(t);
      const targets = rowUids.length ? rowUids : ["UNASSIGNED"];

      for (const uid of targets) {
        if (!out.has(uid)) out.set(uid, new Map());
        const byDate = out.get(uid)!;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(t);
      }
    }

    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort(compareTripTime);
        byDate.set(d, list);
      }
    }

    return out;
  }, [filteredTrips]);

  function goPrev() {
    if (view === "day") {
      setAnchorIso(toIsoDate(prevWorkday(fromIsoDate(anchorIso))));
      return;
    }
    if (view === "month") {
      const prev = addMonths(fromIsoDate(anchorIso), -1);
      setAnchorIso(toIsoDate(new Date(prev.getFullYear(), prev.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(addDays(startOfWorkWeek(fromIsoDate(anchorIso)), -7)));
  }

  function goNext() {
    if (view === "day") {
      setAnchorIso(toIsoDate(nextWorkday(fromIsoDate(anchorIso))));
      return;
    }
    if (view === "month") {
      const next = addMonths(fromIsoDate(anchorIso), 1);
      setAnchorIso(toIsoDate(new Date(next.getFullYear(), next.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(addDays(startOfWorkWeek(fromIsoDate(anchorIso)), 7)));
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);

    if (view === "day") {
      let cur = d;
      while (isWeekend(cur)) cur = addDays(cur, 1);
      setAnchorIso(toIsoDate(cur));
      return;
    }
    if (view === "month") {
      setAnchorIso(toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(startOfWorkWeek(d)));
  }

  const daysForWeekOrDay = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      return [d];
    }
    return workWeekDays(startOfWorkWeek(anchorDate));
  }, [view, anchorIso, anchorDate]);

  const monthWeeks = useMemo(() => {
    if (view !== "month") return [];
    return monthCalendarWorkWeeks(anchorDate);
  }, [view, anchorDate]);

  const titleText = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Day (${formatDow(d)} ${formatShort(d)})`;
    }
    if (view === "month") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Month (${d.getMonth() + 1}/${d.getFullYear()})`;
    }
    const d0 = daysForWeekOrDay[0];
    const d1 = daysForWeekOrDay[daysForWeekOrDay.length - 1];
    return `Schedule • Week (${formatShort(d0)} – ${formatShort(d1)})`;
  }, [view, anchorIso, daysForWeekOrDay]);

  function renderHolidayBadge(iso: string) {
    const h = holidayByDate[iso];
    if (!h) return null;
    return (
      <InfoChip
        icon={<CelebrationRoundedIcon sx={{ fontSize: 16 }} />}
        label={h.name}
        color="warning"
      />
    );
  }

  function renderPtoBadgeSmall(dateIso: string) {
    const summary = getPtoSummaryForDate(dateIso, ptoByUidByDate);
    if (summary.count === 0) return null;

    const label =
      summary.totalHours > 0
        ? `PTO • ${summary.count} • ${summary.totalHours}h`
        : `PTO • ${summary.count}`;

    return (
      <Chip
        size="small"
        icon={<BeachAccessRoundedIcon sx={{ fontSize: 16 }} />}
        label={label}
        color="secondary"
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          fontWeight: 500,
        }}
      />
    );
  }

  function renderMeetingsBadgeSmall(dateIso: string) {
    const list = eventsByDate[dateIso] || [];
    if (!list.length) return null;

    if (list.length === 1) {
      const meeting = list[0];
      const clickable = canEditSchedule;

      return (
        <Chip
          size="small"
          icon={<CampaignRoundedIcon sx={{ fontSize: 16 }} />}
          label={meetingChipLabel(meeting)}
          color="success"
          variant="outlined"
          clickable={clickable}
          onClick={clickable ? () => openEditMeetingModal(meeting) : undefined}
          sx={{
            borderRadius: 1.5,
            fontWeight: 500,
            maxWidth: 320,
            cursor: clickable ? "pointer" : "default",
            "& .MuiChip-label": {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          }}
        />
      );
    }

    return (
      <Chip
        size="small"
        icon={<CampaignRoundedIcon sx={{ fontSize: 16 }} />}
        label={`${list.length} meetings`}
        color="success"
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          fontWeight: 500,
        }}
      />
    );
  }

  function renderTripCard(t: TripDoc, opts?: { showTechName?: boolean }) {
    const type = (t.type || "").toLowerCase();
    const isService = type === "service";
    const isProject = type === "project";

    const ticketId = String(t.link?.serviceTicketId || "").trim();
    const ticket = ticketId ? ticketMap[ticketId] : undefined;

    const projectId = String(t.link?.projectId || "").trim();
    const project = projectId ? projectMap[projectId] : undefined;

    const titleText = isService
      ? ticket?.issueSummary || "Service Ticket"
      : isProject
        ? project?.name || "Project"
        : "Trip";

    const timeText = formatTimeRangeForCard(t);

    const customerLine =
      isService && ticket
        ? `${ticket.customerDisplayName || "Customer"} — ${ticket.serviceAddressLine1 || ""}${ticket.serviceCity ? `, ${ticket.serviceCity}` : ""}`
        : "";

    const showTechName = Boolean(opts?.showTechName);
    const techName = t.crew?.primaryTechName || "";

    const prog = isProject ? confirmationProgress(t) : null;
    const showProgress =
      isProject && prog && prog.requiredCount > 0 && !isCompletedStatus(t.status);

    return (
      <SharedTripCard
        title={titleText}
        status={t.status}
        tripType={t.type}
        subtitle={timeText}
        customerLine={customerLine || undefined}
        progressText={
          showProgress ? `Confirmed: ${prog!.confirmedCount}/${prog!.requiredCount}` : undefined
        }
        titleSuffix={
          showTechName && techName ? (
            <Typography
              component="span"
              variant="caption"
              sx={{ ml: 1, color: "text.secondary" }}
            >
              • {techName}
            </Typography>
          ) : undefined
        }
        onClick={() => {
          if (t.link?.serviceTicketId) {
            router.push(`/service-tickets/${t.link.serviceTicketId}`);
            return;
          }
          if (t.link?.projectId) {
            router.push(`/projects/${t.link.projectId}`);
            return;
          }
          router.push("/schedule");
        }}
      />
    );
  }

  function computeCellAvailability(rowKey: string, iso: string, cellTrips: TripDoc[]) {
    const amBusyTrips = cellTrips.some((t) => tripBlocksSlot(t, "am"));
    const pmBusyTrips = cellTrips.some((t) => tripBlocksSlot(t, "pm"));

    const meetings = (eventsByDate[iso] || []).filter((e) => eventAppliesToRoleOrAll(e, "technician"));
    const amBusyMeet = meetings.some((e) => eventBlocksSlot(e, "am"));
    const pmBusyMeet = meetings.some((e) => eventBlocksSlot(e, "pm"));

    const holiday = Boolean(holidayByDate[iso]);
    const pto = rowKey !== "UNASSIGNED" ? Boolean(ptoByUidByDate[rowKey]?.[iso]) : false;

    const amBusy = amBusyTrips || amBusyMeet || holiday || pto;
    const pmBusy = pmBusyTrips || pmBusyMeet || holiday || pto;

    return { amBusy, pmBusy, allBusy: amBusy && pmBusy, meetings };
  }

  const monthWeeksSafe = useMemo(() => (view === "month" ? monthWeeks : []), [view, monthWeeks]);

  return (
    <ProtectedPage fallbackTitle="Schedule">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1600, mx: "auto" }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", lg: "center" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.6rem", md: "2rem" },
                    lineHeight: 1.08,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {titleText}
                </Typography>

                <Typography
                  sx={{
                    mt: 0.75,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 900,
                  }}
                >
                  Technician schedule, meetings, PTO, holidays, and assignment visibility.
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
                sx={{ width: { xs: "100%", lg: "auto" } }}
              >
                <Stack direction="row" spacing={1}>
                  <IconButton onClick={goPrev} sx={{ borderRadius: 1.5 }}>
                    <ChevronLeftRoundedIcon />
                  </IconButton>

                  <Button variant="outlined" onClick={goToday} startIcon={<TodayRoundedIcon />}>
                    Today
                  </Button>

                  <IconButton onClick={goNext} sx={{ borderRadius: 1.5 }}>
                    <ChevronRightRoundedIcon />
                  </IconButton>
                </Stack>

                {canEditSchedule ? (
                  <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => openMeetingModal(range.startIso)}
                  >
                    Meeting
                  </Button>
                ) : null}

                <ToggleButtonGroup
                  exclusive
                  value={view}
                  onChange={(_, next) => {
                    if (next) setView(next as ViewMode);
                  }}
                  size="small"
                >
                  <ToggleButton value="day">
                    <ViewDayRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                    Day
                  </ToggleButton>
                  <ToggleButton value="week">
                    <ViewWeekRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                    Week
                  </ToggleButton>
                  <ToggleButton value="month">
                    <CalendarMonthRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                    Month
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>

            <Box>
              <SectionHeader
                title="Filters"
                subtitle="Refine the schedule by technician, status, and completion state."
              />

              <Box sx={{ mt: 1.5 }}>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "stretch", md: "center" }}
                  >
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <InputLabel>Technician</InputLabel>
                      <Select
                        label="Technician"
                        value={techFilter}
                        onChange={(e: SelectChangeEvent) => setTechFilter(e.target.value)}
                      >
                        <MenuItem value="ALL">All</MenuItem>
                        <MenuItem value="UNASSIGNED">Unassigned</MenuItem>
                        {techs.map((t) => (
                          <MenuItem key={t.uid} value={t.uid}>
                            {t.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <InputLabel>Status</InputLabel>
                      <Select
                        label="Status"
                        value={statusFilter}
                        onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}
                      >
                        <MenuItem value="ALL">All</MenuItem>
                        <MenuItem value="planned">planned</MenuItem>
                        <MenuItem value="in_progress">in_progress</MenuItem>
                        <MenuItem value="complete">complete</MenuItem>
                        <MenuItem value="cancelled">cancelled</MenuItem>
                      </Select>
                    </FormControl>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={hideCompleted}
                          onChange={(e) => setHideCompleted(e.target.checked)}
                        />
                      }
                      label="Hide completed"
                    />

                    <Box sx={{ flex: 1 }} />

                    <Chip
                      label={`Showing ${filteredTrips.length} trip(s)`}
                      variant="outlined"
                      sx={{ borderRadius: 1.5 }}
                    />
                  </Stack>
                </Stack>
              </Box>
            </Box>

            {(techsError || tripsError || holidaysError || ptoError || eventsError) && (
              <Stack spacing={1}>
                {techsError ? <Alert severity="error">{techsError}</Alert> : null}
                {tripsError ? <Alert severity="error">{tripsError}</Alert> : null}
                {holidaysError ? <Alert severity="error">{holidaysError}</Alert> : null}
                {ptoError ? <Alert severity="error">{ptoError}</Alert> : null}
                {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}
              </Stack>
            )}

            {loading ? (
              <Box sx={{ py: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Loading schedule...
                </Typography>
              </Box>
            ) : null}

            {!loading && view === "month" ? (
              <Box>
                <SectionHeader
                  title="Month view"
                  subtitle="Monday through Friday calendar grid."
                />

                <Box sx={{ mt: 1.5, overflowX: "auto" }}>
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      boxShadow: "none",
                    }}
                  >
                    <Table sx={{ minWidth: 900 }}>
                      <TableHead>
                        <TableRow>
                          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                            <TableCell key={d} sx={{ fontWeight: 600 }}>
                              {d}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {monthWeeksSafe.map((week, idx) => (
                          <TableRow key={`week-${idx}`}>
                            {week.map((cellDate, cIdx) => {
                              if (!cellDate) {
                                return (
                                  <TableCell
                                    key={`empty-${idx}-${cIdx}`}
                                    sx={{ verticalAlign: "top", height: 180, bgcolor: alpha("#FFFFFF", 0.02) }}
                                  />
                                );
                              }

                              const iso = toIsoDate(cellDate);
                              const dayTrips = filteredTrips.filter((t) => String(t.date || "") === iso);
                              const holiday = holidayByDate[iso];
                              const ptoNames = ptoNamesByDate[iso] || [];
                              const meets = eventsByDate[iso] || [];

                              return (
                                <TableCell
                                  key={iso}
                                  sx={{
                                    verticalAlign: "top",
                                    height: 180,
                                    bgcolor: holiday
                                      ? alpha(theme.palette.warning.main, 0.08)
                                      : ptoNames.length
                                        ? alpha(theme.palette.secondary.main, 0.08)
                                        : meets.length
                                          ? alpha(theme.palette.success.main, 0.06)
                                          : "transparent",
                                  }}
                                >
                                  <Stack spacing={1}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                      <Typography variant="subtitle2">{cellDate.getDate()}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {iso}
                                      </Typography>
                                    </Stack>

                                    <Stack spacing={0.75}>
                                      {holiday ? (
                                        <Chip
                                          size="small"
                                          icon={<CelebrationRoundedIcon sx={{ fontSize: 15 }} />}
                                          label={holiday.name}
                                          color="warning"
                                          variant="outlined"
                                          sx={{ width: "fit-content" }}
                                        />
                                      ) : null}

                                      {ptoNames.length ? (
                                        <Chip
                                          size="small"
                                          icon={<BeachAccessRoundedIcon sx={{ fontSize: 15 }} />}
                                          label={ptoNames.length === 1 ? `PTO: ${ptoNames[0]}` : `PTO: ${ptoNames.length} employees`}
                                          color="secondary"
                                          variant="outlined"
                                          sx={{ width: "fit-content" }}
                                        />
                                      ) : null}

                                      {meets.length === 1 ? (
                                        <Chip
                                          size="small"
                                          icon={<CampaignRoundedIcon sx={{ fontSize: 15 }} />}
                                          label={meetingChipLabel(meets[0])}
                                          color="success"
                                          variant="outlined"
                                          clickable={canEditSchedule}
                                          onClick={canEditSchedule ? () => openEditMeetingModal(meets[0]) : undefined}
                                          sx={{
                                            width: "fit-content",
                                            maxWidth: "100%",
                                            cursor: canEditSchedule ? "pointer" : "default",
                                            "& .MuiChip-label": {
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                            },
                                          }}
                                        />
                                      ) : meets.length > 1 ? (
                                        <Chip
                                          size="small"
                                          icon={<CampaignRoundedIcon sx={{ fontSize: 15 }} />}
                                          label={`Meetings: ${meets.length}`}
                                          color="success"
                                          variant="outlined"
                                          sx={{ width: "fit-content" }}
                                        />
                                      ) : null}
                                    </Stack>

                                    <Stack spacing={0.75}>
                                      {dayTrips.slice(0, 6).map((t) =>
                                        renderTripCard(t, { showTechName: techFilter === "ALL" })
                                      )}
                                      {dayTrips.length > 6 ? (
                                        <Typography variant="caption" color="text.secondary">
                                          +{dayTrips.length - 6} more…
                                        </Typography>
                                      ) : null}
                                      {dayTrips.length === 0 && !holiday && ptoNames.length === 0 && meets.length === 0 ? (
                                        <Typography variant="caption" color="text.secondary">
                                          —
                                        </Typography>
                                      ) : null}
                                    </Stack>
                                  </Stack>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Box>
            ) : null}

            {!loading && view !== "month" ? (
              <>
                {isMobile ? (
                  <Stack spacing={1.5}>
                    {daysForWeekOrDay.map((d) => {
                      const iso = toIsoDate(d);
                      const holiday = holidayByDate[iso];

                      return (
                        <Card key={iso} elevation={0} sx={{ borderRadius: 2.5 }}>
                          <Box sx={{ px: { xs: 2, md: 2.5 }, pt: { xs: 2, md: 2.5 }, pb: 1.5 }}>
                            <Stack spacing={1}>
                              <Typography
                                variant="h6"
                                sx={{
                                  fontSize: { xs: "1rem", md: "1.05rem" },
                                  fontWeight: 800,
                                  letterSpacing: "-0.02em",
                                }}
                              >
                                {formatDow(d)} • {iso}
                              </Typography>

                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {renderHolidayBadge(iso)}
                                {renderPtoBadgeSmall(iso)}
                                {renderMeetingsBadgeSmall(iso)}
                              </Stack>
                            </Stack>
                          </Box>

                          <Box sx={{ p: { xs: 2, md: 2.5 }, pt: 0 }}>
                            <Stack spacing={1.5}>
                              {rows.map((r) => {
                                const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;
                                const cellTrips = grid.get(rowKey)?.get(iso) || [];
                                const pto = rowKey !== "UNASSIGNED" ? ptoByUidByDate[rowKey]?.[iso] : null;
                                const { amBusy, pmBusy, allBusy, meetings } = computeCellAvailability(rowKey, iso, cellTrips);
                                const { amTrips, pmTrips } = splitTripsBySlot(cellTrips);
                                const isPast = iso < todayIso;

                                const canShowPlus =
                                  canEditSchedule &&
                                  rowKey !== "UNASSIGNED" &&
                                  !holiday &&
                                  !pto &&
                                  !allBusy &&
                                  !isPast;

                                return (
                                  <Card
                                    key={`${rowKey}_${iso}`}
                                    variant="outlined"
                                    sx={{
                                      borderRadius: 2,
                                      boxShadow: "none",
                                      bgcolor: holiday
                                        ? alpha(theme.palette.warning.main, 0.08)
                                        : pto
                                          ? alpha(theme.palette.secondary.main, 0.08)
                                          : meetings.length
                                            ? alpha(theme.palette.success.main, 0.05)
                                            : "background.paper",
                                    }}
                                  >
                                    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                                      <Stack spacing={1.25}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                          <GroupsRoundedIcon sx={{ fontSize: 18, color: "primary.light" }} />
                                          <Typography variant="subtitle1">{r.label}</Typography>
                                        </Stack>

                                        {holiday ? <Alert severity="warning" variant="outlined">{holiday.name}</Alert> : null}

                                        {pto ? (
                                          <Chip
                                            size="small"
                                            icon={<BeachAccessRoundedIcon sx={{ fontSize: 16 }} />}
                                            label={`PTO approved${pto.hours ? ` • ${pto.hours}h` : ""}`}
                                            color="secondary"
                                            variant="outlined"
                                            sx={{
                                              borderRadius: 1.5,
                                              width: "fit-content",
                                              fontWeight: 500,
                                            }}
                                          />
                                        ) : null}

                                        {canShowPlus && !amBusy ? (
                                          <ScheduleSlotButton
                                            label="Add AM"
                                            onClick={() => openAddModal({ techUid: rowKey, dateIso: iso, slot: "am" })}
                                          />
                                        ) : null}

                                        {amTrips.length ? <Stack spacing={1}>{amTrips.map((t) => renderTripCard(t))}</Stack> : null}

                                        {canShowPlus && !pmBusy ? (
                                          <ScheduleSlotButton
                                            label="Add PM"
                                            onClick={() => openAddModal({ techUid: rowKey, dateIso: iso, slot: "pm" })}
                                          />
                                        ) : null}

                                        {pmTrips.length ? <Stack spacing={1}>{pmTrips.map((t) => renderTripCard(t))}</Stack> : null}

                                        {amTrips.length === 0 && pmTrips.length === 0 ? (
                                          <Typography variant="caption" color="text.secondary">
                                            {holiday ? "Holiday" : pto ? "PTO" : meetings.length ? "Meeting(s)" : "—"}
                                          </Typography>
                                        ) : null}
                                      </Stack>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </Stack>
                          </Box>
                        </Card>
                      );
                    })}
                  </Stack>
                ) : (
                  <Box>
                    <SectionHeader
                      title="Week / day view"
                      subtitle="Technician rows with daily assignment cells."
                    />

                    <Box sx={{ mt: 1.5 }}>
                      <TableContainer
                        component={Paper}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          boxShadow: "none",
                        }}
                      >
                        <Table sx={{ minWidth: Math.max(900, 220 + daysForWeekOrDay.length * 260) }}>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ width: 220, fontWeight: 600 }}>Technician</TableCell>

                              {daysForWeekOrDay.map((d) => {
                                const iso = toIsoDate(d);
                                const holiday = holidayByDate[iso];
                                return (
                                  <TableCell
                                    key={iso}
                                    sx={{
                                      minWidth: 260,
                                      fontWeight: 600,
                                      bgcolor: holiday
                                        ? alpha(theme.palette.warning.main, 0.08)
                                        : alpha("#FFFFFF", 0.02),
                                    }}
                                  >
                                    <Stack spacing={0.75}>
                                      <Typography variant="subtitle2">{formatDow(d)}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {iso}
                                      </Typography>
                                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                        {renderHolidayBadge(iso)}
                                        {renderPtoBadgeSmall(iso)}
                                        {renderMeetingsBadgeSmall(iso)}
                                      </Stack>
                                    </Stack>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          </TableHead>

                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={1 + daysForWeekOrDay.length}>
                                  <Typography variant="body2" color="text.secondary">
                                    No matching technicians or trips.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              rows.map((r) => {
                                const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;

                                return (
                                  <TableRow key={r.key}>
                                    <TableCell sx={{ verticalAlign: "top", width: 220 }}>
                                      <Stack direction="row" spacing={1} alignItems="center">
                                        <GroupsRoundedIcon sx={{ fontSize: 18, color: "primary.light" }} />
                                        <Typography variant="subtitle2">{r.label}</Typography>
                                      </Stack>
                                    </TableCell>

                                    {daysForWeekOrDay.map((d) => {
                                      const iso = toIsoDate(d);
                                      const cellTrips = grid.get(rowKey)?.get(iso) || [];
                                      const holiday = holidayByDate[iso];
                                      const pto = rowKey !== "UNASSIGNED" ? ptoByUidByDate[rowKey]?.[iso] : null;
                                      const { amBusy, pmBusy, allBusy, meetings } = computeCellAvailability(rowKey, iso, cellTrips);
                                      const { amTrips, pmTrips } = splitTripsBySlot(cellTrips);
                                      const isPast = iso < todayIso;

                                      const canShowPlus =
                                        canEditSchedule &&
                                        rowKey !== "UNASSIGNED" &&
                                        !allBusy &&
                                        !holiday &&
                                        !pto &&
                                        !isPast;

                                      return (
                                        <TableCell
                                          key={`${r.key}_${iso}`}
                                          sx={{
                                            verticalAlign: "top",
                                            bgcolor: holiday
                                              ? alpha(theme.palette.warning.main, 0.08)
                                              : pto
                                                ? alpha(theme.palette.secondary.main, 0.08)
                                                : meetings.length
                                                  ? alpha(theme.palette.success.main, 0.05)
                                                  : "transparent",
                                          }}
                                        >
                                          <Stack spacing={1}>
                                            {holiday ? <Alert severity="warning" variant="outlined">{holiday.name}</Alert> : null}

                                            {pto ? (
                                              <Chip
                                                size="small"
                                                icon={<BeachAccessRoundedIcon sx={{ fontSize: 16 }} />}
                                                label={`PTO approved${pto.hours ? ` • ${pto.hours}h` : ""}`}
                                                color="secondary"
                                                variant="outlined"
                                                sx={{
                                                  borderRadius: 1.5,
                                                  width: "fit-content",
                                                  fontWeight: 500,
                                                }}
                                              />
                                            ) : null}

                                            {canShowPlus && !amBusy ? (
                                              <ScheduleSlotButton
                                                label="Add AM"
                                                onClick={() => openAddModal({ techUid: rowKey, dateIso: iso, slot: "am" })}
                                              />
                                            ) : null}

                                            {amTrips.length ? <Stack spacing={1}>{amTrips.map((t) => renderTripCard(t))}</Stack> : null}

                                            {canShowPlus && !pmBusy ? (
                                              <ScheduleSlotButton
                                                label="Add PM"
                                                onClick={() => openAddModal({ techUid: rowKey, dateIso: iso, slot: "pm" })}
                                              />
                                            ) : null}

                                            {pmTrips.length ? <Stack spacing={1}>{pmTrips.map((t) => renderTripCard(t))}</Stack> : null}

                                            {amTrips.length === 0 && pmTrips.length === 0 ? (
                                              <Typography variant="caption" color="text.secondary">
                                                {holiday ? "Holiday" : pto ? "PTO" : meetings.length ? "Meeting(s)" : "—"}
                                              </Typography>
                                            ) : null}
                                          </Stack>
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  </Box>
                )}
              </>
            ) : null}

            {!canSeeAll ? (
              <Alert severity="info" variant="outlined">
                Role-based schedule visibility can be tightened later if you want more restricted access.
              </Alert>
            ) : null}
          </Stack>
        </Box>

        <Dialog open={addOpen} onClose={closeAddModal} fullWidth maxWidth="md">
          <DialogTitle>Schedule Trip</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Tech: <strong>{findTechName(addTechUid) || addTechUid}</strong> • Date: <strong>{addDateIso}</strong> • Slot: <strong>{addSlot.toUpperCase()}</strong>
              </Typography>

              <FormControl fullWidth>
                <InputLabel>Trip Type</InputLabel>
                <Select
                  label="Trip Type"
                  value={addTripType}
                  onChange={(e: SelectChangeEvent) => {
                    const v = e.target.value as AddTripType;
                    setAddTripType(v);
                    setAddSearch("");
                    setAddSelectedId("");
                    setAddAdvancedId("");
                    if (v === "service") loadOpenTicketsIfNeeded();
                    else loadOpenProjectsIfNeeded();
                  }}
                  disabled={addSaving}
                >
                  <MenuItem value="service">Service Ticket</MenuItem>
                  <MenuItem value="project">Project</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label={addTripType === "service" ? "Open Service Ticket" : "Project"}
                placeholder={
                  addTripType === "service"
                    ? "Search by issue, customer, address…"
                    : "Search by project name, customer, address…"
                }
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                disabled={addSaving}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon />
                    </InputAdornment>
                  ),
                }}
              />

              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  }}
                >
                  <Typography variant="subtitle2">
                    {addTripType === "service" ? "Open Tickets" : "Projects"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {addTripType === "service"
                      ? openTicketsLoading
                        ? "Loading…"
                        : openTicketItems.length
                      : openProjectsLoading
                        ? "Loading…"
                        : openProjectItems.length}
                  </Typography>
                </Box>

                {openTicketsErr && addTripType === "service" ? <Alert severity="error">{openTicketsErr}</Alert> : null}
                {openProjectsErr && addTripType === "project" ? <Alert severity="error">{openProjectsErr}</Alert> : null}

                <Box sx={{ maxHeight: 320, overflow: "auto" }}>
                  {currentPickerItems().length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No matches.
                      </Typography>
                    </Box>
                  ) : (
                    currentPickerItems().map((it) => {
                      const selected = addSelectedId === it.id;
                      return (
                        <Box
                          key={it.id}
                          onClick={() => setAddSelectedId(it.id)}
                          sx={{
                            px: 1.5,
                            py: 1.25,
                            cursor: "pointer",
                            borderBottom: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                            bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : "transparent",
                            borderLeft: selected ? `4px solid ${theme.palette.primary.main}` : "4px solid transparent",
                          }}
                        >
                          <Stack spacing={0.75}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                  {it.metaLeft ? (
                                    <Chip
                                      size="small"
                                      label={it.metaLeft}
                                      color="primary"
                                      variant="outlined"
                                      sx={{ height: 22 }}
                                    />
                                  ) : null}

                                  <Typography variant="subtitle2" noWrap>
                                    {it.label}
                                  </Typography>
                                </Stack>
                              </Box>

                              <Stack direction="row" spacing={1} alignItems="center">
                                {it.metaRight ? (
                                  <Typography variant="caption" color="text.primary">
                                    {it.metaRight}
                                  </Typography>
                                ) : null}
                                <Typography variant="caption" color="text.secondary">
                                  {it.id}
                                </Typography>
                              </Stack>
                            </Stack>

                            {it.sublabel ? (
                              <Typography variant="caption" color="text.secondary">
                                {it.sublabel}
                              </Typography>
                            ) : null}

                            {it.preview ? (
                              <Typography variant="caption" sx={{ color: alpha("#FFFFFF", 0.72) }}>
                                {it.preview}
                              </Typography>
                            ) : null}
                          </Stack>
                        </Box>
                      );
                    })
                  )}
                </Box>
              </Paper>

              <TextField
                label="Advanced ID (optional)"
                placeholder={addTripType === "service" ? "Service Ticket ID…" : "Project ID…"}
                value={addAdvancedId}
                onChange={(e) => setAddAdvancedId(e.target.value)}
                disabled={addSaving}
                helperText="Only use if you need to schedule something not in the list."
              />

              <TextField
                label="Notes (optional)"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                disabled={addSaving}
                multiline
                minRows={3}
                placeholder="Optional dispatch note…"
              />

              {addErr ? <Alert severity="error">{addErr}</Alert> : null}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={closeAddModal} disabled={addSaving}>
              Cancel
            </Button>
            <Button onClick={submitAddTrip} disabled={addSaving} variant="contained">
              {addSaving ? "Scheduling…" : "Schedule Trip"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={meetOpen} onClose={closeMeetingModal} fullWidth maxWidth="sm">
          <DialogTitle>{editingMeetId ? "Edit Company Meeting" : "Schedule Company Meeting"}</DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                This meeting will appear on Schedule and My Day.
              </Typography>

              {meetErr ? <Alert severity="error">{meetErr}</Alert> : null}
              {meetMsg ? <Alert severity="success">{meetMsg}</Alert> : null}

              <TextField
                label="Date"
                value={meetDateIso}
                onChange={(e) => setMeetDateIso(e.target.value)}
                disabled={meetSaving}
                placeholder="YYYY-MM-DD"
              />

              <TextField
                label="Title"
                value={meetTitle}
                onChange={(e) => setMeetTitle(e.target.value)}
                disabled={meetSaving}
                placeholder="Weekly Safety Meeting"
              />

              <FormControl fullWidth>
                <InputLabel>Time Window</InputLabel>
                <Select
                  label="Time Window"
                  value={meetWindow}
                  onChange={(e: SelectChangeEvent) => setMeetWindow(e.target.value as "all_day" | "am" | "pm" | "custom")}
                  disabled={meetSaving}
                >
                  <MenuItem value="am">AM</MenuItem>
                  <MenuItem value="pm">PM</MenuItem>
                  <MenuItem value="all_day">All Day</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>

              {meetWindow === "custom" ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    label="Start"
                    value={meetStart}
                    onChange={(e) => setMeetStart(e.target.value)}
                    disabled={meetSaving}
                    placeholder="HH:mm"
                    fullWidth
                  />
                  <TextField
                    label="End"
                    value={meetEnd}
                    onChange={(e) => setMeetEnd(e.target.value)}
                    disabled={meetSaving}
                    placeholder="HH:mm"
                    fullWidth
                  />
                </Stack>
              ) : null}

              <TextField
                label="Location (optional)"
                value={meetLocation}
                onChange={(e) => setMeetLocation(e.target.value)}
                disabled={meetSaving}
                placeholder="Office"
              />

              <TextField
                label="Notes (optional)"
                value={meetNotes}
                onChange={(e) => setMeetNotes(e.target.value)}
                disabled={meetSaving}
                multiline
                minRows={3}
                placeholder="Anything everyone should know…"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={meetBlocks}
                    onChange={(e) => setMeetBlocks(e.target.checked)}
                    disabled={meetSaving}
                  />
                }
                label="Block schedule during this meeting"
              />

              {editingMeetId ? (
                <Typography variant="caption" color="text.secondary">
                  Edits are blocked if linked weekly timesheets are submitted, approved, or exported.
                </Typography>
              ) : null}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ justifyContent: "space-between" }}>
            <Box>
              {editingMeetId ? (
                <Button
                  onClick={handleDeleteMeeting}
                  disabled={meetSaving}
                  color="error"
                  startIcon={<DeleteRoundedIcon />}
                >
                  Delete
                </Button>
              ) : null}
            </Box>

            <Stack direction="row" spacing={1}>
              <Button onClick={closeMeetingModal} disabled={meetSaving}>
                Cancel
              </Button>
              <Button onClick={submitMeeting} disabled={meetSaving} variant="contained">
                {meetSaving ? "Saving…" : editingMeetId ? "Save Changes" : "Schedule Meeting"}
              </Button>
            </Stack>
          </DialogActions>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}