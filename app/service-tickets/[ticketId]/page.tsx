// app/service-tickets/[ticketId]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import {
  canCancelTrip,
  canEditTripSchedule,
  canFinishTrip,
  canPauseTrip,
  canResumeTrip,
  canStartTrip,
  formatLifecycleTripStatus,
  getManualTicketStatusError,
  hasInProgressTrips,
  hasOpenTrips,
  isTicketTerminal,
  normalizeTripStatus,
} from "../../../src/lib/service-ticket-lifecycle";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";
import type { AppUser } from "../../../src/types/app-user";
import type {
  ServiceTicket,
  ServiceTicketStatus,
} from "../../../src/types/service-ticket";

type Props = {
  params: Promise<{ ticketId: string }>;
};

type TicketStatus = ServiceTicketStatus;

type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

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

type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

type TripMaterial = {
  name: string;
  qty: number;
  unit?: string;
  notes?: string;
};

type TripDoc = {
  id: string;
  active: boolean;
  type: "service" | "project";
  status: string;
  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;
  crew?: TripCrew | null;
  crewConfirmed?: TripCrew | null;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  };
  notes?: string | null;
  cancelReason?: string | null;
  timerState?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  startedByUid?: string | null;
  endedByUid?: string | null;
  pauseBlocks?: PauseBlock[];
  actualMinutes?: number | null;
  billableHours?: number | null;
  workNotes?: string | null;
  resolutionNotes?: string | null;
  followUpNotes?: string | null;
  materials?: TripMaterial[] | null;
  noMaterialsUsed?: boolean | null;
  outcome?: "resolved" | "follow_up" | string | null;
  readyToBillAt?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

type BillingPacket = {
  status:
    | "not_ready"
    | "ready_to_bill"
    | "creating_invoice"
    | "invoice_failed"
    | "invoiced";
  readyToBillAt: string | null;
  readyToBillTripId: string | null;
  resolutionNotes: string | null;
  workNotes: string | null;
  labor: {
    totalHours: number;
    byCrew: Array<{
      uid: string;
      name: string;
      role: "technician";
      hours: number;
    }>;
  };
  materials: TripMaterial[];
  materialsSummary?: string | null;
  materialsAmount?: number | null;
  photos: Array<{ url: string; caption?: string }>;
  invoiceSource?: "manual" | "qbo" | null;
  qboInvoiceId?: string | null;
  qboDocNumber?: string | null;
  qboInvoiceUrl?: string | null;
  qboSyncedAt?: string | null;
  qboInvoiceStatus?: string | null;
  invoiceError?: string | null;
  updatedAt: string;
};

type TicketWithBilling = ServiceTicket & {
  billing?: BillingPacket | null;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

type EmployeeProfileOption = {
  id: string;
  userUid?: string | null;
  displayName?: string;
  employmentStatus?: string;
  laborRole?: string;
  defaultPairedTechUid?: string | null;
};

type FinishMode = "none" | "follow_up" | "resolved";

type ExistingTimeEntry = {
  hours?: number;
  hoursLocked?: boolean;
  createdAt?: string;
  createdByUid?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmmLocal(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function addMinutes(date: Date, mins: number) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

function roundToHalf(hours: number) {
  return Math.round(hours * 2) / 2;
}

function normalizeRole(role?: string) {
  return String(role || "").trim().toLowerCase();
}

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((x) => stripUndefined(x)) as unknown as T;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return obj;
}

function formatTicketStatus(value?: string) {
  switch (String(value || "").toLowerCase()) {
    case "new":
      return "New";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "follow_up":
      return "Follow Up";
    case "completed":
      return "Completed";
    case "invoiced":
      return "Invoiced";
    case "cancelled":
      return "Cancelled";
    default:
      return value || "—";
  }
}

function formatBillingPacketStatus(value?: string) {
  switch (String(value || "").toLowerCase()) {
    case "not_ready":
      return "Not Ready";
    case "ready_to_bill":
      return "Ready to Bill";
    case "creating_invoice":
      return "Creating Invoice";
    case "invoice_failed":
      return "Invoice Failed";
    case "invoiced":
      return "Invoiced";
    default:
      return value || "—";
  }
}

function getBillingTone(
  value?: string
): "default" | "success" | "warning" | "error" | "info" {
  const v = String(value || "").toLowerCase();
  if (v === "invoiced") return "success";
  if (v === "ready_to_bill") return "warning";
  if (v === "creating_invoice") return "info";
  if (v === "invoice_failed") return "error";
  return "default";
}

function buildMaterialsSummaryFromLines(materials?: TripMaterial[] | null) {
  const items = Array.isArray(materials) ? materials : [];
  return items
    .filter((m) => String(m?.name || "").trim())
    .map((m) => {
      const qty = Number(m.qty || 0);
      const unit = String(m.unit || "").trim();
      return `${qty > 0 ? `${qty} of ` : ""}${String(m.name || "").trim()}${
        unit ? ` (${unit})` : ""
      }`;
    })
    .join(", ");
}

function mergeTripMaterials(trips: TripDoc[]) {
  return trips
    .flatMap((trip) => (Array.isArray(trip.materials) ? trip.materials : []))
    .filter((item) => String(item?.name || "").trim());
}

function getDefaultBillableHours(actualMinutes: number) {
  const safeMinutes = Math.max(0, Number(actualMinutes || 0));
  return Math.max(1, roundToHalf(safeMinutes / 60));
}

function getStoredOrComputedBillableHours(
  trip: Pick<TripDoc, "billableHours" | "actualMinutes">
) {
  const stored = Number(trip.billableHours);
  if (Number.isFinite(stored) && stored > 0) {
    return roundToHalf(stored);
  }
  return getDefaultBillableHours(Number(trip.actualMinutes || 0));
}

function buildBillingPacketFromResolvedTrips(args: {
  trips: TripDoc[];
  fallbackUpdatedAt: string;
}) {
  const completedTrips = args.trips
    .filter((trip) => trip.active !== false)
    .filter((trip) => normalizeTripStatus(trip.status) === "complete");

  const resolvedTrips = completedTrips.filter(
    (trip) => String(trip.outcome || "").trim().toLowerCase() === "resolved"
  );

  if (completedTrips.length === 0 || resolvedTrips.length === 0) {
    return null;
  }

  const totalHours = completedTrips.reduce(
    (sum, trip) => sum + getStoredOrComputedBillableHours(trip),
    0
  );

  const materials = mergeTripMaterials(completedTrips);
  const materialsSummary = buildMaterialsSummaryFromLines(materials) || null;

  const uniqueResolutionNotes = Array.from(
    new Set(
      resolvedTrips
        .map((trip) => String(trip.resolutionNotes || "").trim())
        .filter(Boolean)
    )
  );

  const uniqueWorkNotes = Array.from(
    new Set(
      completedTrips
        .map((trip) => String(trip.workNotes || "").trim())
        .filter(Boolean)
    )
  );

  const latestResolvedTrip = [...resolvedTrips].sort((a, b) => {
    const aTime = Date.parse(String(a.readyToBillAt || a.updatedAt || ""));
    const bTime = Date.parse(String(b.readyToBillAt || b.updatedAt || ""));
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0];

  return {
    status: "ready_to_bill" as const,
    readyToBillAt:
      latestResolvedTrip?.readyToBillAt ||
      latestResolvedTrip?.updatedAt ||
      args.fallbackUpdatedAt,
    readyToBillTripId: latestResolvedTrip?.id || null,
    resolutionNotes: uniqueResolutionNotes.join("\n\n") || null,
    workNotes: uniqueWorkNotes.join("\n\n") || null,
    labor: {
      totalHours: roundToHalf(totalHours),
      byCrew: [],
    },
    materials,
    materialsSummary,
    materialsAmount: null,
    photos: [],
    invoiceSource: null,
    qboInvoiceId: null,
    qboDocNumber: null,
    qboInvoiceUrl: null,
    qboSyncedAt: null,
    qboInvoiceStatus: null,
    invoiceError: null,
    updatedAt: args.fallbackUpdatedAt,
  };
}

function validateTripMaterialsCapture(args: {
  materials: TripMaterial[];
  noMaterialsUsed: boolean;
}) {
  const cleaned = (args.materials || [])
    .map((m) => ({
      name: String(m.name || "").trim(),
      qty: Number(m.qty),
      unit: String(m.unit || "").trim(),
      notes: String(m.notes || "").trim(),
    }))
    .filter((m) => m.name);

  for (const m of cleaned) {
    if (!Number.isFinite(m.qty) || m.qty <= 0) {
      return {
        ok: false as const,
        message: `Material "${m.name}" must have qty > 0.`,
      };
    }
  }

  if (!args.noMaterialsUsed && cleaned.length < 1) {
    return {
      ok: false as const,
      message: "Add at least 1 material line item or check No materials used.",
    };
  }

  return { ok: true as const, cleaned };
}

function formatTripWindow(value?: string) {
  if (value === "am") return "AM";
  if (value === "pm") return "PM";
  if (value === "all_day") return "All Day";
  if (value === "custom") return "Custom";
  return value || "—";
}

function windowToTimes(window: TripTimeWindow) {
  if (window === "am") return { start: "08:00", end: "12:00" };
  if (window === "pm") return { start: "13:00", end: "17:00" };
  if (window === "all_day") return { start: "08:00", end: "17:00" };
  return { start: "09:00", end: "10:00" };
}

function minutesBetweenIso(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function sumPausedMinutes(blocks?: PauseBlock[], openPauseEndIso?: string) {
  if (!Array.isArray(blocks)) return 0;

  let total = 0;

  for (const block of blocks) {
    if (!block?.startAt) continue;

    const effectiveEnd = block.endAt || openPauseEndIso;
    if (!effectiveEnd) continue;

    total += minutesBetweenIso(block.startAt, effectiveEnd);
  }

  return total;
}

function isUidOnTripCrew(uid: string, crew?: TripCrew | null) {
  if (!uid || !crew) return false;
  return (
    crew.primaryTechUid === uid ||
    crew.helperUid === uid ||
    crew.secondaryTechUid === uid ||
    crew.secondaryHelperUid === uid
  );
}

function crewMembersFromTrip(trip: {
  crewConfirmed?: TripCrew | null;
  crew?: TripCrew | null;
}) {
  const crew = trip.crewConfirmed || trip.crew || {};
  const out: Array<{ uid: string; name: string; role: "technician" | "helper" }> =
    [];

  if (crew.primaryTechUid) {
    out.push({
      uid: crew.primaryTechUid,
      name: crew.primaryTechName || "Primary Tech",
      role: "technician",
    });
  }

  if (crew.helperUid) {
    out.push({
      uid: crew.helperUid,
      name: crew.helperName || "Helper",
      role: "helper",
    });
  }

  if (crew.secondaryTechUid) {
    out.push({
      uid: crew.secondaryTechUid,
      name: crew.secondaryTechName || "Secondary Tech",
      role: "technician",
    });
  }

  if (crew.secondaryHelperUid) {
    out.push({
      uid: crew.secondaryHelperUid,
      name: crew.secondaryHelperName || "Secondary Helper",
      role: "helper",
    });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    if (!x.uid || seen.has(x.uid)) return false;
    seen.add(x.uid);
    return true;
  });
}

function isOpenTripRecord(tripLike: {
  active?: boolean | null;
  status?: string | null;
}) {
  if (tripLike.active === false) return false;
  const status = normalizeTripStatus(tripLike.status);
  return status === "planned" || status === "in_progress";
}

function isRunningTripRecord(tripLike: {
  active?: boolean | null;
  status?: string | null;
  timerState?: string | null;
}) {
  if (tripLike.active === false) return false;
  const status = normalizeTripStatus(tripLike.status);
  const timerState = String(tripLike.timerState || "").trim().toLowerCase();
  return status === "in_progress" && timerState === "running";
}

function normalizeTripTimerState(trip?: TripDoc | null) {
  const timer = String(trip?.timerState || "").toLowerCase().trim();
  const status = String(trip?.status || "").toLowerCase().trim();

  if (timer === "running" || timer === "paused" || timer === "complete") return timer;
  if (status === "in_progress") return "running";
  if (
    status === "complete" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return "complete";
  }

  return "not_started";
}

function isTripRunning(trip?: TripDoc | null) {
  return normalizeTripTimerState(trip) === "running";
}

function isTripPaused(trip?: TripDoc | null) {
  return normalizeTripTimerState(trip) === "paused";
}

function canCurrentUserQuickStartTrip(args: {
  trip: TripDoc;
  role?: AppUser["role"];
  uid: string;
  canStartTripRole: boolean;
}) {
  const { trip, role, uid, canStartTripRole } = args;

  if (!canStartTripRole || !uid) return false;
  if (isTripRunning(trip) || isTripPaused(trip)) return false;

  const status = String(trip.status || "").toLowerCase().trim();
  if (status === "cancelled" || status === "complete" || status === "completed") {
    return false;
  }

  if (role === "admin") return true;
  return isUidOnTripCrew(uid, trip.crew || null);
}

function crewUidsFromCrew(crew?: TripCrew | null) {
  return Array.from(
    new Set(
      [
        String(crew?.primaryTechUid || "").trim(),
        String(crew?.helperUid || "").trim(),
        String(crew?.secondaryTechUid || "").trim(),
        String(crew?.secondaryHelperUid || "").trim(),
      ].filter(Boolean)
    )
  );
}

async function findOpenTripsForTicketId(
  serviceTicketId: string,
  excludeTripId?: string
) {
  if (!serviceTicketId) return [];

  const queriesToRun = [
    query(collection(db, "trips"), where("link.serviceTicketId", "==", serviceTicketId)),
    query(collection(db, "trips"), where("serviceTicketId", "==", serviceTicketId)),
  ];

  const snaps = await Promise.all(
    queriesToRun.map(async (qTrips) => {
      try {
        return await getDocs(qTrips);
      } catch {
        return null;
      }
    })
  );

  const byId = new Map<
    string,
    {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      timerState: string;
    }
  >();

  for (const snap of snaps) {
    if (!snap) continue;

    for (const docSnap of snap.docs) {
      if (excludeTripId && docSnap.id === excludeTripId) continue;

      const data = docSnap.data() as any;
      if (!isOpenTripRecord(data)) continue;

      byId.set(docSnap.id, {
        id: docSnap.id,
        date: String(data.date || ""),
        startTime: String(data.startTime || ""),
        endTime: String(data.endTime || ""),
        status: String(data.status || ""),
        timerState: String(data.timerState || ""),
      });
    }
  }

  return Array.from(byId.values());
}

async function findRunningTripsForCrewUids(args: {
  crewUids: string[];
  excludeTripId?: string;
}) {
  const cleanUids = Array.from(new Set((args.crewUids || []).filter(Boolean)));
  if (cleanUids.length === 0) return [];

  const fieldPaths = [
    "crew.primaryTechUid",
    "crew.helperUid",
    "crew.secondaryTechUid",
    "crew.secondaryHelperUid",
    "primaryTechUid",
    "helperUid",
    "secondaryTechUid",
    "secondaryHelperUid",
  ];

  const queryPromises: Promise<any>[] = [];

  for (const uid of cleanUids) {
    for (const fieldPath of fieldPaths) {
      queryPromises.push(
        getDocs(
          query(collection(db, "trips"), where(fieldPath as any, "==", uid))
        ).catch(() => null)
      );
    }
  }

  const snaps = await Promise.all(queryPromises);

  const byId = new Map<
    string,
    {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      timerState: string;
      primaryName: string;
      summary: string;
    }
  >();

  for (const snap of snaps) {
    if (!snap) continue;

    for (const docSnap of snap.docs) {
      if (args.excludeTripId && docSnap.id === args.excludeTripId) continue;

      const data = docSnap.data() as any;
      if (!isRunningTripRecord(data)) continue;

      const crew = (data.crew || {}) as TripCrew;
      const primaryName =
        crew.primaryTechName ||
        data.primaryTechName ||
        data.primaryTechnicianName ||
        "Assigned Tech";

      byId.set(docSnap.id, {
        id: docSnap.id,
        date: String(data.date || ""),
        startTime: String(data.startTime || ""),
        endTime: String(data.endTime || ""),
        status: String(data.status || ""),
        timerState: String(data.timerState || ""),
        primaryName,
        summary: `${String(data.date || "No date")} • ${String(
          data.startTime || "—"
        )}-${String(data.endTime || "—")} • ${primaryName} • Trip ${docSnap.id}`,
      });
    }
  }

  return Array.from(byId.values());
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

async function upsertWeeklyTimesheetHeader(args: {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  weekStartDate: string;
  weekEndDate: string;
  createdByUid: string | null;
}) {
  const now = nowIso();
  const timesheetId = buildWeeklyTimesheetId(args.employeeId, args.weekStartDate);

  await setDoc(
    doc(db, "weeklyTimesheets", timesheetId),
    stripUndefined({
      employeeId: args.employeeId,
      employeeName: args.employeeName,
      employeeRole: args.employeeRole,
      weekStartDate: args.weekStartDate,
      weekEndDate: args.weekEndDate,
      status: "draft",
      createdAt: now,
      createdByUid: args.createdByUid || null,
      updatedAt: now,
      updatedByUid: args.createdByUid || null,
    }),
    { merge: true }
  );

  return timesheetId;
}

async function upsertTimeEntryFromTrip(args: {
  trip: TripDoc;
  member: { uid: string; name: string; role: "technician" | "helper" };
  entryDate: string;
  hoursGenerated: number;
  weekStartDate: string;
  weekEndDate: string;
  timesheetId: string;
  createdByUid: string | null;
  displayTitle: string;
  displaySubtitle: string;
  outcomeLabel: string;
  addressShort?: string;
}) {
  const now = nowIso();
  const timeEntryId = `trip_${args.trip.id}_${args.member.uid}`;
  const ref = doc(db, "timeEntries", timeEntryId);
  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists()
    ? (existingSnap.data() as ExistingTimeEntry)
    : null;
  const hoursLocked = Boolean(existing?.hoursLocked);
  const hoursToWrite = hoursLocked
    ? Number(existing?.hours ?? args.hoursGenerated)
    : args.hoursGenerated;

  const noteLines: string[] = [];
  if (args.displayTitle) noteLines.push(`Title: ${args.displayTitle}`);
  if (args.displaySubtitle) noteLines.push(`Detail: ${args.displaySubtitle}`);
  if (args.addressShort) noteLines.push(`Address: ${args.addressShort}`);
  if (args.outcomeLabel) noteLines.push(`Outcome: ${args.outcomeLabel}`);
  noteLines.push(`Trip: ${args.trip.id}`);

  await setDoc(
    ref,
    stripUndefined({
      employeeId: args.member.uid,
      employeeName: args.member.name,
      employeeRole: args.member.role,
      entryDate: args.entryDate,
      weekStartDate: args.weekStartDate,
      weekEndDate: args.weekEndDate,
      timesheetId: args.timesheetId,
      category: args.trip.type === "project" ? "project_stage" : "service_ticket",
      payType: "regular",
      billable: true,
      source: "trip_completion",
      hours: hoursToWrite,
      hoursSource: args.hoursGenerated,
      hoursLocked,
      tripId: args.trip.id,
      serviceTicketId: args.trip.link?.serviceTicketId || null,
      projectId: args.trip.link?.projectId || null,
      projectStageKey: args.trip.link?.projectStageKey || null,
      displayTitle: args.displayTitle || null,
      displaySubtitle: args.displaySubtitle || null,
      outcome: args.outcomeLabel.toLowerCase().replaceAll(" ", "_"),
      entryStatus: "draft",
      notes: noteLines.join("\n"),
      createdAt: existingSnap.exists() ? existing?.createdAt ?? now : now,
      createdByUid: existingSnap.exists()
        ? existing?.createdByUid ?? null
        : args.createdByUid || null,
      updatedAt: now,
      updatedByUid: args.createdByUid || null,
    }),
    { merge: true }
  );
}

function getTicketTone(
  status?: string
): "default" | "success" | "warning" | "error" | "info" {
  const s = String(status || "").toLowerCase();
  if (s === "invoiced") return "success";
  if (s === "completed") return "success";
  if (s === "in_progress") return "info";
  if (s === "scheduled" || s === "follow_up") return "warning";
  if (s === "cancelled") return "error";
  return "default";
}

function getTripTone(
  status?: string
): "default" | "success" | "warning" | "error" | "info" {
  const s = normalizeTripStatus(status);
  if (s === "complete") return "success";
  if (s === "in_progress") return "info";
  if (s === "planned") return "warning";
  if (s === "cancelled") return "error";
  return "default";
}

function Section(props: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4 }}>
      <CardHeader
        avatar={props.icon}
        action={props.action}
        title={
          <Typography variant="h6" fontWeight={700}>
            {props.title}
          </Typography>
        }
      />
      <Divider />
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

export default function ServiceTicketDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canWorkTrip =
    appUser?.role === "admin" ||
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const canStartTripRole =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "technician";

  const canBill =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "billing";

  const isFieldUser =
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const myUid = appUser?.uid || "";

  const [mobileFinishTripId, setMobileFinishTripId] = useState<string | null>(null);
  const [mobileFinishMode, setMobileFinishMode] = useState<FinishMode>("none");
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<TicketWithBilling | null>(null);
  const [error, setError] = useState("");

    const isInvoicedTicket = ticket?.status === "invoiced";

  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);

  const [trips, setTrips] = useState<TripDoc[]>([]);
  const [tripActionSaving, setTripActionSaving] = useState<Record<string, boolean>>(
    {}
  );
  const [tripActionError, setTripActionError] = useState<Record<string, string>>({});
  const [tripActionSuccess, setTripActionSuccess] = useState<Record<string, string>>(
    {}
  );
  const [tripWorkNotes, setTripWorkNotes] = useState<Record<string, string>>({});
  const [tripResolutionNotes, setTripResolutionNotes] = useState<Record<string, string>>(
    {}
  );
  const [tripFollowUpNotes, setTripFollowUpNotes] = useState<Record<string, string>>(
    {}
  );
  const [tripMaterials, setTripMaterials] = useState<Record<string, TripMaterial[]>>(
    {}
  );
  const [tripNoMaterialsUsed, setTripNoMaterialsUsed] = useState<
    Record<string, boolean>
  >({});
  const [finishModeByTrip, setFinishModeByTrip] = useState<Record<string, FinishMode>>(
    {}
  );
  const [hoursOverrideByTrip, setHoursOverrideByTrip] = useState<
    Record<string, number>
  >({});
  const [helperConfirmedByTrip, setHelperConfirmedByTrip] = useState<
    Record<string, boolean>
  >({});

  const [ticketStatusEdit, setTicketStatusEdit] = useState<TicketStatus>("new");
  const [ticketEstimatedMinutesEdit, setTicketEstimatedMinutesEdit] =
    useState("240");
  const [ticketIssueSummaryEdit, setTicketIssueSummaryEdit] = useState("");
  const [ticketIssueDetailsEdit, setTicketIssueDetailsEdit] = useState("");
  const [ticketEditSaving, setTicketEditSaving] = useState(false);
  const [ticketEditErr, setTicketEditErr] = useState("");
  const [ticketEditOk, setTicketEditOk] = useState("");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [tripDate, setTripDate] = useState(isoTodayLocal());
  const [tripTimeWindow, setTripTimeWindow] = useState<TripTimeWindow>("am");
  const [tripStartTime, setTripStartTime] = useState("08:00");
  const [tripEndTime, setTripEndTime] = useState("12:00");
  const [tripPrimaryTechUid, setTripPrimaryTechUid] = useState("");
  const [tripSecondaryTechUid, setTripSecondaryTechUid] = useState("");
  const [tripUseDefaultHelper, setTripUseDefaultHelper] = useState(true);
  const [tripHelperUid, setTripHelperUid] = useState("");
  const [tripSecondaryHelperUid, setTripSecondaryHelperUid] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [tripSaving, setTripSaving] = useState(false);
  const [tripSaveError, setTripSaveError] = useState("");
  const [tripSaveSuccess, setTripSaveSuccess] = useState("");

  const [editTripId, setEditTripId] = useState<string | null>(null);
  const [editTripDate, setEditTripDate] = useState(isoTodayLocal());
  const [editTripTimeWindow, setEditTripTimeWindow] = useState<TripTimeWindow>("am");
  const [editTripStartTime, setEditTripStartTime] = useState("08:00");
  const [editTripEndTime, setEditTripEndTime] = useState("12:00");
  const [editTripNotes, setEditTripNotes] = useState("");
  const [editTripSaving, setEditTripSaving] = useState(false);
  const [editTripErr, setEditTripErr] = useState("");
  const [editTripPrimaryTechUid, setEditTripPrimaryTechUid] = useState("");
  const [editTripSecondaryTechUid, setEditTripSecondaryTechUid] = useState("");
  const [editTripUseDefaultHelper, setEditTripUseDefaultHelper] = useState(true);
  const [editTripHelperUid, setEditTripHelperUid] = useState("");
  const [editTripSecondaryHelperUid, setEditTripSecondaryHelperUid] = useState("");

  const [billingSaving, setBillingSaving] = useState(false);
  const [billingErr, setBillingErr] = useState("");
  const [billingOk, setBillingOk] = useState("");
  const [billingMaterialsSummaryEdit, setBillingMaterialsSummaryEdit] = useState("");
  const [billingMaterialsAmountEdit, setBillingMaterialsAmountEdit] = useState("");

  const helperCandidates = useMemo(() => {
    const items = employeeProfiles
      .filter(
        (p) => String(p.employmentStatus || "current").toLowerCase() === "current"
      )
      .filter((p) => {
        const labor = normalizeRole(p.laborRole);
        return labor === "helper" || labor === "apprentice";
      })
      .map((p) => ({
        uid: String(p.userUid || "").trim(),
        name: p.displayName || "Unnamed",
        laborRole: normalizeRole(p.laborRole),
        defaultPairedTechUid: p.defaultPairedTechUid ?? null,
      }))
      .filter((p) => p.uid);

    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [employeeProfiles]);

  const defaultHelperForPrimary = useMemo(() => {
    const techUid = tripPrimaryTechUid.trim();
    if (!techUid) return "";
    return (
      helperCandidates.find(
        (h) => String(h.defaultPairedTechUid || "").trim() === techUid
      )?.uid || ""
    );
  }, [tripPrimaryTechUid, helperCandidates]);

  const defaultHelperForEditPrimary = useMemo(() => {
    const techUid = editTripPrimaryTechUid.trim();
    if (!techUid) return "";
    return (
      helperCandidates.find(
        (h) => String(h.defaultPairedTechUid || "").trim() === techUid
      )?.uid || ""
    );
  }, [editTripPrimaryTechUid, helperCandidates]);

  useEffect(() => {
    if (!editTripUseDefaultHelper) return;
    if (!editTripPrimaryTechUid.trim()) {
      setEditTripHelperUid("");
      return;
    }
    setEditTripHelperUid(defaultHelperForEditPrimary);
  }, [editTripUseDefaultHelper, editTripPrimaryTechUid, defaultHelperForEditPrimary]);

  useEffect(() => {
  if (!ticket?.billing) {
    setBillingMaterialsSummaryEdit("");
    setBillingMaterialsAmountEdit("");
    return;
  }

  const summary =
    String(ticket.billing.materialsSummary || "").trim() ||
    buildMaterialsSummaryFromLines(ticket.billing.materials);

  setBillingMaterialsSummaryEdit(summary);

  const amount =
    typeof ticket.billing.materialsAmount === "number" &&
    Number.isFinite(ticket.billing.materialsAmount)
      ? String(ticket.billing.materialsAmount)
      : "";

  setBillingMaterialsAmountEdit(amount);
}, [ticket?.billing]);

  useEffect(() => {
    async function loadAll() {
      try {
        const resolved = await params;
        const id = resolved.ticketId;
        setTicketId(id);

        const ticketSnap = await getDoc(doc(db, "serviceTickets", id));
        if (!ticketSnap.exists()) {
          setError("Service ticket not found.");
          setLoading(false);
          return;
        }

        const d = ticketSnap.data() as any;
const nextTicket: TicketWithBilling = {
  id: ticketSnap.id,
  customerId: d.customerId ?? "",
  customerDisplayName: d.customerDisplayName ?? "",
  serviceAddressLabel: d.serviceAddressLabel ?? undefined,
  serviceAddressLine1: d.serviceAddressLine1 ?? "",
  serviceAddressLine2: d.serviceAddressLine2 ?? undefined,
  serviceCity: d.serviceCity ?? "",
  serviceState: d.serviceState ?? "",
  servicePostalCode: d.servicePostalCode ?? "",
  issueSummary: d.issueSummary ?? "",
  issueDetails: d.issueDetails ?? undefined,
  status: (d.status ?? "new") as ServiceTicketStatus,
  estimatedDurationMinutes: d.estimatedDurationMinutes ?? 60,
  assignedTechnicianId: d.assignedTechnicianId ?? undefined,
  assignedTechnicianName: d.assignedTechnicianName ?? undefined,
  primaryTechnicianId: d.primaryTechnicianId ?? undefined,
  assignedTechnicianIds: Array.isArray(d.assignedTechnicianIds)
    ? d.assignedTechnicianIds
    : undefined,
  secondaryTechnicianId: d.secondaryTechnicianId ?? undefined,
  secondaryTechnicianName: d.secondaryTechnicianName ?? undefined,
  helperIds: Array.isArray(d.helperIds) ? d.helperIds : undefined,
  helperNames: Array.isArray(d.helperNames) ? d.helperNames : undefined,
  active: d.active ?? true,
  createdAt: d.createdAt ?? undefined,
  updatedAt: d.updatedAt ?? undefined,
  billing: d.billing ?? null,
};

        setTicket(nextTicket);
        setTicketStatusEdit((nextTicket.status || "new") as TicketStatus);
        setTicketEstimatedMinutesEdit(
          String(nextTicket.estimatedDurationMinutes || 60)
        );
        setTicketIssueSummaryEdit(String(nextTicket.issueSummary || ""));
        setTicketIssueDetailsEdit(String(nextTicket.issueDetails || ""));

        const [usersSnap, profilesSnap, tripSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "employeeProfiles")),
          getDocs(
            query(
              collection(db, "trips"),
              where("link.serviceTicketId", "==", id),
              orderBy("date", "asc"),
              orderBy("startTime", "asc")
            )
          ),
        ]);

        setTechnicians(
          usersSnap.docs
            .map((ds) => {
              const user = ds.data() as any;
              return {
                uid: user.uid ?? ds.id,
                displayName: user.displayName ?? "Unnamed Technician",
                active: user.active ?? false,
                role: user.role ?? "technician",
              };
            })
            .filter((u) => u.active && u.role === "technician")
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
        );

        setEmployeeProfiles(
          profilesSnap.docs.map((ds) => {
            const p = ds.data() as any;
            return {
              id: ds.id,
              userUid: p.userUid ?? null,
              displayName: p.displayName ?? undefined,
              employmentStatus: p.employmentStatus ?? "current",
              laborRole: p.laborRole ?? "other",
              defaultPairedTechUid: p.defaultPairedTechUid ?? null,
            };
          })
        );

        const nextTrips = tripSnap.docs.map((ds) => {
          const trip = ds.data() as any;
          return {
            id: ds.id,
            active: trip.active ?? true,
            type: trip.type ?? "service",
            status: trip.status ?? "planned",
            date: trip.date ?? "",
            timeWindow: trip.timeWindow ?? "custom",
            startTime: trip.startTime ?? "",
            endTime: trip.endTime ?? "",
            crew: trip.crew ?? null,
            crewConfirmed: trip.crewConfirmed ?? null,
            link: trip.link ?? undefined,
            notes: trip.notes ?? null,
            cancelReason: trip.cancelReason ?? null,
            timerState: trip.timerState ?? "not_started",
            actualStartAt: trip.actualStartAt ?? null,
            actualEndAt: trip.actualEndAt ?? null,
            startedByUid: trip.startedByUid ?? null,
            endedByUid: trip.endedByUid ?? null,
            pauseBlocks: Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [],
            actualMinutes:
              typeof trip.actualMinutes === "number" ? trip.actualMinutes : null,
            billableHours:
              typeof trip.billableHours === "number" ? trip.billableHours : null,
            workNotes: trip.workNotes ?? null,
            resolutionNotes: trip.resolutionNotes ?? null,
            followUpNotes: trip.followUpNotes ?? null,
            materials: Array.isArray(trip.materials) ? trip.materials : [],
            noMaterialsUsed: Boolean(trip.noMaterialsUsed),
            outcome: trip.outcome ?? null,
            readyToBillAt: trip.readyToBillAt ?? null,
            updatedAt: trip.updatedAt ?? undefined,
            updatedByUid: trip.updatedByUid ?? null,
          } as TripDoc;
        });

        setTrips(nextTrips);

        const nextWork: Record<string, string> = {};
        const nextResolution: Record<string, string> = {};
        const nextFollow: Record<string, string> = {};
        const nextMaterials: Record<string, TripMaterial[]> = {};
        const nextNoMaterials: Record<string, boolean> = {};
        const nextFinish: Record<string, FinishMode> = {};
        const nextHelperConfirmed: Record<string, boolean> = {};

        for (const trip of nextTrips) {
          nextWork[trip.id] = String(trip.workNotes || "");
          nextResolution[trip.id] = String(trip.resolutionNotes || "");
          nextFollow[trip.id] = String(trip.followUpNotes || "");
          nextMaterials[trip.id] = Array.isArray(trip.materials) ? trip.materials : [];
          nextNoMaterials[trip.id] = Boolean(trip.noMaterialsUsed);
          nextFinish[trip.id] = "none";
          nextHelperConfirmed[trip.id] = true;
        }

        setTripWorkNotes(nextWork);
        setTripResolutionNotes(nextResolution);
        setTripFollowUpNotes(nextFollow);
        setTripMaterials(nextMaterials);
        setTripNoMaterialsUsed(nextNoMaterials);
        setFinishModeByTrip(nextFinish);
        setHelperConfirmedByTrip(nextHelperConfirmed);

        const customerId = String(nextTicket.customerId || "").trim();
        if (customerId) {
          const customerSnap = await getDoc(doc(db, "customers", customerId));
          if (customerSnap.exists()) {
            const customer = customerSnap.data() as any;
            setCustomerPhone(String(customer.phone || "").trim());
            setCustomerEmail(String(customer.email || "").trim());
          }
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load service ticket."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [params]);

  useEffect(() => {
    if (tripTimeWindow !== "custom") {
      const times = windowToTimes(tripTimeWindow);
      setTripStartTime(times.start);
      setTripEndTime(times.end);
    }
  }, [tripTimeWindow]);

  useEffect(() => {
    if (!tripUseDefaultHelper) return;
    if (!tripPrimaryTechUid.trim()) {
      setTripHelperUid("");
      return;
    }
    setTripHelperUid(defaultHelperForPrimary);
  }, [tripUseDefaultHelper, tripPrimaryTechUid, defaultHelperForPrimary]);

  function findTechName(uid: string) {
    return technicians.find((t) => t.uid === uid)?.displayName || "";
  }

  function findHelperName(uid: string) {
    return helperCandidates.find((h) => h.uid === uid)?.name || "";
  }

function deriveNextTicketStatus(
  nextTrips: TripDoc[],
  lastCompletedOutcome?: string | null
): TicketStatus {
  const activeTrips = nextTrips.filter((trip) => trip.active !== false);

  if (activeTrips.length === 0) {
    return "new";
  }

  const sortedTrips = [...activeTrips].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;

    const startCompare = String(a.startTime || "").localeCompare(String(b.startTime || ""));
    if (startCompare !== 0) return startCompare;

    const updatedCompare = String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
    if (updatedCompare !== 0) return updatedCompare;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  const hasInProgress = sortedTrips.some(
    (trip) => normalizeTripStatus(trip.status) === "in_progress"
  );
  if (hasInProgress) {
    return "in_progress";
  }

  const openTrips = sortedTrips.filter((trip) => isOpenTripRecord(trip));
  if (openTrips.length > 0) {
    const hasCompletedFollowUpHistory = sortedTrips.some(
      (trip) =>
        normalizeTripStatus(trip.status) === "complete" &&
        String(trip.outcome || "").trim().toLowerCase() === "follow_up"
    );

    return hasCompletedFollowUpHistory || ticket?.status === "follow_up"
      ? "follow_up"
      : "scheduled";
  }

  const completedTrips = sortedTrips.filter(
    (trip) => normalizeTripStatus(trip.status) === "complete"
  );

  if (completedTrips.length > 0) {
    const latestCompletedTrip = completedTrips[completedTrips.length - 1];
    const finalOutcome = String(
      lastCompletedOutcome ??
        latestCompletedTrip.outcome ??
        (latestCompletedTrip.readyToBillAt ? "resolved" : "")
    )
      .trim()
      .toLowerCase();

    if (finalOutcome === "resolved") {
      return ticket?.status === "invoiced" ? "invoiced" : "completed";
    }

    if (finalOutcome === "follow_up") {
      return "follow_up";
    }

    return ticket?.status === "invoiced" ? "invoiced" : "completed";
  }

  const hasCancelledTrips = sortedTrips.some(
    (trip) => normalizeTripStatus(trip.status) === "cancelled"
  );
  if (hasCancelledTrips) {
    return "cancelled";
  }

  return ticket?.status === "follow_up" ? "follow_up" : "scheduled";
}

  async function persistTicketStatus(
    nextStatus: TicketStatus,
    now: string,
    billingOverride?: BillingPacket | null
  ) {
    if (!ticket?.id) return;

    const payload: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: now,
    };

    if (billingOverride !== undefined) {
      payload.billing = billingOverride;
    }

    await updateDoc(doc(db, "serviceTickets", ticket.id), payload);

    setTicket((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            updatedAt: now,
            ...(billingOverride !== undefined ? { billing: billingOverride } : {}),
          }
        : prev
    );

    setTicketStatusEdit(nextStatus);
  }

  function setTripSavingFlag(tripId: string, value: boolean) {
    setTripActionSaving((prev) => ({ ...prev, [tripId]: value }));
  }

  function setTripErr(tripId: string, value: string) {
    setTripActionError((prev) => ({ ...prev, [tripId]: value }));
  }

  function setTripOk(tripId: string, value: string) {
    setTripActionSuccess((prev) => ({ ...prev, [tripId]: value }));
  }

  function canCurrentUserActOnTrip(trip: TripDoc) {
    if (!myUid) return false;
    if (appUser?.role === "admin") return true;
    return isUidOnTripCrew(myUid, trip.crew || null);
  }

  function applyHelperConfirmation(crew: TripCrew | null, tripId: string): TripCrew | null {
    if (!crew) return crew;
    if (helperConfirmedByTrip[tripId] === false) {
      return {
        ...crew,
        helperUid: null,
        helperName: null,
        secondaryHelperUid: null,
        secondaryHelperName: null,
      };
    }
    return crew;
  }

  function getHoursToUse(tripId: string, computedMinutes: number) {
    const override = hoursOverrideByTrip[tripId];
    if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
      return roundToHalf(override);
    }
    return getDefaultBillableHours(computedMinutes);
  }

  const mobileFinishTrip = useMemo(
    () => trips.find((trip) => trip.id === mobileFinishTripId) || null,
    [trips, mobileFinishTripId]
  );

  const inProgressTrip = useMemo(
    () => trips.find((trip) => normalizeTripStatus(trip.status) === "in_progress") || null,
    [trips]
  );

  useEffect(() => {
    if (!inProgressTrip) return;
    const id = window.setInterval(() => setLiveNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [inProgressTrip?.id]);

  const liveNowIso = useMemo(() => new Date(liveNowMs).toISOString(), [liveNowMs]);

  useEffect(() => {
    if (!ticket?.id || trips.length === 0) return;

    const action = String(searchParams.get("tripAction") || "").trim().toLowerCase();
    const targetTripId = String(searchParams.get("tripId") || "").trim();
    const hash =
      typeof window !== "undefined"
        ? decodeURIComponent(window.location.hash || "")
        : "";

    let consumed = false;

    if ((action === "resolved" || action === "follow_up") && isMobile) {
      const targetTrip =
        trips.find((trip) => trip.id === targetTripId) ||
        trips.find((trip) => normalizeTripStatus(trip.status) === "in_progress") ||
        null;

      if (targetTrip && normalizeTripStatus(targetTrip.status) === "in_progress") {
        setMobileFinishTripId(targetTrip.id);
        setMobileFinishMode(action === "resolved" ? "resolved" : "follow_up");
        consumed = true;
      }
    }

    if (hash.startsWith("#trip-work-notes-")) {
      const targetId = hash.replace("#trip-work-notes-", "");
      const el = document.getElementById(`trip-work-notes-${targetId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLInputElement
          ) {
            el.focus();
          }
        }, 120);
        consumed = true;
      }
    }

    if (consumed && typeof window !== "undefined") {
      window.history.replaceState({}, "", pathname);
    }
  }, [isMobile, pathname, searchParams, ticket?.id, trips]);

  function closeMobileFinishSheet() {
    setMobileFinishTripId(null);
    setMobileFinishMode("none");
  }

    function renderTripMaterialsEditor(tripId: string) {
    const materials = Array.isArray(tripMaterials[tripId]) ? tripMaterials[tripId] : [];
    const noMaterialsUsed = Boolean(tripNoMaterialsUsed[tripId]);

    return (
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            Materials Used
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={noMaterialsUsed}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setTripNoMaterialsUsed((prev) => ({
                    ...prev,
                    [tripId]: checked,
                  }));

                  if (checked) {
                    setTripMaterials((prev) => ({
                      ...prev,
                      [tripId]: [],
                    }));
                  }
                }}
              />
            }
            label="No materials used on this trip"
          />

          {noMaterialsUsed ? (
            <Alert severity="success" variant="outlined">
              This trip is marked as no materials used.
            </Alert>
          ) : (
            <>
              {materials.length === 0 ? (
                <Alert severity="info" variant="outlined">
                  No materials added yet.
                </Alert>
              ) : null}

              {materials.map((m, idx) => (
                <Stack
                  key={`${tripId}-${idx}`}
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                >
                  <TextField
                    size="small"
                    label="Name"
                    value={m.name}
                    onChange={(e) =>
                      setTripMaterials((prev) => ({
                        ...prev,
                        [tripId]: (prev[tripId] || []).map((row, rowIdx) =>
                          rowIdx === idx ? { ...row, name: e.target.value } : row
                        ),
                      }))
                    }
                  />

                  <TextField
                    size="small"
                    label="Qty"
                    type="number"
                    value={m.qty}
                    onChange={(e) =>
                      setTripMaterials((prev) => ({
                        ...prev,
                        [tripId]: (prev[tripId] || []).map((row, rowIdx) =>
                          rowIdx === idx
                            ? { ...row, qty: Number(e.target.value) }
                            : row
                        ),
                      }))
                    }
                  />

                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() =>
                      setTripMaterials((prev) => ({
                        ...prev,
                        [tripId]: (prev[tripId] || []).filter(
                          (_, rowIdx) => rowIdx !== idx
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ))}

              <Button
                variant="outlined"
                onClick={() =>
                  setTripMaterials((prev) => ({
                    ...prev,
                    [tripId]: [...(prev[tripId] || []), { name: "", qty: 1 }],
                  }))
                }
              >
                Add Material
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    );
  }

async function handleSaveTicketOverview() {
  if (!canDispatch || !ticket?.id) return;

  if (ticket.status === "invoiced") {
    setTicketEditErr("Invoiced tickets are locked and cannot be edited.");
    return;
  }

  setTicketEditErr("");
  setTicketEditOk("");
  setTicketEditSaving(true);

  try {
    const minutes = Number(ticketEstimatedMinutesEdit);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setTicketEditErr("Estimated duration must be a number > 0.");
      return;
    }

    const summary = ticketIssueSummaryEdit.trim();
    if (!summary) {
      setTicketEditErr("Issue summary is required.");
      return;
    }

    const nextStatus = ticketStatusEdit as TicketStatus;
    const guard = getManualTicketStatusError({
      nextStatus,
      currentStatus: ticket.status,
      trips,
    });

    if (guard) {
      setTicketEditErr(guard);
      return;
    }

    const now = nowIso();

    await updateDoc(doc(db, "serviceTickets", ticket.id), {
      status: nextStatus,
      issueSummary: summary,
      estimatedDurationMinutes: minutes,
      issueDetails: ticketIssueDetailsEdit.trim() || null,
      updatedAt: now,
    });

    setTicket((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            issueSummary: summary,
            estimatedDurationMinutes: minutes,
            issueDetails: ticketIssueDetailsEdit.trim() || undefined,
            updatedAt: now,
          }
        : prev
    );

    setTicketEditOk("Ticket updated.");
  } catch (err: unknown) {
    setTicketEditErr(
      err instanceof Error ? err.message : "Failed to update ticket."
    );
  } finally {
    setTicketEditSaving(false);
  }
}

  async function handleCreateTrip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket || !canDispatch) return;
    if (ticket.status === "invoiced") {
  setTripSaveError("Invoiced tickets are locked and cannot receive new trips.");
  return;
}

    setTripSaveError("");
    setTripSaveSuccess("");

    if (isTicketTerminal(ticket.status)) {
      setTripSaveError(
        "Completed or cancelled tickets cannot receive new trips."
      );
      return;
    }

    if (hasOpenTrips(trips)) {
      setTripSaveError(
        "This ticket already has an open trip. Complete or cancel it before scheduling another."
      );
      return;
    }

    const remoteOpenTrips = await findOpenTripsForTicketId(ticket.id);
    if (remoteOpenTrips.length > 0) {
      setTripSaveError(
        `This ticket already has an open trip in Firestore (${remoteOpenTrips[0].date} ${remoteOpenTrips[0].startTime}-${remoteOpenTrips[0].endTime}). Refresh and use that trip instead.`
      );
      return;
    }

    if (!tripDate.trim()) {
      setTripSaveError("Trip date is required.");
      return;
    }

    if (!tripPrimaryTechUid.trim()) {
      setTripSaveError("Primary technician is required.");
      return;
    }

    if (!tripStartTime.trim() || !tripEndTime.trim() || tripEndTime <= tripStartTime) {
      setTripSaveError("Enter a valid start and end time.");
      return;
    }

    setTripSaving(true);

    try {
      const now = nowIso();
      const helperUid = tripHelperUid.trim() || "";
      const secondaryTechUid = tripSecondaryTechUid.trim() || "";
      const secondaryHelperUid = tripSecondaryHelperUid.trim() || "";

      const primaryName = findTechName(tripPrimaryTechUid) || "Unnamed Technician";
      const helperName = helperUid
        ? findHelperName(helperUid) || "Unnamed Helper"
        : null;
      const secondaryTechName = secondaryTechUid
        ? findTechName(secondaryTechUid) || "Unnamed Technician"
        : null;
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Unnamed Helper"
        : null;

      const payload = {
        active: true,
        type: "service",
        status: "planned",
        date: tripDate,
        timeWindow: tripTimeWindow,
        startTime: tripStartTime,
        endTime: tripEndTime,
        billableHours: null,
noMaterialsUsed: false,
        crew: {
          primaryTechUid: tripPrimaryTechUid,
          primaryTechName: primaryName,
          helperUid: helperUid || null,
          helperName,
          secondaryTechUid: secondaryTechUid || null,
          secondaryTechName,
          secondaryHelperUid: secondaryHelperUid || null,
          secondaryHelperName,
        },
        crewConfirmed: null,
        link: {
          serviceTicketId: ticket.id,
          projectId: null,
          projectStageKey: null,
        },
        notes: tripNotes.trim() || null,
        cancelReason: null,
        timerState: "not_started",
        actualStartAt: null,
        actualEndAt: null,
        startedByUid: null,
        endedByUid: null,
        pauseBlocks: [],
        actualMinutes: null,
        workNotes: null,
        resolutionNotes: null,
        followUpNotes: null,
        materials: [],
        outcome: null,
        readyToBillAt: null,
        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      const createdRef = await addDoc(collection(db, "trips"), payload as any);
      const createdTrip: TripDoc = { id: createdRef.id, ...(payload as any) };

      const nextTrips = [...trips, createdTrip].sort((a, b) => {
        const byDate = String(a.date || "").localeCompare(String(b.date || ""));
        if (byDate !== 0) return byDate;
        return String(a.startTime || "").localeCompare(String(b.startTime || ""));
      });

      const helperIds = helperUid ? [helperUid] : [];
      const helperNames = helperName ? [helperName] : [];

      const assignedTechnicianIds = [tripPrimaryTechUid];
      if (secondaryTechUid && secondaryTechUid !== tripPrimaryTechUid) {
        assignedTechnicianIds.push(secondaryTechUid);
      }
      if (helperUid && !assignedTechnicianIds.includes(helperUid)) {
        assignedTechnicianIds.push(helperUid);
      }
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      const nextStatus = deriveNextTicketStatus(nextTrips);

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,
        assignedTechnicianId: tripPrimaryTechUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: tripPrimaryTechUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              assignedTechnicianId: tripPrimaryTechUid,
              assignedTechnicianName: primaryName,
              primaryTechnicianId: tripPrimaryTechUid,
              secondaryTechnicianId: secondaryTechUid || undefined,
              secondaryTechnicianName: secondaryTechName || undefined,
              helperIds: helperIds.length ? helperIds : undefined,
              helperNames: helperNames.length ? helperNames : undefined,
              assignedTechnicianIds,
              updatedAt: now,
            }
          : prev
      );

      setTicketStatusEdit(nextStatus);
      setTrips(nextTrips);
      setTripWorkNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripResolutionNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripFollowUpNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripMaterials((prev) => ({ ...prev, [createdTrip.id]: [] }));
      setTripNoMaterialsUsed((prev) => ({ ...prev, [createdTrip.id]: false }));
            setFinishModeByTrip((prev) => ({ ...prev, [createdTrip.id]: "none" }));
      setHelperConfirmedByTrip((prev) => ({ ...prev, [createdTrip.id]: true }));
      setTripSaveSuccess(
        `Trip scheduled. Ticket status is now ${formatTicketStatus(nextStatus)}.`
      );
      setTripNotes("");
      setScheduleOpen(false);
    } catch (err: unknown) {
      setTripSaveError(
        err instanceof Error ? err.message : "Failed to create trip."
      );
    } finally {
      setTripSaving(false);
    }
  }

  async function handleStartTrip(trip: TripDoc) {
    if (!canStartTripRole || !myUid) return;

    if (!canCurrentUserActOnTrip(trip) && appUser?.role !== "admin") {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canStartTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip is not in a startable state.");
      return;
    }

    if (hasInProgressTrips(trips.filter((t) => t.id !== trip.id))) {
      setTripErr(trip.id, "Another trip on this ticket is already in progress.");
      return;
    }

    const startCrew = trip.crewConfirmed || trip.crew || null;
    const runningConflicts = await findRunningTripsForCrewUids({
      crewUids: crewUidsFromCrew(startCrew),
      excludeTripId: trip.id,
    });

    if (runningConflicts.length > 0) {
      setTripErr(
        trip.id,
        `Cannot start this trip because one of the assigned crew members already has a running trip: ${runningConflicts[0].summary}`
      );
      return;
    }

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();

      await updateDoc(doc(db, "trips", trip.id), {
        status: "in_progress",
        timerState: "running",
        actualStartAt: trip.actualStartAt || now,
        actualEndAt: null,
        startedByUid: trip.startedByUid || myUid,
        crewConfirmed: trip.crewConfirmed || trip.crew || null,
        pauseBlocks: Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [],
        updatedAt: now,
        updatedByUid: myUid,
      });

      const nextTrips = trips.map((t) =>
        t.id === trip.id
          ? {
              ...t,
              status: "in_progress",
              timerState: "running",
              actualStartAt: t.actualStartAt || now,
              actualEndAt: null,
              startedByUid: t.startedByUid || myUid,
              crewConfirmed: t.crewConfirmed || t.crew || null,
              pauseBlocks: Array.isArray(t.pauseBlocks) ? t.pauseBlocks : [],
              updatedAt: now,
              updatedByUid: myUid,
            }
          : t
      );

      setTrips(nextTrips);
      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));

      const nextStatus = deriveNextTicketStatus(nextTrips);
      if (ticket?.id && nextStatus !== ticket.status) {
        await persistTicketStatus(nextStatus, now);
      }

      setTripOk(trip.id, "Trip started.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to start trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handlePauseTrip(trip: TripDoc) {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canPauseTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip cannot be paused right now.");
      return;
    }

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const pauseBlocks = [...(Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [])];

      const hasOpenPause = pauseBlocks.some((block) => block?.startAt && !block?.endAt);
      if (hasOpenPause) {
        setTripErr(trip.id, "This trip is already paused.");
        return;
      }

      pauseBlocks.push({ startAt: now, endAt: null });

      await updateDoc(doc(db, "trips", trip.id), {
        timerState: "paused",
        pauseBlocks,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id ? { ...t, timerState: "paused", pauseBlocks } : t
        )
      );

      setTripOk(trip.id, "Paused.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to pause trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleResumeTrip(trip: TripDoc) {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canResumeTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip cannot be resumed right now.");
      return;
    }

    if (hasInProgressTrips(trips.filter((t) => t.id !== trip.id))) {
      setTripErr(trip.id, "Another trip on this ticket is already in progress.");
      return;
    }

    const resumeCrew = trip.crewConfirmed || trip.crew || null;
    const runningConflicts = await findRunningTripsForCrewUids({
      crewUids: crewUidsFromCrew(resumeCrew),
      excludeTripId: trip.id,
    });

    if (runningConflicts.length > 0) {
      setTripErr(
        trip.id,
        `Cannot resume this trip because one of the assigned crew members already has a running trip: ${runningConflicts[0].summary}`
      );
      return;
    }

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const pauseBlocks = [...(Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [])];

      let foundOpenPause = false;

      for (let i = pauseBlocks.length - 1; i >= 0; i--) {
        if (pauseBlocks[i] && pauseBlocks[i].startAt && !pauseBlocks[i].endAt) {
          pauseBlocks[i] = { ...pauseBlocks[i], endAt: now };
          foundOpenPause = true;
          break;
        }
      }

      if (!foundOpenPause) {
        setTripErr(trip.id, "No active pause block was found to resume.");
        return;
      }

      await updateDoc(doc(db, "trips", trip.id), {
        timerState: "running",
        pauseBlocks,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id ? { ...t, timerState: "running", pauseBlocks } : t
        )
      );

      setTripOk(trip.id, "Resumed.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to resume trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleSaveWorkNotes(trip: TripDoc) {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    setTripSavingFlag(trip.id, true);
    setTripErr(trip.id, "");
    setTripOk(trip.id, "");

    try {
      const now = nowIso();
      const value = String(tripWorkNotes[trip.id] || "").trim();

      await updateDoc(doc(db, "trips", trip.id), {
        workNotes: value || null,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, workNotes: value || null } : t))
      );

      setTripOk(trip.id, "Notes saved.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function finishTrip(trip: TripDoc, mode: "resolved" | "follow_up") {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canFinishTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip is not ready to finish.");
      return;
    }

    setTripSavingFlag(trip.id, true);
    setTripErr(trip.id, "");
    setTripOk(trip.id, "");

    try {
      const now = nowIso();
      const followNotes = String(tripFollowUpNotes[trip.id] || "").trim();
      const resolutionNotes = String(tripResolutionNotes[trip.id] || "").trim();

      if (mode === "follow_up" && !followNotes) {
        throw new Error("Follow Up requires follow-up notes.");
      }
      if (mode === "resolved" && !resolutionNotes) {
        throw new Error("Resolved requires resolution notes.");
      }

      const mats = Array.isArray(tripMaterials[trip.id]) ? tripMaterials[trip.id] : [];
      const noMaterialsUsed = Boolean(tripNoMaterialsUsed[trip.id]);
      const materialCheck = validateTripMaterialsCapture({
        materials: mats,
        noMaterialsUsed,
      });

      if (!materialCheck.ok) {
        throw new Error(materialCheck.message);
      }

      const pauseBlocks = [...(Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [])];
      for (let i = pauseBlocks.length - 1; i >= 0; i--) {
        if (pauseBlocks[i] && pauseBlocks[i].startAt && !pauseBlocks[i].endAt) {
          pauseBlocks[i] = { ...pauseBlocks[i], endAt: now };
          break;
        }
      }

      const startAt = trip.actualStartAt || now;
      const gross = minutesBetweenIso(startAt, now);
      const paused = sumPausedMinutes(pauseBlocks, now);
      const actualMinutes = Math.max(0, gross - paused);

      if (!trip.date) {
        throw new Error("Trip is missing date; cannot create time entries.");
      }
      if (!actualMinutes || actualMinutes <= 0) {
        throw new Error("Trip duration is 0 minutes; no time entry created.");
      }

      const latestSnap = await getDoc(doc(db, "trips", trip.id));
      const latestTrip = latestSnap.exists() ? (latestSnap.data() as any) : null;

      const crewConfirmed = applyHelperConfirmation(
        (latestTrip?.crewConfirmed ?? trip.crewConfirmed ?? null) as TripCrew | null,
        trip.id
      );
      const crewFallback = applyHelperConfirmation(
        (latestTrip?.crew ?? trip.crew ?? null) as TripCrew | null,
        trip.id
      );
      const finalCrew = crewConfirmed || crewFallback || null;

      const crewMembers = crewMembersFromTrip({ crewConfirmed: finalCrew, crew: finalCrew });
      if (!crewMembers.length) {
        throw new Error("No crew members found on trip.");
      }

      const hoursToUse = getHoursToUse(trip.id, actualMinutes);
      const entryDate = trip.date;
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

      await updateDoc(
        doc(db, "trips", trip.id),
        stripUndefined({
          status: "complete",
          timerState: "complete",
          actualEndAt: now,
          endedByUid: myUid,
          pauseBlocks,
          actualMinutes,
          billableHours: hoursToUse,
          workNotes: String(tripWorkNotes[trip.id] || "").trim() || null,
          resolutionNotes: mode === "resolved" ? resolutionNotes : null,
          followUpNotes: mode === "follow_up" ? followNotes : null,
          outcome: mode,
          readyToBillAt: mode === "resolved" ? now : null,
          materials: materialCheck.cleaned,
          noMaterialsUsed,
          crewConfirmed: finalCrew,
          updatedAt: now,
          updatedByUid: myUid,
        })
      );

      for (const member of crewMembers) {
        const timesheetId = await upsertWeeklyTimesheetHeader({
          employeeId: member.uid,
          employeeName: member.name,
          employeeRole: member.role,
          weekStartDate,
          weekEndDate,
          createdByUid: myUid || null,
        });

        const addressShort = [
          ticket?.serviceAddressLine1 || "",
          ticket?.serviceCity || "",
          ticket?.serviceState || "",
          ticket?.servicePostalCode || "",
        ]
          .filter(Boolean)
          .join(", ");

        await upsertTimeEntryFromTrip({
          trip,
          member,
          entryDate,
          hoursGenerated: hoursToUse,
          weekStartDate,
          weekEndDate,
          timesheetId,
          createdByUid: myUid || null,
          displayTitle: ticket?.customerDisplayName || "Customer",
          displaySubtitle: ticket?.issueSummary || "Service Ticket",
          outcomeLabel: mode === "resolved" ? "Resolved" : "Follow Up",
          addressShort,
        });
      }

      const nextTrips = trips.map((t) =>
        t.id === trip.id
          ? {
              ...t,
              status: "complete",
              timerState: "complete",
              actualEndAt: now,
              endedByUid: myUid,
              pauseBlocks,
              actualMinutes,
              billableHours: hoursToUse,
              workNotes: String(tripWorkNotes[trip.id] || "").trim() || null,
              resolutionNotes: mode === "resolved" ? resolutionNotes : null,
              followUpNotes: mode === "follow_up" ? followNotes : null,
              outcome: mode,
              readyToBillAt: mode === "resolved" ? now : null,
              materials: materialCheck.cleaned,
              noMaterialsUsed,
              crewConfirmed: finalCrew,
            }
          : t
      );

      setTrips(nextTrips);
      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));
      closeMobileFinishSheet();

      const nextStatus = deriveNextTicketStatus(nextTrips, mode);
      let billingOverride: BillingPacket | null | undefined = undefined;

      if (mode === "resolved") {
        if (nextStatus === "completed") {
          billingOverride = buildBillingPacketFromResolvedTrips({
            trips: nextTrips,
            fallbackUpdatedAt: now,
          });
        } else {
          billingOverride = null;
        }
      } else {
        billingOverride = null;
      }

      if (ticket?.id) {
        await persistTicketStatus(nextStatus, now, billingOverride);
      }

      setTripOk(
        trip.id,
        `${mode === "resolved" ? "Resolved" : "Follow Up logged"}. Billable hours: ${hoursToUse}.`
      );
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to finish trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

function openEditTrip(trip: TripDoc) {
  if (ticket?.status === "invoiced") return;
  if (!canEditTripSchedule(trip.status, trip.timerState)) return;

  setEditTripPrimaryTechUid(String(trip.crew?.primaryTechUid || ""));
  setEditTripSecondaryTechUid(String(trip.crew?.secondaryTechUid || ""));
  setEditTripHelperUid(String(trip.crew?.helperUid || ""));
  setEditTripSecondaryHelperUid(String(trip.crew?.secondaryHelperUid || ""));

  const tripPrimaryUid = String(trip.crew?.primaryTechUid || "").trim();
  const tripHelperUid = String(trip.crew?.helperUid || "").trim();
  const defaultHelperUid =
    helperCandidates.find(
      (h) => String(h.defaultPairedTechUid || "").trim() === tripPrimaryUid
    )?.uid || "";

  setEditTripUseDefaultHelper(
    Boolean(tripPrimaryUid && tripHelperUid && defaultHelperUid === tripHelperUid)
  );

  setEditTripId(trip.id);
  setEditTripDate(trip.date || isoTodayLocal());
  setEditTripTimeWindow((trip.timeWindow as TripTimeWindow) || "custom");
  setEditTripStartTime(trip.startTime || "08:00");
  setEditTripEndTime(trip.endTime || "12:00");
  setEditTripNotes(String(trip.notes || ""));
  setEditTripErr("");
}

  async function handleSaveTripEdit() {
    if (!canDispatch || !editTripId || !ticket?.id) return;
    if (ticket.status === "invoiced") {
  setEditTripErr("Invoiced tickets are locked and trip schedule cannot be edited.");
  return;
}

    const trip = trips.find((t) => t.id === editTripId);
    if (!trip) return;

    setEditTripErr("");
    setEditTripSaving(true);

    try {
      if (!canEditTripSchedule(trip.status, trip.timerState)) {
        throw new Error("Only planned trips can be edited.");
      }

      if (!editTripDate.trim()) {
        throw new Error("Trip date is required.");
      }

      if (!editTripPrimaryTechUid.trim()) {
        throw new Error("Primary technician is required.");
      }

      if (!editTripStartTime.trim() || !editTripEndTime.trim() || editTripEndTime <= editTripStartTime) {
        throw new Error("Enter a valid start and end time.");
      }

      const now = nowIso();

      const helperUid = editTripHelperUid.trim() || "";
      const secondaryTechUid = editTripSecondaryTechUid.trim() || "";
      const secondaryHelperUid = editTripSecondaryHelperUid.trim() || "";

      const primaryName = findTechName(editTripPrimaryTechUid) || "Unnamed Technician";
      const helperName = helperUid
        ? findHelperName(helperUid) || "Unnamed Helper"
        : null;
      const secondaryTechName = secondaryTechUid
        ? findTechName(secondaryTechUid) || "Unnamed Technician"
        : null;
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Unnamed Helper"
        : null;

      const nextCrew: TripCrew = {
        primaryTechUid: editTripPrimaryTechUid || null,
        primaryTechName: editTripPrimaryTechUid ? primaryName : null,
        helperUid: helperUid || null,
        helperName,
        secondaryTechUid: secondaryTechUid || null,
        secondaryTechName,
        secondaryHelperUid: secondaryHelperUid || null,
        secondaryHelperName,
      };

      await updateDoc(doc(db, "trips", trip.id), {
        date: editTripDate,
        timeWindow: editTripTimeWindow,
        startTime: editTripStartTime,
        endTime: editTripEndTime,
        crew: nextCrew,
        crewConfirmed: null,
        notes: editTripNotes.trim() || null,
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      const helperIds = helperUid ? [helperUid] : [];
      const helperNames = helperName ? [helperName] : [];

      const assignedTechnicianIds = [editTripPrimaryTechUid];
      if (secondaryTechUid && secondaryTechUid !== editTripPrimaryTechUid) {
        assignedTechnicianIds.push(secondaryTechUid);
      }
      if (helperUid && !assignedTechnicianIds.includes(helperUid)) {
        assignedTechnicianIds.push(helperUid);
      }
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        assignedTechnicianId: editTripPrimaryTechUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: editTripPrimaryTechUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds,
        updatedAt: now,
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                date: editTripDate,
                timeWindow: editTripTimeWindow,
                startTime: editTripStartTime,
                endTime: editTripEndTime,
                crew: nextCrew,
                crewConfirmed: null,
                notes: editTripNotes.trim() || null,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : t
        )
      );

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              assignedTechnicianId: editTripPrimaryTechUid,
              assignedTechnicianName: primaryName,
              primaryTechnicianId: editTripPrimaryTechUid,
              secondaryTechnicianId: secondaryTechUid || undefined,
              secondaryTechnicianName: secondaryTechName || undefined,
              helperIds: helperIds.length ? helperIds : undefined,
              helperNames: helperNames.length ? helperNames : undefined,
              assignedTechnicianIds,
              updatedAt: now,
            }
          : prev
      );

      setEditTripId(null);
    } catch (err: unknown) {
      setEditTripErr(
        err instanceof Error ? err.message : "Failed to update trip."
      );
    } finally {
      setEditTripSaving(false);
    }
  }

async function handleSoftDeleteTrip(trip: TripDoc) {
  if (!canDispatch) return;

  if (ticket?.status === "invoiced") {
    alert("Invoiced tickets are locked and trips cannot be removed.");
    return;
  }

  if (!canCancelTrip(trip.status, trip.timerState)) {
    alert("Only planned trips can be removed.");
    return;
  }

  if (
    window.prompt(
      `Type DELETE to remove ${trip.date} ${trip.startTime}-${trip.endTime}`,
      ""
    ) !== "DELETE"
  ) {
    return;
  }

  setTripSavingFlag(trip.id, true);
  setTripErr(trip.id, "");
  setTripOk(trip.id, "");

  try {
    const now = nowIso();

    await updateDoc(doc(db, "trips", trip.id), {
      status: "cancelled",
      timerState: "complete",
      active: false,
      cancelReason: "deleted",
      updatedAt: now,
      updatedByUid: myUid || null,
    });

    const nextTrips = trips.map((t) =>
      t.id === trip.id
        ? {
            ...t,
            status: "cancelled",
            timerState: "complete",
            active: false,
            cancelReason: "deleted",
            updatedAt: now,
            updatedByUid: myUid || null,
          }
        : t
    );

    setTrips(nextTrips);

    const nextStatus = deriveNextTicketStatus(nextTrips);
    if (ticket?.id && nextStatus !== ticket.status) {
      await persistTicketStatus(nextStatus, now);
    }

    setTripOk(trip.id, "Trip removed.");
  } catch (err: unknown) {
    setTripErr(
      trip.id,
      err instanceof Error ? err.message : "Failed to delete trip."
    );
  } finally {
    setTripSavingFlag(trip.id, false);
  }
}

async function handleClaimAndStartTrip() {
  if (!ticket?.id || !myUid) return;

  if (ticket.status === "invoiced") {
    alert("Invoiced tickets are locked and cannot be claimed or started.");
    return;
  }

  const role = String(appUser?.role || "");
  const canSelfDispatch = [
    "technician",
    "helper",
    "apprentice",
    "admin",
    "dispatcher",
    "manager",
  ].includes(role);

  if (!canSelfDispatch) {
    alert("You do not have permission to claim tickets.");
    return;
  }

  if (ticket.assignedTechnicianId) {
    alert("This ticket is already assigned.");
    return;
  }

  if (isTicketTerminal(ticket.status)) {
    alert("This ticket is not claimable.");
    return;
  }

  if (hasOpenTrips(trips)) {
    alert("This ticket already has an open trip.");
    return;
  }

  const remoteOpenTrips = await findOpenTripsForTicketId(ticket.id);
  if (remoteOpenTrips.length > 0) {
    alert(
      `This ticket already has an open trip in Firestore (${remoteOpenTrips[0].date} ${remoteOpenTrips[0].startTime}-${remoteOpenTrips[0].endTime}). Refresh and use that trip instead.`
    );
    return;
  }

  const now = new Date();
  const nowString = now.toISOString();

  const helperUid =
    helperCandidates.find(
      (h) => String(h.defaultPairedTechUid || "").trim() === myUid
    )?.uid || "";
  const helperName = helperUid
    ? helperCandidates.find((h) => h.uid === helperUid)?.name || "Helper"
    : null;

  const runningConflicts = await findRunningTripsForCrewUids({
    crewUids: [myUid, ...(helperUid ? [helperUid] : [])],
  });

  if (runningConflicts.length > 0) {
    alert(
      `Cannot claim and start because one of the assigned crew members already has a running trip: ${runningConflicts[0].summary}`
    );
    return;
  }

  try {
    const ticketRef = doc(db, "serviceTickets", ticket.id);
    const tripsRef = collection(db, "trips");
    const newTripRef = doc(tripsRef);

    await runTransaction(db, async (tx) => {
      const liveTicket = await tx.get(ticketRef);
      if (!liveTicket.exists()) throw new Error("Ticket not found.");

      const live = liveTicket.data() as any;
      if (live.assignedTechnicianId) throw new Error("Already claimed by another user.");
      if (isTicketTerminal(live.status)) throw new Error("Ticket is not claimable.");

      tx.set(newTripRef, {
        active: true,
        type: "service",
        status: "in_progress",
        date: isoTodayLocal(),
        timeWindow: "custom",
        startTime: hhmmLocal(now),
        endTime: hhmmLocal(addMinutes(now, 60)),
        billableHours: null,
noMaterialsUsed: false,
        crew: {
          primaryTechUid: myUid,
          primaryTechName: appUser?.displayName || "Technician",
          helperUid: helperUid || null,
          helperName,
          secondaryTechUid: null,
          secondaryTechName: null,
          secondaryHelperUid: null,
          secondaryHelperName: null,
        },
        crewConfirmed: {
          primaryTechUid: myUid,
          primaryTechName: appUser?.displayName || "Technician",
          helperUid: helperUid || null,
          helperName,
          secondaryTechUid: null,
          secondaryTechName: null,
          secondaryHelperUid: null,
          secondaryHelperName: null,
        },
        link: {
          serviceTicketId: ticket.id,
          projectId: null,
          projectStageKey: null,
        },
        notes: null,
        cancelReason: null,
        timerState: "running",
        actualStartAt: nowString,
        actualEndAt: null,
        startedByUid: myUid,
        endedByUid: null,
        pauseBlocks: [],
        actualMinutes: null,
        workNotes: null,
        resolutionNotes: null,
        followUpNotes: null,
        materials: [],
        outcome: null,
        readyToBillAt: null,
        createdAt: nowString,
        createdByUid: myUid,
        updatedAt: nowString,
        updatedByUid: myUid,
      });

      tx.update(ticketRef, {
        status: "in_progress",
        assignedTechnicianId: myUid,
        assignedTechnicianName: appUser?.displayName || "Technician",
        primaryTechnicianId: myUid,
        secondaryTechnicianId: null,
        secondaryTechnicianName: null,
        helperIds: helperUid ? [helperUid] : null,
        helperNames: helperName ? [helperName] : null,
        assignedTechnicianIds: helperUid ? [myUid, helperUid] : [myUid],
        updatedAt: nowString,
      });
    });

    window.location.reload();
  } catch (err: any) {
    alert(err?.message || "Failed to claim ticket.");
  }
}

    async function handleSaveBillingPacketDetails() {
    if (!ticket?.id || !canBill || !ticket.billing) return;
    if (ticket.status === "invoiced") {
  setBillingErr("Invoiced tickets are locked and billing details cannot be changed.");
  return;
}

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    try {
      const now = nowIso();

      const parsedAmount =
        billingMaterialsAmountEdit.trim() === ""
          ? null
          : Number(billingMaterialsAmountEdit);

      if (
        parsedAmount !== null &&
        (!Number.isFinite(parsedAmount) || parsedAmount < 0)
      ) {
        throw new Error("Materials Amount must be blank or a number 0 or greater.");
      }

      const nextBilling: BillingPacket = {
        ...ticket.billing,
        materialsSummary: billingMaterialsSummaryEdit.trim() || null,
        materialsAmount: parsedAmount,
        updatedAt: now,
      };

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        billing: nextBilling,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev ? { ...prev, billing: nextBilling, updatedAt: now } : prev
      );

      setBillingOk("Billing packet details saved.");
    } catch (err: unknown) {
      setBillingErr(
        err instanceof Error ? err.message : "Failed to save billing packet details."
      );
    } finally {
      setBillingSaving(false);
    }
  }

  async function markBillingStatus(nextStatus: BillingPacket["status"]) {
    if (!ticket?.id || !canBill) return;
    if (ticket.status === "invoiced") {
  setBillingErr("Invoiced tickets are locked and billing status cannot be changed.");
  return;
}

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    try {
      const now = nowIso();

      const parsedAmount =
        billingMaterialsAmountEdit.trim() === ""
          ? null
          : Number(billingMaterialsAmountEdit);

      if (
        parsedAmount !== null &&
        (!Number.isFinite(parsedAmount) || parsedAmount < 0)
      ) {
        throw new Error("Materials Amount must be blank or a number 0 or greater.");
      }

      const base: BillingPacket =
        ticket.billing || {
          status: "not_ready",
          readyToBillAt: null,
          readyToBillTripId: null,
          resolutionNotes: null,
          workNotes: null,
          labor: { totalHours: 0, byCrew: [] },
          materials: [],
          materialsSummary: null,
          materialsAmount: null,
          photos: [],
          invoiceSource: null,
          qboInvoiceId: null,
          qboDocNumber: null,
          qboInvoiceUrl: null,
          qboSyncedAt: null,
          qboInvoiceStatus: null,
          invoiceError: null,
          updatedAt: now,
        };

      const next: BillingPacket = {
        ...base,
        status: nextStatus,
        materialsSummary: billingMaterialsSummaryEdit.trim() || null,
        materialsAmount: parsedAmount,
        updatedAt: now,
      };

      if (nextStatus === "not_ready") {
        next.readyToBillAt = null;
        next.readyToBillTripId = null;
        next.invoiceSource = null;
        next.invoiceError = null;
      }

      if (nextStatus === "ready_to_bill") {
        next.invoiceSource = null;
        next.invoiceError = null;
      }

      if (nextStatus === "invoiced") {
        next.invoiceSource = next.invoiceSource || "manual";
        next.qboInvoiceStatus = next.qboInvoiceStatus || "manual";
        next.invoiceError = null;
      }

const nextTicketStatus: TicketStatus =
  nextStatus === "invoiced" ? "invoiced" : ticket.status;

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        billing: next,
        status: nextTicketStatus,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              billing: next,
              status: nextTicketStatus,
              updatedAt: now,
            }
          : prev
      );

      setTicketStatusEdit(nextTicketStatus);

      setBillingOk(`Billing status updated: ${formatBillingPacketStatus(nextStatus)}`);
    } catch (err: unknown) {
      setBillingErr(
        err instanceof Error ? err.message : "Failed to update billing status."
      );
    } finally {
      setBillingSaving(false);
    }
  }

  const mapsAddress = [
    ticket?.serviceAddressLine1 || "",
    ticket?.serviceAddressLine2 || "",
    ticket?.serviceCity || "",
    ticket?.serviceState || "",
    ticket?.servicePostalCode || "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <Alert severity="info">Loading service ticket…</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !error && ticket ? (
          <Stack spacing={3}>
            {isInvoicedTicket ? (
  <Alert severity="success" variant="outlined">
    This ticket has been invoiced and is now locked from dispatch, trip, and billing edits.
  </Alert>
) : null}
            <Dialog
              fullScreen={isMobile}
              open={Boolean(mobileFinishTrip)}
              onClose={closeMobileFinishSheet}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle sx={{ pb: 1 }}>
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", letterSpacing: "0.08em" }}
                    >
                      Finish Trip
                    </Typography>

                    <Typography variant="h6" fontWeight={800} sx={{ mt: 0.25 }} noWrap>
                      {ticket.customerDisplayName || "Customer"}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {ticket.issueSummary || "Service Ticket"}
                    </Typography>

                    <Chip
                      sx={{ mt: 1.25 }}
                      size="small"
                      color={mobileFinishMode === "resolved" ? "success" : "warning"}
                      icon={mobileFinishMode === "resolved" ? <CheckRoundedIcon /> : undefined}
                      label={mobileFinishMode === "resolved" ? "Resolved" : "Follow-Up"}
                    />
                  </Box>

                  <IconButton onClick={closeMobileFinishSheet}>
                    <CloseRoundedIcon />
                  </IconButton>
                </Stack>
              </DialogTitle>

              <DialogContent dividers>
                {mobileFinishTrip ? (
                  <Stack spacing={2}>
                    <TextField
                      label="Hours (override)"
                      type="number"
                      size="small"
                      inputProps={{ min: 0, step: 0.5 }}
                      value={
                        typeof hoursOverrideByTrip[mobileFinishTrip.id] === "number"
                          ? hoursOverrideByTrip[mobileFinishTrip.id]
                          : getDefaultBillableHours(
                              Math.max(
                                0,
                                (() => {
                                  const paused = sumPausedMinutes(
                                    mobileFinishTrip.pauseBlocks,
                                    liveNowIso
                                  );
                                  const gross =
                                    mobileFinishTrip.actualStartAt &&
                                    !mobileFinishTrip.actualEndAt
                                      ? minutesBetweenIso(
                                          mobileFinishTrip.actualStartAt,
                                          liveNowIso
                                        )
                                      : mobileFinishTrip.actualStartAt &&
                                          mobileFinishTrip.actualEndAt
                                        ? minutesBetweenIso(
                                            mobileFinishTrip.actualStartAt,
                                            mobileFinishTrip.actualEndAt
                                          )
                                        : 0;
                                  return gross - paused;
                                })()
                              )
                            )
                      }
                      onChange={(e) =>
                        setHoursOverrideByTrip((prev) => ({
                          ...prev,
                          [mobileFinishTrip.id]: Number(e.target.value),
                        }))
                      }
                      helperText="Timer default shown above; you can override if needed."
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={helperConfirmedByTrip[mobileFinishTrip.id] ?? true}
                          onChange={(e) =>
                            setHelperConfirmedByTrip((prev) => ({
                              ...prev,
                              [mobileFinishTrip.id]: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Include helper in payroll"
                    />

                    {mobileFinishMode === "follow_up" ? (
                      <>
                        <TextField
                          label="Follow-Up Notes"
                          multiline
                          minRows={5}
                          value={tripFollowUpNotes[mobileFinishTrip.id] ?? ""}
                          onChange={(e) =>
                            setTripFollowUpNotes((prev) => ({
                              ...prev,
                              [mobileFinishTrip.id]: e.target.value,
                            }))
                          }
                        />

                        {renderTripMaterialsEditor(mobileFinishTrip.id)}
                      </>
                    ) : null}

                    {mobileFinishMode === "resolved" ? (
                      <>
                        <TextField
                          label="Resolution Notes"
                          multiline
                          minRows={5}
                          value={tripResolutionNotes[mobileFinishTrip.id] ?? ""}
                          onChange={(e) =>
                            setTripResolutionNotes((prev) => ({
                              ...prev,
                              [mobileFinishTrip.id]: e.target.value,
                            }))
                          }
                        />

                        {renderTripMaterialsEditor(mobileFinishTrip.id)}
                      </>
                    ) : null}
                  </Stack>
                ) : null}
              </DialogContent>

              <DialogActions
                sx={{ p: 2, pb: "calc(16px + env(safe-area-inset-bottom))" }}
              >
                <Button onClick={closeMobileFinishSheet}>Cancel</Button>

                {mobileFinishTrip ? (
                  <Button
                    variant="contained"
                    color={mobileFinishMode === "resolved" ? "success" : "primary"}
                    onClick={() =>
                      finishTrip(
                        mobileFinishTrip,
                        mobileFinishMode as "resolved" | "follow_up"
                      )
                    }
                  >
                    {mobileFinishMode === "resolved"
                      ? "Complete as Resolved"
                      : "Complete as Follow-Up"}
                  </Button>
                ) : null}
              </DialogActions>
            </Dialog>

            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={2}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h4" fontWeight={800}>
                    {ticket.issueSummary}
                  </Typography>
                  <Chip
                    label={formatTicketStatus(ticket.status)}
                    color={getTicketTone(ticket.status)}
                    size="small"
                  />
                </Stack>

                {!isFieldUser ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={`Ticket ID: ${ticketId}`} variant="outlined" />
                    <IconButton
                      size="small"
                      onClick={() =>
                        navigator.clipboard.writeText(ticketId).catch(() => undefined)
                      }
                    >
                      <ContentCopyRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ) : null}
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {!ticket.assignedTechnicianId && !hasOpenTrips(trips) ? (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleClaimAndStartTrip}
                    startIcon={<PlayArrowRoundedIcon />}
                        disabled={isInvoicedTicket}
                  >
                    Claim & Start Trip
                  </Button>
                ) : null}

                <Button
                  component={Link}
                  href="/service-tickets"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                >
                  Back to Tickets
                </Button>
              </Stack>
            </Stack>

            <Box
              sx={{
                display: "grid",
                gap: 2.5,
                gridTemplateColumns: { xs: "1fr", lg: "1.2fr 0.95fr" },
              }}
            >
              <Stack spacing={2.5}>
                <Section
                  title="Customer & Address"
                  icon={<PlaceOutlinedIcon color="primary" />}
                  action={
                    mapsAddress ? (
                      <Button
                        component="a"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          mapsAddress
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        variant="text"
                      >
                        Open Maps
                      </Button>
                    ) : null
                  }
                >
                  <Stack spacing={1.5}>
                    <Typography variant="h6" fontWeight={800}>
                      {ticket.customerDisplayName || "—"}
                    </Typography>

                    <Stack spacing={0.25}>
                      {ticket.serviceAddressLabel ? (
                        <Typography variant="body2" color="text.secondary">
                          {ticket.serviceAddressLabel}
                        </Typography>
                      ) : null}

                      <Typography variant="body1">
                        {ticket.serviceAddressLine1 || "—"}
                      </Typography>

                      {ticket.serviceAddressLine2 ? (
                        <Typography variant="body1">
                          {ticket.serviceAddressLine2}
                        </Typography>
                      ) : null}

                      <Typography variant="body1">
                        {[ticket.serviceCity, ticket.serviceState, ticket.servicePostalCode]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </Typography>
                    </Stack>

                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PhoneOutlinedIcon fontSize="small" color="action" />
                        <Typography variant="body1">
                          {customerPhone ? (
                            <a href={`tel:${customerPhone}`}>{customerPhone}</a>
                          ) : (
                            "—"
                          )}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1} alignItems="center">
                        <AlternateEmailRoundedIcon fontSize="small" color="action" />
                        <Typography variant="body1">
                          {customerEmail ? (
                            <a href={`mailto:${customerEmail}`}>{customerEmail}</a>
                          ) : (
                            "—"
                          )}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Stack>
                </Section>

                <Section
                  title="Ticket Overview"
                  icon={<AssignmentTurnedInRoundedIcon color="primary" />}
                >
                  {canDispatch ? (
                    <Stack spacing={2}>
                      <Alert severity="info" variant="outlined">
                        Status changes are now guarded by the trip lifecycle.
                      </Alert>

                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        }}
                      >
                        <TextField
                          select
                          size="small"
                          label="Status"
                          value={ticketStatusEdit}
                          onChange={(e) =>
                            setTicketStatusEdit(e.target.value as TicketStatus)
                          }
                          disabled={isInvoicedTicket}
                        >
                          <MenuItem value="new">New</MenuItem>
                          <MenuItem value="scheduled">Scheduled</MenuItem>
                          <MenuItem value="in_progress">In Progress</MenuItem>
                          <MenuItem value="follow_up">Follow Up</MenuItem>
                          <MenuItem value="completed">Completed</MenuItem>
                          <MenuItem value="invoiced">Invoiced</MenuItem>
                          <MenuItem value="cancelled">Cancelled</MenuItem>
                        </TextField>

                        <TextField
                          size="small"
                          type="number"
                          label="Estimated Duration (minutes)"
                          inputProps={{ min: 1 }}
                          value={ticketEstimatedMinutesEdit}
                          onChange={(e) =>
                            setTicketEstimatedMinutesEdit(e.target.value)
                          }
                            disabled={isInvoicedTicket}
                        />
                      </Box>

                      <TextField
                        size="small"
                        label="Issue Summary"
                        value={ticketIssueSummaryEdit}
                        onChange={(e) => setTicketIssueSummaryEdit(e.target.value)}
                          disabled={isInvoicedTicket}
                      />

                      <TextField
                        multiline
                        minRows={4}
                        label="Issue Details"
                        value={ticketIssueDetailsEdit}
                        onChange={(e) => setTicketIssueDetailsEdit(e.target.value)}
                          disabled={isInvoicedTicket}
                      />

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button
                          variant="contained"
                          onClick={handleSaveTicketOverview}
  disabled={ticketEditSaving || isInvoicedTicket}
                        >
                          {ticketEditSaving ? "Saving..." : "Save Ticket Overview"}
                        </Button>
                        {ticketEditErr ? <Alert severity="error">{ticketEditErr}</Alert> : null}
                        {ticketEditOk ? <Alert severity="success">{ticketEditOk}</Alert> : null}
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack spacing={1}>
                      <Typography variant="body1">
                        <strong>Status:</strong> {formatTicketStatus(ticket.status)}
                      </Typography>
                      <Typography variant="body1">
                        <strong>Issue Summary:</strong> {ticket.issueSummary || "—"}
                      </Typography>
                      <Typography variant="body1">
                        <strong>Estimated Duration:</strong>{" "}
                        {ticket.estimatedDurationMinutes} minutes
                      </Typography>
                      <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                        {ticket.issueDetails || "No additional issue details."}
                      </Typography>
                    </Stack>
                  )}
                </Section>
              </Stack>

              <Stack spacing={2.5}>
                <Section
                  title="Trips"
                  icon={<ScheduleRoundedIcon color="primary" />}
action={
  canDispatch ? (
    <Button
      variant="contained"
      onClick={() => setScheduleOpen((prev) => !prev)}
      disabled={isInvoicedTicket}
    >
      {scheduleOpen ? "Close" : "Schedule Trip"}
    </Button>
  ) : null
}
                >
                  <Stack spacing={1.5}>
                    {trips.length === 0 ? (
                      <Alert severity="info" variant="outlined">
                        No trips scheduled yet.
                      </Alert>
                    ) : null}

                    {trips.map((trip) => {
                      const canAct = canCurrentUserActOnTrip(trip);
                      const savingThis = Boolean(tripActionSaving[trip.id]);
                      const timerState = normalizeTripTimerState(trip);
                      const pausedTrip = isTripPaused(trip);
                      const runningTrip = isTripRunning(trip);
                      const pausedMinutes = sumPausedMinutes(trip.pauseBlocks, liveNowIso);
                      const grossMinutes =
                        trip.actualStartAt && !trip.actualEndAt
                          ? minutesBetweenIso(trip.actualStartAt, liveNowIso)
                          : trip.actualStartAt && trip.actualEndAt
                            ? minutesBetweenIso(
                                trip.actualStartAt,
                                trip.actualEndAt
                              )
                            : 0;
                      const billableMinutes = Math.max(0, grossMinutes - pausedMinutes);
                      const finishMode = finishModeByTrip[trip.id] || "none";
                      const showFinishPanel =
                        normalizeTripStatus(trip.status) === "in_progress" &&
                        finishMode !== "none";
                      const anotherTripInProgress = hasInProgressTrips(
                        trips.filter((t) => t.id !== trip.id)
                      );
                      const canQuickStart = canCurrentUserQuickStartTrip({
                        trip,
                        role: appUser?.role,
                        uid: myUid,
                        canStartTripRole,
                      });

                      return (
                        <Paper
                          key={trip.id}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: 3,
                            borderColor: runningTrip
                              ? alpha(theme.palette.primary.main, 0.26)
                              : pausedTrip
                                ? alpha(theme.palette.warning.main, 0.3)
                                : "divider",
                            backgroundColor: runningTrip
                              ? alpha(theme.palette.primary.main, 0.05)
                              : pausedTrip
                                ? alpha(theme.palette.warning.main, 0.08)
                                : "background.paper",
                          }}
                        >
                          <Stack spacing={1.5}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="flex-start"
                              flexWrap="wrap"
                            >
                              <Box>
                                <Typography variant="subtitle1" fontWeight={700}>
                                  {trip.date} • {formatTripWindow(String(trip.timeWindow || ""))} •{" "}
                                  {trip.startTime}-{trip.endTime}
                                </Typography>

                                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.75 }}>
                                  <Chip
                                    size="small"
                                    label={
                                      pausedTrip
                                        ? "Paused"
                                        : runningTrip
                                          ? "In Progress"
                                          : formatLifecycleTripStatus(trip.status)
                                    }
                                    color={
                                      pausedTrip
                                        ? "warning"
                                        : runningTrip
                                          ? "info"
                                          : getTripTone(trip.status)
                                    }
                                  />
                                  <Chip
                                    size="small"
                                    label={`Timer: ${timerState}`}
                                    variant="outlined"
                                  />
                                </Stack>
                              </Box>

                              {canDispatch ? (
                                <Stack direction="row" spacing={1}>
                                  <IconButton
                                    onClick={() => openEditTrip(trip)}
  disabled={isInvoicedTicket || !canEditTripSchedule(trip.status, trip.timerState)}
                                  >
                                    <EditRoundedIcon />
                                  </IconButton>

                                  <IconButton
                                    color="error"
                                    onClick={() => handleSoftDeleteTrip(trip)}
  disabled={isInvoicedTicket || !canCancelTrip(trip.status, trip.timerState)}
                                  >
                                    <DeleteOutlineRoundedIcon />
                                  </IconButton>
                                </Stack>
                              ) : null}
                            </Stack>

                            <Stack spacing={1}>
                              {canStartTrip(trip.status, trip.timerState) ? (
                                <Button
                                  variant="contained"
                                  color="primary"
                                  size="large"
                                  startIcon={<PlayArrowRoundedIcon />}
                                  onClick={() => handleStartTrip(trip)}
                                  disabled={!canQuickStart || savingThis || anotherTripInProgress|| isInvoicedTicket}
                                  fullWidth
                                  sx={{
                                    minHeight: 48,
                                    borderRadius: 999,
                                    fontWeight: 700,
                                  }}
                                >
                                  Start Trip
                                </Button>
                              ) : null}

                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                useFlexGap
                                flexWrap="wrap"
                              >
                                {canPauseTrip(trip.status, trip.timerState) ? (
                                  <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<PauseRoundedIcon />}
                                    onClick={() => handlePauseTrip(trip)}
                                    disabled={!canAct || savingThis || isInvoicedTicket}
                                    sx={{ minHeight: 44 }}
                                  >
                                    Pause
                                  </Button>
                                ) : null}

                                {canResumeTrip(trip.status, trip.timerState) ? (
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<PlayArrowRoundedIcon />}
                                    onClick={() => handleResumeTrip(trip)}
                                    disabled={!canAct || savingThis || isInvoicedTicket}
                                    sx={{ minHeight: 44 }}
                                  >
                                    Resume
                                  </Button>
                                ) : null}

                                {!isMobile &&
                                normalizeTripStatus(trip.status) === "in_progress" ? (
                                  <>
                                    <Button
                                      variant="outlined"
                                      onClick={() =>
                                        setFinishModeByTrip((prev) => ({
                                          ...prev,
                                          [trip.id]: "follow_up",
                                        }))
                                      }
                                      disabled={
  !canAct ||
  savingThis ||
  !canFinishTrip(trip.status, trip.timerState) ||
  isInvoicedTicket
}
                                    >
                                      Follow-Up
                                    </Button>

                                    <Button
                                      variant="outlined"
                                      onClick={() =>
                                        setFinishModeByTrip((prev) => ({
                                          ...prev,
                                          [trip.id]: "resolved",
                                        }))
                                      }
                                      disabled={
  !canAct ||
  savingThis ||
  !canFinishTrip(trip.status, trip.timerState) ||
  isInvoicedTicket
}
                                    >
                                      Resolved
                                    </Button>

                                    {finishMode !== "none" ? (
                                      <Button
                                        variant="outlined"
                                        onClick={() =>
                                          setFinishModeByTrip((prev) => ({
                                            ...prev,
                                            [trip.id]: "none",
                                          }))
                                        }
                                      >
                                        Clear
                                      </Button>
                                    ) : null}
                                  </>
                                ) : null}
                              </Stack>

                              {isMobile &&
                              normalizeTripStatus(trip.status) === "in_progress" ? (
                                <Alert severity="info" variant="outlined">
                                  Finish actions still live in the trip finish sheet. Start,
                                  pause, and resume are available directly on this card.
                                </Alert>
                              ) : null}
                            </Stack>

                            <Typography variant="body2" color="text.secondary">
                              Tech: <strong>{trip.crew?.primaryTechName || "Unassigned"}</strong>
                              {trip.crew?.helperName
                                ? ` • Helper: ${trip.crew.helperName}`
                                : ""}
                              {trip.crew?.secondaryTechName
                                ? ` • 2nd Tech: ${trip.crew.secondaryTechName}`
                                : ""}
                              {trip.crew?.secondaryHelperName
                                ? ` • 2nd Helper: ${trip.crew.secondaryHelperName}`
                                : ""}
                            </Typography>

                            <Typography variant="body2" color="text.secondary">
                              Timer minutes: <strong>{billableMinutes}</strong> (gross{" "}
                              {grossMinutes} - paused {pausedMinutes})
                            </Typography>
                                                        {normalizeTripStatus(trip.status) === "complete" ? (
                              <Typography variant="body2" color="text.secondary">
                                Billable Hours:{" "}
                                <strong>
                                  {getStoredOrComputedBillableHours(trip).toFixed(2)}
                                </strong>
                              </Typography>
                            ) : null}

<TextField
  id={`trip-work-notes-${trip.id}`}
  label="Work Notes"
  multiline
  minRows={3}
  value={tripWorkNotes[trip.id] ?? ""}
  onChange={(e) =>
    setTripWorkNotes((prev) => ({
      ...prev,
      [trip.id]: e.target.value,
    }))
  }
  disabled={
    !canAct ||
    normalizeTripStatus(trip.status) === "cancelled" ||
    isInvoicedTicket
  }
/>

                            <Button
                              variant="outlined"
                              startIcon={<NoteAltOutlinedIcon />}
                              onClick={() => handleSaveWorkNotes(trip)}
                              disabled={
                                !canAct ||
                                normalizeTripStatus(trip.status) === "cancelled" ||
                                savingThis ||
                                isInvoicedTicket
                              }
                            >
                              Save Notes
                            </Button>

                            {showFinishPanel && !isMobile ? (
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: 1.25,
                                  borderRadius: 3,
                                  backgroundColor:
                                    finishMode === "resolved"
                                      ? alpha(theme.palette.success.main, 0.06)
                                      : alpha(theme.palette.warning.main, 0.08),
                                }}
                              >
                                <Stack spacing={1.25}>
                                  <TextField
                                    label="Hours (override)"
                                    type="number"
                                    size="small"
                                    inputProps={{ min: 0, step: 0.5 }}
                                    value={
                                      typeof hoursOverrideByTrip[trip.id] === "number"
                                        ? hoursOverrideByTrip[trip.id]
                                        : getDefaultBillableHours(billableMinutes)
                                                                          }
                                    onChange={(e) =>
                                      setHoursOverrideByTrip((prev) => ({
                                        ...prev,
                                        [trip.id]: Number(e.target.value),
                                      }))
                                    }
                                  />

                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        checked={helperConfirmedByTrip[trip.id] ?? true}
                                        onChange={(e) =>
                                          setHelperConfirmedByTrip((prev) => ({
                                            ...prev,
                                            [trip.id]: e.target.checked,
                                          }))
                                        }
                                      />
                                    }
                                    label="Include helper in payroll"
                                  />

                                  {finishMode === "follow_up" ? (
                                    <>
                                      <TextField
                                        label="Follow-Up Notes"
                                        multiline
                                        minRows={4}
                                        value={tripFollowUpNotes[trip.id] ?? ""}
                                        onChange={(e) =>
                                          setTripFollowUpNotes((prev) => ({
                                            ...prev,
                                            [trip.id]: e.target.value,
                                          }))
                                        }
                                      />

                                      {renderTripMaterialsEditor(trip.id)}

                                      <Button
                                        variant="contained"
                                        onClick={() => finishTrip(trip, "follow_up")}
                                        disabled={!canAct || savingThis || isInvoicedTicket}
                                      >
                                        Complete as Follow-Up
                                      </Button>
                                    </>
                                  ) : null}
                                  {finishMode === "resolved" ? (
                                    <>
                                      <TextField
                                        label="Resolution Notes"
                                        multiline
                                        minRows={4}
                                        value={tripResolutionNotes[trip.id] ?? ""}
                                        onChange={(e) =>
                                          setTripResolutionNotes((prev) => ({
                                            ...prev,
                                            [trip.id]: e.target.value,
                                          }))
                                        }
                                      />

                                      {renderTripMaterialsEditor(trip.id)}

                                      <Button
                                        variant="contained"
                                        color="success"
                                        onClick={() => finishTrip(trip, "resolved")}
                                        disabled={!canAct || savingThis || isInvoicedTicket}
                                      >
                                        Complete as Resolved — Ready to Bill
                                      </Button>
                                    </>
                                  ) : null}
                                </Stack>
                              </Paper>
                            ) : null}

                            {tripActionError[trip.id] ? (
                              <Alert severity="error">{tripActionError[trip.id]}</Alert>
                            ) : null}
                            {tripActionSuccess[trip.id] ? (
                              <Alert severity="success">{tripActionSuccess[trip.id]}</Alert>
                            ) : null}
                          </Stack>
                        </Paper>
                      );
                    })}

                    {canDispatch && scheduleOpen ? (
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          backgroundColor: alpha(theme.palette.primary.main, 0.03),
                        }}
                      >
                        <Stack spacing={2} component="form" onSubmit={handleCreateTrip}>
                          <Typography variant="h6" fontWeight={700}>
                            Schedule Trip
                          </Typography>

                          <Box
                            sx={{
                              display: "grid",
                              gap: 2,
                              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            }}
                          >
                            <TextField
                              type="date"
                              size="small"
                              label="Date"
                              value={tripDate}
                              onChange={(e) => setTripDate(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />

                            <TextField
                              select
                              size="small"
                              label="Time Window"
                              value={tripTimeWindow}
                              onChange={(e) =>
                                setTripTimeWindow(e.target.value as TripTimeWindow)
                              }
                            >
                              <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                              <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                              <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                              <MenuItem value="custom">Custom</MenuItem>
                            </TextField>
                          </Box>

                          {tripTimeWindow === "custom" ? (
                            <Box
                              sx={{
                                display: "grid",
                                gap: 2,
                                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                              }}
                            >
                              <TextField
                                type="time"
                                size="small"
                                label="Start Time"
                                value={tripStartTime}
                                onChange={(e) => setTripStartTime(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                              />

                              <TextField
                                type="time"
                                size="small"
                                label="End Time"
                                value={tripEndTime}
                                onChange={(e) => setTripEndTime(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                              />
                            </Box>
                          ) : null}

                          <TextField
                            select
                            size="small"
                            label="Primary Technician"
                            value={tripPrimaryTechUid}
                            onChange={(e) => setTripPrimaryTechUid(e.target.value)}
                          >
                            <MenuItem value="">Select a technician…</MenuItem>
                            {technicians.map((tech) => (
                              <MenuItem key={tech.uid} value={tech.uid}>
                                {tech.displayName}
                              </MenuItem>
                            ))}
                          </TextField>

                          <TextField
                            select
                            size="small"
                            label="Secondary Technician (optional)"
                            value={tripSecondaryTechUid}
                            onChange={(e) => setTripSecondaryTechUid(e.target.value)}
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {technicians
                              .filter((tech) => tech.uid !== tripPrimaryTechUid)
                              .map((tech) => (
                                <MenuItem key={tech.uid} value={tech.uid}>
                                  {tech.displayName}
                                </MenuItem>
                              ))}
                          </TextField>

                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={tripUseDefaultHelper}
                                onChange={(e) => setTripUseDefaultHelper(e.target.checked)}
                              />
                            }
                            label="Use default helper pairing"
                          />

                          <TextField
                            select
                            size="small"
                            label="Helper / Apprentice (optional)"
                            value={tripHelperUid}
                            onChange={(e) => {
                              setTripUseDefaultHelper(false);
                              setTripHelperUid(e.target.value);
                            }}
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {helperCandidates.map((helper) => (
                              <MenuItem key={helper.uid} value={helper.uid}>
                                {helper.name} ({helper.laborRole})
                              </MenuItem>
                            ))}
                          </TextField>

                          <TextField
                            select
                            size="small"
                            label="Secondary Helper (optional)"
                            value={tripSecondaryHelperUid}
                            onChange={(e) => setTripSecondaryHelperUid(e.target.value)}
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {helperCandidates.map((helper) => (
                              <MenuItem key={helper.uid} value={helper.uid}>
                                {helper.name} ({helper.laborRole})
                              </MenuItem>
                            ))}
                          </TextField>

                          <TextField
                            multiline
                            minRows={3}
                            label="Trip Notes"
                            value={tripNotes}
                            onChange={(e) => setTripNotes(e.target.value)}
                          />

                          <Alert severity="info" variant="outlined">
                            Ticket status moves automatically based on the trip lifecycle.
                          </Alert>

                          {tripSaveError ? <Alert severity="error">{tripSaveError}</Alert> : null}
                          {tripSaveSuccess ? (
                            <Alert severity="success">{tripSaveSuccess}</Alert>
                          ) : null}

                          <Button variant="contained" type="submit" disabled={tripSaving || isInvoicedTicket}>
                            {tripSaving ? "Scheduling..." : "Schedule Trip"}
                          </Button>
                        </Stack>
                      </Paper>
                    ) : null}
                  </Stack>
                </Section>

                <Section title="Billing Packet" icon={<ReceiptLongRoundedIcon color="primary" />}>
                  {!ticket.billing ? (
                    <Alert severity="info" variant="outlined">
                      No billing packet yet. It appears after a trip is completed as{" "}
                      <strong>Resolved — Ready to Bill</strong>.
                    </Alert>
                  ) : (
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        spacing={1}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="body1">
                            Status:
                          </Typography>
                          <Chip
                            size="small"
                            color={getBillingTone(ticket.billing.status)}
                            label={formatBillingPacketStatus(ticket.billing.status)}
                          />
                          {ticket.billing.invoiceSource ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Source: ${ticket.billing.invoiceSource}`}
                            />
                          ) : null}
                        </Stack>

                        {ticket.billing.readyToBillAt ? (
                          <Typography variant="body2" color="text.secondary">
                            Ready: {ticket.billing.readyToBillAt}
                          </Typography>
                        ) : null}
                      </Stack>

                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            Labor Summary
                          </Typography>

                          <Typography variant="body1">
                            Total billed hours:{" "}
                            <strong>
                              {Number(ticket.billing.labor.totalHours || 0).toFixed(2)}
                            </strong>
                          </Typography>

                          {ticket.billing.readyToBillTripId ? (
                            <Typography variant="body2" color="text.secondary">
                              Ready-to-bill trip: {ticket.billing.readyToBillTripId}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                        <Stack spacing={1.5}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            Materials Billing
                          </Typography>

                          <TextField
                            label="Materials Summary"
                            multiline
                            minRows={4}
                            value={billingMaterialsSummaryEdit}
                            onChange={(e) => setBillingMaterialsSummaryEdit(e.target.value)}
                            disabled={!canBill || billingSaving || isInvoicedTicket}
                            placeholder={`Example: 5 of pex viega 1/2 tees, 4 of pex viega 1/2 90s, 1 3" PVC tee`}
                            helperText="This will become the summarized materials line description for invoicing."
                          />

                          <TextField
                            label="Materials Amount"
                            type="number"
                            inputProps={{ min: 0, step: 0.01 }}
                            value={billingMaterialsAmountEdit}
                            onChange={(e) => setBillingMaterialsAmountEdit(e.target.value)}
                            disabled={!canBill || billingSaving || isInvoicedTicket}
                            placeholder="0.00"
                            helperText="Enter the total billed materials amount."
                          />

                          {canBill ? (
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                              <Button
                                variant="contained"
                                onClick={handleSaveBillingPacketDetails}
                                disabled={billingSaving || isInvoicedTicket}
                              >
                                {billingSaving ? "Saving..." : "Save Billing Details"}
                              </Button>
                            </Stack>
                          ) : null}
                        </Stack>
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            Invoice Details
                          </Typography>

                          <Typography variant="body2" color="text.secondary">
                            Resolution notes and work notes remain stored for office reference, but
                            the future QBO invoice flow will use the service date range plus the
                            summarized labor/materials billing model.
                          </Typography>

                          {ticket.billing.qboDocNumber ? (
                            <Typography variant="body1">
                              Invoice Number: <strong>{ticket.billing.qboDocNumber}</strong>
                            </Typography>
                          ) : null}

                          {ticket.billing.qboSyncedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              Synced: {ticket.billing.qboSyncedAt}
                            </Typography>
                          ) : null}

                          {ticket.billing.qboInvoiceUrl ? (
                            <Button
                              component="a"
                              href={ticket.billing.qboInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              variant="outlined"
                            >
                              Open in QBO
                            </Button>
                          ) : null}

                          {ticket.billing.invoiceError ? (
                            <Alert severity="error">{ticket.billing.invoiceError}</Alert>
                          ) : null}
                        </Stack>
                      </Paper>

                      {canBill ? (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button
                            variant="outlined"
                            onClick={() => markBillingStatus("invoiced")}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            {billingSaving ? "Working..." : "Mark Invoiced Manually"}
                          </Button>

                          <Button
                            variant="outlined"
                            onClick={() => markBillingStatus("ready_to_bill")}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            Set Ready to Bill
                          </Button>

                          <Button
                            variant="outlined"
                            onClick={() => markBillingStatus("not_ready")}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            Set Not Ready
                          </Button>
                        </Stack>
                      ) : null}

                      {billingErr ? <Alert severity="error">{billingErr}</Alert> : null}
                      {billingOk ? <Alert severity="success">{billingOk}</Alert> : null}
                    </Stack>
                  )}
                </Section>

                <Section title="System" icon={<BuildRoundedIcon color="primary" />}>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>Active:</strong> {String(ticket.active)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Created At:</strong> {ticket.createdAt || "—"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Updated At:</strong> {ticket.updatedAt || "—"}
                    </Typography>
                  </Stack>
                </Section>
              </Stack>
            </Box>

            <Dialog
              open={Boolean(editTripId)}
              onClose={() => setEditTripId(null)}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle>Edit / Reschedule Trip</DialogTitle>

              <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                  <TextField
                    type="date"
                    label="Date"
                    value={editTripDate}
                    onChange={(e) => setEditTripDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    select
                    label="Time Window"
                    value={editTripTimeWindow}
                    onChange={(e) =>
                      setEditTripTimeWindow(e.target.value as TripTimeWindow)
                    }
                  >
                    <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                    <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                    <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                    <MenuItem value="custom">Custom</MenuItem>
                  </TextField>

                  <TextField
                    type="time"
                    label="Start Time"
                    value={editTripStartTime}
                    onChange={(e) => setEditTripStartTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    type="time"
                    label="End Time"
                    value={editTripEndTime}
                    onChange={(e) => setEditTripEndTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    select
                    label="Primary Technician"
                    value={editTripPrimaryTechUid}
                    onChange={(e) => setEditTripPrimaryTechUid(e.target.value)}
                  >
                    <MenuItem value="">Select a technician…</MenuItem>
                    {technicians.map((tech) => (
                      <MenuItem key={tech.uid} value={tech.uid}>
                        {tech.displayName}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Secondary Technician (optional)"
                    value={editTripSecondaryTechUid}
                    onChange={(e) => setEditTripSecondaryTechUid(e.target.value)}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {technicians
                      .filter((tech) => tech.uid !== editTripPrimaryTechUid)
                      .map((tech) => (
                        <MenuItem key={tech.uid} value={tech.uid}>
                          {tech.displayName}
                        </MenuItem>
                      ))}
                  </TextField>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editTripUseDefaultHelper}
                        onChange={(e) => setEditTripUseDefaultHelper(e.target.checked)}
                      />
                    }
                    label="Use default helper pairing"
                  />

                  <TextField
                    select
                    label="Helper / Apprentice (optional)"
                    value={editTripHelperUid}
                    onChange={(e) => {
                      setEditTripUseDefaultHelper(false);
                      setEditTripHelperUid(e.target.value);
                    }}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {helperCandidates.map((helper) => (
                      <MenuItem key={helper.uid} value={helper.uid}>
                        {helper.name} ({helper.laborRole})
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Secondary Helper (optional)"
                    value={editTripSecondaryHelperUid}
                    onChange={(e) => setEditTripSecondaryHelperUid(e.target.value)}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {helperCandidates.map((helper) => (
                      <MenuItem key={helper.uid} value={helper.uid}>
                        {helper.name} ({helper.laborRole})
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    multiline
                    minRows={3}
                    label="Trip Notes"
                    value={editTripNotes}
                    onChange={(e) => setEditTripNotes(e.target.value)}
                  />

                  {editTripErr ? <Alert severity="error">{editTripErr}</Alert> : null}

                  <Typography variant="body2" color="text.secondary">
                    Only planned trips can be edited or rescheduled now.
                  </Typography>
                </Stack>
              </DialogContent>

              <DialogActions>
                <Button onClick={() => setEditTripId(null)}>Close</Button>
                <Button
                  variant="contained"
                  onClick={handleSaveTripEdit}
                  disabled={editTripSaving || isInvoicedTicket}
                >
                  {editTripSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogActions>
            </Dialog>
          </Stack>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}