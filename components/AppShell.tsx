//components/AppShell.tsx
"use client";

import Image from "next/image";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "./LogoutButton";
import GlobalSearch from "./GlobalSearch";
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
import { queueProjectTripTimeEntryWrites } from "../src/lib/project-trip-time-entries";

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

type ProjectTripMaterial = {
  id?: string;
  name?: string | null;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
  imported?: boolean;
  source?: "manual" | "supplier_invoice" | string | null;
  poCode?: string | null;
  supplierName?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceId?: string | null;
  supplierLineKey?: string | null;
  supplierSku?: string | null;
  unitCost?: number | null;
  lineTotal?: number | null;
  importedAt?: string | null;
};

type ProjectTripMaterialGroup = {
  key: string;
  poCode: string;
  supplierName: string;
  invoiceNumber: string;
  items: ProjectTripMaterial[];
  hasLineTotals: boolean;
  total: number;
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
  startedAt?: string | null;
  completedAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  materials?: ProjectTripMaterial[] | null;
  materialsSummary?: string | null;
  materialNotes?: string | null;
  updatedAt?: string | null;
  closeout?: {
    needsMoreWork?: string | boolean | null;
    materialsUsedToday?: string | null;
    materialNotes?: string | null;
  } | null;
  needsMoreTime?: boolean | null;
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

type ProjectCloseoutDecision =
  | ""
  | "another_visit"
  | "stage_complete"
  | "project_complete";

type ProjectCloseoutCrewHour = {
  uid: string;
  name: string;
  roleLabel: string;
  hours: string;
};

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

function roundProjectTimerMinutesToHours(liveMinutes: number) {
  if (!Number.isFinite(liveMinutes) || liveMinutes <= 0) return 1;

  const roundedToHalfHour = Math.round(liveMinutes / 30) * 0.5;
  return Math.max(1, roundedToHalfHour);
}

function isValidProjectSavedHours(value: number) {
  if (!Number.isFinite(value) || value < 1) return false;
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.001;
}

function formatElapsedMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  return `${minutes} min`;
}

function formatMaterialMoney(value?: number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatMaterialQuantity(material: ProjectTripMaterial) {
  const quantity = Number(material.qty);
  const quantityLabel = Number.isFinite(quantity)
    ? Number.isInteger(quantity)
      ? String(quantity)
      : quantity.toFixed(2).replace(/\.00$/, "")
    : "";
  const unit = safeTrim(material.unit).toUpperCase();

  return [quantityLabel, unit].filter(Boolean).join(" ");
}

function getPurchasedProjectMaterials(materials?: ProjectTripMaterial[] | null) {
  if (!Array.isArray(materials)) return [];

  return materials.filter((material) => {
    const source = safeTrim(material?.source).toLowerCase();
    return source === "supplier_invoice" || material?.imported === true;
  });
}

function groupPurchasedProjectMaterials(materials?: ProjectTripMaterial[] | null) {
  const groups = new Map<string, ProjectTripMaterialGroup>();

  for (const material of getPurchasedProjectMaterials(materials)) {
    const poCode = safeTrim(material.poCode).toUpperCase();
    const supplierName = safeTrim(material.supplierName);
    const invoiceNumber = safeTrim(material.supplierInvoiceNumber);
    const key = [poCode || "no-po", supplierName || "supplier", invoiceNumber || "no-invoice"].join("__");
    const existing = groups.get(key) || {
      key,
      poCode,
      supplierName,
      invoiceNumber,
      items: [],
      hasLineTotals: false,
      total: 0,
    };

    const lineTotal = Number(material.lineTotal);
    existing.items.push(material);
    if (Number.isFinite(lineTotal)) {
      existing.hasLineTotals = true;
      existing.total += lineTotal;
    }

    groups.set(key, existing);
  }

  return Array.from(groups.values());
}

function formatClockTime(hhmm?: string | null) {
  const raw = safeTrim(hhmm);
  if (!/^\d{2}:\d{2}$/.test(raw)) return raw || "—";

  const [hourValue, minuteValue] = raw.split(":").map(Number);
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return raw;

  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour12 = hourValue % 12 || 12;
  return `${hour12}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
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

function getProjectTripTimerMinutesAt(trip: TripDoc, referenceMs: number) {
  const startMs = parseIsoMs(trip.actualStartAt || trip.startedAt || null);
  if (!Number.isFinite(startMs) || !Number.isFinite(referenceMs) || referenceMs < startMs) {
    return null;
  }

  const pausedMinutes = sumPausedMinutes(trip.pauseBlocks || null, referenceMs);
  const grossMinutes = minutesBetweenMs(startMs, referenceMs);
  return Math.max(0, grossMinutes - pausedMinutes);
}

function buildProjectCloseoutCrewHours(
  crew: TripCrew | null | undefined,
  defaultHours: number
): ProjectCloseoutCrewHour[] {
  const rows: ProjectCloseoutCrewHour[] = [];
  const seen = new Set<string>();
  const hours = defaultHours.toFixed(2);

  function add(uidValue: unknown, nameValue: unknown, roleLabel: string) {
    const uid = safeTrim(uidValue);
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    rows.push({
      uid,
      name: safeTrim(nameValue) || "Employee",
      roleLabel,
      hours,
    });
  }

  add(crew?.primaryTechUid, crew?.primaryTechName, "Tech");
  add(crew?.helperUid, crew?.helperName, "Helper");
  add(crew?.secondaryTechUid, crew?.secondaryTechName, "Secondary Tech");
  add(crew?.secondaryHelperUid, crew?.secondaryHelperName, "Secondary Helper");

  return rows;
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

function tripNeedsMoreWork(trip?: TripDoc | null) {
  if (!trip) return false;

  const closeoutValue = safeTrim(trip.closeout?.needsMoreWork).toLowerCase();
  if (closeoutValue === "yes" || closeoutValue === "true") return true;

  if (typeof trip.needsMoreTime === "boolean") {
    return trip.needsMoreTime;
  }

  return false;
}

function isProjectOfficeClosedish(status?: string | null) {
  const s = safeTrim(status).toLowerCase();
  return s === "field_complete" || s === "invoiced" || s === "closed";
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
  const start = safeTrim(startTime);
  const end = safeTrim(endTime);
  const formattedWindow = start && end ? `${formatClockTime(start)}–${formatClockTime(end)}` : "";

  if (w === "all_day") return formattedWindow || "All Day";
  if (w === "am") return formattedWindow || "Morning";
  if (w === "pm") return formattedWindow || "Afternoon";
  if (w === "custom") return formattedWindow || "Custom";

  return formattedWindow || "—";
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
  if (pathname.startsWith("/technician/project-trips/")) return "Project Trip";
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
        startedAt: d.startedAt ?? d.actualStartAt ?? null,
        completedAt: d.completedAt ?? d.actualEndAt ?? null,
        actualStartAt: d.actualStartAt ?? d.startedAt ?? null,
        actualEndAt: d.actualEndAt ?? d.completedAt ?? null,
        pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : null,
        materials: Array.isArray(d.materials) ? d.materials : null,
        materialsSummary: d.materialsSummary ?? null,
        materialNotes: d.materialNotes ?? d.closeout?.materialNotes ?? null,
        closeout: d.closeout ?? null,
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
  const projectId = safeTrim(trip.link?.projectId);
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
  } else if (safeTrim(trip.type).toLowerCase() === "project" && projectId) {
    href = `/technician/project-trips/${tripId}`;
    primaryLine = "Project Trip";
    secondaryLine = "Tap to return";
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

function PurchasedProjectMaterialsCard({
  materials,
}: {
  materials?: ProjectTripMaterial[] | null;
}) {
  const groups = groupPurchasedProjectMaterials(materials);
  const allItems = getPurchasedProjectMaterials(materials);
  const hasLineTotals = allItems.some((material) =>
    Number.isFinite(Number(material.lineTotal)),
  );
  const purchasedTotal = allItems.reduce((sum, material) => {
    const amount = Number(material.lineTotal);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  if (groups.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.75,
        borderRadius: 1,
        bgcolor: (muiTheme) => alpha(muiTheme.palette.primary.main, 0.025),
      }}
    >
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            Materials Purchased for This Project Trip
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Supplier-imported purchases stay attached to this project trip.
          </Typography>
        </Box>

        {groups.map((group) => (
          <Box key={group.key}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", fontWeight: 700, mb: 0.6 }}
            >
              {[
                group.poCode ? `PO ${group.poCode}` : "",
                group.supplierName || "",
                group.invoiceNumber ? `Invoice #${group.invoiceNumber}` : "",
              ]
                .filter(Boolean)
                .join(" • ")}
            </Typography>

            <Stack spacing={0.65}>
              {group.items.map((material, index) => {
                const qty = formatMaterialQuantity(material);
                const lineTotal = formatMaterialMoney(material.lineTotal);

                return (
                  <Stack
                    key={material.id || material.supplierLineKey || `${group.key}_${index}`}
                    direction="row"
                    spacing={1}
                    justifyContent="space-between"
                    alignItems="flex-start"
                  >
                    <Typography variant="body2" sx={{ minWidth: 0 }}>
                      {qty ? `${qty} • ` : ""}
                      {safeTrim(material.name) || "Material"}
                    </Typography>
                    {lineTotal ? (
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
                      >
                        {lineTotal}
                      </Typography>
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        ))}

        {hasLineTotals ? (
          <>
            <Divider />
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Materials Purchased Total
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {formatMaterialMoney(purchasedTotal)}
              </Typography>
            </Stack>
          </>
        ) : null}

        <Typography variant="caption" color="text.secondary">
          Add a material note below when purchased items were left onsite, returned, or planned for a later visit.
        </Typography>
      </Stack>
    </Paper>
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
    role === "manager";

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
  }, [activeTrip?.id, activeTrip?.timerState, activeTrip?.link?.serviceTicketId, activeTrip?.link?.projectId]);

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
    return getProjectTripTimerMinutesAt(activeTrip, nowMs) ?? 0;
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
  const [projectCloseoutDecision, setProjectCloseoutDecision] =
    useState<ProjectCloseoutDecision>("");
  const [projectTodayResult, setProjectTodayResult] =
    useState<ProjectCloseoutTodayResult>("done_today");
  const [projectMoreWorkNeeded, setProjectMoreWorkNeeded] =
    useState<"no" | "yes">("no");
  const [projectHoursWorked, setProjectHoursWorked] = useState("1.00");
  const [projectTimerMinutes, setProjectTimerMinutes] = useState(0);
  const [projectTimerStoppedAt, setProjectTimerStoppedAt] = useState("");
  const [projectCorrectHoursOpen, setProjectCorrectHoursOpen] = useState(false);
  const [projectCrewHours, setProjectCrewHours] = useState<ProjectCloseoutCrewHour[]>([]);
  const [projectOptionalNoteOpen, setProjectOptionalNoteOpen] = useState(false);
  const [projectMaterialsOpen, setProjectMaterialsOpen] = useState(false);
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

  function selectProjectCloseoutDecision(nextDecision: ProjectCloseoutDecision) {
    setProjectCloseoutDecision(nextDecision);
    setProjectCloseoutError("");

    if (nextDecision === "another_visit") {
      setProjectTodayResult("done_today");
      setProjectMoreWorkNeeded("yes");
      setProjectOptionalNoteOpen(false);
      return;
    }

    setProjectMoreWorkNeeded("no");
    if (nextDecision === "stage_complete") {
      setProjectTodayResult("stage_complete");
      return;
    }
    if (nextDecision === "project_complete") {
      setProjectTodayResult("project_complete");
      return;
    }

    setProjectTodayResult("done_today");
  }

  function openProjectCloseoutDialog() {
    if (!activeTrip || !isProjectActiveTrip || !canProjectCloseout) return;

    const timerStoppedAt = nowIso();
    const timerStoppedMs = parseIsoMs(timerStoppedAt);
    const elapsedMinutes = getProjectTripTimerMinutesAt(activeTrip, timerStoppedMs);

    if (elapsedMinutes == null) {
      setProjectDockNotice(
        "Unable to finish this project trip because its timer start time is missing. Open the trip for review before saving labor hours."
      );
      setActiveTripSheetOpen(false);
      return;
    }

    const suggestedHours = roundProjectTimerMinutesToHours(elapsedMinutes);
    const crew = activeTrip.crewConfirmed || activeTrip.crew || null;
    const savedMaterialNote = safeTrim(
      activeTrip.materialNotes ||
        activeTrip.materialsSummary ||
        activeTrip.closeout?.materialNotes ||
        activeTrip.closeout?.materialsUsedToday
    );

    setProjectCloseoutDecision("");
    setProjectTodayResult("done_today");
    setProjectMoreWorkNeeded("no");
    setProjectHoursWorked(suggestedHours.toFixed(2));
    setProjectTimerMinutes(elapsedMinutes);
    setProjectTimerStoppedAt(timerStoppedAt);
    setProjectCorrectHoursOpen(false);
    setProjectCrewHours(buildProjectCloseoutCrewHours(crew, suggestedHours));
    setProjectOptionalNoteOpen(false);
    setProjectMaterialsOpen(Boolean(savedMaterialNote));
    setProjectCloseoutNotes("");
    setProjectMaterialsSummary(savedMaterialNote);
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

    if (!projectCloseoutDecision) {
      setProjectCloseoutError("Select whether another visit is needed before saving.");
      return;
    }

    const hoursNumber = Number(projectHoursWorked);
    if (!isValidProjectSavedHours(hoursNumber)) {
      setProjectCloseoutError("Saved project hours must be at least 1.00 hour and use 0.50-hour increments.");
      return;
    }

    const crewHoursByUid: Record<string, number> = {};
    for (const member of projectCrewHours) {
      const memberHours = Number(member.hours);
      if (!isValidProjectSavedHours(memberHours)) {
        setProjectCloseoutError(
          `${member.name}'s saved hours must be at least 1.00 hour and use 0.50-hour increments.`
        );
        return;
      }
      crewHoursByUid[member.uid] = memberHours;
    }

    if (projectCrewHours.length === 0) {
      setProjectCloseoutError("No assigned crew members were found for this project trip.");
      return;
    }

    const projectIdStageKey = safeTrim(
      projectMeta?.stageKey || activeTrip.link?.projectStageKey
    );
    const closeoutNotes = safeTrim(projectCloseoutNotes);
    const materialsSummary = safeTrim(projectMaterialsSummary);
    const requestedReturnDate = safeTrim(projectRequestedReturnDate);

    if (projectCloseoutDecision === "another_visit" && !closeoutNotes) {
      setProjectCloseoutError("Please explain what work remains before saving.");
      return;
    }

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
      const stamp = safeTrim(projectTimerStoppedAt) || nowIso();
      const savedAt = nowIso();
      const crewHoursAdjusted = projectCrewHours.some(
        (member) => Number(member.hours) !== hoursNumber
      );
      const tripRef = doc(db, "trips", activeTrip.id);
      const projectRef = doc(db, "projects", projectId);

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
        closeoutAt: savedAt,
        closeoutByUid: myUid || null,
        closeoutHours: hoursNumber,
        crewHoursByUid,
        crewHoursAdjusted,
        timerElapsedMinutes: projectTimerMinutes,
        timerRoundedHours: hoursNumber,
        materialsSummary: materialsSummary || null,
        materialNotes: materialsSummary || null,
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
        updatedAt: savedAt,
        updatedByUid: myUid || null,
        [`confirmedBy.${myUid}`]: {
          hours: crewHoursByUid[myUid] ?? hoursNumber,
          note: closeoutNotes || null,
          confirmedAt: savedAt,
        },
      };

      const projectUpdates: Record<string, unknown> = {
        updatedAt: savedAt,
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

        if (isTmProject) {
          projectUpdates.active = true;
          projectUpdates.projectOfficeStatus = "field_complete";
          projectUpdates.fieldCompletedAt = stamp;
          projectUpdates.fieldCompletedByUid = myUid || null;
          projectUpdates.fieldCompletedByName = myDisplayName || null;
        } else {
          projectUpdates.active = true;
          projectUpdates.projectOfficeStatus = "field_complete";
          projectUpdates.fieldCompletedAt = stamp;
          projectUpdates.fieldCompletedByUid = myUid || null;
          projectUpdates.fieldCompletedByName = myDisplayName || null;
          projectUpdates.completedAt = stamp;
          projectUpdates.completedByUid = myUid || null;
        }
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

      const synced = await queueProjectTripTimeEntryWrites(batch, {
        trip: {
          ...activeTrip,
          crew: activeTrip.crewConfirmed || activeTrip.crew || null,
          status: "complete",
          timerState: "complete",
          actualEndAt: stamp,
          completedAt: stamp,
          pauseBlocks,
        } as any,
        projectId,
        projectStageKey: projectIdStageKey || null,
        hours: hoursNumber,
        crewHoursByUid,
        notes: closeoutNotes || null,
        actorUid: myUid || null,
        actorName: myDisplayName || null,
        source: "project_trip_closeout",
      });

      tripUpdates.closeout = {
        outcome:
          projectTodayResult === "stage_complete"
            ? "complete_stage"
            : projectTodayResult === "project_complete"
              ? "complete_project"
              : "done_today",
        needsMoreWork: projectMoreWorkNeeded,
        hoursWorkedToday: hoursNumber,
        timerElapsedMinutes: projectTimerMinutes,
        crewHoursByUid,
        crewHours: projectCrewHours.map((member) => ({
          uid: member.uid,
          name: member.name,
          roleLabel: member.roleLabel,
          hoursWorkedToday: Number(member.hours),
        })),
        crewHoursAdjusted,
        workNotes: closeoutNotes || null,
        materialsUsedToday: materialsSummary || null,
        materialNotes: materialsSummary || null,
        savedAt,
        savedByUid: myUid || null,
        savedByName: myDisplayName || null,
        timeEntrySyncStatus: "synced",
        timeEntrySyncMode: "automatic_closeout",
        timeEntryMemberCount: synced.memberCount,
        timeEntrySyncedAt: savedAt,
        timeEntrySyncedByUid: myUid || null,
        timeEntrySyncedByName: myDisplayName || null,
      };

      batch.update(tripRef, tripUpdates);
      batch.update(projectRef, projectUpdates);

      await batch.commit();

      setProjectCloseoutOpen(false);

      const loggedHoursText = crewHoursAdjusted
        ? "Crew labor hours logged with adjustments."
        : `${hoursNumber.toFixed(2)}h logged for assigned crew.`;

      if (projectTodayResult === "done_today") {
        if (projectMoreWorkNeeded === "yes" && nextFutureProjectTrip) {
          setProjectDockNotice(
            `Saved. ${loggedHoursText} Next scheduled trip: ${nextFutureProjectTripSummary}.`
          );
        } else if (projectMoreWorkNeeded === "yes" && !nextFutureProjectTrip) {
          setProjectDockNotice(
            `Saved. ${loggedHoursText} Return requested for ${formatDisplayDate(requestedReturnDate)}.`
          );
        } else {
          setProjectDockNotice(`Saved. ${loggedHoursText}`);
        }
      } else if (projectTodayResult === "stage_complete") {
        setProjectDockNotice(
          `Saved. ${loggedHoursText} Stage marked complete.${cancelledFutureTripCount > 0 ? ` ${cancelledFutureTripCount} future trip(s) cancelled.` : ""}`
        );
      } else {
        setProjectDockNotice(
          `Saved. ${loggedHoursText} Project marked field complete.${cancelledFutureTripCount > 0 ? ` ${cancelledFutureTripCount} future trip(s) cancelled.` : ""}`
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
  const [scheduledFollowUpServiceTicketIds, setScheduledFollowUpServiceTicketIds] = useState<string[]>([]);
  const [projectFollowUpIds, setProjectFollowUpIds] = useState<string[]>([]);
  const [projectReadyToInvoiceIds, setProjectReadyToInvoiceIds] = useState<string[]>([]);
  const [newUntouchedServiceTicketCount, setNewUntouchedServiceTicketCount] = useState(0);

  useEffect(() => {
    if (!showDashboard) {
      setFollowUpTicketIds([]);
      setReadyToBillTicketIds([]);
      setScheduledFollowUpServiceTicketIds([]);
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

    const unsubScheduledServiceTrips = onSnapshot(
      query(
        collection(db, "trips"),
        where("type", "==", "service"),
        where("active", "==", true),
        limit(1000)
      ),
      (snap) => {
        const ids = new Set<string>();

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const ticketId = safeTrim(data.link?.serviceTicketId);
          if (!ticketId) return;

          const status = normalizeTripStatus(data.status);
          if (status === "cancelled" || status === "complete") return;

          ids.add(ticketId);
        });

        setScheduledFollowUpServiceTicketIds(Array.from(ids));
      },
      () => setScheduledFollowUpServiceTicketIds([])
    );

    return () => {
      unsubFollowUp();
      unsubReady();
      unsubScheduledServiceTrips();
    };
  }, [showDashboard]);

  useEffect(() => {
    if (!showDashboard) {
      setProjectFollowUpIds([]);
      setProjectReadyToInvoiceIds([]);
      return;
    }

    const projectsMap = new Map<string, any>();
    const tripsByProject = new Map<string, TripDoc[]>();

    function recomputeProjectAttention() {
      const readyIds = new Set<string>();
      const followUpIds = new Set<string>();

      for (const [projectId, projectDoc] of projectsMap.entries()) {
        const officeStatus =
          safeTrim(projectDoc?.projectOfficeStatus).toLowerCase() || "active_work";

        if (officeStatus === "ready_to_invoice") {
          readyIds.add(projectId);
        }

        if (officeStatus === "invoiced" || officeStatus === "closed") {
          continue;
        }

        const projectRequestedMoreWork =
          projectDoc?.additionalTripRequested === true ||
          safeTrim(projectDoc?.additionalTripRequested).toLowerCase() === "true";

        const trips = (tripsByProject.get(projectId) || []).filter(
          (trip) => normalizeTripStatus(trip.status) !== "cancelled"
        );

        const hasFlaggedTrip = trips
          .filter((trip) => normalizeTripStatus(trip.status) === "complete")
          .some((trip) => tripNeedsMoreWork(trip));

        if (projectRequestedMoreWork || hasFlaggedTrip) {
          followUpIds.add(projectId);
        }
      }

      setProjectReadyToInvoiceIds(Array.from(readyIds));
      setProjectFollowUpIds(Array.from(followUpIds));
    }

    const unsubProjects = onSnapshot(
      collection(db, "projects"),
      (snap) => {
        projectsMap.clear();

        snap.docs.forEach((ds) => {
          projectsMap.set(ds.id, ds.data() as any);
        });

        recomputeProjectAttention();
      },
      () => {
        setProjectFollowUpIds([]);
        setProjectReadyToInvoiceIds([]);
      }
    );

    const unsubTrips = onSnapshot(
      query(collection(db, "trips"), limit(2000)),
      (snap) => {
        tripsByProject.clear();

        snap.docs.forEach((ds) => {
          const d = ds.data() as any;
          const projectId = safeTrim(d.link?.projectId);
          if (!projectId) return;

          const list = tripsByProject.get(projectId) || [];
          list.push({
            id: ds.id,
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
            closeout: d.closeout ?? null,
            needsMoreTime:
              typeof d.needsMoreTime === "boolean" ? d.needsMoreTime : null,
          });
          tripsByProject.set(projectId, list);
        });

        recomputeProjectAttention();
      },
      () => {
        setProjectFollowUpIds([]);
        setProjectReadyToInvoiceIds([]);
      }
    );

    return () => {
      unsubProjects();
      unsubTrips();
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

  const visibleFollowUpTicketIds = useMemo(() => {
    if (scheduledFollowUpServiceTicketIds.length === 0) return followUpTicketIds;

    const scheduledSet = new Set(scheduledFollowUpServiceTicketIds);
    return followUpTicketIds.filter((id) => !scheduledSet.has(id));
  }, [followUpTicketIds, scheduledFollowUpServiceTicketIds]);

  const dashboardAttentionCount = useMemo(() => {
    return (
      visibleFollowUpTicketIds.length +
      readyToBillTicketIds.length +
      projectFollowUpIds.length +
      projectReadyToInvoiceIds.length
    );
  }, [
    visibleFollowUpTicketIds,
    readyToBillTicketIds,
    projectFollowUpIds,
    projectReadyToInvoiceIds,
  ]);

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
        maxWidth="xs"
        scroll="paper"
        PaperProps={{
          sx: {
            borderRadius: { xs: 1, sm: 4 },
            m: { xs: 1.5, sm: 4 },
            width: { xs: "calc(100% - 24px)", sm: "100%" },
            maxHeight: { xs: "calc(100dvh - 24px)", sm: "calc(100vh - 64px)" },
            overflow: "hidden",
          },
        }}
      >
        <DialogTitle
          sx={{
            px: { xs: 2.5, sm: 3 },
            py: 2.25,
            fontWeight: 800,
            typography: "h5",
            borderBottom: (muiTheme) => `1px solid ${muiTheme.palette.divider}`,
          }}
        >
          Finish Project Day
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.25 }}>
          <Stack spacing={2.25}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {projectMeta?.projectName || "Project Trip"}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {supportsStageCloseout
                  ? stageLabel(projectMeta?.stageKey || activeTrip.link?.projectStageKey)
                  : "Project Trip"}
                {activeTrip.date ? ` • ${formatDisplayDate(activeTrip.date)}` : ""}
              </Typography>
            </Box>

            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={1.25} justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="overline" sx={{ display: "block", fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
                      TODAY&apos;S SAVED HOURS
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.3 }}>
                      <Typography component="div" variant="h4" sx={{ fontWeight: 800, lineHeight: 1 }}>
                        {Number(projectHoursWorked || 0).toFixed(2)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        hours
                      </Typography>
                    </Stack>
                  </Box>

                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setProjectCorrectHoursOpen((open) => !open)}
                    disabled={projectCloseoutSaving}
                    sx={{ borderRadius: 99, whiteSpace: "nowrap" }}
                  >
                    {projectCorrectHoursOpen ? "Done" : "Correct Hours"}
                  </Button>
                </Stack>

                <Typography variant="body2" color="text.secondary">
                  From trip timer: {formatElapsedMinutes(projectTimerMinutes)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Rounded to nearest 0.5 hr • 1 hr minimum
                </Typography>
              </Stack>
            </Paper>

            {projectCorrectHoursOpen ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 3,
                  bgcolor: alpha(theme.palette.primary.main, 0.025),
                }}
              >
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Correct Crew Hours
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Only change hours when a crew member&apos;s project time differed today.
                    </Typography>
                  </Box>

                  {projectCrewHours.map((member) => (
                    <TextField
                      key={member.uid}
                      label={`${member.name} • ${member.roleLabel}`}
                      type="number"
                      size="small"
                      inputProps={{ min: 1, step: 0.5 }}
                      value={member.hours}
                      onChange={(e) =>
                        setProjectCrewHours((current) =>
                          current.map((row) =>
                            row.uid === member.uid ? { ...row, hours: e.target.value } : row
                          )
                        )
                      }
                      disabled={projectCloseoutSaving}
                      helperText="1.00 hr minimum • 0.50 hr increments"
                      fullWidth
                    />
                  ))}

                  <Button
                    size="small"
                    variant="text"
                    onClick={() =>
                      setProjectCrewHours((current) =>
                        current.map((member) => ({ ...member, hours: projectHoursWorked }))
                      )
                    }
                    disabled={projectCloseoutSaving}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Reset to Timer Hours
                  </Button>
                </Stack>
              </Paper>
            ) : null}

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                {supportsStageCloseout
                  ? "Does this stage need another visit?"
                  : "Does this project need another visit?"}
              </Typography>

              <RadioGroup
                value={projectCloseoutDecision}
                onChange={(e) =>
                  selectProjectCloseoutDecision(e.target.value as ProjectCloseoutDecision)
                }
                sx={{ gap: 1 }}
              >
                <Paper
                  elevation={0}
                  variant="outlined"
                  sx={{
                    px: 1.25,
                    borderRadius: 3,
                    bgcolor:
                      projectCloseoutDecision === "another_visit"
                        ? alpha(theme.palette.primary.main, 0.08)
                        : "transparent",
                    borderColor:
                      projectCloseoutDecision === "another_visit" ? "primary.main" : "divider",
                  }}
                >
                  <FormControlLabel
                    value="another_visit"
                    control={<Radio />}
                    label="Yes — Another Visit Needed"
                    sx={{ width: "100%", minHeight: 52, m: 0 }}
                  />
                </Paper>

                <Paper
                  elevation={0}
                  variant="outlined"
                  sx={{
                    px: 1.25,
                    borderRadius: 3,
                    bgcolor:
                      projectCloseoutDecision ===
                      (supportsStageCloseout ? "stage_complete" : "project_complete")
                        ? alpha(theme.palette.primary.main, 0.08)
                        : "transparent",
                    borderColor:
                      projectCloseoutDecision ===
                      (supportsStageCloseout ? "stage_complete" : "project_complete")
                        ? "primary.main"
                        : "divider",
                  }}
                >
                  <FormControlLabel
                    value={supportsStageCloseout ? "stage_complete" : "project_complete"}
                    control={<Radio />}
                    label={supportsStageCloseout ? "No — Stage Complete" : "No — Project Work Complete"}
                    sx={{ width: "100%", minHeight: 52, m: 0 }}
                  />
                </Paper>
              </RadioGroup>
            </Box>

            {projectCloseoutDecision === "another_visit" ? (
              <Stack spacing={1.25}>
                <TextField
                  label="What work remains?"
                  required
                  value={projectCloseoutNotes}
                  onChange={(e) => setProjectCloseoutNotes(e.target.value)}
                  multiline
                  minRows={2}
                  disabled={projectCloseoutSaving}
                  placeholder="Type or dictate what needs to be completed next..."
                  helperText="Required for another visit."
                  fullWidth
                />

                {projectFutureTripsLoading ? (
                  <Typography variant="body2" color="text.secondary">
                    Checking future project trips...
                  </Typography>
                ) : nextFutureProjectTrip ? (
                  <Paper
                    elevation={0}
                    sx={{
                      px: 1.5,
                      py: 1.25,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.success.main, 0.08),
                      border: `1px solid ${alpha(theme.palette.success.main, 0.28)}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "success.main" }}>
                      Next scheduled trip found
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {nextFutureProjectTripSummary}
                    </Typography>
                  </Paper>
                ) : (
                  <Stack spacing={1}>
                    <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2.5 }}>
                      No future trip is scheduled. Enter the requested return date.
                    </Alert>
                    <TextField
                      label="Requested Return Date"
                      type="date"
                      size="small"
                      value={projectRequestedReturnDate}
                      onChange={(e) => setProjectRequestedReturnDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      disabled={projectCloseoutSaving}
                      fullWidth
                    />
                  </Stack>
                )}
              </Stack>
            ) : projectCloseoutDecision ? (
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setProjectOptionalNoteOpen((open) => !open)}
                  disabled={projectCloseoutSaving}
                  sx={{
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    px: 1.5,
                    py: 0.5,
                    minHeight: 34,
                    borderColor: (theme) => alpha(theme.palette.primary.main, 0.45),
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.025),
                    "&:hover": {
                      borderColor: "primary.main",
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                    },
                  }}
                >
                  {projectOptionalNoteOpen ? "Remove Optional Note" : "Add Optional Note"}
                </Button>
                {projectOptionalNoteOpen ? (
                  <TextField
                    label="Completion Note (optional)"
                    value={projectCloseoutNotes}
                    onChange={(e) => setProjectCloseoutNotes(e.target.value)}
                    multiline
                    minRows={2}
                    disabled={projectCloseoutSaving}
                    fullWidth
                    sx={{ mt: 1 }}
                  />
                ) : null}
              </Box>
            ) : null}

            <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
                Crew Receiving Hours
              </Typography>
              {projectCrewHours.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No assigned crew found.
                </Typography>
              ) : projectCrewHours.every(
                  (member) => Number(member.hours || 0) === Number(projectCrewHours[0]?.hours || 0)
                ) ? (
                <Typography variant="body2" color="text.secondary">
                  {projectCrewHours.map((member) => member.name).join(" + ")} will each receive{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 700 }}>
                    {Number(projectCrewHours[0]?.hours || 0).toFixed(2)} hours
                  </Box>
                  .
                </Typography>
              ) : (
                <Stack spacing={0.4}>
                  {projectCrewHours.map((member) => (
                    <Typography key={member.uid} variant="body2" color="text.secondary">
                      {member.name} • {member.roleLabel} •{" "}
                      <Box component="span" sx={{ color: "text.primary", fontWeight: 700 }}>
                        {Number(member.hours || 0).toFixed(2)} hours
                      </Box>
                    </Typography>
                  ))}
                </Stack>
              )}
            </Paper>

            <PurchasedProjectMaterialsCard materials={activeTrip.materials} />

            <Button
              size="small"
              variant="outlined"
              onClick={() => setProjectMaterialsOpen((open) => !open)}
              disabled={projectCloseoutSaving}
              sx={{
                alignSelf: "flex-start",
                borderRadius: 999,
                px: 1.5,
                py: 0.5,
                minHeight: 34,
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.45),
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.025),
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              {projectMaterialsOpen ? "Remove Material Note" : "Add Material Note (optional)"}
            </Button>
            {projectMaterialsOpen ? (
              <TextField
                label="Material Notes (optional)"
                value={projectMaterialsSummary}
                onChange={(e) => setProjectMaterialsSummary(e.target.value)}
                multiline
                minRows={2}
                disabled={projectCloseoutSaving}
                placeholder="Example: Not installed today — left onsite for next visit."
                helperText="Supplier-imported materials stay attached to this project trip."
                fullWidth
                sx={{ mt: -1.25 }}
              />
            ) : null}

            {(projectCloseoutDecision === "stage_complete" ||
              projectCloseoutDecision === "project_complete") &&
            projectFutureTrips.length > 0 ? (
              <Alert severity="warning" variant="outlined" sx={{ borderRadius: 1 }}>
                Future scheduled trips that are no longer needed will be cancelled and kept for history.
              </Alert>
            ) : null}

            {projectCloseoutError ? <Alert severity="error">{projectCloseoutError}</Alert> : null}
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            py: 1.75,
            borderTop: (muiTheme) => `1px solid ${muiTheme.palette.divider}`,
            bgcolor: "background.paper",
          }}
        >
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
            sx={{ borderRadius: 99, boxShadow: "none", px: 2.25 }}
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
            display: "flex",
            flexDirection: "column",
            backgroundColor: "background.default",
            overflow: "hidden",
          }}
        >
<Box
  component="header"
  sx={{
    height: 72,
    px: 3,
    display: "flex",
    alignItems: "center",
    gap: 2,
borderBottom: (theme) =>
  `1px solid ${
    theme.palette.mode === "dark"
      ? alpha("#FFFFFF", 0.08)
      : alpha(theme.palette.divider, 0.72)
  }`,
    backgroundColor: (theme) =>
      theme.palette.mode === "dark"
        ? alpha(theme.palette.background.paper, 0.76)
        : alpha(theme.palette.background.paper, 0.94),
    backgroundImage: (theme) =>
      theme.palette.mode === "dark"
        ? `linear-gradient(180deg, ${alpha(
            theme.palette.common.white,
            0.035
          )} 0%, ${alpha(theme.palette.common.white, 0.012)} 100%)`
        : `linear-gradient(180deg, ${alpha(
            theme.palette.common.white,
            0.82
          )} 0%, ${alpha(theme.palette.common.white, 0.54)} 100%)`,
boxShadow: (theme) =>
  theme.palette.mode === "dark"
    ? `inset 0 -1px 0 ${alpha("#FFFFFF", 0.025)}`
    : `inset 0 -1px 0 ${alpha(theme.palette.common.black, 0.035)}`,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    flexShrink: 0,
  }}
>
  <GlobalSearch />

  <Box sx={{ flex: 1 }} />

  <Paper
    elevation={0}
    sx={{
      display: {
        xs: "none",
        lg: "flex",
      },
      alignItems: "center",
      gap: 1,
      px: 1.15,
      py: 0.7,
      borderRadius: 999,
      border: (theme) =>
        `1px solid ${alpha(theme.palette.divider, 0.72)}`,
      backgroundColor: (theme) =>
        theme.palette.mode === "dark"
          ? alpha(theme.palette.common.white, 0.045)
          : alpha(theme.palette.common.white, 0.72),
      boxShadow: (theme) =>
        theme.palette.mode === "dark"
          ? `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.04)}`
          : `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.82)}`,
    }}
  >
    <Box
      sx={{
        width: 28,
        height: 28,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.16),
        color: "primary.main",
        fontSize: 12,
        fontWeight: 900,
        textTransform: "uppercase",
        border: (theme) =>
          `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
      }}
    >
      {safeTrim(appUser?.displayName || "U").slice(0, 1)}
    </Box>

    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          lineHeight: 1.1,
          fontWeight: 850,
          color: "text.primary",
          maxWidth: 180,
          letterSpacing: "-0.01em",
        }}
        noWrap
      >
        {appUser?.displayName || "Unknown User"}
      </Typography>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          lineHeight: 1.1,
          textTransform: "capitalize",
          fontWeight: 600,
        }}
        noWrap
      >
        {appUser?.role || "No Role"}
      </Typography>
    </Box>
  </Paper>
</Box>

          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
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