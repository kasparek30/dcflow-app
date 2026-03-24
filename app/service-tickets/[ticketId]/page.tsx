// app/service-tickets/[ticketId]/page.tsx
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
  laborRole?: string; // helper/apprentice/technician/etc
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
  status: string; // planned | in_progress | complete | cancelled
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
    totalHours: number; // customer billed hours
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

// -----------------------------
// Helpers
// -----------------------------
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

// Google maps embed (no API key)
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

// Mobile helper
function useIsMobile(breakpointPx = 900) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < breakpointPx);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpointPx]);
  return isMobile;
}

// ---- Weekly Timesheets + TimeEntries helpers ----
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

// -----------------------------
// Lightweight UI atoms (inline styles only)
// -----------------------------
function Pill(props: { text: string; tone?: "neutral" | "green" | "yellow" | "red" | "blue" }) {
  const tone = props.tone || "neutral";
  const map: Record<string, { bg: string; border: string; text: string }> = {
    neutral: { bg: "#f3f4f6", border: "#e5e7eb", text: "#111827" },
    green: { bg: "#eaffea", border: "#b7e3c2", text: "#14532d" },
    yellow: { bg: "#fff7ed", border: "#fed7aa", text: "#7c2d12" },
    red: { bg: "#fff1f2", border: "#fecdd3", text: "#7f1d1d" },
    blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e3a8a" },
  };
  const c = map[tone] || map.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        fontWeight: 900,
        fontSize: 12,
        lineHeight: "12px",
        whiteSpace: "nowrap",
      }}
    >
      {props.text}
    </span>
  );
}

function Card(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 1000 }}>{props.title}</div>
        {props.right ? <div>{props.right}</div> : null}
      </div>
      <div style={{ padding: 16 }}>{props.children}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#f1f5f9", margin: "12px 0" }} />;
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "green" | "blue" | "gray" }) {
  const tone = props.tone || "gray";
  const colors =
    tone === "green"
      ? { bg: "#1f8f3a", border: "#166534", text: "white" }
      : tone === "blue"
        ? { bg: "#2563eb", border: "#1e40af", text: "white" }
        : { bg: "white", border: "#d1d5db", text: "#111827" };

  return (
    <button
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontWeight: 1000,
        ...props.style,
      }}
    />
  );
}

function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#f8fafc",
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontWeight: 900,
        ...props.style,
      }}
    />
  );
}

// -----------------------------
// Page
// -----------------------------
export default function ServiceTicketDetailPage({ params }: ServiceTicketDetailPageProps) {
  const { appUser } = useAuthContext();
  const isMobile = useIsMobile(900);

  const canDispatch =
    appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";

  const canWorkTrip =
    appUser?.role === "admin" ||
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  // Start Trip should be admin + dispatcher + manager + technician (NOT helper/apprentice)
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

  // customer contact (from /customers/{customerId})
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // editable ticket overview fields (admin/dispatch/manager)
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

  // Trips list state
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

  // Schedule Trip form (create)
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

  // Per-trip work state (local UI state keyed by tripId)
  const [tripWorkNotes, setTripWorkNotes] = useState<Record<string, string>>({});
  const [tripResolutionNotes, setTripResolutionNotes] = useState<Record<string, string>>({});
  const [tripFollowUpNotes, setTripFollowUpNotes] = useState<Record<string, string>>({});
  const [tripMaterials, setTripMaterials] = useState<Record<string, TripMaterial[]>>({});
  const [tripActionError, setTripActionError] = useState<Record<string, string>>({});
  const [tripActionSuccess, setTripActionSuccess] = useState<Record<string, string>>({});
  const [tripActionSaving, setTripActionSaving] = useState<Record<string, boolean>>({});

  // Finish UX state
  const [finishModeByTrip, setFinishModeByTrip] = useState<Record<string, FinishMode>>({});
  const [hoursOverrideByTrip, setHoursOverrideByTrip] = useState<Record<string, number>>({});
  const [helperConfirmedByTrip, setHelperConfirmedByTrip] = useState<Record<string, boolean>>({});

  // Mobile slide-up finish panel state
  const [mobileFinishOpen, setMobileFinishOpen] = useState(false);

  // Trip edit modal
  const [editTripId, setEditTripId] = useState<string | null>(null);
  const [editTripSaving, setEditTripSaving] = useState(false);
  const [editTripErr, setEditTripErr] = useState("");
  const [editTripOk, setEditTripOk] = useState("");

  const [editTripDate, setEditTripDate] = useState<string>(isoTodayLocal());
  const [editTripTimeWindow, setEditTripTimeWindow] = useState<TripTimeWindow>("am");
  const [editTripStartTime, setEditTripStartTime] = useState<string>("08:00");
  const [editTripEndTime, setEditTripEndTime] = useState<string>("12:00");
  const [editTripNotes, setEditTripNotes] = useState<string>("");

  // Billing UI
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingErr, setBillingErr] = useState("");
  const [billingOk, setBillingOk] = useState("");

  // Ensure ticket in_progress helper (always in scope)
  async function ensureTicketInProgressIfNeeded(args: { now: string; reason?: string }) {
    if (!ticket?.id) return;
    if (isTerminalTicketStatus(ticket.status)) return;
    if (String(ticket.status || "") === "in_progress") return;

    // Don't override follow_up/completed/cancelled
    if (isAlreadyInProgressOrBeyond(ticket.status)) return;

    await updateDoc(doc(db, "serviceTickets", ticket.id), {
      status: "in_progress",
      updatedAt: args.now,
    });

    setTicket((prev) => (prev ? { ...prev, status: "in_progress", updatedAt: args.now } : prev));
    setTicketStatusEdit("in_progress");
  }

  // -----------------------------
  // Load Ticket
  // -----------------------------
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

  // Load Customer Contact (phone/email) from /customers
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

  // Load Technicians
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

  // Load Employee Profiles (for helpers)
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

  // Load Trips for this Ticket
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

        // Seed UI state
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

  // Auto times from timeWindow
  useEffect(() => {
    const { start, end } = windowToTimes(tripTimeWindow);
    if (tripTimeWindow !== "custom") {
      setTripStartTime(start);
      setTripEndTime(end);
    }
  }, [tripTimeWindow]);

  // Auto default helper pairing
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

  // Ticket Overview Save
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

      setTicketEditOk("✅ Ticket updated.");
    } catch (err: unknown) {
      setTicketEditErr(err instanceof Error ? err.message : "Failed to update ticket.");
    } finally {
      setTicketEditSaving(false);
    }
  }

  // Create Trip (Dispatch)
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

      // Update ticket staffing pointers
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

      setTripSaveSuccess(`✅ Trip scheduled (${formatTripWindow(tripTimeWindow)}).`);
      setTripNotes("");
      setScheduleOpen(false);
    } catch (err: unknown) {
      setTripSaveError(err instanceof Error ? err.message : "Failed to create trip.");
    } finally {
      setTripSaving(false);
    }
  }

  // Trip Actions helpers
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

  // UI helpers
  function canCurrentUserActOnTrip(trip: TripDoc) {
    if (!myUid) return false;
    if (appUser?.role === "admin") return true;
    return isUidOnTripCrew(myUid, trip.crew || null);
  }

  // Trip: Start
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

      // Always ensure ticket goes to in_progress (unless follow_up/completed/cancelled)
      if (ticket?.id && !isTerminalTicketStatus(ticket.status) && !isAlreadyInProgressOrBeyond(ticket.status)) {
        await ensureTicketInProgressIfNeeded({ now, reason: "start_trip" });
      }

      setTripOk(trip.id, "✅ Trip started.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to start trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // Trip: Pause
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

      setTripOk(trip.id, "⏸ Paused.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to pause trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // Trip: Resume
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

      setTripOk(trip.id, "▶ Resumed.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to resume trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // Trip: Save Work Notes
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

      setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, workNotes: notes || null } : t)));

      setTripOk(trip.id, "💾 Notes saved.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // Trip: Resolve
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

      // finalize pause if currently paused
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

      // Billing packet write (bill ONLY primary tech hours)
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

      setTripOk(trip.id, `✅ Resolved. Hours: ${hoursToUse}. Time entries: ${crewMembers.length}`);
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to resolve trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // Trip: Follow Up
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

      // close open pause if exists
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

      // ticket status to follow_up
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

      setTripOk(trip.id, `🟡 Follow Up logged. Hours: ${hoursToUse}. Time entries: ${crewMembers.length}`);
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to complete follow-up.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // Trip Edit Modal
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

      setEditTripOk("✅ Trip updated.");
      setTimeout(() => closeEditTrip(), 650);
    } catch (err: unknown) {
      setEditTripErr(err instanceof Error ? err.message : "Failed to update trip.");
    } finally {
      setEditTripSaving(false);
    }
  }

  // NEW: Soft delete trip (safe)
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

      setTripOk(t.id, "🗑 Trip removed (soft delete).");
    } catch (err: unknown) {
      setTripErr(t.id, err instanceof Error ? err.message : "Failed to delete trip.");
    } finally {
      setTripSavingFlag(t.id, false);
    }
  }

  // Claim & Start (unchanged logic)
  async function handleClaimAndStartTrip() {
    if (!ticket?.id) return;
    if (!myUid) return;

    const role = String(appUser?.role || "");
    const canSelfDispatch =
      role === "technician" || role === "helper" || role === "apprentice" || role === "admin" || role === "dispatcher" || role === "manager";

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

    const defaultHelperUid = helperCandidates.find((h) => String(h.defaultPairedTechUid || "").trim() === myUid)?.uid || "";
    const helperUid = defaultHelperUid || "";
    const helperName = helperUid ? (helperCandidates.find((h) => h.uid === helperUid)?.name || "Helper") : null;

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
        if (liveStatus === "completed" || liveStatus === "cancelled") throw new Error("Ticket is not claimable.");

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
            helperName: helperName,
            secondaryTechUid: null,
            secondaryTechName: null,
            secondaryHelperUid: null,
            secondaryHelperName: null,
          },

          crewConfirmed: {
            primaryTechUid: myUid,
            primaryTechName: appUser?.displayName || "Technician",
            helperUid: helperUid || null,
            helperName: helperName,
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

      alert("✅ Claimed and started trip.");
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Failed to claim ticket.");
    }
  }

  // Billing Panel Actions
  const billing = ticket?.billing ?? null;

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
      setBillingOk(`✅ Billing status updated: ${nextStatus.replaceAll("_", " ")}`);
    } catch (err: unknown) {
      setBillingErr(err instanceof Error ? err.message : "Failed to update billing status.");
    } finally {
      setBillingSaving(false);
    }
  }

  // Render helpers
  const addressFull = `${ticket?.serviceAddressLine1 || ""} ${ticket?.serviceAddressLine2 || ""}, ${
    ticket?.serviceCity || ""
  }, ${ticket?.serviceState || ""} ${ticket?.servicePostalCode || ""}`.trim();

  const mapsUrl = addressFull ? buildMapsUrl(addressFull) : "";
  const mapsEmbedUrl = addressFull ? buildMapsEmbedUrl(addressFull) : "";

  const statusTone: "neutral" | "green" | "yellow" | "red" | "blue" = useMemo(() => {
    const s = String(ticket?.status || "").toLowerCase();
    if (s === "completed") return "green";
    if (s === "in_progress") return "blue";
    if (s === "scheduled") return "yellow";
    if (s === "cancelled") return "red";
    return "neutral";
  }, [ticket?.status]);

  const inProgressTrip = useMemo(() => {
    return trips.find((t) => String(t.status || "") === "in_progress") || null;
  }, [trips]);

  // Safety net: if any trip is in_progress, force ticket status to in_progress (unless follow_up/completed/cancelled)
  useEffect(() => {
    async function syncTicketStatusFromTrips() {
      if (!ticket?.id) return;
      if (!Array.isArray(trips) || trips.length === 0) return;

      const hasInProgress = trips.some((t) => String(t.status || "") === "in_progress");
      if (!hasInProgress) return;

      if (isTerminalTicketStatus(ticket.status)) return;
      if (String(ticket.status || "") === "in_progress") return;
      if (isAlreadyInProgressOrBeyond(ticket.status)) return;

      const now = nowIso();
      try {
        await updateDoc(doc(db, "serviceTickets", ticket.id), {
          status: "in_progress",
          updatedAt: now,
        });
        setTicket((prev) => (prev ? { ...prev, status: "in_progress", updatedAt: now } : prev));
        setTicketStatusEdit("in_progress");
      } catch {
        // best-effort only
      }
    }

    syncTicketStatusFromTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, ticket?.status, trips.length]);

  const startableTrip = useMemo(() => {
    const candidates = trips.filter((t) => {
      const status = String(t.status || "");
      const cancelled = status === "cancelled";
      const complete = status === "complete";
      const inProg = status === "in_progress";
      if (cancelled || complete || inProg) return false;
      if (!canStartTripRole) return false;
      const canAct = canCurrentUserActOnTrip(t);
      return canAct;
    });

    const today = isoTodayLocal();
    const todayPick = candidates.find((t) => String(t.date || "") === today);
    return todayPick || candidates[0] || null;
  }, [trips, canStartTripRole, myUid, appUser?.role]);

  // Sticky start CTA (mobile only)
  const stickyStartCta =
    isMobile && startableTrip ? (
      <div
        style={{
          position: "sticky",
          top: 10,
          zIndex: 50,
          borderRadius: 14,
          border: "1px solid #2e7d32",
          background: "#eaffea",
          padding: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.10)",
        }}
      >
        <div style={{ fontWeight: 950, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            🚀 Ready to start?
            <div style={{ marginTop: 4, fontSize: 12, color: "#1f6b1f", fontWeight: 800 }}>
              Trip: {startableTrip.date} • {formatTripWindow(String(startableTrip.timeWindow || ""))} • {startableTrip.startTime}-{startableTrip.endTime}
            </div>
          </div>

          <PrimaryButton type="button" onClick={() => handleStartTrip(startableTrip)} tone="green">
            Start Trip
          </PrimaryButton>
        </div>
      </div>
    ) : null;

  // Mobile sticky in-progress bar (unchanged concept)
  const stickyInProgressBar =
    isMobile && inProgressTrip ? (
      (() => {
        const trip = inProgressTrip;

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
          <div
            style={{
              position: "fixed",
              left: 12,
              right: 12,
              bottom: 64 + 66 + 18,
              zIndex: 60,
              borderRadius: 14,
              border: "1px solid #c6dbff",
              background: "white",
              padding: 10,
              boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950 }}>
                🧳 Trip in progress
                <div style={{ marginTop: 2, fontSize: 12, color: "#666", fontWeight: 800 }}>
                  {trip.date} • {formatTripWindow(String(trip.timeWindow || ""))} • {trip.startTime}-{trip.endTime}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#777" }}>
                  Timer: <strong>{timerState}</strong> • Minutes: <strong>{computedBillable}</strong>{" "}
                  <span style={{ color: "#aaa" }}>(gross {liveGrossMins} - paused {pausedMins})</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {isPaused ? (
                  <GhostButton type="button" onClick={() => handleResumeTrip(trip)} disabled={!canAct || savingThis}>
                    ▶ Resume
                  </GhostButton>
                ) : (
                  <GhostButton type="button" onClick={() => handlePauseTrip(trip)} disabled={!canAct || savingThis}>
                    ❚❚ Pause
                  </GhostButton>
                )}

                <GhostButton
                  type="button"
                  onClick={() => {
                    setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "follow_up" }));
                    setMobileFinishOpen(true);
                  }}
                  disabled={!canAct || savingThis}
                >
                  🟡 Follow-Up
                </GhostButton>

                <GhostButton
                  type="button"
                  onClick={() => {
                    setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "resolved" }));
                    setMobileFinishOpen(true);
                  }}
                  disabled={!canAct || savingThis}
                >
                  ✅ Resolved
                </GhostButton>

                {finishMode !== "none" ? (
                  <>
                    <GhostButton
                      type="button"
                      onClick={() => setMobileFinishOpen((v) => !v)}
                      disabled={!canAct || savingThis}
                    >
                      {showPanel ? "Hide" : "Show"} Fields
                    </GhostButton>

                    <GhostButton
                      type="button"
                      onClick={() => {
                        setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));
                        setMobileFinishOpen(false);
                      }}
                      disabled={!canAct || savingThis}
                    >
                      Clear
                    </GhostButton>
                  </>
                ) : null}
              </div>
            </div>

            {/* Slide-up finish fields */}
            <div
              style={{
                marginTop: showPanel ? 10 : 0,
                overflow: "hidden",
                maxHeight: showPanel ? 1200 : 0,
                transition: "max-height 220ms ease, margin-top 220ms ease",
                borderTop: showPanel ? "1px solid #eee" : "none",
                paddingTop: showPanel ? 10 : 0,
              }}
            >
              {showPanel ? (
                <div
                  style={{
                    border: finishMode === "resolved" ? "1px solid #b7e3c2" : "1px solid #d7b6ff",
                    background: finishMode === "resolved" ? "#f2fff6" : "#fbf5ff",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>
                    {finishMode === "resolved" ? "✅ Finish Trip: Resolved" : "🟡 Finish Trip: Follow-Up"}
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 900 }}>Hours (override)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={hoursToUse}
                        onChange={(e) =>
                          setHoursOverrideByTrip((prev) => ({
                            ...prev,
                            [trip.id]: Number(e.target.value),
                          }))
                        }
                        disabled={!canAct || savingThis}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                      <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                        Timer default: <strong>{computedHours}</strong> hr
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 900 }}>Helper confirmed?</label>
                      <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                        <input
                          type="checkbox"
                          checked={helperConfirmedByTrip[trip.id] ?? true}
                          onChange={(e) =>
                            setHelperConfirmedByTrip((prev) => ({
                              ...prev,
                              [trip.id]: e.target.checked,
                            }))
                          }
                          disabled={!canAct || savingThis}
                        />
                        <span style={{ fontSize: 13, fontWeight: 900 }}>Include helper in payroll</span>
                      </label>
                    </div>

                    {finishMode === "follow_up" ? (
                      <div>
                        <div style={{ fontWeight: 950, marginBottom: 6, color: "#5b21b6" }}>Follow-Up Notes (required)</div>
                        <textarea
                          value={tripFollowUpNotes[trip.id] ?? ""}
                          onChange={(e) => setTripFollowUpNotes((prev) => ({ ...prev, [trip.id]: e.target.value }))}
                          rows={4}
                          disabled={!canAct || savingThis}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "10px",
                            borderRadius: 12,
                            border: "1px solid #ccc",
                          }}
                        />
                        <PrimaryButton
                          type="button"
                          onClick={() => handleFollowUpTrip(trip)}
                          disabled={!canAct || savingThis}
                          style={{ width: "100%", marginTop: 10 }}
                          tone="blue"
                        >
                          🟡 Complete as Follow-Up
                        </PrimaryButton>
                      </div>
                    ) : null}

                    {finishMode === "resolved" ? (
                      <>
                        <div>
                          <div style={{ fontWeight: 950, marginBottom: 6, color: "#1f6b1f" }}>Resolution Notes (required)</div>
                          <textarea
                            value={tripResolutionNotes[trip.id] ?? ""}
                            onChange={(e) => setTripResolutionNotes((prev) => ({ ...prev, [trip.id]: e.target.value }))}
                            rows={4}
                            disabled={!canAct || savingThis}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "10px",
                              borderRadius: 12,
                              border: "1px solid #ccc",
                            }}
                          />
                        </div>

                        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
                          <div style={{ fontWeight: 950 }}>Materials (required)</div>

                          {mats.length === 0 ? (
                            <div
                              style={{
                                marginTop: 10,
                                border: "1px dashed #ccc",
                                borderRadius: 12,
                                padding: 10,
                                background: "white",
                                color: "#666",
                                fontSize: 13,
                              }}
                            >
                              No materials added yet.
                            </div>
                          ) : (
                            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                              {mats.map((m, idx) => (
                                <div
                                  key={`mobile-mat-${idx}`}
                                  style={{
                                    border: "1px solid #eee",
                                    borderRadius: 12,
                                    padding: 10,
                                    background: "white",
                                    display: "grid",
                                    gap: 8,
                                  }}
                                >
                                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                                    <div>
                                      <label style={{ fontSize: 12, fontWeight: 900 }}>Name</label>
                                      <input
                                        value={m.name}
                                        onChange={(e) => updateMaterialRow(trip.id, idx, { name: e.target.value })}
                                        disabled={!canAct || savingThis}
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          padding: "10px 12px",
                                          borderRadius: 12,
                                          border: "1px solid #ccc",
                                          marginTop: 6,
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 12, fontWeight: 900 }}>Qty</label>
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={Number.isFinite(Number(m.qty)) ? m.qty : 1}
                                        onChange={(e) => updateMaterialRow(trip.id, idx, { qty: Number(e.target.value) })}
                                        disabled={!canAct || savingThis}
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          padding: "10px 12px",
                                          borderRadius: 12,
                                          border: "1px solid #ccc",
                                          marginTop: 6,
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <GhostButton
                                    type="button"
                                    onClick={() => removeMaterialRow(trip.id, idx)}
                                    disabled={!canAct || savingThis}
                                    style={{ width: "fit-content" }}
                                  >
                                    Remove
                                  </GhostButton>
                                </div>
                              ))}
                            </div>
                          )}

                          <GhostButton
                            type="button"
                            onClick={() => addMaterialRow(trip.id)}
                            disabled={!canAct || savingThis}
                            style={{ width: "100%", marginTop: 10 }}
                          >
                            + Add Material
                          </GhostButton>
                        </div>

                        <PrimaryButton
                          type="button"
                          onClick={() => handleResolveTrip(trip)}
                          disabled={!canAct || savingThis}
                          style={{ width: "100%", marginTop: 10 }}
                          tone="green"
                        >
                          ✅ Complete as Resolved — Ready to Bill
                        </PrimaryButton>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })()
    ) : null;

  // Billing rendering: only show the “big” billing UI when billing exists
  const showFullBillingPanel = Boolean(billing);

  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading service ticket...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && ticket ? (
          <div style={{ display: "grid", gap: 16 }}>
            {stickyStartCta}

            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <h1 style={{ fontSize: 26, fontWeight: 1000, margin: 0 }}>{ticket.issueSummary}</h1>
                  <Pill text={formatTicketStatus(ticket.status)} tone={statusTone} />
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "#6b7280" }}>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>Ticket ID:</span>
                  <span style={{ fontSize: 13 }}>{ticketId}</span>
                  <GhostButton
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(ticketId);
                      } catch {}
                    }}
                    style={{ padding: "6px 10px", borderRadius: 10, fontSize: 12 }}
                  >
                    Copy
                  </GhostButton>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {!ticket.assignedTechnicianId ? (
                  <PrimaryButton type="button" onClick={handleClaimAndStartTrip} tone="green">
                    ✅ Claim & Start Trip
                  </PrimaryButton>
                ) : null}

                <Link
                  href="/service-tickets"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: "inherit",
                    whiteSpace: "nowrap",
                    fontWeight: 900,
                    background: "white",
                  }}
                >
                  Back to Tickets
                </Link>
              </div>
            </div>

            {/* Main layout */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1.15fr 0.85fr",
                gap: 16,
                alignItems: "start",
              }}
            >
              {/* LEFT COLUMN */}
              <div style={{ display: "grid", gap: 16 }}>
                {/* Customer + Address + Map */}
                <Card
                  title="Customer & Service Address"
                  right={
                    mapsUrl ? (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          textDecoration: "none",
                        }}
                      >
                        <Pill text="📍 Open in Maps" tone="blue" />
                      </a>
                    ) : null
                  }
                >
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.15fr", gap: 14 }}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 1000, marginBottom: 8 }}>Customer</div>
                        <div style={{ fontSize: 14 }}>
                          <strong>Name:</strong> {ticket.customerDisplayName || "—"}
                        </div>
                        <div style={{ fontSize: 14, marginTop: 6 }}>
                          <strong>Phone:</strong>{" "}
                          {customerPhone ? (
                            <a href={`tel:${customerPhone}`} style={{ color: "inherit" }}>
                              {customerPhone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div style={{ fontSize: 14, marginTop: 6 }}>
                          <strong>Email:</strong>{" "}
                          {customerEmail ? (
                            <a href={`mailto:${customerEmail}`} style={{ color: "inherit" }}>
                              {customerEmail}
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>

                      <Divider />

                      <div>
                        <div style={{ fontWeight: 1000, marginBottom: 8 }}>Service Address</div>
                        <div style={{ fontSize: 14 }}>
                          <strong>Label:</strong> {ticket.serviceAddressLabel || "—"}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 14 }}>{ticket.serviceAddressLine1 || "—"}</div>
                        {ticket.serviceAddressLine2 ? <div style={{ fontSize: 14 }}>{ticket.serviceAddressLine2}</div> : null}
                        <div style={{ marginTop: 6, fontSize: 14 }}>
                          {ticket.serviceCity || "—"}, {ticket.serviceState || "—"} {ticket.servicePostalCode || ""}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <GhostButton
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(addressFull);
                              } catch {}
                            }}
                          >
                            Copy Address
                          </GhostButton>

                          {mapsUrl ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-block",
                                textDecoration: "none",
                              }}
                            >
                              <GhostButton type="button">Open Maps</GhostButton>
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Map */}
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        overflow: "hidden",
                        background: "#f8fafc",
                        minHeight: isMobile ? 220 : 320,
                      }}
                    >
                      {mapsEmbedUrl ? (
                        <iframe
                          title="Map"
                          src={mapsEmbedUrl}
                          style={{ width: "100%", height: isMobile ? 220 : 320, border: "none" }}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      ) : (
                        <div style={{ padding: 14, color: "#6b7280", fontSize: 13 }}>
                          No address available to show a map.
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Ticket Overview */}
                <Card title="Ticket Overview">
                  {canDispatch ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={{ fontWeight: 900, fontSize: 13 }}>Status</label>
                          <select
                            value={ticketStatusEdit}
                            onChange={(e) => setTicketStatusEdit(e.target.value as TicketStatus)}
                            disabled={ticketEditSaving}
                            style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12 }}
                          >
                            <option value="new">New</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="in_progress">In Progress</option>
                            <option value="follow_up">Follow Up</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                            Current: <strong>{formatTicketStatus(ticket.status)}</strong>
                          </div>
                        </div>

                        <div>
                          <label style={{ fontWeight: 900, fontSize: 13 }}>Estimated Duration (minutes)</label>
                          <input
                            type="number"
                            min="1"
                            value={ticketEstimatedMinutesEdit}
                            onChange={(e) => setTicketEstimatedMinutesEdit(e.target.value)}
                            disabled={ticketEditSaving}
                            style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12, border: "1px solid #d1d5db" }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 13 }}>Issue Details</label>
                        <textarea
                          value={ticketIssueDetailsEdit}
                          onChange={(e) => setTicketIssueDetailsEdit(e.target.value)}
                          rows={4}
                          disabled={ticketEditSaving}
                          placeholder="Add or update issue details for the tech..."
                          style={{
                            display: "block",
                            width: "100%",
                            padding: 10,
                            marginTop: 6,
                            borderRadius: 12,
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <PrimaryButton type="button" onClick={handleSaveTicketOverview} disabled={ticketEditSaving} tone="blue">
                          {ticketEditSaving ? "Saving..." : "Save Ticket Overview"}
                        </PrimaryButton>

                        {ticketEditErr ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{ticketEditErr}</span> : null}
                        {ticketEditOk ? <span style={{ color: "#166534", fontSize: 13 }}>{ticketEditOk}</span> : null}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "#111827" }}>
                      <div>
                        <strong>Current Status:</strong> {formatTicketStatus(ticket.status)}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <strong>Estimated Duration:</strong> {ticket.estimatedDurationMinutes} minutes
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <strong>Issue Details:</strong>
                      </div>
                      <div style={{ marginTop: 6 }}>{ticket.issueDetails || "No additional issue details."}</div>
                    </div>
                  )}
                </Card>
              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: "grid", gap: 16 }}>
                {/* Trips */}
                <Card
                  title="Trips"
                  right={
                    canDispatch ? (
                      <PrimaryButton type="button" onClick={() => setScheduleOpen((v) => !v)} tone="blue">
                        {scheduleOpen ? "Close" : "+ Schedule New Trip"}
                      </PrimaryButton>
                    ) : null
                  }
                >
                  {tripsLoading ? <p style={{ color: "#6b7280" }}>Loading trips...</p> : null}
                  {tripsError ? <p style={{ color: "#b91c1c" }}>{tripsError}</p> : null}

                  {!tripsLoading && !tripsError ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {trips.length === 0 ? (
                        <div
                          style={{
                            border: "1px dashed #d1d5db",
                            borderRadius: 12,
                            padding: 12,
                            background: "#f8fafc",
                            color: "#6b7280",
                            fontSize: 13,
                            fontWeight: 800,
                          }}
                        >
                          No trips scheduled yet.
                        </div>
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
                          const hideInlineFinishPanelOnMobile = isMobile && inProgressTrip?.id === t.id;

                          return (
                            <div
                              key={t.id}
                              style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: 14,
                                padding: 12,
                                background: "white",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                                <div style={{ display: "grid", gap: 6 }}>
                                  <div style={{ fontWeight: 1000 }}>
                                    🧳 {t.date} • {formatTripWindow(String(t.timeWindow || ""))} • {t.startTime}-{t.endTime}
                                  </div>

                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    Status: <strong>{t.status}</strong> • Timer: <strong>{timerState}</strong>
                                    {t.actualMinutes != null ? ` • Minutes: ${t.actualMinutes}` : ""}
                                  </div>

                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    Tech: <strong>{primary}</strong>
                                    {helper ? <div style={{ marginTop: 4 }}>{helper}</div> : null}
                                    {secondary ? <div style={{ marginTop: 4 }}>{secondary}</div> : null}
                                    {secondaryHelper ? <div style={{ marginTop: 4 }}>{secondaryHelper}</div> : null}
                                  </div>

                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    Timer minutes: <strong>{computedBillable}</strong>{" "}
                                    <span style={{ color: "#9ca3af" }}>(gross {liveGrossMins} - paused {pausedMins})</span>
                                  </div>
                                </div>

                                {canDispatch ? (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    <GhostButton type="button" onClick={() => openEditTrip(t)} disabled={savingThis || isCancelled}>
                                      Edit
                                    </GhostButton>

                                    <GhostButton
                                      type="button"
                                      onClick={() => handleSoftDeleteTrip(t)}
                                      disabled={savingThis || isCancelled || isInProgress || isComplete}
                                      style={{ borderColor: "#fecdd3", background: "#fff1f2" }}
                                    >
                                      Delete
                                    </GhostButton>
                                  </div>
                                ) : null}
                              </div>

                              <Divider />

                              {/* Actions */}
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {!isComplete && !isCancelled ? (
                                  <>
                                    {!isInProgress ? (
                                      <PrimaryButton
                                        type="button"
                                        onClick={() => handleStartTrip(t)}
                                        disabled={!canAct || savingThis || !canStartTripRole}
                                        tone="green"
                                      >
                                        {savingThis ? "Working..." : "🚀 Start Trip"}
                                      </PrimaryButton>
                                    ) : null}

                                    {isInProgress && isRunning ? (
                                      <GhostButton type="button" onClick={() => handlePauseTrip(t)} disabled={!canAct || savingThis}>
                                        ❚❚ Pause
                                      </GhostButton>
                                    ) : null}

                                    {isInProgress && isPaused ? (
                                      <GhostButton type="button" onClick={() => handleResumeTrip(t)} disabled={!canAct || savingThis}>
                                        ▶ Resume
                                      </GhostButton>
                                    ) : null}

                                    {isInProgress ? (
                                      <div style={{ width: "100%", marginTop: 8, display: "grid", gap: 8 }}>
                                        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>Finish mode</div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          <GhostButton
                                            type="button"
                                            onClick={() => {
                                              setFinishModeByTrip((prev) => ({ ...prev, [t.id]: "follow_up" }));
                                              if (isMobile && inProgressTrip?.id === t.id) setMobileFinishOpen(true);
                                            }}
                                            disabled={!canAct || savingThis}
                                            style={{ borderColor: "#d7b6ff", background: "#fbf5ff" }}
                                          >
                                            🟡 Follow-Up
                                          </GhostButton>

                                          <GhostButton
                                            type="button"
                                            onClick={() => {
                                              setFinishModeByTrip((prev) => ({ ...prev, [t.id]: "resolved" }));
                                              if (isMobile && inProgressTrip?.id === t.id) setMobileFinishOpen(true);
                                            }}
                                            disabled={!canAct || savingThis}
                                            style={{ borderColor: "#b7e3c2", background: "#f2fff6" }}
                                          >
                                            ✅ Resolved
                                          </GhostButton>

                                          {finishMode !== "none" ? (
                                            <GhostButton
                                              type="button"
                                              onClick={() => {
                                                setFinishModeByTrip((prev) => ({ ...prev, [t.id]: "none" }));
                                                if (isMobile && inProgressTrip?.id === t.id) setMobileFinishOpen(false);
                                              }}
                                              disabled={!canAct || savingThis}
                                            >
                                              Clear
                                            </GhostButton>
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 900 }}>
                                    {isCancelled ? `🚫 Cancelled (${t.cancelReason || "No reason"})` : "✅ Complete"}
                                  </div>
                                )}
                              </div>

                              {/* Work Notes */}
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontWeight: 900, marginBottom: 6 }}>Work Notes</div>
                                <textarea
                                  value={tripWorkNotes[t.id] ?? ""}
                                  onChange={(e) => setTripWorkNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                  rows={3}
                                  disabled={!canAct || savingThis || isCancelled}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    padding: 10,
                                    borderRadius: 12,
                                    border: "1px solid #d1d5db",
                                  }}
                                />
                                <div style={{ marginTop: 8 }}>
                                  <GhostButton type="button" onClick={() => handleSaveWorkNotes(t)} disabled={!canAct || savingThis || isCancelled}>
                                    💾 Save Notes
                                  </GhostButton>
                                </div>
                              </div>

                              {/* Finish Panel (desktop + non-mobile in-progress trip only) */}
                              {showFinishPanel && !hideInlineFinishPanelOnMobile ? (
                                <div style={{ marginTop: 14 }}>
                                  <div
                                    style={{
                                      border: finishMode === "resolved" ? "1px solid #b7e3c2" : "1px solid #d7b6ff",
                                      background: finishMode === "resolved" ? "#f2fff6" : "#fbf5ff",
                                      borderRadius: 14,
                                      padding: 12,
                                    }}
                                  >
                                    <div style={{ fontWeight: 1000 }}>
                                      {finishMode === "resolved" ? "✅ Finish Trip: Resolved" : "🟡 Finish Trip: Follow-Up"}
                                    </div>

                                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                                        <div>
                                          <label style={{ fontSize: 12, fontWeight: 900 }}>Hours (override)</label>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={hoursToUse}
                                            onChange={(e) =>
                                              setHoursOverrideByTrip((prev) => ({
                                                ...prev,
                                                [t.id]: Number(e.target.value),
                                              }))
                                            }
                                            disabled={!canAct || savingThis}
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              padding: "10px 12px",
                                              borderRadius: 12,
                                              border: "1px solid #ccc",
                                              marginTop: 6,
                                            }}
                                          />
                                          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                                            Timer default: <strong>{computedHours}</strong> hr
                                          </div>
                                        </div>

                                        <div>
                                          <label style={{ fontSize: 12, fontWeight: 900 }}>Helper confirmed?</label>
                                          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                                            <input
                                              type="checkbox"
                                              checked={helperConfirmedByTrip[t.id] ?? true}
                                              onChange={(e) =>
                                                setHelperConfirmedByTrip((prev) => ({
                                                  ...prev,
                                                  [t.id]: e.target.checked,
                                                }))
                                              }
                                              disabled={!canAct || savingThis}
                                            />
                                            <span style={{ fontSize: 13, fontWeight: 900 }}>Include helper in payroll</span>
                                          </label>
                                        </div>
                                      </div>

                                      {showFollowUpField ? (
                                        <div>
                                          <div style={{ fontWeight: 950, marginBottom: 6, color: "#5b21b6" }}>Follow-Up Notes (required)</div>
                                          <textarea
                                            value={tripFollowUpNotes[t.id] ?? ""}
                                            onChange={(e) => setTripFollowUpNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                            rows={4}
                                            disabled={!canAct || savingThis}
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              padding: 10,
                                              borderRadius: 12,
                                              border: "1px solid #d1d5db",
                                            }}
                                          />
                                          <PrimaryButton
                                            type="button"
                                            onClick={() => handleFollowUpTrip(t)}
                                            disabled={!canAct || savingThis}
                                            tone="blue"
                                            style={{ marginTop: 10 }}
                                          >
                                            🟡 Complete as Follow-Up
                                          </PrimaryButton>
                                        </div>
                                      ) : null}

                                      {showResolvedFields ? (
                                        <>
                                          <div>
                                            <div style={{ fontWeight: 950, marginBottom: 6, color: "#14532d" }}>Resolution Notes (required)</div>
                                            <textarea
                                              value={tripResolutionNotes[t.id] ?? ""}
                                              onChange={(e) => setTripResolutionNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                              rows={4}
                                              disabled={!canAct || savingThis}
                                              style={{
                                                display: "block",
                                                width: "100%",
                                                padding: 10,
                                                borderRadius: 12,
                                                border: "1px solid #d1d5db",
                                              }}
                                            />
                                          </div>

                                          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
                                            <div style={{ fontWeight: 950 }}>Materials (required)</div>

                                            {mats.length === 0 ? (
                                              <div
                                                style={{
                                                  marginTop: 10,
                                                  border: "1px dashed #d1d5db",
                                                  borderRadius: 12,
                                                  padding: 10,
                                                  background: "white",
                                                  color: "#6b7280",
                                                  fontSize: 13,
                                                }}
                                              >
                                                No materials added yet.
                                              </div>
                                            ) : (
                                              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                                {mats.map((m, idx) => (
                                                  <div
                                                    key={`${t.id}-mat-${idx}`}
                                                    style={{
                                                      border: "1px solid #e5e7eb",
                                                      borderRadius: 12,
                                                      padding: 10,
                                                      background: "white",
                                                      display: "grid",
                                                      gap: 8,
                                                    }}
                                                  >
                                                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                                                      <div>
                                                        <label style={{ fontSize: 12, fontWeight: 900 }}>Name</label>
                                                        <input
                                                          value={m.name}
                                                          onChange={(e) => updateMaterialRow(t.id, idx, { name: e.target.value })}
                                                          disabled={!canAct || savingThis}
                                                          style={{
                                                            display: "block",
                                                            width: "100%",
                                                            padding: "10px 12px",
                                                            borderRadius: 12,
                                                            border: "1px solid #ccc",
                                                            marginTop: 6,
                                                          }}
                                                        />
                                                      </div>
                                                      <div>
                                                        <label style={{ fontSize: 12, fontWeight: 900 }}>Qty</label>
                                                        <input
                                                          type="number"
                                                          min="0.01"
                                                          step="0.01"
                                                          value={Number.isFinite(Number(m.qty)) ? m.qty : 1}
                                                          onChange={(e) => updateMaterialRow(t.id, idx, { qty: Number(e.target.value) })}
                                                          disabled={!canAct || savingThis}
                                                          style={{
                                                            display: "block",
                                                            width: "100%",
                                                            padding: "10px 12px",
                                                            borderRadius: 12,
                                                            border: "1px solid #ccc",
                                                            marginTop: 6,
                                                          }}
                                                        />
                                                      </div>
                                                    </div>

                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                      <div>
                                                        <label style={{ fontSize: 12, fontWeight: 900 }}>Unit (opt)</label>
                                                        <input
                                                          value={m.unit || ""}
                                                          onChange={(e) => updateMaterialRow(t.id, idx, { unit: e.target.value })}
                                                          disabled={!canAct || savingThis}
                                                          style={{
                                                            display: "block",
                                                            width: "100%",
                                                            padding: "10px 12px",
                                                            borderRadius: 12,
                                                            border: "1px solid #ccc",
                                                            marginTop: 6,
                                                          }}
                                                        />
                                                      </div>
                                                      <div>
                                                        <label style={{ fontSize: 12, fontWeight: 900 }}>Notes (opt)</label>
                                                        <input
                                                          value={m.notes || ""}
                                                          onChange={(e) => updateMaterialRow(t.id, idx, { notes: e.target.value })}
                                                          disabled={!canAct || savingThis}
                                                          style={{
                                                            display: "block",
                                                            width: "100%",
                                                            padding: "10px 12px",
                                                            borderRadius: 12,
                                                            border: "1px solid #ccc",
                                                            marginTop: 6,
                                                          }}
                                                        />
                                                      </div>
                                                    </div>

                                                    <GhostButton
                                                      type="button"
                                                      onClick={() => removeMaterialRow(t.id, idx)}
                                                      disabled={!canAct || savingThis}
                                                      style={{ width: "fit-content" }}
                                                    >
                                                      Remove
                                                    </GhostButton>
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            <GhostButton
                                              type="button"
                                              onClick={() => addMaterialRow(t.id)}
                                              disabled={!canAct || savingThis}
                                              style={{ marginTop: 10 }}
                                            >
                                              + Add Material
                                            </GhostButton>
                                          </div>

                                          <PrimaryButton
                                            type="button"
                                            onClick={() => handleResolveTrip(t)}
                                            disabled={!canAct || savingThis}
                                            tone="green"
                                            style={{ marginTop: 6 }}
                                          >
                                            ✅ Complete as Resolved — Ready to Bill
                                          </PrimaryButton>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {errMsg ? <p style={{ marginTop: 10, color: "#b91c1c", fontWeight: 900 }}>{errMsg}</p> : null}
                              {okMsg ? <p style={{ marginTop: 10, color: "#166534", fontWeight: 900 }}>{okMsg}</p> : null}

                              <div style={{ marginTop: 10, fontSize: 11, color: "#9ca3af" }}>Trip ID: {t.id}</div>
                            </div>
                          );
                        })
                      )}

                      {/* Schedule panel */}
                      {canDispatch && scheduleOpen ? (
                        <div
                          style={{
                            borderTop: "1px solid #f1f5f9",
                            paddingTop: 12,
                            marginTop: 6,
                          }}
                        >
                          <div style={{ fontWeight: 1000, marginBottom: 10 }}>Schedule a Trip</div>

                          <form onSubmit={handleCreateTrip} style={{ display: "grid", gap: 12 }}>
                            <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
                              <div>
                                <label style={{ fontWeight: 900, fontSize: 13 }}>Date</label>
                                <input
                                  type="date"
                                  value={tripDate}
                                  onChange={(e) => setTripDate(e.target.value)}
                                  disabled={tripSaving}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    padding: 10,
                                    marginTop: 6,
                                    borderRadius: 12,
                                    border: "1px solid #d1d5db",
                                  }}
                                />
                              </div>

                              <div>
                                <label style={{ fontWeight: 900, fontSize: 13 }}>Time Window</label>
                                <select
                                  value={tripTimeWindow}
                                  onChange={(e) => setTripTimeWindow(e.target.value as TripTimeWindow)}
                                  disabled={tripSaving}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    padding: 10,
                                    marginTop: 6,
                                    borderRadius: 12,
                                  }}
                                >
                                  <option value="am">Morning (8:00–12:00)</option>
                                  <option value="pm">Afternoon (1:00–5:00)</option>
                                  <option value="all_day">All Day (8:00–5:00)</option>
                                  <option value="custom">Custom</option>
                                </select>
                              </div>
                            </div>

                            {tripTimeWindow === "custom" ? (
                              <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
                                <div>
                                  <label style={{ fontWeight: 900, fontSize: 13 }}>Start Time</label>
                                  <input
                                    type="time"
                                    value={tripStartTime}
                                    onChange={(e) => setTripStartTime(e.target.value)}
                                    disabled={tripSaving}
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: 10,
                                      marginTop: 6,
                                      borderRadius: 12,
                                      border: "1px solid #d1d5db",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontWeight: 900, fontSize: 13 }}>End Time</label>
                                  <input
                                    type="time"
                                    value={tripEndTime}
                                    onChange={(e) => setTripEndTime(e.target.value)}
                                    disabled={tripSaving}
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: 10,
                                      marginTop: 6,
                                      borderRadius: 12,
                                      border: "1px solid #d1d5db",
                                    }}
                                  />
                                </div>
                              </div>
                            ) : null}

                            {techniciansLoading ? <p style={{ color: "#6b7280" }}>Loading technicians...</p> : null}
                            {techniciansError ? <p style={{ color: "#b91c1c" }}>{techniciansError}</p> : null}

                            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#f8fafc" }}>
                              <div style={{ fontWeight: 1000, marginBottom: 10 }}>Crew</div>

                              <div>
                                <label style={{ fontWeight: 900, fontSize: 13 }}>Primary Technician</label>
                                <select
                                  value={tripPrimaryTechUid}
                                  onChange={(e) => setTripPrimaryTechUid(e.target.value)}
                                  disabled={tripSaving || techniciansLoading}
                                  style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12 }}
                                >
                                  <option value="">Select a technician...</option>
                                  {technicians.map((t) => (
                                    <option key={t.uid} value={t.uid}>
                                      {t.displayName}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div style={{ marginTop: 10 }}>
                                <label style={{ fontWeight: 900, fontSize: 13 }}>Secondary Technician (Optional)</label>
                                <select
                                  value={tripSecondaryTechUid}
                                  onChange={(e) => setTripSecondaryTechUid(e.target.value)}
                                  disabled={tripSaving || !tripPrimaryTechUid}
                                  style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12 }}
                                >
                                  <option value="">— None —</option>
                                  {technicians
                                    .filter((t) => t.uid !== tripPrimaryTechUid)
                                    .map((t) => (
                                      <option key={t.uid} value={t.uid}>
                                        {t.displayName}
                                      </option>
                                    ))}
                                </select>
                                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                                  Only use this for two true technicians. Helpers/apprentices go below.
                                </div>
                              </div>

                              <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                                <div style={{ fontWeight: 1000, marginBottom: 8 }}>Helper / Apprentice</div>

                                {profilesLoading ? <p style={{ color: "#6b7280" }}>Loading employee profiles...</p> : null}
                                {profilesError ? <p style={{ color: "#b91c1c" }}>{profilesError}</p> : null}

                                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
                                  <input
                                    type="checkbox"
                                    checked={tripUseDefaultHelper}
                                    onChange={(e) => setTripUseDefaultHelper(e.target.checked)}
                                    disabled={tripSaving}
                                  />
                                  Use default helper pairing (recommended)
                                </label>

                                <div style={{ marginTop: 10 }}>
                                  <label style={{ fontWeight: 900, fontSize: 13 }}>Helper / Apprentice (Optional)</label>
                                  <select
                                    value={tripHelperUid}
                                    onChange={(e) => {
                                      setTripUseDefaultHelper(false);
                                      setTripHelperUid(e.target.value);
                                    }}
                                    disabled={tripSaving || profilesLoading || !tripPrimaryTechUid}
                                    style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12 }}
                                  >
                                    <option value="">— None —</option>
                                    {helperCandidates.map((h) => (
                                      <option key={h.uid} value={h.uid}>
                                        {h.name} ({h.laborRole})
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div style={{ marginTop: 10 }}>
                                  <label style={{ fontWeight: 900, fontSize: 13 }}>Secondary Helper (Optional)</label>
                                  <select
                                    value={tripSecondaryHelperUid}
                                    onChange={(e) => setTripSecondaryHelperUid(e.target.value)}
                                    disabled={tripSaving || profilesLoading}
                                    style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12 }}
                                  >
                                    <option value="">— None —</option>
                                    {helperCandidates.map((h) => (
                                      <option key={h.uid} value={h.uid}>
                                        {h.name} ({h.laborRole})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>

                            <div>
                              <label style={{ fontWeight: 900, fontSize: 13 }}>Trip Notes (optional)</label>
                              <textarea
                                value={tripNotes}
                                onChange={(e) => setTripNotes(e.target.value)}
                                rows={3}
                                disabled={tripSaving}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  padding: 10,
                                  marginTop: 6,
                                  borderRadius: 12,
                                  border: "1px solid #d1d5db",
                                }}
                              />
                            </div>

                            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
                              <input
                                type="checkbox"
                                checked={tripSetTicketScheduled}
                                onChange={(e) => setTripSetTicketScheduled(e.target.checked)}
                                disabled={tripSaving}
                              />
                              If ticket is NEW, change status to SCHEDULED when this trip is created
                            </label>

                            {tripSaveError ? <p style={{ color: "#b91c1c", fontWeight: 900 }}>{tripSaveError}</p> : null}
                            {tripSaveSuccess ? <p style={{ color: "#166534", fontWeight: 900 }}>{tripSaveSuccess}</p> : null}

                            <PrimaryButton type="submit" disabled={tripSaving || !canDispatch} tone="blue" style={{ width: "fit-content" }}>
                              {tripSaving ? "Scheduling..." : "Schedule Trip"}
                            </PrimaryButton>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </Card>

                {/* Billing (clean) */}
                <Card title="Billing Packet">
                  {!showFullBillingPanel ? (
                    <div
                      style={{
                        border: "1px dashed #d1d5db",
                        borderRadius: 12,
                        padding: 12,
                        background: "#f8fafc",
                        color: "#6b7280",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      No billing packet yet. It will appear after a trip is completed as <strong>Resolved — Ready to Bill</strong>.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 13, color: "#374151" }}>
                        Status: <strong>{billing?.status}</strong>
                        {billing?.readyToBillAt ? <span style={{ color: "#6b7280" }}> • Ready: {billing.readyToBillAt}</span> : null}
                      </div>

                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                        <div style={{ fontWeight: 1000, marginBottom: 6 }}>Labor (Customer Billing)</div>
                        <div style={{ fontSize: 13, color: "#374151" }}>
                          Total billed hours: <strong>{Number(billing?.labor?.totalHours ?? 0).toFixed(2)}</strong>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                          Billing rule: labor hours belong to the <strong>Primary Tech only</strong>.
                        </div>

                        {Array.isArray(billing?.labor?.byCrew) && billing!.labor.byCrew.length ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                            {billing!.labor.byCrew.map((c) => (
                              <div key={c.uid} style={{ fontSize: 13, color: "#374151" }}>
                                {c.name} • {c.hours.toFixed(2)} hr
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: 10, fontSize: 13, color: "#6b7280" }}>No primary tech labor line captured yet.</div>
                        )}
                      </div>

                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                        <div style={{ fontWeight: 1000, marginBottom: 6 }}>Materials</div>

                        {!Array.isArray(billing?.materials) || billing!.materials.length === 0 ? (
                          <div style={{ fontSize: 13, color: "#6b7280" }}>No materials captured.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {billing!.materials.map((m, idx) => (
                              <div
                                key={`bill-mat-${idx}`}
                                style={{
                                  border: "1px solid #f1f5f9",
                                  borderRadius: 12,
                                  padding: 10,
                                }}
                              >
                                <div style={{ fontWeight: 900, fontSize: 13 }}>
                                  {m.name} • {Number(m.qty).toFixed(2)} {m.unit || ""}
                                </div>
                                {m.notes ? <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{m.notes}</div> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
                        <div style={{ fontWeight: 1000, marginBottom: 6 }}>Resolution Notes</div>
                        <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
                          {billing?.resolutionNotes || "—"}
                        </div>

                        <div style={{ marginTop: 12, fontWeight: 1000, marginBottom: 6 }}>Work Notes</div>
                        <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
                          {billing?.workNotes || "—"}
                        </div>
                      </div>

                      {canBill ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <GhostButton type="button" onClick={() => markBillingStatus("invoiced")} disabled={billingSaving}>
                            {billingSaving ? "Working..." : "Mark Invoiced"}
                          </GhostButton>

                          <GhostButton type="button" onClick={() => markBillingStatus("ready_to_bill")} disabled={billingSaving}>
                            Set Ready to Bill
                          </GhostButton>

                          <GhostButton type="button" onClick={() => markBillingStatus("not_ready")} disabled={billingSaving}>
                            Set Not Ready
                          </GhostButton>

                          <GhostButton
                            type="button"
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
                                  `✅ QBO Invoice Created\nInvoice ID: ${data.qboInvoiceId}${
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
                          </GhostButton>

                          {billingErr ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{billingErr}</span> : null}
                          {billingOk ? <span style={{ color: "#166534", fontSize: 13 }}>{billingOk}</span> : null}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          Billing controls are limited to Admin/Manager/Dispatcher/Billing.
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* System (small + quiet) */}
                <Card title="System">
                  <div style={{ display: "grid", gap: 6, color: "#374151", fontSize: 13 }}>
                    <div>
                      <strong>Active:</strong> {String(ticket.active)}
                    </div>
                    <div>
                      <strong>Created At:</strong> {ticket.createdAt || "—"}
                    </div>
                    <div>
                      <strong>Updated At:</strong> {ticket.updatedAt || "—"}
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Edit Trip Modal (separate UI so it never feels like the schedule form) */}
            {canDispatch && editTripId ? (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(15, 23, 42, 0.55)",
                  zIndex: 999,
                  display: "grid",
                  placeItems: "center",
                  padding: 16,
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeEditTrip();
                }}
              >
                <div
                  style={{
                    width: "min(720px, 100%)",
                    background: "white",
                    borderRadius: 16,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: 14,
                      borderBottom: "1px solid #f1f5f9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 1000 }}>Edit / Reschedule Trip</div>
                    <GhostButton type="button" onClick={closeEditTrip} disabled={editTripSaving}>
                      Close
                    </GhostButton>
                  </div>

                  <div style={{ padding: 16, display: "grid", gap: 12 }}>
                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
                      <div>
                        <label style={{ fontWeight: 900, fontSize: 13 }}>Date</label>
                        <input
                          type="date"
                          value={editTripDate}
                          onChange={(e) => setEditTripDate(e.target.value)}
                          disabled={editTripSaving}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: 10,
                            marginTop: 6,
                            borderRadius: 12,
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 13 }}>Time Window</label>
                        <select
                          value={editTripTimeWindow}
                          onChange={(e) => setEditTripTimeWindow(e.target.value as TripTimeWindow)}
                          disabled={editTripSaving}
                          style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 12 }}
                        >
                          <option value="am">Morning (8:00–12:00)</option>
                          <option value="pm">Afternoon (1:00–5:00)</option>
                          <option value="all_day">All Day (8:00–5:00)</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 13 }}>Start Time</label>
                        <input
                          type="time"
                          value={editTripStartTime}
                          onChange={(e) => setEditTripStartTime(e.target.value)}
                          disabled={editTripSaving}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: 10,
                            marginTop: 6,
                            borderRadius: 12,
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontWeight: 900, fontSize: 13 }}>End Time</label>
                        <input
                          type="time"
                          value={editTripEndTime}
                          onChange={(e) => setEditTripEndTime(e.target.value)}
                          disabled={editTripSaving}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: 10,
                            marginTop: 6,
                            borderRadius: 12,
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 13 }}>Trip Notes</label>
                      <textarea
                        value={editTripNotes}
                        onChange={(e) => setEditTripNotes(e.target.value)}
                        rows={3}
                        disabled={editTripSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          marginTop: 6,
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <PrimaryButton type="button" onClick={handleSaveTripEdits} disabled={editTripSaving} tone="blue">
                        {editTripSaving ? "Saving..." : "Save Changes"}
                      </PrimaryButton>

                      {editTripErr ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{editTripErr}</span> : null}
                      {editTripOk ? <span style={{ color: "#166534", fontSize: 13 }}>{editTripOk}</span> : null}
                    </div>

                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      This modal is intentionally separate from “Schedule New Trip” so rescheduling never feels like it’s using the same fields.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Mobile sticky in-progress actions bar */}
            {stickyInProgressBar}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}