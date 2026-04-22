// components/AppShell.tsx
"use client";

import Image from "next/image";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "./LogoutButton";
import type { AppUser } from "../src/types/app-user";
import { db } from "../src/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  limit,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import {
  Alert,
  AppBar,
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  SwipeableDrawer,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import TvRoundedIcon from "@mui/icons-material/TvRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import AccessTimeFilledRoundedIcon from "@mui/icons-material/AccessTimeFilledRounded";
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";

type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

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

type TripDoc = {
  id: string;
  active?: boolean;
  status?: string;
  type?: string;
  date?: string;
  timeWindow?: string;
  startTime?: string;
  endTime?: string;
  crew?: TripCrew | null;
  crewConfirmed?: TripCrew | null;
  link?: TripLink | null;
  timerState?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  updatedAt?: string | null;
};

type ActiveTripCard = {
  tripId: string;
  href: string;
  statusLabel: string;
  primaryLine: string;
  secondaryLine: string;
};

type NavEntry = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeCount?: number;
};

type RejectedTimesheetNotice = {
  id: string;
  weekStartDate: string;
  updatedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
};

type ProjectCloseoutTodayResult =
  | "done_today"
  | "stage_complete"
  | "project_complete";

type ProjectCloseoutMeta = {
  projectId: string;
  projectName?: string;
  projectType?: string | null;
  stageKey?: string | null;
};

type FutureProjectTripInfo = {
  id: string;
  date: string;
  timeWindow?: string;
  startTime?: string;
  endTime?: string;
  stageKey?: string | null;
};

const DESKTOP_DRAWER_WIDTH = 296;
const MOBILE_BOTTOM_NAV_HEIGHT = 68;
const MOBILE_ACTIVE_TRIP_HEIGHT = 138;
const MOBILE_TOP_REJECTED_OVERLAY_HEIGHT = 128;
const REJECTED_BANNER_DISMISS_KEY = "dcflow_dismissedRejectedBannerKey";

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function truncate(s: string, max = 44) {
  const x = (s || "").trim();
  if (x.length <= max) return x;
  return x.slice(0, max - 1) + "…";
}

function nowIso() {
  return new Date().toISOString();
}

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function roundQuarter(value: number) {
  return Math.round(value * 4) / 4;
}

function parseTimeToMinutes(hhmm?: string | null) {
  const raw = safeTrim(hhmm);
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [hh, mm] = raw.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function suggestedProjectHoursForCloseout(args: {
  liveMinutes: number;
  timeWindow?: string;
  startTime?: string;
  endTime?: string;
}) {
  const { liveMinutes, timeWindow, startTime, endTime } = args;

  if (liveMinutes > 0) {
    return Math.max(0.25, roundQuarter(liveMinutes / 60));
  }

  const w = safeTrim(timeWindow).toLowerCase();
  if (w === "all_day") return 8;
  if (w === "am") return 4;
  if (w === "pm") return 4;

  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s != null && e != null && e > s) {
    return Math.max(0.25, roundQuarter((e - s) / 60));
  }

  return 8;
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

  return {
    weekStartDate: toIsoDate(weekStart),
    weekEndDate: toIsoDate(weekEnd),
  };
}

function parseIsoMs(iso?: string | null) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

function parseFlexibleDateMs(value?: string | null) {
  const v = safeTrim(value);
  if (!v) return NaN;

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (isoDateOnly.test(v)) {
    return new Date(`${v}T12:00:00`).getTime();
  }

  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function minutesBetweenMs(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

function sumPausedMinutes(
  pauseBlocks?: PauseBlock[] | null,
  referenceNowMs: number = Date.now()
) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return 0;

  let total = 0;

  for (const p of pauseBlocks) {
    const s = parseIsoMs(p?.startAt || null);
    const e = p?.endAt ? parseIsoMs(p.endAt) : referenceNowMs;

    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (e <= s) continue;

    total += minutesBetweenMs(s, e);
  }

  return total;
}

function findOpenPauseIndex(pauseBlocks?: PauseBlock[] | null) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return -1;
  for (let i = pauseBlocks.length - 1; i >= 0; i--) {
    const b = pauseBlocks[i];
    if (b?.startAt && !b?.endAt) return i;
  }
  return -1;
}

function userIsOnCrew(uid: string, crew?: TripCrew | null) {
  const u = safeTrim(uid);
  if (!u) return false;
  const c = crew || {};
  return (
    safeTrim(c.primaryTechUid) === u ||
    safeTrim(c.helperUid) === u ||
    safeTrim(c.secondaryTechUid) === u ||
    safeTrim(c.secondaryHelperUid) === u
  );
}

function normalizeTripStatus(status?: string | null) {
  const s = safeTrim(status).toLowerCase();
  if (s === "completed") return "complete";
  return s;
}

function stageLabel(stageKey?: string | null) {
  const key = safeTrim(stageKey);
  if (key === "roughIn") return "Rough-In";
  if (key === "topOutVent") return "Top-Out / Vent";
  if (key === "trimFinish") return "Trim / Finish";
  if (key === "tm_work") return "T&M Work";
  return key || "Project Work";
}

function isTimeMaterialsProject(projectType?: string | null) {
  const value = safeTrim(projectType).toLowerCase();
  return (
    value === "time_materials" ||
    value === "time+materials" ||
    value === "time_and_materials"
  );
}

function compareTripSequence(
  a: Pick<TripDoc, "id" | "date" | "startTime">,
  b: Pick<TripDoc, "id" | "date" | "startTime">
) {
  const aKey = `${safeTrim(a.date)}_${safeTrim(a.startTime) || "00:00"}_${a.id}`;
  const bKey = `${safeTrim(b.date)}_${safeTrim(b.startTime) || "00:00"}_${b.id}`;
  return aKey.localeCompare(bKey);
}

function formatTripWindowLabel(
  timeWindow?: string,
  startTime?: string,
  endTime?: string
) {
  const w = safeTrim(timeWindow).toLowerCase();

  if (w === "all_day") return "All Day";
  if (w === "am") return "AM";
  if (w === "pm") return "PM";
  if (w === "custom") {
    const s = safeTrim(startTime);
    const e = safeTrim(endTime);
    if (s && e) return `${s}-${e}`;
    return "Custom";
  }

  if (safeTrim(startTime) && safeTrim(endTime)) {
    return `${safeTrim(startTime)}-${safeTrim(endTime)}`;
  }

  return "—";
}

function pickLatestTrip(trips: TripDoc[]) {
  if (!trips.length) return null;

  const scored = trips
    .map((t) => {
      const updated = safeTrim(t.updatedAt);
      const started = safeTrim(t.actualStartAt);
      const ts = updated || started || "";
      const ms = ts ? new Date(ts).getTime() : 0;
      return { t, ms };
    })
    .sort((a, b) => (b.ms || 0) - (a.ms || 0));

  return scored[0]?.t ?? null;
}

function pickLatestRejectedNotice(notices: RejectedTimesheetNotice[]) {
  if (!notices.length) return null;

  const sorted = [...notices].sort((a, b) => {
    const aMs =
      parseFlexibleDateMs(a.reviewedAt) ||
      parseFlexibleDateMs(a.updatedAt) ||
      parseFlexibleDateMs(a.weekStartDate) ||
      0;

    const bMs =
      parseFlexibleDateMs(b.reviewedAt) ||
      parseFlexibleDateMs(b.updatedAt) ||
      parseFlexibleDateMs(b.weekStartDate) ||
      0;

    return bMs - aMs;
  });

  return sorted[0] ?? null;
}

function getMobilePageLabel(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/dispatch")) return "Dispatcher Board";
  if (pathname.startsWith("/technician/my-day")) return "My Day";
  if (pathname.startsWith("/schedule")) return "Schedule";
  if (pathname.startsWith("/office-display")) return "Office Display";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/service-tickets/")) return "Service Ticket";
  if (pathname.startsWith("/service-tickets")) return "Service Tickets";
  if (pathname.startsWith("/time-entries")) return "Time Entries";
  if (pathname.startsWith("/weekly-timesheet")) return "Weekly Timesheet";
  if (pathname.startsWith("/pto-requests")) return "PTO Requests";
  if (pathname.startsWith("/timesheet-review")) return "Timesheet Review";
  if (pathname.startsWith("/admin")) return "Admin";
  return "DCFlow";
}

function formatDisplayDate(isoDate?: string | null) {
  const raw = safeTrim(isoDate);
  if (!raw) return "";

  const ms = parseFlexibleDateMs(raw);
  if (!Number.isFinite(ms)) return raw;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return raw;
  }
}

function buildRejectedFixHref(notice: RejectedTimesheetNotice | null) {
  const params = new URLSearchParams();
  params.set("showRejected", "1");

  const weekStart = safeTrim(notice?.weekStartDate);
  if (weekStart) {
    params.set("weekStart", weekStart);
  }

  return `/time-entries?${params.toString()}`;
}

function buildRejectedBannerKey(notice: RejectedTimesheetNotice | null) {
  if (!notice) return "";
  const stamp =
    safeTrim(notice.reviewedAt) ||
    safeTrim(notice.updatedAt) ||
    safeTrim(notice.weekStartDate) ||
    "rejected";
  return `${notice.id}:${stamp}`;
}

function useRealtimeActiveTrip(uid: string) {
  const [trip, setTrip] = useState<TripDoc | null>(null);

  useEffect(() => {
    const u = safeTrim(uid);
    if (!u) {
      setTrip(null);
      return;
    }

    const base = collection(db, "trips");

    const qs = [
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.primaryTechUid", "==", u),
        limit(10)
      ),
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.helperUid", "==", u),
        limit(10)
      ),
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.secondaryTechUid", "==", u),
        limit(10)
      ),
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.secondaryHelperUid", "==", u),
        limit(10)
      ),
    ];

    const map = new Map<string, TripDoc>();
    const idsByQuery = qs.map(() => new Set<string>());

    function upsertFromDoc(id: string, d: any) {
      map.set(id, {
        id,
        active: typeof d.active === "boolean" ? d.active : true,
        status: d.status ?? undefined,
        type: d.type ?? undefined,
        date: d.date ?? undefined,
        timeWindow: d.timeWindow ?? undefined,
        startTime: d.startTime ?? undefined,
        endTime: d.endTime ?? undefined,
        crew: d.crew ?? null,
        crewConfirmed: d.crewConfirmed ?? null,
        link: d.link ?? null,
        timerState: d.timerState ?? null,
        actualStartAt: d.actualStartAt ?? null,
        actualEndAt: d.actualEndAt ?? null,
        pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : null,
        updatedAt: d.updatedAt ?? null,
      });
    }

    function recompute() {
      const union = new Set<string>();
      for (const s of idsByQuery) {
        for (const id of s) union.add(id);
      }

      for (const id of Array.from(map.keys())) {
        if (!union.has(id)) map.delete(id);
      }

      const chosen = pickLatestTrip(Array.from(map.values()));
      setTrip(chosen);
    }

    const unsubs: Unsubscribe[] = [];

    qs.forEach((qRef, idx) => {
      const unsub = onSnapshot(
        qRef,
        (snap) => {
          const idsThisSnap = new Set<string>();
          snap.docs.forEach((ds) => {
            idsThisSnap.add(ds.id);
            upsertFromDoc(ds.id, ds.data() as any);
          });

          idsByQuery[idx] = idsThisSnap;
          recompute();
        },
        () => recompute()
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((fn) => fn());
      map.clear();
      setTrip(null);
    };
  }, [uid]);

  return trip;
}

async function buildActiveTripCard(trip: TripDoc): Promise<ActiveTripCard> {
  const serviceTicketId = safeTrim(trip.link?.serviceTicketId);
  const tripId = trip.id;

  let href = `/trips/${tripId}`;
  let primaryLine = "Active Trip";
  let secondaryLine = "Tap to return";

  if (serviceTicketId) {
    href = `/service-tickets/${serviceTicketId}`;
    try {
      const ticketSnap = await getDoc(doc(db, "serviceTickets", serviceTicketId));
      if (ticketSnap.exists()) {
        const td = ticketSnap.data() as any;
        const issue = safeTrim(td.issueSummary) || "Service Ticket";
        const cust = safeTrim(td.customerDisplayName) || "Customer";
        primaryLine = truncate(cust, 40);
        secondaryLine = truncate(issue, 52);
      } else {
        primaryLine = "Service Ticket";
        secondaryLine = "Tap to return";
      }
    } catch {
      primaryLine = "Service Ticket";
      secondaryLine = "Tap to return";
    }
  } else {
    const type = safeTrim(trip.type).toLowerCase();
    primaryLine = type === "project" ? "Project Trip" : "Active Trip";
    secondaryLine = "Tap to return";
  }

  const ts = safeTrim(trip.timerState).toLowerCase();
  const statusLabel = ts === "paused" ? "Paused" : "Running";

  return { tripId, href, statusLabel, primaryLine, secondaryLine };
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekMondayIsoForDate(d: Date) {
  const base = new Date(d);
  base.setHours(12, 0, 0, 0);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  return toIsoDate(monday);
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function isMondayLocalNow() {
  const d = new Date();
  return d.getDay() === 1;
}

function isActivePath(pathname: string, target: string) {
  if (!target) return false;
  if (target === "/") return pathname === "/";
  if (pathname === target) return true;
  return pathname.startsWith(target + "/");
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavEntry[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <List disablePadding sx={{ display: "grid", gap: 0.25 }}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <ListItemButton
            key={item.href}
            selected={active}
            onClick={() => {
              onNavigate?.();
              router.push(item.href);
            }}
            sx={{
              minHeight: 44,
              px: 1.25,
              py: 0.375,
              borderRadius: 1.25,
              "&.Mui-selected": {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
              },
              "&.Mui-selected:hover": {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.18),
              },
              "&:hover": {
                backgroundColor: (theme) =>
                  active
                    ? alpha(theme.palette.primary.main, 0.18)
                    : alpha(theme.palette.common.white, 0.04),
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 36,
                color: active ? "primary.light" : "text.secondary",
              }}
            >
              {item.icon}
            </ListItemIcon>

            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                variant: "body2",
                fontWeight: active ? 500 : 400,
                color: active ? "text.primary" : "text.secondary",
              }}
            />

            {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
              <Badge
                color="error"
                badgeContent={item.badgeCount > 99 ? "99+" : item.badgeCount}
                sx={{
                  "& .MuiBadge-badge": {
                    fontWeight: 700,
                    right: -2,
                  },
                }}
              />
            ) : null}
          </ListItemButton>
        );
      })}
    </List>
  );
}

function BannerCard({
  severity,
  title,
  body,
  action,
}: {
  severity: "warning" | "error";
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Alert
      severity={severity}
      variant="outlined"
      sx={{
        mb: 1.5,
        borderRadius: 1.5,
        alignItems: "flex-start",
        "& .MuiAlert-message": {
          width: "100%",
        },
      }}
      action={action}
    >
      <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="body2">{body}</Typography>
    </Alert>
  );
}

function MobileTopActionCard({
  title,
  body,
  action,
  onDismiss,
}: {
  title: string;
  body: React.ReactNode;
  action: React.ReactNode;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const accent = theme.palette.error.main;

  return (
    <Paper
      elevation={8}
      sx={{
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: theme.palette.background.paper,
        backgroundImage: "none",
        border: `1px solid ${alpha(accent, 0.24)}`,
        boxShadow: theme.shadows[8],
      }}
    >
      <Box sx={{ px: 1.5, pt: 1.25, pb: 1.5 }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2.5,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              backgroundColor: alpha(accent, 0.14),
              color: accent,
            }}
          >
            <ErrorOutlineRoundedIcon />
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="overline"
              sx={{
                display: "block",
                lineHeight: 1.1,
                letterSpacing: 0.5,
                color: alpha(accent, 0.95),
                fontWeight: 700,
                mb: 0.5,
              }}
            >
              Payroll needs attention
            </Typography>

            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 800,
                lineHeight: 1.15,
                mb: 0.5,
              }}
            >
              {title}
            </Typography>

            {body}
          </Box>

          <IconButton
            size="small"
            aria-label="Dismiss payroll alert"
            onClick={onDismiss}
            sx={{
              mt: -0.25,
              mr: -0.5,
              color: "text.secondary",
            }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Box sx={{ mt: 1.25, ml: "64px" }}>{action}</Box>

        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: 999,
            mx: "auto",
            mt: 1.4,
            backgroundColor: alpha(accent, 0.22),
          }}
        />
      </Box>
    </Paper>
  );
}

export default function AppShell({
  children,
  appUser,
}: {
  children: ReactNode;
  appUser: AppUser | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const role = appUser?.role;
  const myUid = safeTrim(appUser?.uid);
  const myDisplayName = safeTrim(
    (appUser as any)?.displayName || (appUser as any)?.name || "Employee"
  );

  const showDashboard =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "billing" ||
    role === "office_display";

  const showAdmin = role === "admin";

  const showMyDay =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showDispatch =
    role === "admin" || role === "dispatcher" || role === "manager";

  const showSchedule =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display" ||
    role === "technician";

  const showOfficeDisplay =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";

  const showProjects =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "technician";

  const showWorkload = false;

  const showTimeEntries =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showWeeklyTimesheet =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showTimesheetReview =
    role === "admin" || role === "manager" || role === "dispatcher";

  const showPTORequests =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showMobileBottomNav =
    role === "technician" || role === "helper" || role === "apprentice";

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTripSheetOpen, setActiveTripSheetOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const activeTrip = useRealtimeActiveTrip(myUid);
  const [activeTripCard, setActiveTripCard] = useState<ActiveTripCard | null>(null);
  const [projectMeta, setProjectMeta] = useState<ProjectCloseoutMeta | null>(null);
  const [projectFutureTrips, setProjectFutureTrips] = useState<FutureProjectTripInfo[]>([]);
  const [projectFutureTripsLoading, setProjectFutureTripsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!activeTrip) {
        setActiveTripCard(null);
        return;
      }
      const card = await buildActiveTripCard(activeTrip);
      if (!cancelled) setActiveTripCard(card);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, activeTrip?.timerState, activeTrip?.link?.serviceTicketId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectMeta() {
      const isProject = safeTrim(activeTrip?.type).toLowerCase() === "project";
      const projectId = safeTrim(activeTrip?.link?.projectId);
      const stageKey = safeTrim(activeTrip?.link?.projectStageKey) || null;

      if (!isProject || !projectId) {
        setProjectMeta(null);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "projects", projectId));
        if (cancelled) return;

        if (snap.exists()) {
          const data = snap.data() as any;
          setProjectMeta({
            projectId,
            projectName: safeTrim(data.projectName) || undefined,
            projectType: safeTrim(data.projectType) || null,
            stageKey,
          });
        } else {
          setProjectMeta({
            projectId,
            stageKey,
          });
        }
      } catch {
        if (!cancelled) {
          setProjectMeta({
            projectId,
            stageKey,
          });
        }
      }
    }

    loadProjectMeta();

    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, activeTrip?.type, activeTrip?.link?.projectId, activeTrip?.link?.projectStageKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadFutureProjectTrips() {
      const isProject = safeTrim(activeTrip?.type).toLowerCase() === "project";
      const projectId = safeTrim(activeTrip?.link?.projectId);

      if (!isProject || !projectId || !activeTrip) {
        setProjectFutureTrips([]);
        return;
      }

      setProjectFutureTripsLoading(true);

      try {
        const snap = await getDocs(
          query(
            collection(db, "trips"),
            where("link.projectId", "==", projectId),
            orderBy("date", "asc"),
            orderBy("startTime", "asc")
          )
        );

        if (cancelled) return;

        const trips: FutureProjectTripInfo[] = snap.docs
          .map((ds) => {
            const d = ds.data() as any;
            return {
              id: ds.id,
              date: safeTrim(d.date),
              timeWindow: d.timeWindow ?? "",
              startTime: d.startTime ?? "",
              endTime: d.endTime ?? "",
              stageKey: safeTrim(d.link?.projectStageKey) || null,
            };
          })
          .filter((trip) => trip.id !== activeTrip.id)
          .filter((trip) => {
            const currentComparable = {
              id: activeTrip.id,
              date: activeTrip.date ?? "",
              startTime: activeTrip.startTime ?? "",
            };
            const candidateComparable = {
              id: trip.id,
              date: trip.date,
              startTime: trip.startTime ?? "",
            };
            return compareTripSequence(candidateComparable, currentComparable) > 0;
          });

        const statusMap = new Map<string, string>();
        snap.docs.forEach((ds) => {
          const d = ds.data() as any;
          statusMap.set(ds.id, normalizeTripStatus(d.status));
        });

        const activeMap = new Map<string, boolean>();
        snap.docs.forEach((ds) => {
          const d = ds.data() as any;
          activeMap.set(ds.id, d.active !== false);
        });

        setProjectFutureTrips(
          trips.filter((trip) => {
            const status = statusMap.get(trip.id) || "planned";
            const active = activeMap.get(trip.id) !== false;
            return active && status !== "cancelled";
          })
        );
      } catch {
        if (!cancelled) setProjectFutureTrips([]);
      } finally {
        if (!cancelled) setProjectFutureTripsLoading(false);
      }
    }

    loadFutureProjectTrips();

    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, activeTrip?.type, activeTrip?.date, activeTrip?.startTime, activeTrip?.link?.projectId]);

  useEffect(() => {
    if (!activeTripCard) setActiveTripSheetOpen(false);
  }, [activeTripCard]);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!activeTrip) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [activeTrip?.id]);

  const liveMinutes = useMemo(() => {
    if (!activeTrip) return 0;
    const startMs = parseIsoMs(activeTrip.actualStartAt || null);
    if (!Number.isFinite(startMs)) return 0;
    const pausedMins = sumPausedMinutes(activeTrip.pauseBlocks || null, nowMs);
    const grossMins = minutesBetweenMs(startMs, nowMs);
    return Math.max(0, grossMins - pausedMins);
  }, [activeTrip, nowMs]);

  const timerState = useMemo(
    () => safeTrim(activeTrip?.timerState).toLowerCase(),
    [activeTrip?.timerState]
  );

  const isPaused = timerState === "paused";
  const hasServiceTicketTarget = Boolean(safeTrim(activeTrip?.link?.serviceTicketId));
  const isProjectActiveTrip = safeTrim(activeTrip?.type).toLowerCase() === "project";
  const isTmProject = isTimeMaterialsProject(projectMeta?.projectType);
  const supportsStageCloseout =
    isProjectActiveTrip &&
    !isTmProject &&
    Boolean(safeTrim(projectMeta?.stageKey || activeTrip?.link?.projectStageKey));

  const nextFutureProjectTrip = useMemo(
    () => projectFutureTrips[0] || null,
    [projectFutureTrips]
  );

  const nextFutureProjectTripSummary = useMemo(() => {
    if (!nextFutureProjectTrip) return "";
    const bits = [
      formatDisplayDate(nextFutureProjectTrip.date),
      formatTripWindowLabel(
        nextFutureProjectTrip.timeWindow,
        nextFutureProjectTrip.startTime,
        nextFutureProjectTrip.endTime
      ),
    ];
    if (safeTrim(nextFutureProjectTrip.stageKey)) {
      bits.push(stageLabel(nextFutureProjectTrip.stageKey));
    }
    return bits.filter(Boolean).join(" • ");
  }, [nextFutureProjectTrip]);

  const canQuickAct = useMemo(() => {
    if (!activeTrip) return false;
    const c = activeTrip.crewConfirmed || activeTrip.crew || null;
    const onCrew = userIsOnCrew(myUid, c);
    const elevated =
      role === "admin" || role === "manager" || role === "dispatcher";
    return Boolean(myUid) && (onCrew || elevated);
  }, [activeTrip, myUid, role]);

  const canProjectCloseout = useMemo(() => {
    if (!activeTrip || !isProjectActiveTrip || !myUid) return false;
    const c = activeTrip.crewConfirmed || activeTrip.crew || null;
    return userIsOnCrew(myUid, c);
  }, [activeTrip, isProjectActiveTrip, myUid]);

  const [pillActionBusy, setPillActionBusy] = useState(false);
  const [projectCloseoutOpen, setProjectCloseoutOpen] = useState(false);
  const [projectTodayResult, setProjectTodayResult] =
    useState<ProjectCloseoutTodayResult>("done_today");
  const [projectMoreWorkNeeded, setProjectMoreWorkNeeded] =
    useState<"no" | "yes">("no");
  const [projectHoursWorked, setProjectHoursWorked] = useState("8");
  const [projectCloseoutNotes, setProjectCloseoutNotes] = useState("");
  const [projectMaterialsSummary, setProjectMaterialsSummary] = useState("");
  const [projectRequestedReturnDate, setProjectRequestedReturnDate] = useState("");
  const [projectCloseoutSaving, setProjectCloseoutSaving] = useState(false);
  const [projectCloseoutError, setProjectCloseoutError] = useState("");
  const [projectDockNotice, setProjectDockNotice] = useState("");

  async function handleQuickPause() {
    if (!activeTrip || !canQuickAct || pillActionBusy) return;
    setPillActionBusy(true);
    try {
      const tripRef = doc(db, "trips", activeTrip.id);
      const stamp = nowIso();
      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks)
        ? [...activeTrip.pauseBlocks]
        : [];
      const openIdx = findOpenPauseIndex(curBlocks);
      if (openIdx !== -1) return;
      curBlocks.push({ startAt: stamp, endAt: null });

      await updateDoc(tripRef, {
        timerState: "paused",
        pauseBlocks: curBlocks,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      } as any);
    } finally {
      setPillActionBusy(false);
    }
  }

  async function handleQuickResume() {
    if (!activeTrip || !canQuickAct || pillActionBusy) return;
    setPillActionBusy(true);
    try {
      const tripRef = doc(db, "trips", activeTrip.id);
      const stamp = nowIso();
      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks)
        ? [...activeTrip.pauseBlocks]
        : [];
      const openIdx = findOpenPauseIndex(curBlocks);
      if (openIdx === -1) return;
      curBlocks[openIdx] = { ...curBlocks[openIdx], endAt: stamp };

      await updateDoc(tripRef, {
        timerState: "running",
        pauseBlocks: curBlocks,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      } as any);
    } finally {
      setPillActionBusy(false);
    }
  }

  function openProjectCloseoutDialog() {
    if (!activeTrip || !isProjectActiveTrip || !canProjectCloseout) return;

    const suggestedHours = suggestedProjectHoursForCloseout({
      liveMinutes,
      timeWindow: activeTrip.timeWindow,
      startTime: activeTrip.startTime,
      endTime: activeTrip.endTime,
    });

    setProjectTodayResult("done_today");
    setProjectMoreWorkNeeded("no");
    setProjectHoursWorked(String(suggestedHours));
    setProjectCloseoutNotes("");
    setProjectMaterialsSummary("");
    setProjectRequestedReturnDate("");
    setProjectCloseoutError("");
    setProjectDockNotice("");
    setActiveTripSheetOpen(false);
    setProjectCloseoutOpen(true);
  }

  async function handleSubmitProjectCloseoutFromDock() {
    if (!activeTrip || !isProjectActiveTrip || !canProjectCloseout) return;

    const projectId = safeTrim(activeTrip.link?.projectId);
    if (!projectId) {
      setProjectCloseoutError("This project trip is missing a linked project.");
      return;
    }

    const hoursNumber = Number(projectHoursWorked);
    if (!Number.isFinite(hoursNumber) || hoursNumber <= 0) {
      setProjectCloseoutError("Hours worked today must be a number greater than 0.");
      return;
    }

    const projectIdStageKey = safeTrim(
      projectMeta?.stageKey || activeTrip.link?.projectStageKey
    );
    const closeoutNotes = safeTrim(projectCloseoutNotes);
    const materialsSummary = safeTrim(projectMaterialsSummary);
    const requestedReturnDate = safeTrim(projectRequestedReturnDate);

    if (
      projectTodayResult === "done_today" &&
      projectMoreWorkNeeded === "yes" &&
      !nextFutureProjectTrip &&
      !requestedReturnDate
    ) {
      setProjectCloseoutError("Please enter a requested return date.");
      return;
    }

    setProjectCloseoutSaving(true);
    setProjectCloseoutError("");

    try {
      const stamp = nowIso();
      const tripRef = doc(db, "trips", activeTrip.id);
      const projectRef = doc(db, "projects", projectId);

      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(
        safeTrim(activeTrip.date) || todayKeyLocal()
      );
      const timesheetId = buildWeeklyTimesheetId(myUid, weekStartDate);
      const timeEntryId = `trip_${activeTrip.id}_${myUid}`;
      const timesheetRef = doc(db, "weeklyTimesheets", timesheetId);
      const timeEntryRef = doc(db, "timeEntries", timeEntryId);

      const pauseBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks)
        ? [...activeTrip.pauseBlocks]
        : [];

      const openPauseIdx = findOpenPauseIndex(pauseBlocks);
      if (openPauseIdx !== -1) {
        pauseBlocks[openPauseIdx] = {
          ...pauseBlocks[openPauseIdx],
          endAt: stamp,
        };
      }

      const relatedTripsSnap = await getDocs(
        query(
          collection(db, "trips"),
          where("link.projectId", "==", projectId),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        )
      );

      const relatedTrips: TripDoc[] = relatedTripsSnap.docs.map((ds) => {
        const d = ds.data() as any;
        return {
          id: ds.id,
          active: d.active ?? true,
          status: d.status ?? "planned",
          type: d.type ?? "project",
          date: d.date ?? "",
          startTime: d.startTime ?? "",
          endTime: d.endTime ?? "",
          timeWindow: d.timeWindow ?? "all_day",
          crew: d.crew ?? null,
          link: d.link ?? null,
          timerState: d.timerState ?? null,
          actualStartAt: d.actualStartAt ?? null,
          actualEndAt: d.actualEndAt ?? null,
          pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : null,
        };
      });

      const currentTrip =
        relatedTrips.find((candidate) => candidate.id === activeTrip.id) || activeTrip;

      const futureTrips = relatedTrips.filter((candidate) => {
        if (candidate.id === currentTrip.id) return false;
        if (candidate.active === false) return false;

        const status = normalizeTripStatus(candidate.status);
        if (status === "cancelled") return false;

        const isFuture = compareTripSequence(candidate, currentTrip) > 0;
        if (!isFuture) return false;

        if (projectTodayResult === "stage_complete") {
          return safeTrim(candidate.link?.projectStageKey) === projectIdStageKey;
        }

        if (projectTodayResult === "project_complete") {
          return true;
        }

        return false;
      });

      let cancelledFutureTripCount = 0;

      const batch = writeBatch(db);

      const tripUpdates: Record<string, unknown> = {
        status: "complete",
        timerState: "complete",
        actualStartAt: activeTrip.actualStartAt || stamp,
        actualEndAt: stamp,
        pauseBlocks,
        completedAt: stamp,
        completedByUid: myUid || null,
        closeoutDecision: projectTodayResult,
        closeoutNotes: closeoutNotes || null,
        closeoutAt: stamp,
        closeoutByUid: myUid || null,
        closeoutHours: hoursNumber,
        materialsSummary: materialsSummary || null,
        materialsLoggedAt: materialsSummary ? stamp : null,
        materialsLoggedByUid: materialsSummary ? myUid || null : null,
        needsMoreTime:
          projectTodayResult === "done_today" && projectMoreWorkNeeded === "yes",
        requestedReturnDate:
          projectTodayResult === "done_today" &&
          projectMoreWorkNeeded === "yes" &&
          !nextFutureProjectTrip
            ? requestedReturnDate || null
            : null,
        nextScheduledTripId:
          projectTodayResult === "done_today" &&
          projectMoreWorkNeeded === "yes" &&
          nextFutureProjectTrip
            ? nextFutureProjectTrip.id
            : null,
        nextScheduledTripDate:
          projectTodayResult === "done_today" &&
          projectMoreWorkNeeded === "yes" &&
          nextFutureProjectTrip
            ? nextFutureProjectTrip.date
            : null,
        completedEarly: false,
        cancelledFutureTripCount: 0,
        updatedAt: stamp,
        updatedByUid: myUid || null,
        [`confirmedBy.${myUid}`]: {
          hours: hoursNumber,
          note: closeoutNotes || null,
          confirmedAt: stamp,
        },
      };

      const projectUpdates: Record<string, unknown> = {
        updatedAt: stamp,
      };

      if (projectTodayResult === "done_today") {
        if (projectIdStageKey && !isTmProject) {
          projectUpdates[`${projectIdStageKey}.status`] = "in_progress";
        }

        const needsMoreWork = projectMoreWorkNeeded === "yes";
        const hasFutureTrip = Boolean(nextFutureProjectTrip);

        projectUpdates.additionalTripRequested = needsMoreWork && !hasFutureTrip;
        projectUpdates.additionalTripRequestedAt =
          needsMoreWork && !hasFutureTrip ? stamp : null;
        projectUpdates.additionalTripRequestedByUid =
          needsMoreWork && !hasFutureTrip ? myUid || null : null;
        projectUpdates.additionalTripRequestedForStage =
          needsMoreWork && !hasFutureTrip ? projectIdStageKey || null : null;
        projectUpdates.additionalTripRequestedNote =
          needsMoreWork && !hasFutureTrip ? closeoutNotes || null : null;
        projectUpdates.additionalTripRequestedReturnDate =
          needsMoreWork && !hasFutureTrip ? requestedReturnDate || null : null;
      }

      if (projectTodayResult === "stage_complete") {
        projectUpdates[`${projectIdStageKey}.status`] = "complete";
        projectUpdates[`${projectIdStageKey}.completedDate`] =
          activeTrip.date || todayKeyLocal();

        projectUpdates.additionalTripRequested = false;
        projectUpdates.additionalTripRequestedAt = null;
        projectUpdates.additionalTripRequestedByUid = null;
        projectUpdates.additionalTripRequestedForStage = null;
        projectUpdates.additionalTripRequestedNote = null;
        projectUpdates.additionalTripRequestedReturnDate = null;

        for (const futureTrip of futureTrips) {
          batch.update(doc(db, "trips", futureTrip.id), {
            status: "cancelled",
            active: false,
            cancelReason: `Stage completed early from trip ${activeTrip.id}`,
            updatedAt: stamp,
            updatedByUid: myUid || null,
          });
          cancelledFutureTripCount += 1;
        }
      }

      if (projectTodayResult === "project_complete") {
        if (projectIdStageKey && !isTmProject) {
          projectUpdates[`${projectIdStageKey}.status`] = "complete";
          projectUpdates[`${projectIdStageKey}.completedDate`] =
            activeTrip.date || todayKeyLocal();
        }

        projectUpdates.active = false;
        projectUpdates.completedAt = stamp;
        projectUpdates.completedByUid = myUid || null;
        projectUpdates.completionNotes = closeoutNotes || null;

        projectUpdates.additionalTripRequested = false;
        projectUpdates.additionalTripRequestedAt = null;
        projectUpdates.additionalTripRequestedByUid = null;
        projectUpdates.additionalTripRequestedForStage = null;
        projectUpdates.additionalTripRequestedNote = null;
        projectUpdates.additionalTripRequestedReturnDate = null;

        for (const futureTrip of futureTrips) {
          batch.update(doc(db, "trips", futureTrip.id), {
            status: "cancelled",
            active: false,
            cancelReason: `Project completed early from trip ${activeTrip.id}`,
            updatedAt: stamp,
            updatedByUid: myUid || null,
          });
          cancelledFutureTripCount += 1;
        }
      }

      tripUpdates.completedEarly = cancelledFutureTripCount > 0;
      tripUpdates.cancelledFutureTripCount = cancelledFutureTripCount;

      batch.set(
        timesheetRef,
        {
          employeeId: myUid,
          employeeName: myDisplayName || "Employee",
          employeeRole: role || "technician",
          weekStartDate,
          weekEndDate,
          status: "draft",
          submittedAt: null,
          submittedByUid: null,
          createdAt: stamp,
          createdByUid: myUid,
          updatedAt: stamp,
          updatedByUid: myUid,
        },
        { merge: true }
      );

      batch.set(
        timeEntryRef,
        {
          employeeId: myUid,
          employeeName: myDisplayName || "Employee",
          employeeRole: role || "technician",
          entryDate: safeTrim(activeTrip.date) || todayKeyLocal(),
          weekStartDate,
          weekEndDate,
          timesheetId,
          category: "project",
          payType: "regular",
          billable: true,
          source: "project_trip_closeout",
          hours: hoursNumber,
          hoursSource: hoursNumber,
          hoursLocked: true,
          tripId: activeTrip.id,
          projectId,
          projectStageKey: projectIdStageKey || null,
          entryStatus: "draft",
          notes: closeoutNotes || null,
          createdAt: stamp,
          createdByUid: myUid,
          updatedAt: stamp,
          updatedByUid: myUid,
        },
        { merge: true }
      );

      batch.update(tripRef, tripUpdates);
      batch.update(projectRef, projectUpdates);

      await batch.commit();

      setProjectCloseoutOpen(false);

      if (projectTodayResult === "done_today") {
        if (projectMoreWorkNeeded === "yes" && nextFutureProjectTrip) {
          setProjectDockNotice(
            `Saved. ${hoursNumber.toFixed(2)}h logged. Next scheduled trip: ${nextFutureProjectTripSummary}.`
          );
        } else if (projectMoreWorkNeeded === "yes" && !nextFutureProjectTrip) {
          setProjectDockNotice(
            `Saved. ${hoursNumber.toFixed(2)}h logged. Return requested for ${formatDisplayDate(requestedReturnDate)}.`
          );
        } else {
          setProjectDockNotice(`Saved. ${hoursNumber.toFixed(2)}h logged.`);
        }
      } else if (projectTodayResult === "stage_complete") {
        setProjectDockNotice(
          `Saved. ${hoursNumber.toFixed(2)}h logged. Stage marked complete.${cancelledFutureTripCount > 0 ? ` ${cancelledFutureTripCount} future trip(s) cancelled.` : ""}`
        );
      } else {
        setProjectDockNotice(
          `Saved. ${hoursNumber.toFixed(2)}h logged. ${isTmProject ? "Work" : "Project"} marked complete.${cancelledFutureTripCount > 0 ? ` ${cancelledFutureTripCount} future trip(s) cancelled.` : ""}`
        );
      }
    } catch (err: unknown) {
      setProjectCloseoutError(
        err instanceof Error ? err.message : "Failed to save project closeout."
      );
    } finally {
      setProjectCloseoutSaving(false);
    }
  }

  function navigateToActiveTrip(action?: "note" | "follow_up" | "resolved") {
    if (!activeTripCard) return;

    if (!hasServiceTicketTarget || !action) {
      router.push(activeTripCard.href);
      setActiveTripSheetOpen(false);
      return;
    }

    const url = new URL(activeTripCard.href, window.location.origin);

    if (action === "note") {
      url.hash = `trip-work-notes-${activeTripCard.tripId}`;
    } else {
      url.searchParams.set("tripAction", action);
      url.searchParams.set("tripId", activeTripCard.tripId);
    }

    router.push(`${url.pathname}${url.search}${url.hash}`);
    setActiveTripSheetOpen(false);
  }

  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    if (!showTimesheetReview) {
      setPendingReviewCount(0);
      return;
    }
    const qRef = query(
      collection(db, "weeklyTimesheets"),
      where("status", "==", "submitted"),
      limit(200)
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => setPendingReviewCount(snap.size || 0),
      () => {}
    );
    return () => unsub();
  }, [showTimesheetReview]);

  const [pendingPtoCount, setPendingPtoCount] = useState(0);

  useEffect(() => {
    if (!showPTORequests) {
      setPendingPtoCount(0);
      return;
    }

    const canReviewPto =
      role === "admin" || role === "manager" || role === "dispatcher";

    if (!canReviewPto) {
      setPendingPtoCount(0);
      return;
    }

    const qRef = query(
      collection(db, "ptoRequests"),
      where("status", "==", "pending"),
      limit(50)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => setPendingPtoCount(snap.size || 0),
      () => setPendingPtoCount(0)
    );

    return () => unsub();
  }, [showPTORequests, role]);

  const [myRejectedCount, setMyRejectedCount] = useState(0);
  const [latestRejectedNotice, setLatestRejectedNotice] =
    useState<RejectedTimesheetNotice | null>(null);
  const [dismissedRejectedBannerKey, setDismissedRejectedBannerKey] =
    useState<string>("");

  useEffect(() => {
    const uid = safeTrim(myUid);
    if (!uid) {
      setMyRejectedCount(0);
      setLatestRejectedNotice(null);
      return;
    }

    const canReceive =
      role === "technician" ||
      role === "helper" ||
      role === "apprentice" ||
      role === "dispatcher" ||
      role === "manager" ||
      role === "admin";

    if (!canReceive) {
      setMyRejectedCount(0);
      setLatestRejectedNotice(null);
      return;
    }

    const qRef = query(
      collection(db, "weeklyTimesheets"),
      where("employeeId", "==", uid),
      where("status", "==", "rejected"),
      limit(20)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const notices: RejectedTimesheetNotice[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            weekStartDate:
              safeTrim(data.weekStartDate) || safeTrim(data.weekStart) || "",
            updatedAt: data.updatedAt ?? null,
            reviewedAt: data.reviewedAt ?? data.rejectedAt ?? null,
            rejectionReason:
              safeTrim(data.rejectionReason) ||
              safeTrim(data.reviewNotes) ||
              safeTrim(data.reviewerNotes) ||
              null,
          };
        });

        setMyRejectedCount(notices.length);
        setLatestRejectedNotice(pickLatestRejectedNotice(notices));
      },
      () => {
        setMyRejectedCount(0);
        setLatestRejectedNotice(null);
      }
    );

    return () => unsub();
  }, [myUid, role]);

  const rejectedBannerKey = useMemo(
    () => buildRejectedBannerKey(latestRejectedNotice),
    [latestRejectedNotice]
  );

  useEffect(() => {
    if (!rejectedBannerKey) {
      setDismissedRejectedBannerKey("");
      return;
    }

    try {
      if (typeof window !== "undefined") {
        const saved = window.sessionStorage.getItem(REJECTED_BANNER_DISMISS_KEY) || "";
        setDismissedRejectedBannerKey(saved);
      }
    } catch {
      setDismissedRejectedBannerKey("");
    }
  }, [rejectedBannerKey]);

  function dismissRejectedBanner() {
    if (!rejectedBannerKey) return;
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          REJECTED_BANNER_DISMISS_KEY,
          rejectedBannerKey
        );
      }
    } catch {}
    setDismissedRejectedBannerKey(rejectedBannerKey);
  }

  const showRejectedBanner =
    myRejectedCount > 0 &&
    showWeeklyTimesheet &&
    Boolean(latestRejectedNotice) &&
    dismissedRejectedBannerKey !== rejectedBannerKey;

  const rejectedFixHref = useMemo(
    () => buildRejectedFixHref(latestRejectedNotice),
    [latestRejectedNotice]
  );

  const latestRejectedWeekLabel = useMemo(
    () => formatDisplayDate(latestRejectedNotice?.weekStartDate || ""),
    [latestRejectedNotice?.weekStartDate]
  );

  const [showMondayReminder, setShowMondayReminder] = useState(false);
  const [prevWeekStart, setPrevWeekStart] = useState<string>("");
  const [prevWeekStatus, setPrevWeekStatus] = useState<string>("");

  useEffect(() => {
    const uid = safeTrim(myUid);

    if (!uid) {
      setShowMondayReminder(false);
      return;
    }

    const canReceive =
      role === "technician" ||
      role === "helper" ||
      role === "apprentice" ||
      role === "dispatcher" ||
      role === "manager" ||
      role === "admin";

    if (!canReceive) {
      setShowMondayReminder(false);
      return;
    }

    if (!isMondayLocalNow()) {
      setShowMondayReminder(false);
      return;
    }

    const dismissKey = `dcflow_missingTimesheetDismissed_${todayKeyLocal()}`;
    try {
      if (
        typeof window !== "undefined" &&
        window.localStorage.getItem(dismissKey) === "1"
      ) {
        setShowMondayReminder(false);
        return;
      }
    } catch {}

    const now = new Date();
    const thisMonIso = getWeekMondayIsoForDate(now);
    const thisMon = new Date(`${thisMonIso}T12:00:00`);
    const prevMon = new Date(thisMon);
    prevMon.setDate(thisMon.getDate() - 7);
    const prevMonIso = toIsoDate(prevMon);

    setPrevWeekStart(prevMonIso);

    const tsId = buildWeeklyTimesheetId(uid, prevMonIso);
    const tsRef = doc(db, "weeklyTimesheets", tsId);

    const unsub = onSnapshot(
      tsRef,
      (snap) => {
        if (!snap.exists()) {
          setPrevWeekStatus("missing");
          setShowMondayReminder(true);
          return;
        }

        const d: any = snap.data();
        const status = safeTrim(d.status).toLowerCase() || "draft";
        setPrevWeekStatus(status);

        const ok =
          status === "submitted" ||
          status === "approved" ||
          status === "exported_to_quickbooks" ||
          status === "exported";

        setShowMondayReminder(!ok);
      },
      () => setShowMondayReminder(false)
    );

    return () => unsub();
  }, [myUid, role]);

  function dismissMondayReminderForToday() {
    const dismissKey = `dcflow_missingTimesheetDismissed_${todayKeyLocal()}`;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(dismissKey, "1");
      }
    } catch {}
    setShowMondayReminder(false);
  }

  const [followUpTicketIds, setFollowUpTicketIds] = useState<string[]>([]);
  const [readyToBillTicketIds, setReadyToBillTicketIds] = useState<string[]>([]);
  const [newUntouchedServiceTicketCount, setNewUntouchedServiceTicketCount] = useState(0);

  useEffect(() => {
    if (!showDashboard) {
      setFollowUpTicketIds([]);
      setReadyToBillTicketIds([]);
      return;
    }

    const followUpQuery = query(
      collection(db, "serviceTickets"),
      where("status", "==", "follow_up"),
      limit(100)
    );

    const readyToBillQuery = query(
      collection(db, "serviceTickets"),
      where("billing.status", "==", "ready_to_bill"),
      limit(100)
    );

    const unsubFollowUp = onSnapshot(
      followUpQuery,
      (snap) => {
        setFollowUpTicketIds(snap.docs.map((d) => d.id));
      },
      () => setFollowUpTicketIds([])
    );

    const unsubReady = onSnapshot(
      readyToBillQuery,
      (snap) => {
        setReadyToBillTicketIds(snap.docs.map((d) => d.id));
      },
      () => setReadyToBillTicketIds([])
    );

    return () => {
      unsubFollowUp();
      unsubReady();
    };
  }, [showDashboard]);

  useEffect(() => {
    const ticketsQuery = query(
      collection(db, "serviceTickets"),
      where("status", "==", "new"),
      limit(200)
    );

    const unsub = onSnapshot(
      ticketsQuery,
      (snap) => {
        const count = snap.docs.reduce((total, docSnap) => {
          const data = docSnap.data() as any;
          const hasAssignedTech = Boolean(
            safeTrim(data.assignedTechnicianId) || safeTrim(data.assignedTechnicianName)
          );
          return hasAssignedTech ? total : total + 1;
        }, 0);

        setNewUntouchedServiceTicketCount(count);
      },
      () => setNewUntouchedServiceTicketCount(0)
    );

    return () => unsub();
  }, []);

  const dashboardAttentionCount = useMemo(() => {
    return new Set([...followUpTicketIds, ...readyToBillTicketIds]).size;
  }, [followUpTicketIds, readyToBillTicketIds]);

  const topNav: NavEntry[] = [
    ...(showDashboard
      ? [
          {
            href: "/dashboard",
            label: "Dashboard",
            icon: <DashboardRoundedIcon />,
            badgeCount: dashboardAttentionCount,
          },
        ]
      : []),
    ...(showDispatch
      ? [{ href: "/dispatch", label: "Dispatcher Board", icon: <MapRoundedIcon /> }]
      : []),
    ...(showMyDay
      ? [{ href: "/technician/my-day", label: "My Day", icon: <TodayRoundedIcon /> }]
      : []),
    ...(showSchedule
      ? [{ href: "/schedule", label: "Schedule", icon: <CalendarMonthRoundedIcon /> }]
      : []),
    ...(showOfficeDisplay
      ? [{ href: "/office-display", label: "Office Display", icon: <TvRoundedIcon /> }]
      : []),
    ...(showProjects
      ? [{ href: "/projects", label: "Projects", icon: <FolderRoundedIcon /> }]
      : []),
    ...(showWorkload
      ? [
          {
            href: "/technician-workload",
            label: "Technician Workload",
            icon: <AssignmentRoundedIcon />,
          },
        ]
      : []),
    { href: "/customers", label: "Customers", icon: <PeopleAltRoundedIcon /> },
    {
      href: "/service-tickets",
      label: "Service Tickets",
      icon: <ReceiptLongRoundedIcon />,
      badgeCount: newUntouchedServiceTicketCount,
    },
    ...(showTimeEntries
      ? [
          {
            href: "/time-entries",
            label: "Time Entries",
            icon: <AccessTimeFilledRoundedIcon />,
          },
        ]
      : []),
    ...(showWeeklyTimesheet
      ? [
          {
            href: "/weekly-timesheet",
            label: "Weekly Timesheet",
            icon: <ViewWeekRoundedIcon />,
          },
        ]
      : []),
    ...(showPTORequests
      ? [
          {
            href: "/pto-requests",
            label: "PTO Requests",
            icon: <BeachAccessRoundedIcon />,
            badgeCount: pendingPtoCount,
          },
        ]
      : []),
    ...(showTimesheetReview
      ? [
          {
            href: "/timesheet-review",
            label: "Timesheet Review",
            icon: <TaskAltRoundedIcon />,
            badgeCount: pendingReviewCount,
          },
        ]
      : []),
  ];

  const bottomNav: NavEntry[] = [
    ...(showAdmin
      ? [{ href: "/admin", label: "Admin", icon: <AdminPanelSettingsRoundedIcon /> }]
      : []),
  ];

  const mobilePrimaryNav = useMemo<NavEntry[]>(() => {
    const items: NavEntry[] = [];

    if (showMyDay) {
      items.push({
        href: "/technician/my-day",
        label: "My Day",
        icon: <EventNoteRoundedIcon />,
      });
    }

    if (showSchedule) {
      items.push({
        href: "/schedule",
        label: "Schedule",
        icon: <CalendarMonthRoundedIcon />,
      });
    }

    items.push({
      href: "/service-tickets",
      label: "Tickets",
      icon: <ReceiptLongRoundedIcon />,
      badgeCount: newUntouchedServiceTicketCount,
    });

    return items.slice(0, 3);
  }, [showMyDay, showSchedule, newUntouchedServiceTicketCount]);

  const mobileMoreItems = useMemo(() => {
    if (!showMobileBottomNav) {
      return [...topNav, ...bottomNav];
    }

    return [
      ...topNav.filter(
        (item) => !mobilePrimaryNav.some((primary) => primary.href === item.href)
      ),
      ...bottomNav,
    ];
  }, [showMobileBottomNav, topNav, bottomNav, mobilePrimaryNav]);

  const mobileMoreBadgeCount = useMemo(() => {
    return mobileMoreItems.reduce((sum, item) => sum + (item.badgeCount || 0), 0);
  }, [mobileMoreItems]);

  const suppressGlobalActiveTripSurface = false;

  const mobileBottomNavValue = useMemo(() => {
    const activeItem = mobilePrimaryNav.find((item) =>
      isActivePath(pathname, item.href)
    );
    return activeItem?.href ?? "more";
  }, [pathname, mobilePrimaryNav]);

  const mobileBottomPadding =
    (showMobileBottomNav ? MOBILE_BOTTOM_NAV_HEIGHT : 0) +
    (activeTripCard && isMobile && !suppressGlobalActiveTripSurface
      ? MOBILE_ACTIVE_TRIP_HEIGHT
      : 0) +
    18;

  const mondayReminderBanner =
    showMondayReminder && showWeeklyTimesheet ? (
      <BannerCard
        severity="warning"
        title="Last week’s timesheet isn’t submitted yet"
        body={
          <>
            Week starting <strong>{prevWeekStart || "—"}</strong>
            {prevWeekStatus ? <> • Status: {prevWeekStatus}</> : null}
          </>
        }
        action={
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={() => router.push("/weekly-timesheet?weekOffset=-1")}
            >
              Review last week
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={dismissMondayReminderForToday}
            >
              Dismiss today
            </Button>
          </Stack>
        }
      />
    ) : null;

  const rejectedBanner =
    showRejectedBanner && showWeeklyTimesheet ? (
      <BannerCard
        severity="error"
        title="Your timesheet was rejected and needs changes"
        body={
          <>
            {myRejectedCount} rejected timesheet{myRejectedCount === 1 ? "" : "s"} found
            {latestRejectedWeekLabel ? (
              <>
                {" "}
                • Latest week: <strong>{latestRejectedWeekLabel}</strong>
              </>
            ) : null}
          </>
        }
        action={
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => router.push(rejectedFixHref)}
          >
            Fix now
          </Button>
        }
      />
    ) : null;

  const drawerContent = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.paper",
      }}
    >
      <Box sx={{ p: 1.25 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 1.5,
            px: 1.25,
            py: 1.25,
            backgroundColor: alpha("#FFFFFF", 0.02),
            border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          }}
        >
          <Box sx={{ position: "relative", width: "100%", height: 52 }}>
            <Image
              src="/brand/dcflow-logo.png"
              alt="DCFlow"
              fill
              sizes="280px"
              style={{ objectFit: "contain" }}
              priority
            />
          </Box>

          <Typography
            variant="caption"
            sx={{ mt: 1, display: "block", color: "text.secondary" }}
          >
            {appUser?.displayName || "Unknown User"} • {appUser?.role || "No Role"}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ px: 1, pb: 1 }}>
        <NavList
          items={topNav}
          pathname={pathname}
          onNavigate={isMobile ? () => setDrawerOpen(false) : undefined}
        />
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ px: 1, pb: 1.25 }}>
        <Divider sx={{ mb: 1 }} />

        {bottomNav.length > 0 ? (
          <NavList
            items={bottomNav}
            pathname={pathname}
            onNavigate={isMobile ? () => setDrawerOpen(false) : undefined}
          />
        ) : null}

        <Box
          sx={{
            mt: bottomNav.length > 0 ? 0.75 : 0,
            "& button": {
              width: "100%",
              justifyContent: "flex-start",
              minHeight: 44,
              borderRadius: 1.25,
            },
          }}
        >
          <LogoutButton />
        </Box>
      </Box>
    </Box>
  );

  const tripAccentMain = isPaused
    ? theme.palette.warning.main
    : theme.palette.primary.main;
  const tripAccentSoft = alpha(tripAccentMain, 0.12);
  const tripAccentBorder = alpha(tripAccentMain, 0.24);

  const projectCollapsedTripDock =
    isMobile &&
    activeTripCard &&
    isProjectActiveTrip &&
    !activeTripSheetOpen &&
    !suppressGlobalActiveTripSurface ? (
      <Paper
        elevation={6}
        onClick={() => setActiveTripSheetOpen(true)}
        sx={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: showMobileBottomNav ? MOBILE_BOTTOM_NAV_HEIGHT + 16 : 16,
          zIndex: 1201,
          borderRadius: 3,
          border: `1px solid ${tripAccentBorder}`,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: "none",
          boxShadow: theme.shadows[8],
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <Box sx={{ px: 2, pt: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 1,
              backgroundColor: tripAccentSoft,
            }}
          />
        </Box>

        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 999,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              backgroundColor: tripAccentSoft,
              color: tripAccentMain,
            }}
          >
            {isPaused ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: tripAccentMain }}>
                {isPaused ? "Paused" : "Running"}
              </Typography>

              <Chip
                size="small"
                label={`${liveMinutes} min`}
                variant="outlined"
                sx={{
                  color: tripAccentMain,
                  backgroundColor: tripAccentSoft,
                  borderColor: tripAccentBorder,
                  fontWeight: 700,
                }}
              />
            </Stack>

            <Typography variant="body2" sx={{ mt: 0.25 }} noWrap>
              {projectMeta?.projectName || activeTripCard.primaryLine}
            </Typography>

            <Typography variant="caption" color="text.secondary" noWrap>
              {supportsStageCloseout
                ? `${stageLabel(projectMeta?.stageKey || activeTrip?.link?.projectStageKey)} • ${activeTripCard.secondaryLine}`
                : activeTripCard.secondaryLine}
            </Typography>
          </Box>

          <KeyboardArrowUpRoundedIcon sx={{ color: tripAccentMain }} />
        </Stack>

        <Box sx={{ px: 2, pt: 1.25, pb: 1.5 }}>
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
            {canQuickAct ? (
              isPaused ? (
                <Button
                  variant="contained"
                  startIcon={<PlayArrowRoundedIcon />}
                  disabled={pillActionBusy}
                  onClick={async (event) => {
                    event.stopPropagation();
                    await handleQuickResume();
                  }}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<PauseRoundedIcon />}
                  disabled={pillActionBusy}
                  onClick={async (event) => {
                    event.stopPropagation();
                    await handleQuickPause();
                  }}
                >
                  Pause
                </Button>
              )
            ) : (
              <Button
                variant="outlined"
                startIcon={<ArrowOutwardRoundedIcon />}
                onClick={(event) => {
                  event.stopPropagation();
                  router.push(activeTripCard.href);
                }}
              >
                Open Trip
              </Button>
            )}

            <Button
              variant="contained"
              color="warning"
              startIcon={<StopRoundedIcon />}
              disabled={!canProjectCloseout || pillActionBusy}
              onClick={(event) => {
                event.stopPropagation();
                openProjectCloseoutDialog();
              }}
            >
              Finish Day
            </Button>
          </Box>
        </Box>
      </Paper>
    ) : null;

  const standardCollapsedTripDock =
    isMobile &&
    activeTripCard &&
    !isProjectActiveTrip &&
    !activeTripSheetOpen &&
    !suppressGlobalActiveTripSurface ? (
      <Paper
        elevation={6}
        onClick={() => setActiveTripSheetOpen(true)}
        sx={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: showMobileBottomNav ? MOBILE_BOTTOM_NAV_HEIGHT + 16 : 16,
          zIndex: 1201,
          borderRadius: 3,
          border: `1px solid ${tripAccentBorder}`,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: "none",
          boxShadow: theme.shadows[8],
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <Box sx={{ px: 2, pt: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 1,
              backgroundColor: tripAccentSoft,
            }}
          />
        </Box>

        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, pb: 1.5 }}>
          <IconButton
            aria-label={isPaused ? "Resume trip" : "Pause trip"}
            onClick={async (event) => {
              event.stopPropagation();

              if (pillActionBusy) return;

              if (!canQuickAct) {
                setActiveTripSheetOpen(true);
                return;
              }

              if (isPaused) {
                await handleQuickResume();
                return;
              }

              await handleQuickPause();
            }}
            sx={{
              width: 52,
              height: 52,
              borderRadius: 999,
              flexShrink: 0,
              backgroundColor: tripAccentSoft,
              color: tripAccentMain,
              "&:hover": {
                backgroundColor: alpha(tripAccentMain, 0.18),
              },
            }}
          >
            {canQuickAct ? (
              isPaused ? (
                <PlayArrowRoundedIcon />
              ) : (
                <PauseRoundedIcon />
              )
            ) : (
              <ArrowOutwardRoundedIcon />
            )}
          </IconButton>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: tripAccentMain }}>
                {isPaused ? "Paused" : "Running"}
              </Typography>

              <Chip
                size="small"
                label={`${liveMinutes} min`}
                variant="outlined"
                sx={{
                  color: tripAccentMain,
                  backgroundColor: tripAccentSoft,
                  borderColor: tripAccentBorder,
                  fontWeight: 700,
                }}
              />
            </Stack>

            <Typography variant="body2" sx={{ mt: 0.25 }} noWrap>
              {activeTripCard.primaryLine}
            </Typography>

            <Typography variant="caption" color="text.secondary" noWrap>
              {activeTripCard.secondaryLine}
            </Typography>
          </Box>

          <KeyboardArrowUpRoundedIcon sx={{ color: tripAccentMain }} />
        </Stack>
      </Paper>
    ) : null;

  const collapsedTripDock = projectCollapsedTripDock || standardCollapsedTripDock;

  const projectActiveTripBottomSheet =
    isMobile && activeTripCard && isProjectActiveTrip && !suppressGlobalActiveTripSurface ? (
      <SwipeableDrawer
        anchor="bottom"
        open={activeTripSheetOpen}
        onOpen={() => setActiveTripSheetOpen(true)}
        onClose={() => setActiveTripSheetOpen(false)}
        disableSwipeToOpen={false}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: theme.palette.background.paper,
            backgroundImage: "none",
            pb: "calc(16px + env(safe-area-inset-bottom))",
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 2,
              backgroundColor: tripAccentSoft,
            }}
          />

          <Stack spacing={2}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  backgroundColor: tripAccentSoft,
                  color: tripAccentMain,
                }}
              >
                {isPaused ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: tripAccentMain }}>
                  {isPaused ? "Paused" : "Running"}
                </Typography>
                <Typography variant="body2" noWrap>
                  {projectMeta?.projectName || activeTripCard.primaryLine}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {supportsStageCloseout
                    ? stageLabel(projectMeta?.stageKey || activeTrip?.link?.projectStageKey)
                    : activeTripCard.secondaryLine}
                </Typography>
              </Box>

              <IconButton onClick={() => setActiveTripSheetOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              Project Trip Actions
            </Typography>

            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
              {canQuickAct ? (
                isPaused ? (
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowRoundedIcon />}
                    disabled={pillActionBusy}
                    onClick={async () => {
                      await handleQuickResume();
                      setActiveTripSheetOpen(false);
                    }}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<PauseRoundedIcon />}
                    disabled={pillActionBusy}
                    onClick={async () => {
                      await handleQuickPause();
                      setActiveTripSheetOpen(false);
                    }}
                  >
                    Pause
                  </Button>
                )
              ) : (
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<ArrowOutwardRoundedIcon />}
                  onClick={() => {
                    router.push(activeTripCard.href);
                    setActiveTripSheetOpen(false);
                  }}
                >
                  Open Trip
                </Button>
              )}

              <Button
                variant="contained"
                color="warning"
                startIcon={<StopRoundedIcon />}
                disabled={!canProjectCloseout || pillActionBusy}
                onClick={() => {
                  openProjectCloseoutDialog();
                }}
              >
                Finish Day
              </Button>

              <Button
                variant="outlined"
                color="primary"
                startIcon={<ArrowOutwardRoundedIcon />}
                sx={{ gridColumn: "1 / -1" }}
                onClick={() => {
                  router.push(activeTripCard.href);
                  setActiveTripSheetOpen(false);
                }}
              >
                Open Trip
              </Button>
            </Box>
          </Stack>
        </Box>
      </SwipeableDrawer>
    ) : null;

  const standardActiveTripBottomSheet =
    isMobile && activeTripCard && !isProjectActiveTrip && !suppressGlobalActiveTripSurface ? (
      <SwipeableDrawer
        anchor="bottom"
        open={activeTripSheetOpen}
        onOpen={() => setActiveTripSheetOpen(true)}
        onClose={() => setActiveTripSheetOpen(false)}
        disableSwipeToOpen={false}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: theme.palette.background.paper,
            backgroundImage: "none",
            pb: "calc(16px + env(safe-area-inset-bottom))",
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 2,
              backgroundColor: tripAccentSoft,
            }}
          />

          <Stack spacing={2}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  backgroundColor: tripAccentSoft,
                  color: tripAccentMain,
                }}
              >
                {isPaused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: tripAccentMain }}>
                  {isPaused ? "Paused" : "Running"}
                </Typography>
                <Typography variant="body2" noWrap>
                  {activeTripCard.primaryLine}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {activeTripCard.secondaryLine}
                </Typography>
              </Box>

              <IconButton onClick={() => setActiveTripSheetOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              Trip Actions
            </Typography>

            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
              {canQuickAct ? (
                isPaused ? (
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowRoundedIcon />}
                    disabled={pillActionBusy}
                    onClick={async () => {
                      await handleQuickResume();
                      setActiveTripSheetOpen(false);
                    }}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<PauseRoundedIcon />}
                    disabled={pillActionBusy}
                    onClick={async () => {
                      await handleQuickPause();
                      setActiveTripSheetOpen(false);
                    }}
                  >
                    Pause
                  </Button>
                )
              ) : (
                <Button
                  variant="outlined"
                  color={isPaused ? "warning" : "primary"}
                  startIcon={<ArrowOutwardRoundedIcon />}
                  onClick={() => {
                    router.push(activeTripCard.href);
                    setActiveTripSheetOpen(false);
                  }}
                >
                  Open Trip
                </Button>
              )}

              <Button
                variant="outlined"
                color={isPaused ? "warning" : "primary"}
                startIcon={<ReceiptLongRoundedIcon />}
                onClick={() => {
                  router.push(activeTripCard.href);
                  setActiveTripSheetOpen(false);
                }}
              >
                {hasServiceTicketTarget ? "Open Ticket" : "Open Trip"}
              </Button>

              {hasServiceTicketTarget ? (
                <>
                  <Button
                    variant="outlined"
                    color={isPaused ? "warning" : "primary"}
                    startIcon={<NoteAltOutlinedIcon />}
                    onClick={() => navigateToActiveTrip("note")}
                  >
                    Add Note
                  </Button>

                  <Button
                    variant="outlined"
                    color={isPaused ? "warning" : "primary"}
                    startIcon={<ArrowOutwardRoundedIcon />}
                    onClick={() => navigateToActiveTrip("follow_up")}
                  >
                    Follow-Up
                  </Button>

                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckRoundedIcon />}
                    sx={{ gridColumn: "1 / -1" }}
                    onClick={() => navigateToActiveTrip("resolved")}
                  >
                    Resolved
                  </Button>
                </>
              ) : null}
            </Box>
          </Stack>
        </Box>
      </SwipeableDrawer>
    ) : null;

  const activeTripBottomSheet = projectActiveTripBottomSheet || standardActiveTripBottomSheet;

  const currentPageLabel = useMemo(() => getMobilePageLabel(pathname), [pathname]);

  const mobileRejectedOverlay =
    isMobile && showRejectedBanner ? (
      <Box
        sx={{
          position: "fixed",
          left: 12,
          right: 12,
          top: "calc(env(safe-area-inset-top) + 72px)",
          zIndex: 1202,
          pointerEvents: "none",
        }}
      >
        <Box sx={{ pointerEvents: "auto" }}>
          <MobileTopActionCard
            title="Timesheet needs changes"
            body={
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                  Open <strong>Time Entries</strong> to correct and resubmit your rejected
                  timesheet.
                </Typography>

                <Stack
                  direction="row"
                  spacing={0.75}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ mt: 1 }}
                >
                  <Chip
                    size="small"
                    color="error"
                    label={`${myRejectedCount} rejected ${
                      myRejectedCount === 1 ? "timesheet" : "timesheets"
                    }`}
                    sx={{ fontWeight: 700 }}
                  />

                  {latestRejectedWeekLabel ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Week of ${latestRejectedWeekLabel}`}
                    />
                  ) : null}
                </Stack>
              </Box>
            }
            action={
              <Button
                fullWidth
                variant="contained"
                color="error"
                startIcon={<AccessTimeFilledRoundedIcon />}
                onClick={() => router.push(rejectedFixHref)}
                sx={{
                  minHeight: 44,
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                Fix now in Time Entries
              </Button>
            }
            onDismiss={dismissRejectedBanner}
          />
        </Box>
      </Box>
    ) : null;

  const projectCloseoutDialog =
    isProjectActiveTrip && activeTrip ? (
      <Dialog
        open={projectCloseoutOpen}
        onClose={projectCloseoutSaving ? undefined : () => setProjectCloseoutOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Finish Project Day</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" variant="outlined">
              This saves the project closeout and today’s hours together, so the tech does not need to go back to My Day to confirm hours.
            </Alert>

            <RadioGroup
              value={projectTodayResult}
              onChange={(e) =>
                setProjectTodayResult(e.target.value as ProjectCloseoutTodayResult)
              }
            >
              <FormControlLabel
                value="done_today"
                control={<Radio />}
                label="Done for today"
              />

              {supportsStageCloseout ? (
                <FormControlLabel
                  value="stage_complete"
                  control={<Radio />}
                  label={`Complete ${stageLabel(projectMeta?.stageKey || activeTrip.link?.projectStageKey)}`}
                />
              ) : null}

              <FormControlLabel
                value="project_complete"
                control={<Radio />}
                label={isTmProject ? "Work complete" : "Complete entire project"}
              />
            </RadioGroup>

            {projectTodayResult === "done_today" ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 3,
                  bgcolor: alpha(theme.palette.primary.main, 0.03),
                }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Is more work still needed after today?
                  </Typography>

                  <RadioGroup
                    value={projectMoreWorkNeeded}
                    onChange={(e) =>
                      setProjectMoreWorkNeeded(e.target.value as "no" | "yes")
                    }
                  >
                    <FormControlLabel value="no" control={<Radio />} label="No" />
                    <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                  </RadioGroup>

                  {projectMoreWorkNeeded === "yes" ? (
                    projectFutureTripsLoading ? (
                      <Typography variant="body2" color="text.secondary">
                        Checking future project trips...
                      </Typography>
                    ) : nextFutureProjectTrip ? (
                      <Alert severity="success" variant="outlined">
                        <Typography sx={{ fontWeight: 700 }}>
                          Next scheduled trip found
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {nextFutureProjectTripSummary}
                        </Typography>
                      </Alert>
                    ) : (
                      <Stack spacing={1.25}>
                        <Alert severity="warning" variant="outlined">
                          No future trip is currently scheduled. Request the return date the customer or contractor wants.
                        </Alert>

                        <TextField
                          label="Requested Return Date"
                          type="date"
                          value={projectRequestedReturnDate}
                          onChange={(e) => setProjectRequestedReturnDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          disabled={projectCloseoutSaving}
                          fullWidth
                        />
                      </Stack>
                    )
                  ) : null}
                </Stack>
              </Paper>
            ) : null}

            <TextField
              label="Hours Worked Today"
              type="number"
              inputProps={{ min: 0.25, step: 0.25 }}
              value={projectHoursWorked}
              onChange={(e) => setProjectHoursWorked(e.target.value)}
              disabled={projectCloseoutSaving}
              fullWidth
            />

            <Typography variant="caption" color="text.secondary">
              These hours are saved now as the project time entry, so no extra confirmation step is required.
            </Typography>

            <TextField
              label="Work Notes"
              value={projectCloseoutNotes}
              onChange={(e) => setProjectCloseoutNotes(e.target.value)}
              multiline
              minRows={4}
              disabled={projectCloseoutSaving}
              placeholder="Type or dictate what was finished today, what remains, or what office should know..."
              fullWidth
            />

            <TextField
              label="Materials Used Today"
              value={projectMaterialsSummary}
              onChange={(e) => setProjectMaterialsSummary(e.target.value)}
              multiline
              minRows={5}
              disabled={projectCloseoutSaving}
              placeholder="Type or dictate materials used, parts picked up, supply house run details, or anything billing should know..."
              fullWidth
            />

            <Typography variant="caption" color="text.secondary">
              Keep materials simple and natural-language. No line items required.
            </Typography>

            {(projectTodayResult === "stage_complete" ||
              projectTodayResult === "project_complete") ? (
              <Alert severity="warning" variant="outlined">
                Any future scheduled project trips that are no longer needed will be cancelled and kept for history.
              </Alert>
            ) : null}

            {projectCloseoutError ? (
              <Alert severity="error">{projectCloseoutError}</Alert>
            ) : null}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setProjectCloseoutOpen(false)}
            disabled={projectCloseoutSaving}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<StopRoundedIcon />}
            onClick={handleSubmitProjectCloseoutFromDock}
            disabled={projectCloseoutSaving}
          >
            {projectCloseoutSaving ? "Saving..." : "Save Closeout"}
          </Button>
        </DialogActions>
      </Dialog>
    ) : null;

  const globalDockNotice = projectDockNotice ? (
    <Alert
      severity="success"
      variant="outlined"
      sx={{ mb: 1.5, borderRadius: 1.5 }}
      action={
        <Button size="small" color="inherit" onClick={() => setProjectDockNotice("")}>
          Dismiss
        </Button>
      }
    >
      {projectDockNotice}
    </Alert>
  ) : null;

  if (!isMobile) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          backgroundColor: "background.default",
          overflow: "hidden",
        }}
      >
        {projectCloseoutDialog}

        <Drawer
          variant="permanent"
          PaperProps={{
            sx: {
              width: DESKTOP_DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
          sx={{
            width: DESKTOP_DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DESKTOP_DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          {drawerContent}
        </Drawer>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: "100vh",
            overflow: "auto",
            backgroundColor: "background.default",
          }}
        >
          <Box
            sx={{
              maxWidth: 1600,
              mx: "auto",
              px: { xs: 2, md: 3 },
              py: 3,
            }}
          >
            {globalDockNotice}
            {rejectedBanner}
            {mondayReminderBanner}
            {children}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      {projectCloseoutDialog}

      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar sx={{ minHeight: 64, px: 1.5 }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 1 }}
          >
            <MenuRoundedIcon />
          </IconButton>

          <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
            <WaterDropRoundedIcon color="primary" sx={{ fontSize: 18 }} />
            <Box minWidth={0}>
              <Typography variant="subtitle2">DCFlow</Typography>
              <Typography variant="caption" color="text.secondary">
                {appUser?.displayName || "Unknown User"}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1 }} />

          <Box sx={{ minWidth: 0, maxWidth: 152, textAlign: "right" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", lineHeight: 1.1 }}
            >
              Current page
            </Typography>
            <Typography variant="subtitle2" noWrap>
              {currentPageLabel}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: "84vw",
            maxWidth: 360,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {mobileRejectedOverlay}

      <Box
        component="main"
        sx={{
          px: 1.5,
          pt: showRejectedBanner ? `${MOBILE_TOP_REJECTED_OVERLAY_HEIGHT}px` : 1.5,
          pb: `${mobileBottomPadding}px`,
        }}
      >
        {globalDockNotice}
        {!showRejectedBanner ? rejectedBanner : null}
        {mondayReminderBanner}
        {children}
      </Box>

      {collapsedTripDock}
      {activeTripBottomSheet}

      {showMobileBottomNav ? (
        <Paper
          elevation={0}
          sx={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 1200,
            borderRadius: 2.5,
            overflow: "hidden",
            border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
            backgroundColor: "background.paper",
          }}
        >
          <BottomNavigation
            showLabels
            value={mobileBottomNavValue}
            onChange={(_, nextValue) => {
              if (nextValue === "more") {
                setDrawerOpen(true);
                return;
              }
              router.push(nextValue);
            }}
            sx={{
              height: MOBILE_BOTTOM_NAV_HEIGHT,
              background: "transparent",
            }}
          >
            {mobilePrimaryNav.map((item) => (
              <BottomNavigationAction
                key={item.href}
                label={item.label}
                value={item.href}
                icon={
                  item.badgeCount && item.badgeCount > 0 ? (
                    <Badge
                      color="error"
                      badgeContent={item.badgeCount > 99 ? "99+" : item.badgeCount}
                      sx={{
                        "& .MuiBadge-badge": {
                          fontWeight: 700,
                        },
                      }}
                    >
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )
                }
              />
            ))}

            <BottomNavigationAction
              label="More"
              value="more"
              icon={
                <Badge
                  color="error"
                  badgeContent={mobileMoreBadgeCount > 99 ? "99+" : mobileMoreBadgeCount}
                  invisible={mobileMoreBadgeCount < 1}
                  sx={{
                    "& .MuiBadge-badge": {
                      fontWeight: 700,
                    },
                  }}
                >
                  <MoreHorizRoundedIcon />
                </Badge>
              }
            />
          </BottomNavigation>
        </Paper>
      ) : null}
    </Box>
  );
}