// app/service-tickets/[ticketId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

// -----------------------------
// Helpers
// -----------------------------
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

function roundToQuarter(hours: number) {
  return Math.round(hours * 4) / 4;
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

function nowIso() {
  return new Date().toISOString();
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

  // de-dupe
  const seen = new Set<string>();
  return out.filter((m) => {
    if (!m.uid) return false;
    if (seen.has(m.uid)) return false;
    seen.add(m.uid);
    return true;
  });
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
  noteSuffix: string;
}) {
  const { trip, member, entryDate, hoursGenerated, weekStartDate, weekEndDate, timesheetId, createdByUid, noteSuffix } =
    args;

  const now = nowIso();

  const timeEntryId = `trip_${trip.id}_${member.uid}`;
  const ref = doc(db, "timeEntries", timeEntryId);

  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists() ? (existingSnap.data() as ExistingTimeEntry) : null;

  const hoursLocked = Boolean(existing?.hoursLocked);
  const hoursToWrite = hoursLocked ? Number(existing?.hours ?? hoursGenerated) : hoursGenerated;

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

      category: trip.type === "project" ? "project" : "service",
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

      entryStatus: "draft",
      notes: `AUTO_TIME_FROM_TRIP:${trip.id} • ${noteSuffix}`,

      createdAt: existingSnap.exists() ? existing?.createdAt ?? now : now,
      createdByUid: existingSnap.exists() ? existing?.createdByUid ?? null : createdByUid || null,
      updatedAt: now,
      updatedByUid: createdByUid || null,
    }),
    { merge: true }
  );
}

function validateMaterialsForResolved(materials: TripMaterial[]):
  | { ok: false; message: string }
  | { ok: true; cleaned: TripMaterial[] } {
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
// Page
// -----------------------------
export default function ServiceTicketDetailPage({ params }: ServiceTicketDetailPageProps) {
  const { appUser } = useAuthContext();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canWorkTrip =
    appUser?.role === "admin" ||
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

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

  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState("");

  const [profilesLoading, setProfilesLoading] = useState(true);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [profilesError, setProfilesError] = useState("");

  // Legacy ticket update form state (kept; schedule fields hidden)
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [status, setStatus] = useState<
    "new" | "scheduled" | "in_progress" | "follow_up" | "completed" | "cancelled"
  >("new");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [selectedTechnicianUid, setSelectedTechnicianUid] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // Trips list state
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

  // Schedule Trip form
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

  // Billing UI
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingErr, setBillingErr] = useState("");
  const [billingOk, setBillingOk] = useState("");

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

        setStatus(item.status);
        setEstimatedDurationMinutes(String(item.estimatedDurationMinutes || 60));
        setScheduledDate(item.scheduledDate ?? "");
        setScheduledStartTime(item.scheduledStartTime ?? "");
        setScheduledEndTime(item.scheduledEndTime ?? "");
        setSelectedTechnicianUid(item.assignedTechnicianId ?? "");
        setInternalNotes(item.internalNotes ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load service ticket.");
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [params]);

  // -----------------------------
  // Load Technicians
  // -----------------------------
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

  // -----------------------------
  // Load Employee Profiles (for helpers)
  // -----------------------------
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

  // -----------------------------
  // Load Trips for this Ticket
  // -----------------------------
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

        // Seed UI state from loaded trips
        const nextWork: Record<string, string> = {};
        const nextRes: Record<string, string> = {};
        const nextFollow: Record<string, string> = {};
        const nextMat: Record<string, TripMaterial[]> = {};

        for (const t of items) {
          nextWork[t.id] = (t.workNotes || "") as string;
          nextRes[t.id] = (t.resolutionNotes || "") as string;
          nextFollow[t.id] = (t.followUpNotes || "") as string;
          nextMat[t.id] = Array.isArray(t.materials) && t.materials.length ? (t.materials as TripMaterial[]) : [];
        }

        setTripWorkNotes(nextWork);
        setTripResolutionNotes(nextRes);
        setTripFollowUpNotes(nextFollow);
        setTripMaterials(nextMat);
      } catch (err: unknown) {
        setTripsError(err instanceof Error ? err.message : "Failed to load trips.");
      } finally {
        setTripsLoading(false);
      }
    }

    loadTrips();
  }, [ticketId]);

  // -----------------------------
  // Auto times from timeWindow
  // -----------------------------
  useEffect(() => {
    const { start, end } = windowToTimes(tripTimeWindow);
    if (tripTimeWindow !== "custom") {
      setTripStartTime(start);
      setTripEndTime(end);
    }
  }, [tripTimeWindow]);

  // -----------------------------
  // Auto default helper pairing
  // -----------------------------
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

  // -----------------------------
  // Legacy: Save Ticket Updates (schedule fields hidden)
  // -----------------------------
  const selectedTechnician = useMemo(() => {
    return technicians.find((tech) => tech.uid === selectedTechnicianUid) ?? null;
  }, [technicians, selectedTechnicianUid]);

  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const now = nowIso();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,
        assignedTechnicianId: selectedTechnician ? selectedTechnician.uid : null,
        assignedTechnicianName: selectedTechnician ? selectedTechnician.displayName : null,
        internalNotes: internalNotes.trim() || null,
        updatedAt: now,
      });

      setTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status,
          estimatedDurationMinutes: Number(estimatedDurationMinutes),
          scheduledDate: scheduledDate || undefined,
          scheduledStartTime: scheduledStartTime || undefined,
          scheduledEndTime: scheduledEndTime || undefined,
          assignedTechnicianId: selectedTechnician?.uid || undefined,
          assignedTechnicianName: selectedTechnician?.displayName || undefined,
          internalNotes: internalNotes.trim() || undefined,
          updatedAt: now,
        };
      });

      setSaveSuccess("Ticket updates saved successfully.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save ticket updates.");
    } finally {
      setSaving(false);
    }
  }

  function getScheduleSummary() {
    if (!ticket) return "—";
    if (!ticket.scheduledDate && !ticket.scheduledStartTime && !ticket.scheduledEndTime) {
      return "Not scheduled yet";
    }
    const datePart = ticket.scheduledDate || "No date";
    const startPart = ticket.scheduledStartTime || "—";
    const endPart = ticket.scheduledEndTime || "—";
    return `${datePart} • ${startPart} - ${endPart}`;
  }

  // -----------------------------
  // Create Trip (Dispatch)
  // -----------------------------
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

      // Update ticket staffing pointers (keep for now)
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

      setTripSaveSuccess(`✅ Trip scheduled (${formatTripWindow(tripTimeWindow)}). Trip ID: ${createdTripRef.id}`);
      setTripNotes("");
    } catch (err: unknown) {
      setTripSaveError(err instanceof Error ? err.message : "Failed to create trip.");
    } finally {
      setTripSaving(false);
    }
  }

  // -----------------------------
  // Trip Actions
  // -----------------------------
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

  async function handleStartTrip(trip: TripDoc) {
    if (!canWorkTrip) return;
    if (!myUid) return;
    if (!isUidOnTripCrew(myUid, trip.crew) && appUser?.role !== "admin") {
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

      setTripOk(trip.id, "✅ Trip started.");
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

      setTripOk(trip.id, "⏸ Paused.");
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

      setTripOk(trip.id, "▶ Resumed.");
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

      setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, workNotes: notes || null } : t)));

      setTripOk(trip.id, "💾 Notes saved.");
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

      // finalize pause if currently paused (close open pause)
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

      if (!trip.date) {
        throw new Error("Trip is missing date; cannot create time entries.");
      }
      if (!actualMinutes || actualMinutes <= 0) {
        throw new Error("Trip duration is 0 minutes; no time entry created.");
      }

      // pull latest trip snapshot to ensure crewConfirmed is current
      const latestSnap = await getDoc(doc(db, "trips", trip.id));
      const latestTrip = latestSnap.exists() ? (latestSnap.data() as any) : null;

      const crewConfirmed: TripCrew | null = (latestTrip?.crewConfirmed ?? trip.crewConfirmed ?? null) as any;
      const crewFallback: TripCrew | null = (latestTrip?.crew ?? trip.crew ?? null) as any;

      const crewMembers = crewMembersFromTrip({
        crewConfirmed,
        crew: crewFallback,
      });

      if (crewMembers.length === 0) {
        throw new Error("No crew members found on trip (crewConfirmed/crew empty). Cannot create time entries.");
      }

      const hoursGenerated = roundToQuarter(actualMinutes / 60);
      const entryDate = trip.date;
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

      // 1) Update trip -> complete
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

      // 2) Create timeEntries + weeklyTimesheets header for EACH crew member (Option B)
      for (const m of crewMembers) {
        const timesheetId = await upsertWeeklyTimesheetHeader({
          employeeId: m.uid,
          employeeName: m.name,
          employeeRole: m.role,
          weekStartDate,
          weekEndDate,
          createdByUid: myUid || null,
        });

        await upsertTimeEntryFromTrip({
          trip,
          member: m,
          entryDate,
          hoursGenerated,
          weekStartDate,
          weekEndDate,
          timesheetId,
          createdByUid: myUid || null,
          noteSuffix: "Resolved",
        });
      }

      // 3) Billing Packet write (Option C: bill ONLY primary tech hours)
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
            totalHours: hoursGenerated,
            byCrew: primaryUid
              ? [
                  {
                    uid: primaryUid,
                    name: primaryName,
                    role: "technician",
                    hours: hoursGenerated,
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
      }

      // 4) local state updates
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
              }
            : t
        )
      );

      setTripOk(trip.id, `✅ Resolved. Billable minutes: ${actualMinutes}. Time entries: ${crewMembers.length}`);
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

      const crewConfirmed: TripCrew | null = (latestTrip?.crewConfirmed ?? trip.crewConfirmed ?? null) as any;
      const crewFallback: TripCrew | null = (latestTrip?.crew ?? trip.crew ?? null) as any;

      const crewMembers = crewMembersFromTrip({ crewConfirmed, crew: crewFallback });
      if (crewMembers.length === 0) {
        throw new Error("No crew members found on trip (crewConfirmed/crew empty). Cannot create time entries.");
      }

      const hoursGenerated = roundToQuarter(actualMinutes / 60);
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

      // Follow up also generates payroll time entries (paid work)
      for (const m of crewMembers) {
        const timesheetId = await upsertWeeklyTimesheetHeader({
          employeeId: m.uid,
          employeeName: m.name,
          employeeRole: m.role,
          weekStartDate,
          weekEndDate,
          createdByUid: myUid || null,
        });

        await upsertTimeEntryFromTrip({
          trip,
          member: m,
          entryDate,
          hoursGenerated,
          weekStartDate,
          weekEndDate,
          timesheetId,
          createdByUid: myUid || null,
          noteSuffix: "Follow Up",
        });
      }

      // ticket status to follow_up
      if (ticket?.id) {
        await updateDoc(doc(db, "serviceTickets", ticket.id), {
          status: "follow_up",
          updatedAt: now,
        });

        setTicket((prev) => (prev ? { ...prev, status: "follow_up", updatedAt: now } : prev));
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
              }
            : t
        )
      );

      setTripOk(trip.id, `🟡 Follow Up logged. Minutes: ${actualMinutes}. Time entries: ${crewMembers.length}`);
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to complete follow-up.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  // -----------------------------
  // Billing Panel Actions
  // -----------------------------
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

  // -----------------------------
  // UI helpers
  // -----------------------------
  function canCurrentUserActOnTrip(trip: TripDoc) {
    if (!myUid) return false;
    if (appUser?.role === "admin") return true;
    return isUidOnTripCrew(myUid, trip.crew || null);
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading service ticket...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && ticket ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800 }}>{ticket.issueSummary}</h1>
                <p style={{ marginTop: "6px", color: "#666" }}>Ticket ID: {ticketId}</p>
              </div>

              <Link
                href="/service-tickets"
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                Back to Tickets
              </Link>
            </div>

            {/* Billing Packet Panel */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "#fafafa" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "10px" }}>Billing Packet</h2>

              {!billing ? (
                <div
                  style={{
                    border: "1px dashed #ccc",
                    borderRadius: "10px",
                    padding: "12px",
                    background: "white",
                    color: "#666",
                    fontSize: "13px",
                  }}
                >
                  No billing packet yet. It will appear after a trip is marked{" "}
                  <strong>Resolved — Ready to Bill</strong>.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ fontSize: "13px", color: "#555" }}>
                    Status: <strong>{billing.status}</strong>
                    {billing.readyToBillAt ? (
                      <span style={{ color: "#777" }}> • Ready To Bill At: {billing.readyToBillAt}</span>
                    ) : null}
                  </div>

                  <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px", background: "white" }}>
                    <div style={{ fontWeight: 900, marginBottom: "6px" }}>Labor (Customer Billing)</div>
                    <div style={{ fontSize: "13px", color: "#555" }}>
                      Total labor hours billed: <strong>{Number(billing.labor?.totalHours ?? 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                      Billing rule: labor hours belong to the <strong>Primary Tech only</strong>. Payroll timeEntries still go to all crew members.
                    </div>

                    {Array.isArray(billing.labor?.byCrew) && billing.labor.byCrew.length ? (
                      <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
                        {billing.labor.byCrew.map((c) => (
                          <div key={c.uid} style={{ fontSize: "13px", color: "#555" }}>
                            {c.name} • {c.hours.toFixed(2)} hr
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: "10px", fontSize: "13px", color: "#777" }}>
                        No primary tech labor line captured yet.
                      </div>
                    )}
                  </div>

                  <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px", background: "white" }}>
                    <div style={{ fontWeight: 900, marginBottom: "6px" }}>Materials</div>

                    {!Array.isArray(billing.materials) || billing.materials.length === 0 ? (
                      <div style={{ fontSize: "13px", color: "#777" }}>No materials captured.</div>
                    ) : (
                      <div style={{ display: "grid", gap: "8px" }}>
                        {billing.materials.map((m, idx) => (
                          <div
                            key={`bill-mat-${idx}`}
                            style={{
                              border: "1px solid #f0f0f0",
                              borderRadius: "10px",
                              padding: "10px",
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: "13px" }}>
                              {m.name} • {Number(m.qty).toFixed(2)} {m.unit || ""}
                            </div>
                            {m.notes ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>{m.notes}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px", background: "white" }}>
                    <div style={{ fontWeight: 900, marginBottom: "6px" }}>Resolution Notes</div>
                    <div style={{ fontSize: "13px", color: "#555", whiteSpace: "pre-wrap" }}>
                      {billing.resolutionNotes || "—"}
                    </div>

                    <div style={{ marginTop: "12px", fontWeight: 900, marginBottom: "6px" }}>Work Notes</div>
                    <div style={{ fontSize: "13px", color: "#555", whiteSpace: "pre-wrap" }}>
                      {billing.workNotes || "—"}
                    </div>
                  </div>

                  {canBill ? (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => markBillingStatus("invoiced")}
                        disabled={billingSaving}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        {billingSaving ? "Working..." : "Mark Invoiced"}
                      </button>

                      <button
                        type="button"
                        onClick={() => markBillingStatus("ready_to_bill")}
                        disabled={billingSaving}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Set Ready to Bill
                      </button>

                      <button
                        type="button"
                        onClick={() => markBillingStatus("not_ready")}
                        disabled={billingSaving}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                          background: "white",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Set Not Ready
                      </button>

<button
  type="button"
  onClick={() => {
    // 1) Open immediately (must be synchronous or browser blocks it)
    const win = window.open("about:blank", "_blank", "noopener,noreferrer");

    (async () => {
      try {
        if (!ticket?.id) {
          win?.close();
          return;
        }

        // Optional: show something in the new tab while loading
        if (win) {
          win.document.write("<p style='font-family: sans-serif;'>Creating QBO invoice draft…</p>");
        }

        const res = await fetch("/api/qbo/invoices/create-from-service-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceTicketId: ticket.id }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (win) {
            win.document.body.innerHTML = `<pre style="font-family: sans-serif; white-space: pre-wrap;">${
              data?.error || "Failed to create QBO invoice."
            }</pre>`;
          }
          alert(data?.error || "Failed to create QBO invoice.");
          return;
        }

        // 2) Navigate the already-opened window to QBO
        const url =
          data?.qboInvoiceUrl ||
          (data?.qboInvoiceId ? `https://qbo.intuit.com/app/invoice?txnId=${data.qboInvoiceId}` : null);

        if (url && win) {
          win.location.href = url;
        } else {
          alert(
            `✅ QBO Invoice Created\nInvoice ID: ${data.qboInvoiceId}${
              data.docNumber ? `\nDoc #: ${data.docNumber}` : ""
            }\n\nCould not auto-open QBO invoice URL.`
          );
        }
      } catch (e: any) {
        if (win) {
          win.document.body.innerHTML = `<pre style="font-family: sans-serif; white-space: pre-wrap;">${
            e?.message || "Failed to create QBO invoice."
          }</pre>`;
        }
        alert(e?.message || "Failed to create QBO invoice.");
      }
    })();
  }}
  style={{
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "10px",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
  }}
>
  Create QBO Invoice Draft
</button>

                      {billingErr ? <span style={{ color: "red", fontSize: "13px" }}>{billingErr}</span> : null}
                      {billingOk ? <span style={{ color: "green", fontSize: "13px" }}>{billingOk}</span> : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#777" }}>
                      Billing controls are limited to Admin/Manager/Dispatcher/Billing.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Ticket Overview */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "10px" }}>Ticket Overview</h2>
              <p>
                <strong>Current Status:</strong> {formatTicketStatus(ticket.status)}
              </p>
              <p>
                <strong>Estimated Duration:</strong> {ticket.estimatedDurationMinutes} minutes
              </p>

              <p style={{ marginTop: "10px", color: "#777", fontSize: "13px" }}>
                Legacy schedule fields are being phased out (Trips now power scheduling + time).
              </p>

              <p style={{ marginTop: "10px" }}>
                <strong>Issue Details:</strong>
              </p>
              <p>{ticket.issueDetails || "No additional issue details."}</p>
            </div>

            {/* Trips Panel */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "10px" }}>
                Trips (Scheduling + Time)
              </h2>

              {tripsLoading ? <p>Loading trips...</p> : null}
              {tripsError ? <p style={{ color: "red" }}>{tripsError}</p> : null}

              {!tripsLoading && !tripsError ? (
                <>
                  {trips.length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed #ccc",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "white",
                        color: "#666",
                        fontSize: "13px",
                      }}
                    >
                      No trips scheduled yet for this ticket.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {trips.map((t) => {
                        const crew = t.crew || {};
                        const primary = crew.primaryTechName || "Unassigned";
                        const helper = crew.helperName ? `Helper: ${crew.helperName}` : "";
                        const secondary = crew.secondaryTechName ? `2nd Tech: ${crew.secondaryTechName}` : "";
                        const secondaryHelper = crew.secondaryHelperName ? `2nd Helper: ${crew.secondaryHelperName}` : "";

                        const canAct = canCurrentUserActOnTrip(t);
                        const savingThis = Boolean(tripActionSaving[t.id]);
                        const errMsg = tripActionError[t.id] || "";
                        const okMsg = tripActionSuccess[t.id] || "";

                        const timerState = (t.timerState ||
                          (t.status === "in_progress" ? "running" : "not_started")) as string;
                        const isRunning = timerState === "running";
                        const isPaused = timerState === "paused";
                        const isComplete = timerState === "complete" || t.status === "complete";
                        const isInProgress = t.status === "in_progress";

                        const pausedMins = sumPausedMinutes(t.pauseBlocks);
                        const liveGrossMins =
                          t.actualStartAt && !t.actualEndAt
                            ? minutesBetweenIso(t.actualStartAt, nowIso())
                            : t.actualStartAt && t.actualEndAt
                              ? minutesBetweenIso(t.actualStartAt, t.actualEndAt)
                              : 0;

                        const computedBillable = Math.max(0, liveGrossMins - pausedMins);
                        const mats = Array.isArray(tripMaterials[t.id]) ? tripMaterials[t.id] : [];

                        return (
                          <div
                            key={t.id}
                            style={{
                              border: "1px solid #eee",
                              borderRadius: "10px",
                              padding: "12px",
                              background: "white",
                            }}
                          >
                            <div style={{ fontWeight: 900 }}>
                              🧳 {t.date} • {formatTripWindow(String(t.timeWindow || ""))} • {t.startTime}-{t.endTime}
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                              Status: <strong>{t.status}</strong>{" "}
                              <span style={{ color: "#777" }}>
                                • Timer: {timerState}
                                {t.actualMinutes != null ? ` • Minutes: ${t.actualMinutes}` : ""}
                              </span>
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                              Tech: {primary}
                              {helper ? <div style={{ marginTop: "4px" }}>{helper}</div> : null}
                              {secondary ? <div style={{ marginTop: "4px" }}>{secondary}</div> : null}
                              {secondaryHelper ? <div style={{ marginTop: "4px" }}>{secondaryHelper}</div> : null}
                            </div>

                            <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                              Billable minutes (computed): <strong>{computedBillable}</strong>{" "}
                              <span style={{ color: "#999" }}>(gross {liveGrossMins} - paused {pausedMins})</span>
                            </div>

                            {/* Actions */}
                            <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {!isComplete ? (
                                <>
                                  {!isInProgress ? (
                                    <button
                                      type="button"
                                      onClick={() => handleStartTrip(t)}
                                      disabled={!canAct || savingThis}
                                      style={{
                                        padding: "8px 12px",
                                        border: "1px solid #ccc",
                                        borderRadius: "10px",
                                        background: "white",
                                        cursor: canAct ? "pointer" : "not-allowed",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {savingThis ? "Working..." : "Start Trip"}
                                    </button>
                                  ) : null}

                                  {isInProgress && isRunning ? (
                                    <button
                                      type="button"
                                      onClick={() => handlePauseTrip(t)}
                                      disabled={!canAct || savingThis}
                                      style={{
                                        padding: "8px 12px",
                                        border: "1px solid #ccc",
                                        borderRadius: "10px",
                                        background: "white",
                                        cursor: canAct ? "pointer" : "not-allowed",
                                        fontWeight: 800,
                                      }}
                                    >
                                      Pause
                                    </button>
                                  ) : null}

                                  {isInProgress && isPaused ? (
                                    <button
                                      type="button"
                                      onClick={() => handleResumeTrip(t)}
                                      disabled={!canAct || savingThis}
                                      style={{
                                        padding: "8px 12px",
                                        border: "1px solid #ccc",
                                        borderRadius: "10px",
                                        background: "white",
                                        cursor: canAct ? "pointer" : "not-allowed",
                                        fontWeight: 800,
                                      }}
                                    >
                                      Resume
                                    </button>
                                  ) : null}

                                  {isInProgress ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleFollowUpTrip(t)}
                                        disabled={!canAct || savingThis}
                                        style={{
                                          padding: "8px 12px",
                                          border: "1px solid #ccc",
                                          borderRadius: "10px",
                                          background: "white",
                                          cursor: canAct ? "pointer" : "not-allowed",
                                          fontWeight: 800,
                                        }}
                                      >
                                        Follow Up
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleResolveTrip(t)}
                                        disabled={!canAct || savingThis}
                                        style={{
                                          padding: "8px 12px",
                                          border: "1px solid #ccc",
                                          borderRadius: "10px",
                                          background: "white",
                                          cursor: canAct ? "pointer" : "not-allowed",
                                          fontWeight: 900,
                                        }}
                                      >
                                        Resolved — Ready to Bill
                                      </button>
                                    </>
                                  ) : null}
                                </>
                              ) : (
                                <div style={{ color: "#777", fontSize: "12px" }}>✅ This trip is complete.</div>
                              )}
                            </div>

                            {!canAct ? (
                              <div style={{ marginTop: "8px", fontSize: "12px", color: "#999" }}>
                                You can only start/finish trips where you are on the assigned crew. (Admin can act on any
                                trip.)
                              </div>
                            ) : null}

                            {/* Work Notes */}
                            <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                              <div style={{ fontWeight: 900, marginBottom: "6px" }}>Work Notes</div>
                              <textarea
                                value={tripWorkNotes[t.id] ?? ""}
                                onChange={(e) =>
                                  setTripWorkNotes((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                rows={3}
                                disabled={!canAct || savingThis}
                                placeholder="What did you work on during this trip?"
                                style={{
                                  display: "block",
                                  width: "100%",
                                  padding: "8px",
                                  borderRadius: "10px",
                                  border: "1px solid #ccc",
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveWorkNotes(t)}
                                disabled={!canAct || savingThis}
                                style={{
                                  marginTop: "8px",
                                  padding: "8px 12px",
                                  border: "1px solid #ccc",
                                  borderRadius: "10px",
                                  background: "white",
                                  cursor: canAct ? "pointer" : "not-allowed",
                                  fontWeight: 800,
                                }}
                              >
                                Save Notes
                              </button>
                            </div>

                            {/* Follow Up Notes */}
                            {!isComplete ? (
                              <div style={{ marginTop: "12px" }}>
                                <div style={{ fontWeight: 900, marginBottom: "6px" }}>
                                  Follow Up Notes (required if Follow Up)
                                </div>
                                <textarea
                                  value={tripFollowUpNotes[t.id] ?? ""}
                                  onChange={(e) =>
                                    setTripFollowUpNotes((prev) => ({ ...prev, [t.id]: e.target.value }))
                                  }
                                  rows={3}
                                  disabled={!canAct || savingThis}
                                  placeholder="What needs to happen next? Parts? Return visit? Notes for dispatch?"
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    padding: "8px",
                                    borderRadius: "10px",
                                    border: "1px solid #ccc",
                                  }}
                                />
                              </div>
                            ) : null}

                            {/* Resolution Notes */}
                            {!isComplete ? (
                              <div style={{ marginTop: "12px" }}>
                                <div style={{ fontWeight: 900, marginBottom: "6px" }}>
                                  Resolution Notes (required if Resolved)
                                </div>
                                <textarea
                                  value={tripResolutionNotes[t.id] ?? ""}
                                  onChange={(e) =>
                                    setTripResolutionNotes((prev) => ({ ...prev, [t.id]: e.target.value }))
                                  }
                                  rows={3}
                                  disabled={!canAct || savingThis}
                                  placeholder="What did you do to resolve the issue? What was fixed? Verification?"
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    padding: "8px",
                                    borderRadius: "10px",
                                    border: "1px solid #ccc",
                                  }}
                                />
                              </div>
                            ) : null}

                            {/* Materials */}
                            {!isComplete ? (
                              <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                                <div style={{ fontWeight: 900 }}>Materials (required for Resolved)</div>
                                <div style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
                                  Add at least 1 material with a name and qty.
                                </div>

                                {mats.length === 0 ? (
                                  <div
                                    style={{
                                      marginTop: "10px",
                                      border: "1px dashed #ccc",
                                      borderRadius: "10px",
                                      padding: "10px",
                                      background: "#fafafa",
                                      color: "#666",
                                      fontSize: "13px",
                                    }}
                                  >
                                    No materials added yet.
                                  </div>
                                ) : (
                                  <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                                    {mats.map((m, idx) => (
                                      <div
                                        key={`${t.id}-mat-${idx}`}
                                        style={{
                                          border: "1px solid #eee",
                                          borderRadius: "10px",
                                          padding: "10px",
                                          background: "white",
                                          display: "grid",
                                          gap: "8px",
                                        }}
                                      >
                                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "8px" }}>
                                          <div>
                                            <label style={{ fontSize: "12px", fontWeight: 800 }}>Name</label>
                                            <input
                                              value={m.name}
                                              onChange={(e) => updateMaterialRow(t.id, idx, { name: e.target.value })}
                                              disabled={!canAct || savingThis}
                                              placeholder='Example: 1/2" PEX, wax ring, PRV...'
                                              style={{
                                                display: "block",
                                                width: "100%",
                                                padding: "8px",
                                                borderRadius: "10px",
                                                border: "1px solid #ccc",
                                                marginTop: "4px",
                                              }}
                                            />
                                          </div>
                                          <div>
                                            <label style={{ fontSize: "12px", fontWeight: 800 }}>Qty</label>
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
                                                padding: "8px",
                                                borderRadius: "10px",
                                                border: "1px solid #ccc",
                                                marginTop: "4px",
                                              }}
                                            />
                                          </div>
                                          <div>
                                            <label style={{ fontSize: "12px", fontWeight: 800 }}>Unit (opt)</label>
                                            <input
                                              value={m.unit || ""}
                                              onChange={(e) => updateMaterialRow(t.id, idx, { unit: e.target.value })}
                                              disabled={!canAct || savingThis}
                                              placeholder="ea, ft, gal"
                                              style={{
                                                display: "block",
                                                width: "100%",
                                                padding: "8px",
                                                borderRadius: "10px",
                                                border: "1px solid #ccc",
                                                marginTop: "4px",
                                              }}
                                            />
                                          </div>
                                        </div>

                                        <div>
                                          <label style={{ fontSize: "12px", fontWeight: 800 }}>Notes (opt)</label>
                                          <input
                                            value={m.notes || ""}
                                            onChange={(e) => updateMaterialRow(t.id, idx, { notes: e.target.value })}
                                            disabled={!canAct || savingThis}
                                            placeholder="Any extra details..."
                                            style={{
                                              display: "block",
                                              width: "100%",
                                              padding: "8px",
                                              borderRadius: "10px",
                                              border: "1px solid #ccc",
                                              marginTop: "4px",
                                            }}
                                          />
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => removeMaterialRow(t.id, idx)}
                                          disabled={!canAct || savingThis}
                                          style={{
                                            padding: "8px 12px",
                                            border: "1px solid #ccc",
                                            borderRadius: "10px",
                                            background: "white",
                                            cursor: canAct ? "pointer" : "not-allowed",
                                            fontWeight: 800,
                                            width: "fit-content",
                                          }}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => addMaterialRow(t.id)}
                                  disabled={!canAct || savingThis}
                                  style={{
                                    marginTop: "10px",
                                    padding: "8px 12px",
                                    border: "1px solid #ccc",
                                    borderRadius: "10px",
                                    background: "white",
                                    cursor: canAct ? "pointer" : "not-allowed",
                                    fontWeight: 900,
                                  }}
                                >
                                  + Add Material
                                </button>
                              </div>
                            ) : null}

                            {errMsg ? <p style={{ marginTop: "10px", color: "red" }}>{errMsg}</p> : null}
                            {okMsg ? <p style={{ marginTop: "10px", color: "green" }}>{okMsg}</p> : null}

                            <div style={{ marginTop: "10px", fontSize: "11px", color: "#999" }}>Trip ID: {t.id}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}

              {/* Schedule Trip form */}
              <div style={{ marginTop: "16px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 900, margin: 0 }}>Schedule a Trip</h3>

                {!canDispatch ? (
                  <p style={{ marginTop: "8px", color: "#777", fontSize: "13px" }}>
                    Only Admin/Dispatcher/Manager can schedule trips.
                  </p>
                ) : (
                  <form
                    onSubmit={handleCreateTrip}
                    style={{ display: "grid", gap: "12px", maxWidth: "900px", marginTop: "10px" }}
                  >
                    <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                      <div>
                        <label>Date</label>
                        <input
                          type="date"
                          value={tripDate}
                          onChange={(e) => setTripDate(e.target.value)}
                          disabled={tripSaving}
                          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                        />
                      </div>

                      <div>
                        <label>Time Window</label>
                        <select
                          value={tripTimeWindow}
                          onChange={(e) => setTripTimeWindow(e.target.value as TripTimeWindow)}
                          disabled={tripSaving}
                          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                        >
                          <option value="am">Morning (8:00–12:00)</option>
                          <option value="pm">Afternoon (1:00–5:00)</option>
                          <option value="all_day">All Day (8:00–5:00)</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                    </div>

                    {tripTimeWindow === "custom" ? (
                      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                        <div>
                          <label>Start Time</label>
                          <input
                            type="time"
                            value={tripStartTime}
                            onChange={(e) => setTripStartTime(e.target.value)}
                            disabled={tripSaving}
                            style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                          />
                        </div>
                        <div>
                          <label>End Time</label>
                          <input
                            type="time"
                            value={tripEndTime}
                            onChange={(e) => setTripEndTime(e.target.value)}
                            disabled={tripSaving}
                            style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {techniciansLoading ? <p>Loading technicians...</p> : null}
                    {techniciansError ? <p style={{ color: "red" }}>{techniciansError}</p> : null}

                    <div style={{ border: "1px solid #eee", borderRadius: "12px", padding: "12px", background: "#fafafa" }}>
                      <div style={{ fontWeight: 900, marginBottom: "10px" }}>Crew</div>

                      <div>
                        <label>Primary Technician</label>
                        <select
                          value={tripPrimaryTechUid}
                          onChange={(e) => setTripPrimaryTechUid(e.target.value)}
                          disabled={tripSaving || techniciansLoading}
                          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                        >
                          <option value="">Select a technician...</option>
                          {technicians.map((t) => (
                            <option key={t.uid} value={t.uid}>
                              {t.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ marginTop: "10px" }}>
                        <label>Secondary Technician (Optional)</label>
                        <select
                          value={tripSecondaryTechUid}
                          onChange={(e) => setTripSecondaryTechUid(e.target.value)}
                          disabled={tripSaving || !tripPrimaryTechUid}
                          style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
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
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                          Only use this for two true technicians. Helpers/apprentices go below.
                        </div>
                      </div>

                      <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                        <div style={{ fontWeight: 900, marginBottom: "8px" }}>Helper / Apprentice</div>

                        {profilesLoading ? <p>Loading employee profiles...</p> : null}
                        {profilesError ? <p style={{ color: "red" }}>{profilesError}</p> : null}

                        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={tripUseDefaultHelper}
                            onChange={(e) => setTripUseDefaultHelper(e.target.checked)}
                            disabled={tripSaving}
                          />
                          Use default helper pairing (recommended)
                        </label>

                        <div style={{ marginTop: "10px" }}>
                          <label>Helper / Apprentice (Optional)</label>
                          <select
                            value={tripHelperUid}
                            onChange={(e) => {
                              setTripUseDefaultHelper(false);
                              setTripHelperUid(e.target.value);
                            }}
                            disabled={tripSaving || profilesLoading || !tripPrimaryTechUid}
                            style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                          >
                            <option value="">— None —</option>
                            {helperCandidates.map((h) => (
                              <option key={h.uid} value={h.uid}>
                                {h.name} ({h.laborRole})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ marginTop: "10px" }}>
                          <label>Secondary Helper (Optional)</label>
                          <select
                            value={tripSecondaryHelperUid}
                            onChange={(e) => setTripSecondaryHelperUid(e.target.value)}
                            disabled={tripSaving || profilesLoading}
                            style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                          >
                            <option value="">— None —</option>
                            {helperCandidates.map((h) => (
                              <option key={h.uid} value={h.uid}>
                                {h.name} ({h.laborRole})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
                          Tip: If you want a helper reassigned for the day, use <strong>Daily Crew Overrides</strong>.
                        </div>
                      </div>
                    </div>

                    <div>
                      <label>Trip Notes (optional)</label>
                      <textarea
                        value={tripNotes}
                        onChange={(e) => setTripNotes(e.target.value)}
                        rows={3}
                        disabled={tripSaving}
                        style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                      />
                    </div>

                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={tripSetTicketScheduled}
                        onChange={(e) => setTripSetTicketScheduled(e.target.checked)}
                        disabled={tripSaving}
                      />
                      If ticket is NEW, change status to SCHEDULED when this trip is created
                    </label>

                    {tripSaveError ? <p style={{ color: "red" }}>{tripSaveError}</p> : null}
                    {tripSaveSuccess ? <p style={{ color: "green" }}>{tripSaveSuccess}</p> : null}

                    <button
                      type="submit"
                      disabled={tripSaving || !canDispatch}
                      style={{
                        padding: "10px 16px",
                        border: "1px solid #ccc",
                        borderRadius: "10px",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 900,
                        width: "fit-content",
                      }}
                    >
                      {tripSaving ? "Scheduling..." : "Schedule Trip"}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Legacy Update Ticket */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "12px" }}>Update Ticket (legacy fields)</h2>

              <div style={{ marginBottom: "10px", fontSize: "12px", color: "#777" }}>
                This section will be hidden/removed soon. Trips now control scheduling and staffing.
              </div>

              <form onSubmit={handleSaveUpdates} style={{ display: "grid", gap: "12px", maxWidth: "800px" }}>
                <div>
                  <label>Status</label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(
                        e.target.value as
                          | "new"
                          | "scheduled"
                          | "in_progress"
                          | "follow_up"
                          | "completed"
                          | "cancelled"
                      )
                    }
                    style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                  >
                    <option value="new">New</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label>Estimated Job Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={estimatedDurationMinutes}
                    onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                    required
                    style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                  />
                </div>

                {/* Hidden legacy schedule inputs */}
                <div style={{ display: "none" }}>
                  <label>Scheduled Date (legacy)</label>
                  <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                </div>
                <div style={{ display: "none" }}>
                  <label>Scheduled Start Time (legacy)</label>
                  <input type="time" value={scheduledStartTime} onChange={(e) => setScheduledStartTime(e.target.value)} />
                </div>
                <div style={{ display: "none" }}>
                  <label>Scheduled End Time (legacy)</label>
                  <input type="time" value={scheduledEndTime} onChange={(e) => setScheduledEndTime(e.target.value)} />
                </div>
                <div style={{ display: "none" }}>
                  <label>Assigned Technician (legacy)</label>
                  <select value={selectedTechnicianUid} onChange={(e) => setSelectedTechnicianUid(e.target.value)}>
                    <option value="">Unassigned</option>
                    {technicians.map((tech) => (
                      <option key={tech.uid} value={tech.uid}>
                        {tech.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                  />
                </div>

                {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
                {saveSuccess ? <p style={{ color: "green" }}>{saveSuccess}</p> : null}

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "10px 16px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                    width: "fit-content",
                  }}
                >
                  {saving ? "Saving..." : "Save Ticket Updates"}
                </button>
              </form>

              <div style={{ marginTop: "10px", fontSize: "12px", color: "#999" }}>
                Legacy schedule: {getScheduleSummary()}
              </div>
            </div>

            {/* System */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "10px" }}>System</h2>
              <p>
                <strong>Active:</strong> {String(ticket.active)}
              </p>
              <p>
                <strong>Created At:</strong> {ticket.createdAt || "—"}
              </p>
              <p>
                <strong>Updated At:</strong> {ticket.updatedAt || "—"}
              </p>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}
