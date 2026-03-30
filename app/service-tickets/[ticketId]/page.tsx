"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  runTransaction,
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
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import AlternateEmailRoundedIcon from "@mui/icons-material/AlternateEmailRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceTicket } from "../../../src/types/service-ticket";
import type { AppUser } from "../../../src/types/app-user";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";

type ServiceTicketDetailPageProps = {
  params: Promise<{
    ticketId: string;
  }>;
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

type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

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

type TripDoc = {
  id: string;
  active: boolean;
  type: "service" | "project";
  status: string;
  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;
  crew?: TripCrew;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  };
  sourceKey?: string;
  notes?: string | null;
  cancelReason?: string | null;
  timerState?: "not_started" | "running" | "paused" | "complete" | string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  startedByUid?: string | null;
  endedByUid?: string | null;
  pauseBlocks?: PauseBlock[];
  actualMinutes?: number | null;
  workNotes?: string | null;
  resolutionNotes?: string | null;
  followUpNotes?: string | null;
  crewConfirmed?: TripCrew | null;
  materials?: TripMaterial[] | null;
  outcome?: "resolved" | "follow_up" | string | null;
  readyToBillAt?: string | null;
  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

type BillingPacket = {
  status: "not_ready" | "ready_to_bill" | "invoiced";
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
  photos: Array<{ url: string; caption?: string }>;
  updatedAt: string;
};

type TicketWithBilling = ServiceTicket & {
  billing?: BillingPacket | null;
};

type TicketStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

type FinishMode = "none" | "follow_up" | "resolved";

function safeText(x: unknown) {
  return String(x ?? "").trim();
}

function oneLine(x: unknown) {
  return safeText(x).replace(/\s+/g, " ");
}

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowIso() {
  return new Date().toISOString();
}

function roundToHalf(hours: number) {
  return Math.round(hours * 2) / 2;
}

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((v) => stripUndefined(v)) as unknown as T;
  }

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

function formatTripWindow(w: string) {
  if (w === "am") return "AM";
  if (w === "pm") return "PM";
  if (w === "all_day") return "All Day";
  if (w === "custom") return "Custom";
  return w;
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
  const diffMs = b - a;
  return Math.max(0, Math.round(diffMs / 60000));
}

function sumPausedMinutes(pauseBlocks?: PauseBlock[]) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return 0;
  let total = 0;
  for (const p of pauseBlocks) {
    if (!p?.startAt) continue;
    const endAt = p.endAt || null;
    if (!endAt) continue;
    total += minutesBetweenIso(p.startAt, endAt);
  }
  return total;
}

function isUidOnTripCrew(uid: string, crew?: TripCrew | null) {
  if (!uid) return false;
  if (!crew) return false;
  return (
    (crew.primaryTechUid || "") === uid ||
    (crew.helperUid || "") === uid ||
    (crew.secondaryTechUid || "") === uid ||
    (crew.secondaryHelperUid || "") === uid
  );
}

function hhmmLocal(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function addMinutes(date: Date, mins: number) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

function crewMembersFromTrip(trip: { crewConfirmed?: TripCrew | null; crew?: TripCrew | null }) {
  const crew = trip.crewConfirmed || trip.crew || {};
  const out: Array<{ uid: string; name: string; role: "technician" | "helper" }> = [];

  if (crew.primaryTechUid)
    out.push({
      uid: crew.primaryTechUid,
      name: crew.primaryTechName || "Primary Tech",
      role: "technician",
    });

  if (crew.helperUid)
    out.push({
      uid: crew.helperUid,
      name: crew.helperName || "Helper",
      role: "helper",
    });

  if (crew.secondaryTechUid)
    out.push({
      uid: crew.secondaryTechUid,
      name: crew.secondaryTechName || "Secondary Tech",
      role: "technician",
    });

  if (crew.secondaryHelperUid)
    out.push({
      uid: crew.secondaryHelperUid,
      name: crew.secondaryHelperName || "Secondary Helper",
      role: "helper",
    });

  const seen = new Set<string>();
  return out.filter((m) => {
    if (!m.uid) return false;
    if (seen.has(m.uid)) return false;
    seen.add(m.uid);
    return true;
  });
}

function isAppleDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function buildMapsUrl(address: string) {
  const q = encodeURIComponent(address);
  if (isAppleDevice()) {
    return `https://maps.apple.com/?q=${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildMapsEmbedUrl(address: string) {
  const q = encodeURIComponent(address);
  return `https://www.google.com/maps?q=${q}&output=embed`;
}

function isTerminalTicketStatus(s?: string) {
  const x = String(s || "").toLowerCase().trim();
  return x === "completed" || x === "cancelled";
}

function isAlreadyInProgressOrBeyond(s?: string) {
  const x = String(s || "").toLowerCase().trim();
  return x === "in_progress" || x === "follow_up" || x === "completed" || x === "cancelled";
}

function formatTicketStatus(value: ServiceTicket["status"]) {
  switch (value) {
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
    case "cancelled":
      return "Cancelled";
    default:
      return value;
  }
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

type ExistingTimeEntry = {
  hours?: number;
  hoursLocked?: boolean;
  createdAt?: string;
  createdByUid?: string | null;
};

async function upsertWeeklyTimesheetHeader(args: {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  weekStartDate: string;
  weekEndDate: string;
  createdByUid: string | null;
}) {
  const { employeeId, employeeName, employeeRole, weekStartDate, weekEndDate, createdByUid } = args;
  const now = nowIso();

  const timesheetId = buildWeeklyTimesheetId(employeeId, weekStartDate);
  const ref = doc(db, "weeklyTimesheets", timesheetId);

  await setDoc(
    ref,
    stripUndefined({
      employeeId,
      employeeName,
      employeeRole,
      weekStartDate,
      weekEndDate,
      status: "draft",
      submittedAt: null,
      submittedByUid: null,
      createdAt: now,
      createdByUid: createdByUid || null,
      updatedAt: now,
      updatedByUid: createdByUid || null,
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
  const {
    trip,
    member,
    entryDate,
    hoursGenerated,
    weekStartDate,
    weekEndDate,
    timesheetId,
    createdByUid,
    displayTitle,
    displaySubtitle,
    outcomeLabel,
    addressShort,
  } = args;

  const now = nowIso();

  const timeEntryId = `trip_${trip.id}_${member.uid}`;
  const ref = doc(db, "timeEntries", timeEntryId);

  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists() ? (existingSnap.data() as ExistingTimeEntry) : null;

  const hoursLocked = Boolean(existing?.hoursLocked);
  const hoursToWrite = hoursLocked ? Number(existing?.hours ?? hoursGenerated) : hoursGenerated;

  const noteLines: string[] = [];
  if (displayTitle) noteLines.push(`Title: ${displayTitle}`);
  if (displaySubtitle) noteLines.push(`Detail: ${displaySubtitle}`);
  if (addressShort) noteLines.push(`Address: ${addressShort}`);
  if (outcomeLabel) noteLines.push(`Outcome: ${outcomeLabel}`);
  noteLines.push(`Trip: ${trip.id}`);
  const notes = noteLines.join("\n");

  await setDoc(
    ref,
    stripUndefined({
      employeeId: member.uid,
      employeeName: member.name,
      employeeRole: member.role,
      entryDate,
      weekStartDate,
      weekEndDate,
      timesheetId,
      category: trip.type === "project" ? "project_stage" : "service_ticket",
      payType: "regular",
      billable: true,
      source: "trip_completion",
      hours: hoursToWrite,
      hoursSource: hoursGenerated,
      hoursLocked: hoursLocked || false,
      tripId: trip.id,
      serviceTicketId: trip.link?.serviceTicketId || null,
      projectId: trip.link?.projectId || null,
      projectStageKey: trip.link?.projectStageKey || null,
      displayTitle: displayTitle || null,
      displaySubtitle: displaySubtitle || null,
      outcome: outcomeLabel ? outcomeLabel.toLowerCase().replaceAll(" ", "_") : null,
      entryStatus: "draft",
      notes: notes || null,
      createdAt: existingSnap.exists() ? existing?.createdAt ?? now : now,
      createdByUid: existingSnap.exists() ? existing?.createdByUid ?? null : createdByUid || null,
      updatedAt: now,
      updatedByUid: createdByUid || null,
    }),
    { merge: true }
  );
}

function validateMaterialsForResolved(
  materials: TripMaterial[]
): { ok: false; message: string } | { ok: true; cleaned: TripMaterial[] } {
  const cleaned = (materials || [])
    .map((m) => ({
      name: (m.name || "").trim(),
      qty: Number(m.qty),
      unit: (m.unit || "").trim(),
      notes: (m.notes || "").trim(),
    }))
    .filter((m) => m.name);

  if (cleaned.length < 1) {
    return { ok: false, message: "Resolved requires at least 1 material line item (name + qty)." };
  }

  for (const m of cleaned) {
    if (!Number.isFinite(m.qty) || m.qty <= 0) {
      return { ok: false, message: `Material "${m.name}" must have qty > 0.` };
    }
  }

  return { ok: true, cleaned };
}

function SectionCard(props: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 4,
        borderColor: "divider",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <CardHeader
        avatar={props.icon ? props.icon : undefined}
        title={
          <Typography variant="h6" fontWeight={700}>
            {props.title}
          </Typography>
        }
        action={props.action}
        sx={{ pb: 1.5 }}
      />
      <Divider />
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>{props.children}</CardContent>
    </Card>
  );
}

function StatusPill(props: { text: string; tone?: "neutral" | "green" | "yellow" | "red" | "blue" }) {
  const tone = props.tone || "neutral";

  const chipProps =
    tone === "green"
      ? { color: "success" as const, variant: "filled" as const }
      : tone === "yellow"
        ? { color: "warning" as const, variant: "filled" as const }
        : tone === "red"
          ? { color: "error" as const, variant: "filled" as const }
          : tone === "blue"
            ? { color: "info" as const, variant: "filled" as const }
            : { color: "default" as const, variant: "outlined" as const };

  return <Chip size="small" label={props.text} {...chipProps} sx={{ fontWeight: 700 }} />;
}

function sxArray(sx?: SxProps<Theme>) {
  if (!sx) return [];
  return Array.isArray(sx) ? sx : [sx];
}

function M3Button({
  tone = "gray",
  sx,
  ...props
}: React.ComponentProps<typeof Button> & { tone?: "green" | "blue" | "gray" }) {
  const color = tone === "green" ? "success" : tone === "blue" ? "primary" : "inherit";
  const variant = tone === "gray" ? "outlined" : "contained";

  return (
    <Button
      {...props}
      color={color}
      variant={variant}
      sx={[
        {
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 700,
          boxShadow: variant === "contained" ? "none" : undefined,
        },
        ...sxArray(sx),
      ]}
    />
  );
}

function QuietButton({ sx, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      variant="outlined"
      color="inherit"
      sx={[
        {
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 700,
        },
        ...sxArray(sx),
      ]}
    />
  );
}

function getTicketTone(status?: string): "neutral" | "green" | "yellow" | "red" | "blue" {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "green";
  if (s === "in_progress") return "blue";
  if (s === "scheduled") return "yellow";
  if (s === "cancelled") return "red";
  return "neutral";
}

function getTripStatusTone(status?: string): "neutral" | "green" | "yellow" | "red" | "blue" {
  const s = String(status || "").toLowerCase();
  if (s === "complete") return "green";
  if (s === "in_progress") return "blue";
  if (s === "planned") return "yellow";
  if (s === "cancelled") return "red";
  return "neutral";
}

export default function ServiceTicketDetailPage({ params }: ServiceTicketDetailPageProps) {
  const { appUser } = useAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const canDispatch =
    appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";

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

  const myUid = appUser?.uid || "";

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<TicketWithBilling | null>(null);
  const [error, setError] = useState("");

  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [ticketEditSaving, setTicketEditSaving] = useState(false);
  const [ticketEditErr, setTicketEditErr] = useState("");
  const [ticketEditOk, setTicketEditOk] = useState("");
  const [ticketStatusEdit, setTicketStatusEdit] = useState<TicketStatus>("new");
  const [ticketEstimatedMinutesEdit, setTicketEstimatedMinutesEdit] = useState<string>("240");
  const [ticketIssueDetailsEdit, setTicketIssueDetailsEdit] = useState<string>("");

  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState("");

  const [profilesLoading, setProfilesLoading] = useState(true);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [profilesError, setProfilesError] = useState("");

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

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
  const [tripSetTicketScheduled, setTripSetTicketScheduled] = useState(true);

  const [tripSaving, setTripSaving] = useState(false);
  const [tripSaveError, setTripSaveError] = useState("");
  const [tripSaveSuccess, setTripSaveSuccess] = useState("");

  const [tripWorkNotes, setTripWorkNotes] = useState<Record<string, string>>({});
  const [tripResolutionNotes, setTripResolutionNotes] = useState<Record<string, string>>({});
  const [tripFollowUpNotes, setTripFollowUpNotes] = useState<Record<string, string>>({});
  const [tripMaterials, setTripMaterials] = useState<Record<string, TripMaterial[]>>({});
  const [tripActionError, setTripActionError] = useState<Record<string, string>>({});
  const [tripActionSuccess, setTripActionSuccess] = useState<Record<string, string>>({});
  const [tripActionSaving, setTripActionSaving] = useState<Record<string, boolean>>({});

  const [finishModeByTrip, setFinishModeByTrip] = useState<Record<string, FinishMode>>({});
  const [hoursOverrideByTrip, setHoursOverrideByTrip] = useState<Record<string, number>>({});
  const [helperConfirmedByTrip, setHelperConfirmedByTrip] = useState<Record<string, boolean>>({});

  const [mobileFinishOpen, setMobileFinishOpen] = useState(false);

  const [editTripId, setEditTripId] = useState<string | null>(null);
  const [editTripSaving, setEditTripSaving] = useState(false);
  const [editTripErr, setEditTripErr] = useState("");
  const [editTripOk, setEditTripOk] = useState("");

  const [editTripDate, setEditTripDate] = useState<string>(isoTodayLocal());
  const [editTripTimeWindow, setEditTripTimeWindow] = useState<TripTimeWindow>("am");
  const [editTripStartTime, setEditTripStartTime] = useState<string>("08:00");
  const [editTripEndTime, setEditTripEndTime] = useState<string>("12:00");
  const [editTripNotes, setEditTripNotes] = useState<string>("");

  const [billingSaving, setBillingSaving] = useState(false);
  const [billingErr, setBillingErr] = useState("");
  const [billingOk, setBillingOk] = useState("");

  async function ensureTicketInProgressIfNeeded(args: { now: string; reason?: string }) {
    if (!ticket?.id) return;
    if (isTerminalTicketStatus(ticket.status)) return;
    if (String(ticket.status || "") === "in_progress") return;
    if (isAlreadyInProgressOrBeyond(ticket.status)) return;

    await updateDoc(doc(db, "serviceTickets", ticket.id), {
      status: "in_progress",
      updatedAt: args.now,
    });

    setTicket((prev) => (prev ? { ...prev, status: "in_progress", updatedAt: args.now } : prev));
    setTicketStatusEdit("in_progress");
  }

  useEffect(() => {
    async function loadTicket() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.ticketId;
        setTicketId(id);

        const ticketRef = doc(db, "serviceTickets", id);
        const snap = await getDoc(ticketRef);

        if (!snap.exists()) {
          setError("Service ticket not found.");
          setLoading(false);
          return;
        }

        const data = snap.data() as any;

        const item: TicketWithBilling = {
          id: snap.id,
          customerId: data.customerId ?? "",
          customerDisplayName: data.customerDisplayName ?? "",
          serviceAddressId: data.serviceAddressId ?? undefined,
          serviceAddressLabel: data.serviceAddressLabel ?? undefined,
          serviceAddressLine1: data.serviceAddressLine1 ?? "",
          serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
          serviceCity: data.serviceCity ?? "",
          serviceState: data.serviceState ?? "",
          servicePostalCode: data.servicePostalCode ?? "",
          issueSummary: data.issueSummary ?? "",
          issueDetails: data.issueDetails ?? undefined,
          status: data.status ?? "new",
          estimatedDurationMinutes: data.estimatedDurationMinutes ?? 0,
          scheduledDate: data.scheduledDate ?? undefined,
          scheduledStartTime: data.scheduledStartTime ?? undefined,
          scheduledEndTime: data.scheduledEndTime ?? undefined,
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,
          primaryTechnicianId: data.primaryTechnicianId ?? undefined,
          assignedTechnicianIds: Array.isArray(data.assignedTechnicianIds)
            ? data.assignedTechnicianIds.filter(Boolean)
            : undefined,
          secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
          secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
          helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
          helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,
          internalNotes: data.internalNotes ?? undefined,
          active: data.active ?? true,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
          billing: data.billing ?? null,
        };

        setTicket(item);

        setTicketStatusEdit((item.status || "new") as TicketStatus);
        setTicketEstimatedMinutesEdit(String(item.estimatedDurationMinutes || 60));
        setTicketIssueDetailsEdit(String(item.issueDetails || ""));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load service ticket.");
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [params]);

  useEffect(() => {
    async function loadCustomerContact() {
      const customerId = String(ticket?.customerId || "").trim();
      if (!customerId) {
        setCustomerPhone("");
        setCustomerEmail("");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "customers", customerId));
        if (!snap.exists()) {
          setCustomerPhone("");
          setCustomerEmail("");
          return;
        }

        const d = snap.data() as any;
        setCustomerPhone(String(d.phone || "").trim());
        setCustomerEmail(String(d.email || "").trim());
      } catch {
        setCustomerPhone("");
        setCustomerEmail("");
      }
    }

    loadCustomerContact();
  }, [ticket?.customerId]);

  useEffect(() => {
    async function loadTechnicians() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: TechnicianOption[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              uid: data.uid ?? docSnap.id,
              displayName: data.displayName ?? "Unnamed Technician",
              active: data.active ?? false,
              role: data.role ?? "technician",
            };
          })
          .filter((u) => u.role === "technician" && u.active);

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setTechnicians(items);
      } catch (err: unknown) {
        setTechniciansError(err instanceof Error ? err.message : "Failed to load technicians.");
      } finally {
        setTechniciansLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  useEffect(() => {
    async function loadProfiles() {
      setProfilesLoading(true);
      setProfilesError("");

      try {
        const snap = await getDocs(collection(db, "employeeProfiles"));
        const items: EmployeeProfileOption[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          return {
            id: docSnap.id,
            userUid: d.userUid ?? null,
            displayName: d.displayName ?? undefined,
            employmentStatus: d.employmentStatus ?? "current",
            laborRole: d.laborRole ?? "other",
            defaultPairedTechUid: d.defaultPairedTechUid ?? null,
          };
        });

        setEmployeeProfiles(items);
      } catch (err: unknown) {
        setProfilesError(err instanceof Error ? err.message : "Failed to load employee profiles.");
      } finally {
        setProfilesLoading(false);
      }
    }

    loadProfiles();
  }, []);

  const helperCandidates = useMemo(() => {
    const out: { uid: string; name: string; laborRole: string; defaultPairedTechUid?: string | null }[] = [];

    for (const p of employeeProfiles) {
      if ((p.employmentStatus || "current").toLowerCase() !== "current") continue;

      const labor = normalizeRole(p.laborRole);
      if (labor !== "helper" && labor !== "apprentice") continue;

      const uid = String(p.userUid || "").trim();
      if (!uid) continue;

      out.push({
        uid,
        name: p.displayName || "Unnamed",
        laborRole: labor,
        defaultPairedTechUid: p.defaultPairedTechUid ?? null,
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [employeeProfiles]);

  function findTechName(uid: string) {
    const t = technicians.find((x) => x.uid === uid);
    return t?.displayName || "";
  }

  function findHelperName(uid: string) {
    const h = helperCandidates.find((x) => x.uid === uid);
    return h?.name || "";
  }

  useEffect(() => {
    async function loadTrips() {
      if (!ticketId) return;
      setTripsLoading(true);
      setTripsError("");

      try {
        const qTrips = query(
          collection(db, "trips"),
          where("link.serviceTicketId", "==", ticketId),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        );

        const snap = await getDocs(qTrips);

        const items: TripDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          return {
            id: docSnap.id,
            active: d.active ?? true,
            type: d.type ?? "service",
            status: d.status ?? "planned",
            date: d.date ?? "",
            timeWindow: d.timeWindow ?? "custom",
            startTime: d.startTime ?? "",
            endTime: d.endTime ?? "",
            crew: d.crew ?? undefined,
            link: d.link ?? undefined,
            sourceKey: d.sourceKey ?? undefined,
            notes: d.notes ?? null,
            cancelReason: d.cancelReason ?? null,
            timerState: d.timerState ?? undefined,
            actualStartAt: d.actualStartAt ?? null,
            actualEndAt: d.actualEndAt ?? null,
            startedByUid: d.startedByUid ?? null,
            endedByUid: d.endedByUid ?? null,
            pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : undefined,
            actualMinutes: typeof d.actualMinutes === "number" ? d.actualMinutes : null,
            workNotes: d.workNotes ?? null,
            resolutionNotes: d.resolutionNotes ?? null,
            followUpNotes: d.followUpNotes ?? null,
            crewConfirmed: d.crewConfirmed ?? null,
            materials: Array.isArray(d.materials) ? d.materials : null,
            outcome: d.outcome ?? null,
            readyToBillAt: d.readyToBillAt ?? null,
            createdAt: d.createdAt ?? undefined,
            createdByUid: d.createdByUid ?? null,
            updatedAt: d.updatedAt ?? undefined,
            updatedByUid: d.updatedByUid ?? null,
          };
        });

        setTrips(items);

        const nextWork: Record<string, string> = {};
        const nextRes: Record<string, string> = {};
        const nextFollow: Record<string, string> = {};
        const nextMat: Record<string, TripMaterial[]> = {};

        for (const t of items) {
          nextWork[t.id] = String(t.workNotes || "");
          nextRes[t.id] = String(t.resolutionNotes || "");
          nextFollow[t.id] = String(t.followUpNotes || "");
          nextMat[t.id] = Array.isArray(t.materials) && t.materials.length ? (t.materials as TripMaterial[]) : [];
        }

        setTripWorkNotes(nextWork);
        setTripResolutionNotes(nextRes);
        setTripFollowUpNotes(nextFollow);
        setTripMaterials(nextMat);

        setFinishModeByTrip((prev) => {
          const next = { ...prev };
          for (const t of items) {
            if (!next[t.id]) next[t.id] = "none";
          }
          return next;
        });

        setHelperConfirmedByTrip((prev) => {
          const next = { ...prev };
          for (const t of items) {
            if (typeof next[t.id] !== "boolean") next[t.id] = true;
          }
          return next;
        });
      } catch (err: unknown) {
        setTripsError(err instanceof Error ? err.message : "Failed to load trips.");
      } finally {
        setTripsLoading(false);
      }
    }

    loadTrips();
  }, [ticketId]);

  useEffect(() => {
    const { start, end } = windowToTimes(tripTimeWindow);
    if (tripTimeWindow !== "custom") {
      setTripStartTime(start);
      setTripEndTime(end);
    }
  }, [tripTimeWindow]);

  const defaultHelperForPrimary = useMemo(() => {
    const techUid = tripPrimaryTechUid.trim();
    if (!techUid) return "";

    const match = helperCandidates.find((h) => String(h.defaultPairedTechUid || "").trim() === techUid);
    return match?.uid || "";
  }, [tripPrimaryTechUid, helperCandidates]);

  useEffect(() => {
    if (!tripUseDefaultHelper) return;
    if (!tripPrimaryTechUid.trim()) {
      setTripHelperUid("");
      return;
    }
    setTripHelperUid(defaultHelperForPrimary);
  }, [tripUseDefaultHelper, tripPrimaryTechUid, defaultHelperForPrimary]);

  async function handleSaveTicketOverview() {
    if (!canDispatch) return;
    if (!ticket?.id) return;

    setTicketEditErr("");
    setTicketEditOk("");
    setTicketEditSaving(true);

    try {
      const now = nowIso();

      const minutes = Number(ticketEstimatedMinutesEdit);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setTicketEditErr("Estimated duration must be a number > 0.");
        return;
      }

      const nextStatus = ticketStatusEdit as TicketStatus;
      const nextIssueDetails = ticketIssueDetailsEdit.trim();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,
        estimatedDurationMinutes: minutes,
        issueDetails: nextIssueDetails ? nextIssueDetails : null,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              estimatedDurationMinutes: minutes,
              issueDetails: nextIssueDetails ? nextIssueDetails : undefined,
              updatedAt: now,
            }
          : prev
      );

      setTicketEditOk("Ticket updated.");
    } catch (err: unknown) {
      setTicketEditErr(err instanceof Error ? err.message : "Failed to update ticket.");
    } finally {
      setTicketEditSaving(false);
    }
  }

  async function handleCreateTrip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket) return;
    if (!canDispatch) return;

    setTripSaveError("");
    setTripSaveSuccess("");

    const date = tripDate.trim();
    if (!date) {
      setTripSaveError("Trip date is required.");
      return;
    }

    const primaryUid = tripPrimaryTechUid.trim();
    if (!primaryUid) {
      setTripSaveError("Primary technician is required to schedule a trip.");
      return;
    }

    const startTime = tripStartTime.trim();
    const endTime = tripEndTime.trim();
    if (!startTime || !endTime) {
      setTripSaveError("Start and end time are required.");
      return;
    }
    if (endTime <= startTime) {
      setTripSaveError("End time must be after start time.");
      return;
    }

    const helperUid = tripHelperUid.trim() || "";
    const secondaryTechUid = tripSecondaryTechUid.trim() || "";
    const secondaryHelperUid = tripSecondaryHelperUid.trim() || "";

    setTripSaving(true);

    try {
      const now = nowIso();

      const primaryName = findTechName(primaryUid) || "Unnamed Technician";
      const helperName = helperUid ? findHelperName(helperUid) || "Unnamed Helper" : null;
      const secondaryTechName = secondaryTechUid ? findTechName(secondaryTechUid) || "Unnamed Technician" : null;
      const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Unnamed Helper" : null;

      const sourceKey = `serviceTicket:${ticket.id}:${date}:${tripTimeWindow}`;

      const tripPayload = {
        active: true,
        cancelReason: null,
        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
        crew: {
          primaryTechUid: primaryUid,
          primaryTechName: primaryName,
          helperUid: helperUid || null,
          helperName: helperName,
          secondaryTechUid: secondaryTechUid || null,
          secondaryTechName: secondaryTechName,
          secondaryHelperUid: secondaryHelperUid || null,
          secondaryHelperName: secondaryHelperName,
        },
        date,
        startTime,
        endTime,
        timeWindow: tripTimeWindow,
        link: {
          projectId: null,
          projectStageKey: null,
          serviceTicketId: ticket.id,
        },
        notes: tripNotes.trim() || null,
        sourceKey,
        status: "planned",
        type: "service",
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
        crewConfirmed: null,
        materials: null,
        outcome: null,
        readyToBillAt: null,
      };

      const createdTripRef = await addDoc(collection(db, "trips"), tripPayload as any);

      const helperIds = helperUid ? [helperUid] : [];
      const helperNames = helperName ? [helperName] : [];

      const assignedTechnicianIds: string[] = [];
      assignedTechnicianIds.push(primaryUid);
      if (secondaryTechUid && secondaryTechUid !== primaryUid) assignedTechnicianIds.push(secondaryTechUid);
      for (const h of helperIds) {
        if (!assignedTechnicianIds.includes(h)) assignedTechnicianIds.push(h);
      }
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      const nextStatus = tripSetTicketScheduled && ticket.status === "new" ? "scheduled" : ticket.status;

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,
        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: primaryUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds: assignedTechnicianIds.length ? assignedTechnicianIds : null,
        updatedAt: now,
      });

      setTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: nextStatus as any,
          assignedTechnicianId: primaryUid,
          assignedTechnicianName: primaryName,
          primaryTechnicianId: primaryUid,
          secondaryTechnicianId: secondaryTechUid || undefined,
          secondaryTechnicianName: secondaryTechUid ? (secondaryTechName || undefined) : undefined,
          helperIds: helperIds.length ? helperIds : undefined,
          helperNames: helperNames.length ? helperNames : undefined,
          assignedTechnicianIds: assignedTechnicianIds.length ? assignedTechnicianIds : undefined,
          updatedAt: now,
        };
      });

      const createdTrip: TripDoc = {
        id: createdTripRef.id,
        ...(tripPayload as any),
        materials: [],
        pauseBlocks: [],
      };

      setTrips((prev) =>
        [...prev, createdTrip].sort((a, b) => {
          const byDate = (a.date || "").localeCompare(b.date || "");
          if (byDate !== 0) return byDate;
          return (a.startTime || "").localeCompare(b.startTime || "");
        })
      );

      setTripWorkNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripResolutionNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripFollowUpNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripMaterials((prev) => ({ ...prev, [createdTrip.id]: [] }));

      setFinishModeByTrip((prev) => ({ ...prev, [createdTrip.id]: "none" }));
      setHelperConfirmedByTrip((prev) => ({ ...prev, [createdTrip.id]: true }));

      setTripSaveSuccess(`Trip scheduled (${formatTripWindow(tripTimeWindow)}).`);
      setTripNotes("");
      setScheduleOpen(false);
    } catch (err: unknown) {
      setTripSaveError(err instanceof Error ? err.message : "Failed to create trip.");
    } finally {
      setTripSaving(false);
    }
  }

  function setTripSavingFlag(tripId: string, value: boolean) {
    setTripActionSaving((prev) => ({ ...prev, [tripId]: value }));
  }
  function setTripErr(tripId: string, msg: string) {
    setTripActionError((prev) => ({ ...prev, [tripId]: msg }));
  }
  function setTripOk(tripId: string, msg: string) {
    setTripActionSuccess((prev) => ({ ...prev, [tripId]: msg }));
  }

  function addMaterialRow(tripId: string) {
    setTripMaterials((prev) => {
      const cur = Array.isArray(prev[tripId]) ? prev[tripId] : [];
      return {
        ...prev,
        [tripId]: [...cur, { name: "", qty: 1 }],
      };
    });
  }

  function updateMaterialRow(tripId: string, idx: number, patch: Partial<TripMaterial>) {
    setTripMaterials((prev) => {
      const cur = Array.isArray(prev[tripId]) ? prev[tripId] : [];
      const next = cur.map((m, i) => (i === idx ? { ...m, ...patch } : m));
      return { ...prev, [tripId]: next };
    });
  }

  function removeMaterialRow(tripId: string, idx: number) {
    setTripMaterials((prev) => {
      const cur = Array.isArray(prev[tripId]) ? prev[tripId] : [];
      const next = cur.filter((_, i) => i !== idx);
      return { ...prev, [tripId]: next };
    });
  }

  function applyHelperConfirmation(crew: TripCrew | null, tripId: string): TripCrew | null {
    if (!crew) return crew;
    const helperConfirmed = helperConfirmedByTrip[tripId];
    if (typeof helperConfirmed === "boolean" && helperConfirmed === false) {
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
    const computed = roundToHalf(computedMinutes / 60);
    const override = hoursOverrideByTrip[tripId];
    if (typeof override === "number" && Number.isFinite(override) && override >= 0) return roundToHalf(override);
    return computed;
  }

  function canCurrentUserActOnTrip(trip: TripDoc) {
    if (!myUid) return false;
    if (appUser?.role === "admin") return true;
    return isUidOnTripCrew(myUid, trip.crew || null);
  }

    async function handleStartTrip(trip: TripDoc) {
    if (!canStartTripRole) return;
    if (!myUid) return;

    if (appUser?.role !== "admin" && !isUidOnTripCrew(myUid, trip.crew || null)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
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
        updatedAt: now,
        updatedByUid: myUid,
        crewConfirmed: trip.crew || null,
        pauseBlocks: Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [],
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                status: "in_progress",
                timerState: "running",
                actualStartAt: t.actualStartAt || now,
                actualEndAt: null,
                startedByUid: t.startedByUid || myUid,
                crewConfirmed: t.crew || t.crewConfirmed,
                pauseBlocks: Array.isArray(t.pauseBlocks) ? t.pauseBlocks : [],
                updatedAt: now,
                updatedByUid: myUid,
              }
            : t
        )
      );

      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));

      if (ticket?.id && !isTerminalTicketStatus(ticket.status) && !isAlreadyInProgressOrBeyond(ticket.status)) {
        await ensureTicketInProgressIfNeeded({ now, reason: "start_trip" });
      }

      setTripOk(trip.id, "Trip started.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to start trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handlePauseTrip(trip: TripDoc) {
    if (!canWorkTrip) return;
    if (!myUid) return;

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const curBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];
      const hasOpen = curBlocks.some((b) => b && b.startAt && !b.endAt);
      if (hasOpen) {
        setTripErr(trip.id, "Trip is already paused.");
        return;
      }

      curBlocks.push({ startAt: now, endAt: null });

      await updateDoc(doc(db, "trips", trip.id), {
        timerState: "paused",
        pauseBlocks: curBlocks,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, timerState: "paused", pauseBlocks: curBlocks } : t))
      );

      setTripOk(trip.id, "Paused.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to pause trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleResumeTrip(trip: TripDoc) {
    if (!canWorkTrip) return;
    if (!myUid) return;

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const curBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];

      let closed = false;
      for (let i = curBlocks.length - 1; i >= 0; i--) {
        const b = curBlocks[i];
        if (b && b.startAt && !b.endAt) {
          curBlocks[i] = { ...b, endAt: now };
          closed = true;
          break;
        }
      }

      if (!closed) {
        setTripErr(trip.id, "No active pause to resume.");
        return;
      }

      await updateDoc(doc(db, "trips", trip.id), {
        timerState: "running",
        pauseBlocks: curBlocks,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, timerState: "running", pauseBlocks: curBlocks } : t))
      );

      setTripOk(trip.id, "Resumed.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to resume trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleSaveWorkNotes(trip: TripDoc) {
    if (!canWorkTrip) return;
    if (!myUid) return;

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const notes = (tripWorkNotes[trip.id] || "").trim();

      await updateDoc(doc(db, "trips", trip.id), {
        workNotes: notes || null,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, workNotes: notes || null } : t))
      );

      setTripOk(trip.id, "Notes saved.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

    async function handleResolveTrip(trip: TripDoc) {
    if (!canWorkTrip) return;
    if (!myUid) return;

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();

      const resolution = (tripResolutionNotes[trip.id] || "").trim();
      if (!resolution) {
        setTripErr(trip.id, "Resolved requires resolution notes.");
        return;
      }

      const mats = Array.isArray(tripMaterials[trip.id]) ? tripMaterials[trip.id] : [];
      const matCheck = validateMaterialsForResolved(mats);
      if (!matCheck.ok) {
        setTripErr(trip.id, matCheck.message || "Materials validation failed.");
        return;
      }

      let pauseBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];
      for (let i = pauseBlocks.length - 1; i >= 0; i--) {
        const b = pauseBlocks[i];
        if (b && b.startAt && !b.endAt) {
          pauseBlocks[i] = { ...b, endAt: now };
          break;
        }
      }

      const startAt = trip.actualStartAt || now;
      const gross = minutesBetweenIso(startAt, now);
      const paused = sumPausedMinutes(pauseBlocks);
      const actualMinutes = Math.max(0, gross - paused);

      if (!trip.date) throw new Error("Trip is missing date; cannot create time entries.");
      if (!actualMinutes || actualMinutes <= 0) throw new Error("Trip duration is 0 minutes; no time entry created.");

      const latestSnap = await getDoc(doc(db, "trips", trip.id));
      const latestTrip = latestSnap.exists() ? (latestSnap.data() as any) : null;

      const crewConfirmedBase: TripCrew | null = (latestTrip?.crewConfirmed ?? trip.crewConfirmed ?? null) as any;
      const crewFallbackBase: TripCrew | null = (latestTrip?.crew ?? trip.crew ?? null) as any;

      const crewConfirmed = applyHelperConfirmation(crewConfirmedBase, trip.id);
      const crewFallback = applyHelperConfirmation(crewFallbackBase, trip.id);

      const crewMembers = crewMembersFromTrip({ crewConfirmed, crew: crewFallback });
      if (crewMembers.length === 0) {
        throw new Error("No crew members found on trip (crewConfirmed/crew empty). Cannot create time entries.");
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
          workNotes: (tripWorkNotes[trip.id] || "").trim() || null,
          resolutionNotes: resolution,
          followUpNotes: null,
          outcome: "resolved",
          readyToBillAt: now,
          materials: matCheck.cleaned,
          crewConfirmed: crewConfirmed || crewFallback || null,
          updatedAt: now,
          updatedByUid: myUid,
        }) as any
      );

      for (const m of crewMembers) {
        const timesheetId = await upsertWeeklyTimesheetHeader({
          employeeId: m.uid,
          employeeName: m.name,
          employeeRole: m.role,
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
          member: m,
          entryDate,
          hoursGenerated: hoursToUse,
          weekStartDate,
          weekEndDate,
          timesheetId,
          createdByUid: myUid || null,
          displayTitle: ticket?.customerDisplayName || "Customer",
          displaySubtitle: ticket?.issueSummary || "Service Ticket",
          outcomeLabel: "Resolved",
          addressShort,
        });
      }

      if (ticket?.id) {
        const primaryUid = crewConfirmed?.primaryTechUid || crewFallback?.primaryTechUid || "";
        const primaryName =
          crewConfirmed?.primaryTechName ||
          crewFallback?.primaryTechName ||
          findTechName(primaryUid) ||
          "Primary Tech";

        const billingPacket: BillingPacket = {
          status: "ready_to_bill",
          readyToBillAt: now,
          readyToBillTripId: trip.id,
          resolutionNotes: resolution,
          workNotes: (tripWorkNotes[trip.id] || "").trim() || null,
          labor: {
            totalHours: hoursToUse,
            byCrew: primaryUid
              ? [
                  {
                    uid: primaryUid,
                    name: primaryName,
                    role: "technician",
                    hours: hoursToUse,
                  },
                ]
              : [],
          },
          materials: matCheck.cleaned,
          photos: [],
          updatedAt: now,
        };

        await updateDoc(doc(db, "serviceTickets", ticket.id), {
          status: "completed",
          updatedAt: now,
          billing: billingPacket,
        });

        setTicket((prev) => (prev ? { ...prev, status: "completed", updatedAt: now, billing: billingPacket } : prev));
        setTicketStatusEdit("completed");
      }

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                status: "complete",
                timerState: "complete",
                actualEndAt: now,
                endedByUid: myUid,
                pauseBlocks,
                actualMinutes,
                workNotes: (tripWorkNotes[trip.id] || "").trim() || null,
                resolutionNotes: resolution,
                followUpNotes: null,
                materials: matCheck.cleaned as any,
                outcome: "resolved",
                readyToBillAt: now,
                crewConfirmed: crewConfirmed || crewFallback || null,
              }
            : t
        )
      );

      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));
      setMobileFinishOpen(false);

      setTripOk(trip.id, `Resolved. Hours: ${hoursToUse}. Time entries: ${crewMembers.length}`);
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to resolve trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleFollowUpTrip(trip: TripDoc) {
    if (!canWorkTrip) return;
    if (!myUid) return;

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();

      const follow = (tripFollowUpNotes[trip.id] || "").trim();
      if (!follow) {
        setTripErr(trip.id, "Follow Up requires follow-up notes.");
        return;
      }

      let pauseBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];
      for (let i = pauseBlocks.length - 1; i >= 0; i--) {
        const b = pauseBlocks[i];
        if (b && b.startAt && !b.endAt) {
          pauseBlocks[i] = { ...b, endAt: now };
          break;
        }
      }

      const startAt = trip.actualStartAt || now;
      const gross = minutesBetweenIso(startAt, now);
      const paused = sumPausedMinutes(pauseBlocks);
      const actualMinutes = Math.max(0, gross - paused);

      if (!trip.date) throw new Error("Trip is missing date; cannot create time entries.");
      if (!actualMinutes || actualMinutes <= 0) throw new Error("Trip duration is 0 minutes; no time entry created.");

      const latestSnap = await getDoc(doc(db, "trips", trip.id));
      const latestTrip = latestSnap.exists() ? (latestSnap.data() as any) : null;

      const crewConfirmedBase: TripCrew | null = (latestTrip?.crewConfirmed ?? trip.crewConfirmed ?? null) as any;
      const crewFallbackBase: TripCrew | null = (latestTrip?.crew ?? trip.crew ?? null) as any;

      const crewConfirmed = applyHelperConfirmation(crewConfirmedBase, trip.id);
      const crewFallback = applyHelperConfirmation(crewFallbackBase, trip.id);

      const crewMembers = crewMembersFromTrip({ crewConfirmed, crew: crewFallback });
      if (crewMembers.length === 0) {
        throw new Error("No crew members found on trip (crewConfirmed/crew empty). Cannot create time entries.");
      }

      const hoursToUse = getHoursToUse(trip.id, actualMinutes);
      const entryDate = trip.date;
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

      await updateDoc(doc(db, "trips", trip.id), {
        status: "complete",
        timerState: "complete",
        actualEndAt: now,
        endedByUid: myUid,
        pauseBlocks,
        actualMinutes,
        workNotes: (tripWorkNotes[trip.id] || "").trim() || null,
        resolutionNotes: null,
        followUpNotes: follow,
        outcome: "follow_up",
        readyToBillAt: null,
        crewConfirmed: crewConfirmed || crewFallback || null,
        updatedAt: now,
        updatedByUid: myUid,
      });

      for (const m of crewMembers) {
        const timesheetId = await upsertWeeklyTimesheetHeader({
          employeeId: m.uid,
          employeeName: m.name,
          employeeRole: m.role,
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
          member: m,
          entryDate,
          hoursGenerated: hoursToUse,
          weekStartDate,
          weekEndDate,
          timesheetId,
          createdByUid: myUid || null,
          displayTitle: ticket?.customerDisplayName || "Customer",
          displaySubtitle: ticket?.issueSummary || "Service Ticket",
          outcomeLabel: "Follow Up",
          addressShort,
        });
      }

      if (ticket?.id) {
        await updateDoc(doc(db, "serviceTickets", ticket.id), {
          status: "follow_up",
          updatedAt: now,
        });

        setTicket((prev) => (prev ? { ...prev, status: "follow_up", updatedAt: now } : prev));
        setTicketStatusEdit("follow_up");
      }

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                status: "complete",
                timerState: "complete",
                actualEndAt: now,
                endedByUid: myUid,
                pauseBlocks,
                actualMinutes,
                workNotes: (tripWorkNotes[trip.id] || "").trim() || null,
                followUpNotes: follow,
                resolutionNotes: null,
                outcome: "follow_up",
                crewConfirmed: crewConfirmed || crewFallback || null,
              }
            : t
        )
      );

      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));
      setMobileFinishOpen(false);

      setTripOk(trip.id, `Follow Up logged. Hours: ${hoursToUse}. Time entries: ${crewMembers.length}`);
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to complete follow-up.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

    function openEditTrip(t: TripDoc) {
    setEditTripErr("");
    setEditTripOk("");
    setEditTripId(t.id);

    setEditTripDate(t.date || isoTodayLocal());
    setEditTripTimeWindow((t.timeWindow as TripTimeWindow) || "custom");
    setEditTripStartTime(t.startTime || "08:00");
    setEditTripEndTime(t.endTime || "12:00");
    setEditTripNotes(String(t.notes || ""));
  }

  function closeEditTrip() {
    setEditTripId(null);
    setEditTripErr("");
    setEditTripOk("");
    setEditTripSaving(false);
  }

  async function handleSaveTripEdits() {
    if (!canDispatch) return;
    if (!editTripId) return;

    setEditTripErr("");
    setEditTripOk("");
    setEditTripSaving(true);

    try {
      const now = nowIso();

      const date = editTripDate.trim();
      if (!date) {
        setEditTripErr("Trip date is required.");
        return;
      }

      const startTime = editTripStartTime.trim();
      const endTime = editTripEndTime.trim();
      if (!startTime || !endTime) {
        setEditTripErr("Start and end time are required.");
        return;
      }
      if (endTime <= startTime) {
        setEditTripErr("End time must be after start time.");
        return;
      }

      const payload = stripUndefined({
        date,
        timeWindow: editTripTimeWindow,
        startTime,
        endTime,
        notes: editTripNotes.trim() || null,
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      await updateDoc(doc(db, "trips", editTripId), payload as any);

      setTrips((prev) =>
        prev.map((t) =>
          t.id === editTripId
            ? {
                ...t,
                date,
                timeWindow: editTripTimeWindow,
                startTime,
                endTime,
                notes: editTripNotes.trim() || null,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : t
        )
      );

      setEditTripOk("Trip updated.");
      setTimeout(() => closeEditTrip(), 650);
    } catch (err: unknown) {
      setEditTripErr(err instanceof Error ? err.message : "Failed to update trip.");
    } finally {
      setEditTripSaving(false);
    }
  }

  async function handleSoftDeleteTrip(t: TripDoc) {
    if (!canDispatch) return;

    const status = String(t.status || "").toLowerCase();
    if (status === "in_progress" || status === "complete") {
      alert("You can’t delete a trip that is in progress or complete.");
      return;
    }

    const confirm = window.prompt(
      `Type DELETE to remove this trip from the schedule.\n\nTrip: ${t.date} ${t.startTime}-${t.endTime}`,
      ""
    );
    if (confirm !== "DELETE") return;

    setTripErr(t.id, "");
    setTripOk(t.id, "");
    setTripSavingFlag(t.id, true);

    try {
      const now = nowIso();

      await updateDoc(doc(db, "trips", t.id), {
        status: "cancelled",
        timerState: "complete",
        active: false,
        cancelReason: "deleted",
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      setTrips((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                status: "cancelled",
                timerState: "complete",
                active: false,
                cancelReason: "deleted",
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : x
        )
      );

      setTripOk(t.id, "Trip removed (soft delete).");
    } catch (err: unknown) {
      setTripErr(t.id, err instanceof Error ? err.message : "Failed to delete trip.");
    } finally {
      setTripSavingFlag(t.id, false);
    }
  }

  async function handleClaimAndStartTrip() {
    if (!ticket?.id) return;
    if (!myUid) return;

    const role = String(appUser?.role || "");
    const canSelfDispatch =
      role === "technician" ||
      role === "helper" ||
      role === "apprentice" ||
      role === "admin" ||
      role === "dispatcher" ||
      role === "manager";

    if (!canSelfDispatch) {
      alert("You do not have permission to claim tickets.");
      return;
    }

    const curStatus = String(ticket.status || "").toLowerCase();
    if (curStatus === "completed" || curStatus === "cancelled") {
      alert("This ticket is not claimable.");
      return;
    }

    if (ticket.assignedTechnicianId) {
      alert("This ticket is already assigned.");
      return;
    }

    const now = new Date();
    const nowIsoStr = now.toISOString();
    const date = isoTodayLocal();
    const startTime = hhmmLocal(now);
    const endTime = hhmmLocal(addMinutes(now, 60));

    const defaultHelperUid =
      helperCandidates.find((h) => String(h.defaultPairedTechUid || "").trim() === myUid)?.uid || "";
    const helperUid = defaultHelperUid || "";
    const helperName = helperUid
      ? helperCandidates.find((h) => h.uid === helperUid)?.name || "Helper"
      : null;

    try {
      const ticketRef = doc(db, "serviceTickets", ticket.id);
      const tripsCol = collection(db, "trips");
      const newTripRef = doc(tripsCol);

      await runTransaction(db, async (tx) => {
        const ticketSnap = await tx.get(ticketRef);
        if (!ticketSnap.exists()) throw new Error("Ticket not found.");

        const live = ticketSnap.data() as any;

        if (live.assignedTechnicianId) throw new Error("Already claimed by another user.");

        const liveStatus = String(live.status || "").toLowerCase();
        if (liveStatus === "completed" || liveStatus === "cancelled") {
          throw new Error("Ticket is not claimable.");
        }

        tx.set(newTripRef, {
          active: true,
          type: "service",
          status: "in_progress",
          date,
          timeWindow: "custom",
          startTime,
          endTime,
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
          actualStartAt: nowIsoStr,
          actualEndAt: null,
          startedByUid: myUid,
          endedByUid: null,
          pauseBlocks: [],
          actualMinutes: null,
          workNotes: null,
          resolutionNotes: null,
          followUpNotes: null,
          materials: null,
          outcome: null,
          readyToBillAt: null,
          createdAt: nowIsoStr,
          createdByUid: myUid,
          updatedAt: nowIsoStr,
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
          updatedAt: nowIsoStr,
        });
      });

      alert("Claimed and started trip.");
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Failed to claim ticket.");
    }
  }

  const billing = ticket?.billing ?? null;
  const showFullBillingPanel = Boolean(billing);

  async function markBillingStatus(nextStatus: BillingPacket["status"]) {
    if (!ticket?.id) return;
    if (!canBill) return;

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    try {
      const now = nowIso();

      const base: BillingPacket =
        billing ||
        ({
          status: "not_ready",
          readyToBillAt: null,
          readyToBillTripId: null,
          resolutionNotes: null,
          workNotes: null,
          labor: { totalHours: 0, byCrew: [] },
          materials: [],
          photos: [],
          updatedAt: now,
        } as BillingPacket);

      const next: BillingPacket = {
        ...base,
        status: nextStatus,
        updatedAt: now,
      };

      if (nextStatus === "not_ready") {
        next.readyToBillAt = null;
        next.readyToBillTripId = null;
      }

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        billing: next,
        updatedAt: now,
      });

      setTicket((prev) => (prev ? { ...prev, billing: next, updatedAt: now } : prev));
      setBillingOk(`Billing status updated: ${nextStatus.replaceAll("_", " ")}`);
    } catch (err: unknown) {
      setBillingErr(err instanceof Error ? err.message : "Failed to update billing status.");
    } finally {
      setBillingSaving(false);
    }
  }

  const mainColumnsSx = {
    display: "grid",
    gap: 2.5,
    gridTemplateColumns: {
      xs: "1fr",
      md: "minmax(0, 1.25fr) minmax(340px, 0.95fr)",
    },
    alignItems: "start",
  } as const;

  const twoColSx = {
    display: "grid",
    gap: 2,
    gridTemplateColumns: {
      xs: "1fr",
      md: "1fr 1fr",
    },
  } as const;

  const customerAddressSx = {
    display: "grid",
    gap: 2,
    gridTemplateColumns: {
      xs: "1fr",
      md: "minmax(0, 0.95fr) minmax(0, 1.25fr)",
    },
  } as const;

  const materialsTwoColSx = {
    display: "grid",
    gap: 1,
    gridTemplateColumns: {
      xs: "1fr 1fr",
      sm: "1fr 1fr",
    },
  } as const;

  const materialsFourSx = {
    display: "grid",
    gap: 1,
    gridTemplateColumns: {
      xs: "1fr",
      sm: "1fr 1fr",
    },
  } as const;

  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <Alert severity="info">Loading service ticket…</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !error && ticket ? (
          <Box sx={{ display: "grid", gap: 3 }}>
            {isMobile && (() => {
              const startableTrip = trips
                .filter((t) => {
                  const status = String(t.status || "");
                  const cancelled = status === "cancelled";
                  const complete = status === "complete";
                  const inProg = status === "in_progress";
                  if (cancelled || complete || inProg) return false;
                  if (!canStartTripRole) return false;
                  return canCurrentUserActOnTrip(t);
                })
                .find((t) => String(t.date || "") === isoTodayLocal()) ||
                trips.find((t) => {
                  const status = String(t.status || "");
                  const cancelled = status === "cancelled";
                  const complete = status === "complete";
                  const inProg = status === "in_progress";
                  if (cancelled || complete || inProg) return false;
                  if (!canStartTripRole) return false;
                  return canCurrentUserActOnTrip(t);
                }) ||
                null;

              return startableTrip ? (
                <Paper
                  variant="outlined"
                  sx={{
                    position: "sticky",
                    top: 12,
                    zIndex: 10,
                    p: 1.5,
                    borderRadius: 4,
                    borderColor: alpha(theme.palette.primary.main, 0.28),
                    backgroundColor: alpha(theme.palette.primary.main, 0.06),
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between" flexWrap="wrap">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Ready to start?
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {startableTrip.date} • {formatTripWindow(String(startableTrip.timeWindow || ""))} • {startableTrip.startTime}-{startableTrip.endTime}
                      </Typography>
                    </Box>

                    <Fab
                      variant="extended"
                      color="primary"
                      size="medium"
                      onClick={() => handleStartTrip(startableTrip)}
                      sx={{ boxShadow: "none" }}
                    >
                      <PlayArrowRoundedIcon sx={{ mr: 0.75 }} />
                      Start Trip
                    </Fab>
                  </Stack>
                </Paper>
              ) : null;
            })()}

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", md: "center" }}
              justifyContent="space-between"
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h4" fontWeight={800}>
                    {ticket.issueSummary}
                  </Typography>
                  <StatusPill text={formatTicketStatus(ticket.status)} tone={getTicketTone(ticket.status)} />
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip
                    variant="outlined"
                    label={`Ticket ID: ${ticketId}`}
                    sx={{ borderRadius: 999, fontWeight: 700 }}
                  />
                  <Tooltip title="Copy ticket ID">
                    <IconButton
                      size="small"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(ticketId);
                        } catch {}
                      }}
                    >
                      <ContentCopyRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap flexWrap="wrap">
                {!ticket.assignedTechnicianId ? (
                  <M3Button tone="green" onClick={handleClaimAndStartTrip} startIcon={<PlayArrowRoundedIcon />}>
                    Claim & Start Trip
                  </M3Button>
                ) : null}

                <Link href="/service-tickets" style={{ textDecoration: "none" }}>
                  <Button
                    variant="outlined"
                    startIcon={<ArrowBackRoundedIcon />}
                    sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
                  >
                    Back to Tickets
                  </Button>
                </Link>
              </Stack>
            </Stack>

            <Box sx={mainColumnsSx}>
              <Stack spacing={2.5}>
                <SectionCard
                  title="Customer & Service Address"
                  icon={<PlaceOutlinedIcon color="primary" />}
                  action={
                    buildMapsUrl(
                      `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
                    ) ? (
 <a
  href={buildMapsUrl(
    `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
  )}
  target="_blank"
  rel="noreferrer"
  style={{ textDecoration: "none" }}
>
  <Button
    variant="text"
    sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700 }}
  >
    Open in Maps
  </Button>
</a>
                    ) : null
                  }
                >
                  <Box sx={customerAddressSx}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                          Customer
                        </Typography>

                        <Stack spacing={1.25}>
                          <Typography variant="body1">
                            <strong>Name:</strong> {ticket.customerDisplayName || "—"}
                          </Typography>

                          <Stack direction="row" spacing={1} alignItems="center">
                            <PhoneOutlinedIcon fontSize="small" color="action" />
                            <Typography variant="body1">
                              {customerPhone ? (
                                <a href={`tel:${customerPhone}`} style={{ color: "inherit" }}>
                                  {customerPhone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </Typography>
                          </Stack>

                          <Stack direction="row" spacing={1} alignItems="center">
                            <AlternateEmailRoundedIcon fontSize="small" color="action" />
                            <Typography variant="body1">
                              {customerEmail ? (
                                <a href={`mailto:${customerEmail}`} style={{ color: "inherit" }}>
                                  {customerEmail}
                                </a>
                              ) : (
                                "—"
                              )}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Box>

                      <Divider />

                      <Box>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                          Service Address
                        </Typography>

                        <Stack spacing={0.75}>
                          <Typography variant="body1">
                            <strong>Label:</strong> {ticket.serviceAddressLabel || "—"}
                          </Typography>
                          <Typography variant="body1">{ticket.serviceAddressLine1 || "—"}</Typography>
                          {ticket.serviceAddressLine2 ? (
                            <Typography variant="body1">{ticket.serviceAddressLine2}</Typography>
                          ) : null}
                          <Typography variant="body1">
                            {ticket.serviceCity || "—"}, {ticket.serviceState || "—"} {ticket.servicePostalCode || ""}
                          </Typography>
                        </Stack>

                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                          <QuietButton
                            startIcon={<ContentCopyRoundedIcon />}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
                                );
                              } catch {}
                            }}
                          >
                            Copy Address
                          </QuietButton>

                          {buildMapsUrl(
                            `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
                          ) ? (
<a
  href={buildMapsUrl(
    `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
  )}
  target="_blank"
  rel="noreferrer"
  style={{ textDecoration: "none" }}
>
  <QuietButton startIcon={<PlaceOutlinedIcon />}>
    Open Maps
  </QuietButton>
</a>
                          ) : null}
                        </Stack>
                      </Box>
                    </Stack>

                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 4,
                        overflow: "hidden",
                        minHeight: { xs: 240, md: 340 },
                        bgcolor: "action.hover",
                      }}
                    >
                      {buildMapsEmbedUrl(
                        `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
                      ) ? (
                        <iframe
                          title="Map"
                          src={buildMapsEmbedUrl(
                            `${ticket.serviceAddressLine1 || ""} ${ticket.serviceAddressLine2 || ""}, ${ticket.serviceCity || ""}, ${ticket.serviceState || ""} ${ticket.servicePostalCode || ""}`.trim()
                          )}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          style={{
                            width: "100%",
                            height: isMobile ? 240 : 340,
                            border: 0,
                            display: "block",
                          }}
                        />
                      ) : (
                        <Box sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary">
                            No address available to show a map.
                          </Typography>
                        </Box>
                      )}
                    </Paper>
                  </Box>
                </SectionCard>

                <SectionCard title="Ticket Overview" icon={<AssignmentTurnedInRoundedIcon color="primary" />}>
                  {canDispatch ? (
                    <Stack spacing={2}>
                      <Box sx={twoColSx}>
                        <TextField
                          select
                          fullWidth
                          size="small"
                          label="Status"
                          value={ticketStatusEdit}
                          onChange={(e) => setTicketStatusEdit(e.target.value as TicketStatus)}
                          disabled={ticketEditSaving}
                        >
                          <MenuItem value="new">New</MenuItem>
                          <MenuItem value="scheduled">Scheduled</MenuItem>
                          <MenuItem value="in_progress">In Progress</MenuItem>
                          <MenuItem value="follow_up">Follow Up</MenuItem>
                          <MenuItem value="completed">Completed</MenuItem>
                          <MenuItem value="cancelled">Cancelled</MenuItem>
                        </TextField>

                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          label="Estimated Duration (minutes)"
                          inputProps={{ min: 1 }}
                          value={ticketEstimatedMinutesEdit}
                          onChange={(e) => setTicketEstimatedMinutesEdit(e.target.value)}
                          disabled={ticketEditSaving}
                        />
                      </Box>

                      <TextField
                        fullWidth
                        multiline
                        minRows={4}
                        label="Issue Details"
                        value={ticketIssueDetailsEdit}
                        onChange={(e) => setTicketIssueDetailsEdit(e.target.value)}
                        disabled={ticketEditSaving}
                        placeholder="Add or update issue details for the tech..."
                      />

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ xs: "stretch", sm: "center" }}>
                        <M3Button tone="blue" onClick={handleSaveTicketOverview} disabled={ticketEditSaving}>
                          {ticketEditSaving ? "Saving..." : "Save Ticket Overview"}
                        </M3Button>

                        {ticketEditErr ? <Alert severity="error" sx={{ py: 0 }}>{ticketEditErr}</Alert> : null}
                        {ticketEditOk ? <Alert severity="success" sx={{ py: 0 }}>{ticketEditOk}</Alert> : null}
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack spacing={1.25}>
                      <Typography variant="body1">
                        <strong>Current Status:</strong> {formatTicketStatus(ticket.status)}
                      </Typography>
                      <Typography variant="body1">
                        <strong>Estimated Duration:</strong> {ticket.estimatedDurationMinutes} minutes
                      </Typography>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                          Issue Details
                        </Typography>
                        <Typography variant="body1">
                          {ticket.issueDetails || "No additional issue details."}
                        </Typography>
                      </Box>
                    </Stack>
                  )}
                </SectionCard>
              </Stack>

              <Stack spacing={2.5}>
                <SectionCard
                  title="Trips"
                  icon={<ScheduleRoundedIcon color="primary" />}
                  action={
                    canDispatch ? (
                      <M3Button
                        tone="blue"
                        onClick={() => setScheduleOpen((v) => !v)}
                        startIcon={<AddRoundedIcon />}
                      >
                        {scheduleOpen ? "Close" : "Schedule New Trip"}
                      </M3Button>
                    ) : null
                  }
                >
                  <Stack spacing={1.5}>
                    {tripsLoading ? <Alert severity="info">Loading trips…</Alert> : null}
                    {tripsError ? <Alert severity="error">{tripsError}</Alert> : null}

                    {!tripsLoading && !tripsError ? (
                      <>
                        {trips.length === 0 ? (
                          <Alert severity="info" variant="outlined">
                            No trips scheduled yet.
                          </Alert>
                        ) : (
                          trips.map((t) => {
                            const crew = t.crew || {};
                            const primary = crew.primaryTechName || "Unassigned";
                            const helper = crew.helperName ? `Helper: ${crew.helperName}` : "";
                            const secondary = crew.secondaryTechName ? `2nd Tech: ${crew.secondaryTechName}` : "";
                            const secondaryHelper = crew.secondaryHelperName ? `2nd Helper: ${crew.secondaryHelperName}` : "";

                            const canAct = canCurrentUserActOnTrip(t);
                            const savingThis = Boolean(tripActionSaving[t.id]);
                            const errMsg = tripActionError[t.id] || "";
                            const okMsg = tripActionSuccess[t.id] || "";

                            const timerState = (t.timerState || (t.status === "in_progress" ? "running" : "not_started")) as string;
                            const isRunning = timerState === "running";
                            const isPaused = timerState === "paused";
                            const isComplete = timerState === "complete" || t.status === "complete";
                            const isInProgress = t.status === "in_progress";
                            const isCancelled = t.status === "cancelled";

                            const pausedMins = sumPausedMinutes(t.pauseBlocks);
                            const liveGrossMins =
                              t.actualStartAt && !t.actualEndAt
                                ? minutesBetweenIso(t.actualStartAt, nowIso())
                                : t.actualStartAt && t.actualEndAt
                                  ? minutesBetweenIso(t.actualStartAt, t.actualEndAt)
                                  : 0;

                            const computedBillable = Math.max(0, liveGrossMins - pausedMins);
                            const computedHours = roundToHalf(computedBillable / 60);

                            const hoursToUse =
                              typeof hoursOverrideByTrip[t.id] === "number"
                                ? roundToHalf(hoursOverrideByTrip[t.id])
                                : computedHours;

                            const mats = Array.isArray(tripMaterials[t.id]) ? tripMaterials[t.id] : [];

                            const finishMode = finishModeByTrip[t.id] || "none";
                            const showFinishPanel = isInProgress && finishMode !== "none";
                            const showFollowUpField = showFinishPanel && finishMode === "follow_up";
                            const showResolvedFields = showFinishPanel && finishMode === "resolved";
                            const hideInlineFinishPanelOnMobile =
                              isMobile &&
                              trips.find((x) => String(x.status || "") === "in_progress")?.id === t.id;

                            return (
                              <Paper
                                key={t.id}
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderRadius: 4,
                                  borderColor:
                                    isInProgress
                                      ? alpha(theme.palette.info.main, 0.28)
                                      : isComplete
                                        ? alpha(theme.palette.success.main, 0.28)
                                        : "divider",
                                  bgcolor:
                                    isInProgress
                                      ? alpha(theme.palette.info.main, 0.03)
                                      : "background.paper",
                                }}
                              >
                                <Stack spacing={1.25}>
                                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                                    <Box>
                                      <Typography variant="subtitle1" fontWeight={700}>
                                        {t.date} • {formatTripWindow(String(t.timeWindow || ""))} • {t.startTime}-{t.endTime}
                                      </Typography>

                                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                                        <StatusPill text={oneLine(t.status)} tone={getTripStatusTone(t.status)} />
                                        <StatusPill text={`Timer: ${timerState}`} tone={isPaused ? "yellow" : isInProgress ? "blue" : isComplete ? "green" : "neutral"} />
                                      </Stack>
                                    </Box>

                                    {canDispatch ? (
                                      <Stack direction="row" spacing={1}>
                                        <Tooltip title="Edit trip">
                                          <span>
                                            <IconButton onClick={() => openEditTrip(t)} disabled={savingThis || isCancelled}>
                                              <EditRoundedIcon />
                                            </IconButton>
                                          </span>
                                        </Tooltip>

                                        <Tooltip title="Delete trip">
                                          <span>
                                            <IconButton
                                              onClick={() => handleSoftDeleteTrip(t)}
                                              disabled={savingThis || isCancelled || isInProgress || isComplete}
                                              color="error"
                                            >
                                              <DeleteOutlineRoundedIcon />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                      </Stack>
                                    ) : null}
                                  </Stack>

                                  <Stack spacing={0.5}>
                                    <Typography variant="body2" color="text.secondary">
                                      Tech: <strong>{primary}</strong>
                                    </Typography>
                                    {helper ? <Typography variant="body2" color="text.secondary">{helper}</Typography> : null}
                                    {secondary ? <Typography variant="body2" color="text.secondary">{secondary}</Typography> : null}
                                    {secondaryHelper ? <Typography variant="body2" color="text.secondary">{secondaryHelper}</Typography> : null}
                                    <Typography variant="body2" color="text.secondary">
                                      Timer minutes: <strong>{computedBillable}</strong> (gross {liveGrossMins} - paused {pausedMins})
                                    </Typography>
                                  </Stack>

                                  <Divider />

                                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                    {!isComplete && !isCancelled ? (
                                      <>
                                        {!isInProgress ? (
                                          <M3Button
                                            tone="green"
                                            onClick={() => handleStartTrip(t)}
                                            disabled={!canAct || savingThis || !canStartTripRole}
                                            startIcon={<PlayArrowRoundedIcon />}
                                          >
                                            {savingThis ? "Working..." : "Start Trip"}
                                          </M3Button>
                                        ) : null}

                                        {isInProgress && isRunning ? (
                                          <QuietButton
                                            onClick={() => handlePauseTrip(t)}
                                            disabled={!canAct || savingThis}
                                            startIcon={<PauseRoundedIcon />}
                                          >
                                            Pause
                                          </QuietButton>
                                        ) : null}

                                        {isInProgress && isPaused ? (
                                          <QuietButton
                                            onClick={() => handleResumeTrip(t)}
                                            disabled={!canAct || savingThis}
                                            startIcon={<PlayArrowRoundedIcon />}
                                          >
                                            Resume
                                          </QuietButton>
                                        ) : null}

                                        {isInProgress ? (
                                          <>
                                            <QuietButton
                                              onClick={() => {
                                                setFinishModeByTrip((prev) => ({ ...prev, [t.id]: "follow_up" }));
                                                if (isMobile && trips.find((x) => String(x.status || "") === "in_progress")?.id === t.id) {
                                                  setMobileFinishOpen(true);
                                                }
                                              }}
                                              disabled={!canAct || savingThis}
                                            >
                                              Follow-Up
                                            </QuietButton>

                                            <QuietButton
                                              onClick={() => {
                                                setFinishModeByTrip((prev) => ({ ...prev, [t.id]: "resolved" }));
                                                if (isMobile && trips.find((x) => String(x.status || "") === "in_progress")?.id === t.id) {
                                                  setMobileFinishOpen(true);
                                                }
                                              }}
                                              disabled={!canAct || savingThis}
                                            >
                                              Resolved
                                            </QuietButton>

                                            {finishMode !== "none" ? (
                                              <QuietButton
                                                onClick={() => {
                                                  setFinishModeByTrip((prev) => ({ ...prev, [t.id]: "none" }));
                                                  if (isMobile && trips.find((x) => String(x.status || "") === "in_progress")?.id === t.id) {
                                                    setMobileFinishOpen(false);
                                                  }
                                                }}
                                                disabled={!canAct || savingThis}
                                              >
                                                Clear
                                              </QuietButton>
                                            ) : null}
                                          </>
                                        ) : null}
                                      </>
                                    ) : (
                                      <Alert severity={isCancelled ? "error" : "success"} variant="outlined" sx={{ py: 0 }}>
                                        {isCancelled ? `Cancelled (${t.cancelReason || "No reason"})` : "Complete"}
                                      </Alert>
                                    )}
                                  </Stack>

                                  <TextField
                                    label="Work Notes"
                                    multiline
                                    minRows={3}
                                    fullWidth
                                    value={tripWorkNotes[t.id] ?? ""}
                                    onChange={(e) => setTripWorkNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                    disabled={!canAct || savingThis || isCancelled}
                                  />

                                  <QuietButton
                                    onClick={() => handleSaveWorkNotes(t)}
                                    disabled={!canAct || savingThis || isCancelled}
                                    startIcon={<NoteAltOutlinedIcon />}
                                  >
                                    Save Notes
                                  </QuietButton>

                                  {showFinishPanel && !hideInlineFinishPanelOnMobile ? (
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        p: 1.5,
                                        borderRadius: 3,
                                        bgcolor:
                                          finishMode === "resolved"
                                            ? alpha(theme.palette.success.main, 0.06)
                                            : alpha(theme.palette.warning.main, 0.08),
                                        borderColor:
                                          finishMode === "resolved"
                                            ? alpha(theme.palette.success.main, 0.3)
                                            : alpha(theme.palette.warning.main, 0.28),
                                      }}
                                    >
                                      <Stack spacing={1.5}>
                                        <Typography variant="subtitle1" fontWeight={700}>
                                          {finishMode === "resolved" ? "Finish Trip: Resolved" : "Finish Trip: Follow-Up"}
                                        </Typography>

                                        <Box sx={twoColSx}>
                                          <TextField
                                            label="Hours (override)"
                                            type="number"
                                            size="small"
                                            fullWidth
                                            inputProps={{ min: 0, step: 0.5 }}
                                            value={hoursToUse}
                                            onChange={(e) =>
                                              setHoursOverrideByTrip((prev) => ({
                                                ...prev,
                                                [t.id]: Number(e.target.value),
                                              }))
                                            }
                                            disabled={!canAct || savingThis}
                                            helperText={`Timer default: ${computedHours} hr`}
                                          />

                                          <FormControlLabel
                                            control={
                                              <Checkbox
                                                checked={helperConfirmedByTrip[t.id] ?? true}
                                                onChange={(e) =>
                                                  setHelperConfirmedByTrip((prev) => ({
                                                    ...prev,
                                                    [t.id]: e.target.checked,
                                                  }))
                                                }
                                                disabled={!canAct || savingThis}
                                              />
                                            }
                                            label="Include helper in payroll"
                                          />
                                        </Box>

                                        {showFollowUpField ? (
                                          <>
                                            <TextField
                                              label="Follow-Up Notes"
                                              multiline
                                              minRows={4}
                                              fullWidth
                                              value={tripFollowUpNotes[t.id] ?? ""}
                                              onChange={(e) => setTripFollowUpNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                              disabled={!canAct || savingThis}
                                            />
                                            <M3Button
                                              tone="blue"
                                              onClick={() => handleFollowUpTrip(t)}
                                              disabled={!canAct || savingThis}
                                            >
                                              Complete as Follow-Up
                                            </M3Button>
                                          </>
                                        ) : null}

                                        {showResolvedFields ? (
                                          <>
                                            <TextField
                                              label="Resolution Notes"
                                              multiline
                                              minRows={4}
                                              fullWidth
                                              value={tripResolutionNotes[t.id] ?? ""}
                                              onChange={(e) => setTripResolutionNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                              disabled={!canAct || savingThis}
                                            />

                                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                                              <Stack spacing={1.25}>
                                                <Typography variant="subtitle1" fontWeight={700}>
                                                  Materials
                                                </Typography>

                                                {mats.length === 0 ? (
                                                  <Alert severity="info" variant="outlined">
                                                    No materials added yet.
                                                  </Alert>
                                                ) : (
                                                  <Stack spacing={1.25}>
                                                    {mats.map((m, idx) => (
                                                      <Paper key={`${t.id}-mat-${idx}`} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                                                        <Stack spacing={1}>
                                                          <Box sx={materialsTwoColSx}>
                                                            <TextField
                                                              label="Name"
                                                              size="small"
                                                              fullWidth
                                                              value={m.name}
                                                              onChange={(e) => updateMaterialRow(t.id, idx, { name: e.target.value })}
                                                              disabled={!canAct || savingThis}
                                                            />
                                                            <TextField
                                                              label="Qty"
                                                              type="number"
                                                              size="small"
                                                              fullWidth
                                                              inputProps={{ min: 0.01, step: 0.01 }}
                                                              value={Number.isFinite(Number(m.qty)) ? m.qty : 1}
                                                              onChange={(e) => updateMaterialRow(t.id, idx, { qty: Number(e.target.value) })}
                                                              disabled={!canAct || savingThis}
                                                            />
                                                          </Box>

                                                          <QuietButton
                                                            onClick={() => removeMaterialRow(t.id, idx)}
                                                            disabled={!canAct || savingThis}
                                                            startIcon={<DeleteOutlineRoundedIcon />}
                                                          >
                                                            Remove
                                                          </QuietButton>
                                                        </Stack>
                                                      </Paper>
                                                    ))}
                                                  </Stack>
                                                )}

                                                <QuietButton
                                                  onClick={() => addMaterialRow(t.id)}
                                                  disabled={!canAct || savingThis}
                                                  startIcon={<AddRoundedIcon />}
                                                >
                                                  Add Material
                                                </QuietButton>
                                              </Stack>
                                            </Paper>

                                            <M3Button
                                              tone="green"
                                              onClick={() => handleResolveTrip(t)}
                                              disabled={!canAct || savingThis}
                                            >
                                              Complete as Resolved — Ready to Bill
                                            </M3Button>
                                          </>
                                        ) : null}
                                      </Stack>
                                    </Paper>
                                  ) : null}

                                  {errMsg ? <Alert severity="error">{errMsg}</Alert> : null}
                                  {okMsg ? <Alert severity="success">{okMsg}</Alert> : null}

                                  <Typography variant="caption" color="text.secondary">
                                    Trip ID: {t.id}
                                  </Typography>
                                </Stack>
                              </Paper>
                            );
                          })
                        )}

                        {canDispatch && scheduleOpen ? (
                          <Paper
                            variant="outlined"
                            sx={{
                              mt: 0.5,
                              p: 2,
                              borderRadius: 4,
                              bgcolor: alpha(theme.palette.primary.main, 0.03),
                            }}
                          >
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                              Schedule a Trip
                            </Typography>

                            <form onSubmit={handleCreateTrip} style={{ display: "grid", gap: 16 }}>
                              <Box sx={twoColSx}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="date"
                                  label="Date"
                                  value={tripDate}
                                  onChange={(e) => setTripDate(e.target.value)}
                                  disabled={tripSaving}
                                  InputLabelProps={{ shrink: true }}
                                />

                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  label="Time Window"
                                  value={tripTimeWindow}
                                  onChange={(e) => setTripTimeWindow(e.target.value as TripTimeWindow)}
                                  disabled={tripSaving}
                                >
                                  <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                                  <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                                  <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                                  <MenuItem value="custom">Custom</MenuItem>
                                </TextField>
                              </Box>

                              {tripTimeWindow === "custom" ? (
                                <Box sx={twoColSx}>
                                  <TextField
                                    fullWidth
                                    size="small"
                                    type="time"
                                    label="Start Time"
                                    value={tripStartTime}
                                    onChange={(e) => setTripStartTime(e.target.value)}
                                    disabled={tripSaving}
                                    InputLabelProps={{ shrink: true }}
                                  />
                                  <TextField
                                    fullWidth
                                    size="small"
                                    type="time"
                                    label="End Time"
                                    value={tripEndTime}
                                    onChange={(e) => setTripEndTime(e.target.value)}
                                    disabled={tripSaving}
                                    InputLabelProps={{ shrink: true }}
                                  />
                                </Box>
                              ) : null}

                              {techniciansLoading ? <Alert severity="info">Loading technicians…</Alert> : null}
                              {techniciansError ? <Alert severity="error">{techniciansError}</Alert> : null}

                              <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
                                <Stack spacing={2}>
                                  <Typography variant="subtitle1" fontWeight={700}>
                                    Crew
                                  </Typography>

                                  <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    label="Primary Technician"
                                    value={tripPrimaryTechUid}
                                    onChange={(e) => setTripPrimaryTechUid(e.target.value)}
                                    disabled={tripSaving || techniciansLoading}
                                  >
                                    <MenuItem value="">Select a technician…</MenuItem>
                                    {technicians.map((t) => (
                                      <MenuItem key={t.uid} value={t.uid}>
                                        {t.displayName}
                                      </MenuItem>
                                    ))}
                                  </TextField>

                                  <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    label="Secondary Technician (Optional)"
                                    value={tripSecondaryTechUid}
                                    onChange={(e) => setTripSecondaryTechUid(e.target.value)}
                                    disabled={tripSaving || !tripPrimaryTechUid}
                                    helperText="Only use this for two true technicians. Helpers/apprentices go below."
                                  >
                                    <MenuItem value="">— None —</MenuItem>
                                    {technicians
                                      .filter((t) => t.uid !== tripPrimaryTechUid)
                                      .map((t) => (
                                        <MenuItem key={t.uid} value={t.uid}>
                                          {t.displayName}
                                        </MenuItem>
                                      ))}
                                  </TextField>

                                  <Divider />

                                  <Typography variant="subtitle1" fontWeight={700}>
                                    Helper / Apprentice
                                  </Typography>

                                  {profilesLoading ? <Alert severity="info">Loading employee profiles…</Alert> : null}
                                  {profilesError ? <Alert severity="error">{profilesError}</Alert> : null}

                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        checked={tripUseDefaultHelper}
                                        onChange={(e) => setTripUseDefaultHelper(e.target.checked)}
                                        disabled={tripSaving}
                                      />
                                    }
                                    label="Use default helper pairing (recommended)"
                                  />

                                  <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    label="Helper / Apprentice (Optional)"
                                    value={tripHelperUid}
                                    onChange={(e) => {
                                      setTripUseDefaultHelper(false);
                                      setTripHelperUid(e.target.value);
                                    }}
                                    disabled={tripSaving || profilesLoading || !tripPrimaryTechUid}
                                  >
                                    <MenuItem value="">— None —</MenuItem>
                                    {helperCandidates.map((h) => (
                                      <MenuItem key={h.uid} value={h.uid}>
                                        {h.name} ({h.laborRole})
                                      </MenuItem>
                                    ))}
                                  </TextField>

                                  <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    label="Secondary Helper (Optional)"
                                    value={tripSecondaryHelperUid}
                                    onChange={(e) => setTripSecondaryHelperUid(e.target.value)}
                                    disabled={tripSaving || profilesLoading}
                                  >
                                    <MenuItem value="">— None —</MenuItem>
                                    {helperCandidates.map((h) => (
                                      <MenuItem key={h.uid} value={h.uid}>
                                        {h.name} ({h.laborRole})
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Stack>
                              </Paper>

                              <TextField
                                fullWidth
                                multiline
                                minRows={3}
                                label="Trip Notes (optional)"
                                value={tripNotes}
                                onChange={(e) => setTripNotes(e.target.value)}
                                disabled={tripSaving}
                              />

                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={tripSetTicketScheduled}
                                    onChange={(e) => setTripSetTicketScheduled(e.target.checked)}
                                    disabled={tripSaving}
                                  />
                                }
                                label="If ticket is NEW, change status to SCHEDULED when this trip is created"
                              />

                              {tripSaveError ? <Alert severity="error">{tripSaveError}</Alert> : null}
                              {tripSaveSuccess ? <Alert severity="success">{tripSaveSuccess}</Alert> : null}

                              <M3Button
                                type="submit"
                                tone="blue"
                                disabled={tripSaving || !canDispatch}
                                startIcon={<AddRoundedIcon />}
                                sx={{ width: "fit-content" }}
                              >
                                {tripSaving ? "Scheduling..." : "Schedule Trip"}
                              </M3Button>
                            </form>
                          </Paper>
                        ) : null}
                      </>
                    ) : null}
                  </Stack>
                </SectionCard>

                <SectionCard title="Billing Packet" icon={<ReceiptLongRoundedIcon color="primary" />}>
                  {!showFullBillingPanel ? (
                    <Alert severity="info" variant="outlined">
                      No billing packet yet. It will appear after a trip is completed as <strong>Resolved — Ready to Bill</strong>.
                    </Alert>
                  ) : (
                    <Stack spacing={1.5}>
                      <Typography variant="body1">
                        Status: <strong>{billing?.status}</strong>
                        {billing?.readyToBillAt ? (
                          <span style={{ color: theme.palette.text.secondary }}>
                            {" "}• Ready: {billing.readyToBillAt}
                          </span>
                        ) : null}
                      </Typography>

                      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 4 }}>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                          Labor (Customer Billing)
                        </Typography>
                        <Typography variant="body1">
                          Total billed hours: <strong>{Number(billing?.labor?.totalHours ?? 0).toFixed(2)}</strong>
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          Billing rule: labor hours belong to the <strong>Primary Tech only</strong>.
                        </Typography>

                        {Array.isArray(billing?.labor?.byCrew) && billing!.labor.byCrew.length ? (
                          <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                            {billing!.labor.byCrew.map((c) => (
                              <Typography key={c.uid} variant="body1">
                                {c.name} • {c.hours.toFixed(2)} hr
                              </Typography>
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25 }}>
                            No primary tech labor line captured yet.
                          </Typography>
                        )}
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 4 }}>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                          Materials
                        </Typography>

                        {!Array.isArray(billing?.materials) || billing!.materials.length === 0 ? (
                          <Typography variant="body1" color="text.secondary">
                            No materials captured.
                          </Typography>
                        ) : (
                          <Stack spacing={1}>
                            {billing!.materials.map((m, idx) => (
                              <Paper key={`bill-mat-${idx}`} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                                <Typography variant="body1" fontWeight={700}>
                                  {m.name} • {Number(m.qty).toFixed(2)} {m.unit || ""}
                                </Typography>
                                {m.notes ? (
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {m.notes}
                                  </Typography>
                                ) : null}
                              </Paper>
                            ))}
                          </Stack>
                        )}
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 4 }}>
                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                          Resolution Notes
                        </Typography>
                        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                          {billing?.resolutionNotes || "—"}
                        </Typography>

                        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
                          Work Notes
                        </Typography>
                        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                          {billing?.workNotes || "—"}
                        </Typography>
                      </Paper>

                      {canBill ? (
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                          <QuietButton onClick={() => markBillingStatus("invoiced")} disabled={billingSaving}>
                            {billingSaving ? "Working..." : "Mark Invoiced"}
                          </QuietButton>

                          <QuietButton onClick={() => markBillingStatus("ready_to_bill")} disabled={billingSaving}>
                            Set Ready to Bill
                          </QuietButton>

                          <QuietButton onClick={() => markBillingStatus("not_ready")} disabled={billingSaving}>
                            Set Not Ready
                          </QuietButton>

                          <QuietButton
                            onClick={async () => {
                              if (!ticket?.id) return;

                              const win = window.open("about:blank", "_blank");

                              try {
                                const res = await fetch("/api/qbo/invoices/create-from-service-ticket", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ serviceTicketId: ticket.id }),
                                });

                                const data = await res.json();

                                if (!res.ok) {
                                  if (win) win.close();
                                  alert(data?.error || "Failed to create QBO invoice.");
                                  return;
                                }

                                alert(
                                  `QBO Invoice Created\nInvoice ID: ${data.qboInvoiceId}${
                                    data.docNumber ? `\nDoc #: ${data.docNumber}` : ""
                                  }`
                                );

                                const url: string | null = data?.qboInvoiceUrl || null;

                                if (win && url) {
                                  win.location.href = url;
                                  win.focus();
                                  return;
                                }

                                if (!win) {
                                  alert("Popup blocked. Please allow popups for dcflow.app, then try again.");
                                } else {
                                  alert("Could not auto-open QBO invoice URL.");
                                }

                                if (url) window.open(url, "_blank");
                              } catch (e: any) {
                                if (win) win.close();
                                alert(e?.message || "Failed to create QBO invoice.");
                              }
                            }}
                          >
                            Create QBO Invoice Draft
                          </QuietButton>

                          {billingErr ? <Alert severity="error" sx={{ py: 0 }}>{billingErr}</Alert> : null}
                          {billingOk ? <Alert severity="success" sx={{ py: 0 }}>{billingOk}</Alert> : null}
                        </Stack>
                      ) : (
                        <Alert severity="info" variant="outlined">
                          Billing controls are limited to Admin/Manager/Dispatcher/Billing.
                        </Alert>
                      )}
                    </Stack>
                  )}
                </SectionCard>

                <SectionCard title="System" icon={<BuildRoundedIcon color="primary" />}>
                  <Stack spacing={0.75}>
                    <Typography variant="body1">
                      <strong>Active:</strong> {String(ticket.active)}
                    </Typography>
                    <Typography variant="body1">
                      <strong>Created At:</strong> {ticket.createdAt || "—"}
                    </Typography>
                    <Typography variant="body1">
                      <strong>Updated At:</strong> {ticket.updatedAt || "—"}
                    </Typography>
                  </Stack>
                </SectionCard>
              </Stack>
            </Box>

            <Dialog open={canDispatch && Boolean(editTripId)} onClose={closeEditTrip} fullWidth maxWidth="sm">
              <DialogTitle>Edit / Reschedule Trip</DialogTitle>

              <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                  <Box sx={twoColSx}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label="Date"
                      value={editTripDate}
                      onChange={(e) => setEditTripDate(e.target.value)}
                      disabled={editTripSaving}
                      InputLabelProps={{ shrink: true }}
                    />

                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Time Window"
                      value={editTripTimeWindow}
                      onChange={(e) => setEditTripTimeWindow(e.target.value as TripTimeWindow)}
                      disabled={editTripSaving}
                    >
                      <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                      <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                      <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                      <MenuItem value="custom">Custom</MenuItem>
                    </TextField>

                    <TextField
                      fullWidth
                      size="small"
                      type="time"
                      label="Start Time"
                      value={editTripStartTime}
                      onChange={(e) => setEditTripStartTime(e.target.value)}
                      disabled={editTripSaving}
                      InputLabelProps={{ shrink: true }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      type="time"
                      label="End Time"
                      value={editTripEndTime}
                      onChange={(e) => setEditTripEndTime(e.target.value)}
                      disabled={editTripSaving}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>

                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Trip Notes"
                    value={editTripNotes}
                    onChange={(e) => setEditTripNotes(e.target.value)}
                    disabled={editTripSaving}
                  />

                  {editTripErr ? <Alert severity="error">{editTripErr}</Alert> : null}
                  {editTripOk ? <Alert severity="success">{editTripOk}</Alert> : null}

                  <Typography variant="body2" color="text.secondary">
                    This modal is intentionally separate from “Schedule New Trip” so rescheduling never feels like it’s using the same fields.
                  </Typography>
                </Stack>
              </DialogContent>

              <DialogActions sx={{ p: 2 }}>
                <Button onClick={closeEditTrip} disabled={editTripSaving} sx={{ textTransform: "none", borderRadius: 999 }}>
                  Close
                </Button>
                <M3Button tone="blue" onClick={handleSaveTripEdits} disabled={editTripSaving}>
                  {editTripSaving ? "Saving..." : "Save Changes"}
                </M3Button>
              </DialogActions>
            </Dialog>

            {isMobile && (() => {
              const trip = trips.find((t) => String(t.status || "") === "in_progress");
              if (!trip) return null;

              const finishMode = finishModeByTrip[trip.id] || "none";
              const showPanel = mobileFinishOpen && finishMode !== "none";

              const timerState = String(trip.timerState || (trip.status === "in_progress" ? "running" : "not_started"));
              const isPaused = timerState === "paused";

              const pausedMins = sumPausedMinutes(trip.pauseBlocks);
              const liveGrossMins =
                trip.actualStartAt && !trip.actualEndAt
                  ? minutesBetweenIso(trip.actualStartAt, nowIso())
                  : trip.actualStartAt && trip.actualEndAt
                    ? minutesBetweenIso(trip.actualStartAt, trip.actualEndAt)
                    : 0;

              const computedBillable = Math.max(0, liveGrossMins - pausedMins);
              const computedHours = roundToHalf(computedBillable / 60);

              const hoursToUse =
                typeof hoursOverrideByTrip[trip.id] === "number"
                  ? roundToHalf(hoursOverrideByTrip[trip.id])
                  : computedHours;

              const mats = Array.isArray(tripMaterials[trip.id]) ? tripMaterials[trip.id] : [];

              const savingThis = Boolean(tripActionSaving[trip.id]);
              const canAct = canCurrentUserActOnTrip(trip);

              return (
                <Paper
                  elevation={6}
                  sx={{
                    position: "fixed",
                    left: 12,
                    right: 12,
                    bottom: 148,
                    zIndex: 30,
                    borderRadius: 4,
                    border: `1px solid ${alpha(theme.palette.info.main, 0.24)}`,
                    p: 1.5,
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          Trip in progress
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {trip.date} • {formatTripWindow(String(trip.timeWindow || ""))} • {trip.startTime}-{trip.endTime}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          Timer: <strong>{timerState}</strong> • Minutes: <strong>{computedBillable}</strong> (gross {liveGrossMins} - paused {pausedMins})
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {isPaused ? (
                          <QuietButton onClick={() => handleResumeTrip(trip)} disabled={!canAct || savingThis} startIcon={<PlayArrowRoundedIcon />}>
                            Resume
                          </QuietButton>
                        ) : (
                          <QuietButton onClick={() => handlePauseTrip(trip)} disabled={!canAct || savingThis} startIcon={<PauseRoundedIcon />}>
                            Pause
                          </QuietButton>
                        )}

                        <QuietButton
                          onClick={() => {
                            setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "follow_up" }));
                            setMobileFinishOpen(true);
                          }}
                          disabled={!canAct || savingThis}
                        >
                          Follow-Up
                        </QuietButton>

                        <QuietButton
                          onClick={() => {
                            setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "resolved" }));
                            setMobileFinishOpen(true);
                          }}
                          disabled={!canAct || savingThis}
                        >
                          Resolved
                        </QuietButton>

                        {finishMode !== "none" ? (
                          <>
                            <QuietButton onClick={() => setMobileFinishOpen((v) => !v)} disabled={!canAct || savingThis}>
                              {showPanel ? "Hide" : "Show"} Fields
                            </QuietButton>

                            <QuietButton
                              onClick={() => {
                                setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));
                                setMobileFinishOpen(false);
                              }}
                              disabled={!canAct || savingThis}
                            >
                              Clear
                            </QuietButton>
                          </>
                        ) : null}
                      </Stack>
                    </Stack>

                    <Collapse in={showPanel}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 3,
                          bgcolor:
                            finishMode === "resolved"
                              ? alpha(theme.palette.success.main, 0.06)
                              : alpha(theme.palette.warning.main, 0.08),
                          borderColor:
                            finishMode === "resolved"
                              ? alpha(theme.palette.success.main, 0.3)
                              : alpha(theme.palette.warning.main, 0.28),
                        }}
                      >
                        <Stack spacing={1.5}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            {finishMode === "resolved" ? "Finish Trip: Resolved" : "Finish Trip: Follow-Up"}
                          </Typography>

                          <TextField
                            label="Hours (override)"
                            type="number"
                            size="small"
                            fullWidth
                            inputProps={{ min: 0, step: 0.5 }}
                            value={hoursToUse}
                            onChange={(e) =>
                              setHoursOverrideByTrip((prev) => ({
                                ...prev,
                                [trip.id]: Number(e.target.value),
                              }))
                            }
                            disabled={!canAct || savingThis}
                            helperText={`Timer default: ${computedHours} hr`}
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
                                disabled={!canAct || savingThis}
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
                                fullWidth
                                value={tripFollowUpNotes[trip.id] ?? ""}
                                onChange={(e) => setTripFollowUpNotes((prev) => ({ ...prev, [trip.id]: e.target.value }))}
                                disabled={!canAct || savingThis}
                              />
                              <M3Button
                                fullWidth
                                tone="blue"
                                onClick={() => handleFollowUpTrip(trip)}
                                disabled={!canAct || savingThis}
                              >
                                Complete as Follow-Up
                              </M3Button>
                            </>
                          ) : null}

                          {finishMode === "resolved" ? (
                            <>
                              <TextField
                                label="Resolution Notes"
                                multiline
                                minRows={4}
                                fullWidth
                                value={tripResolutionNotes[trip.id] ?? ""}
                                onChange={(e) => setTripResolutionNotes((prev) => ({ ...prev, [trip.id]: e.target.value }))}
                                disabled={!canAct || savingThis}
                              />

                              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                                <Stack spacing={1.25}>
                                  <Typography variant="subtitle1" fontWeight={700}>
                                    Materials
                                  </Typography>

                                  {mats.length === 0 ? (
                                    <Alert severity="info" variant="outlined">
                                      No materials added yet.
                                    </Alert>
                                  ) : (
                                    <Stack spacing={1.25}>
                                      {mats.map((m, idx) => (
                                        <Paper key={`mobile-mat-${idx}`} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                                          <Stack spacing={1}>
                                            <Box sx={materialsTwoColSx}>
                                              <TextField
                                                label="Name"
                                                size="small"
                                                fullWidth
                                                value={m.name}
                                                onChange={(e) => updateMaterialRow(trip.id, idx, { name: e.target.value })}
                                                disabled={!canAct || savingThis}
                                              />
                                              <TextField
                                                label="Qty"
                                                type="number"
                                                size="small"
                                                fullWidth
                                                inputProps={{ min: 0.01, step: 0.01 }}
                                                value={Number.isFinite(Number(m.qty)) ? m.qty : 1}
                                                onChange={(e) => updateMaterialRow(trip.id, idx, { qty: Number(e.target.value) })}
                                                disabled={!canAct || savingThis}
                                              />
                                            </Box>

                                            <QuietButton
                                              onClick={() => removeMaterialRow(trip.id, idx)}
                                              disabled={!canAct || savingThis}
                                              startIcon={<DeleteOutlineRoundedIcon />}
                                            >
                                              Remove
                                            </QuietButton>
                                          </Stack>
                                        </Paper>
                                      ))}
                                    </Stack>
                                  )}

                                  <QuietButton
                                    onClick={() => addMaterialRow(trip.id)}
                                    disabled={!canAct || savingThis}
                                    startIcon={<AddRoundedIcon />}
                                  >
                                    Add Material
                                  </QuietButton>
                                </Stack>
                              </Paper>

                              <M3Button
                                fullWidth
                                tone="green"
                                onClick={() => handleResolveTrip(trip)}
                                disabled={!canAct || savingThis}
                              >
                                Complete as Resolved — Ready to Bill
                              </M3Button>
                            </>
                          ) : null}
                        </Stack>
                      </Paper>
                    </Collapse>
                  </Stack>
                </Paper>
              );
            })()}
          </Box>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}