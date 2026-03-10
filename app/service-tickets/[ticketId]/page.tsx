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

type TripDoc = {
  id: string;
  active: boolean;
  type: "service" | "project";
  status: string;
  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;

  crew?: {
    primaryTechUid?: string | null;
    primaryTechName?: string | null;
    helperUid?: string | null;
    helperName?: string | null;
    secondaryTechUid?: string | null;
    secondaryTechName?: string | null;
    secondaryHelperUid?: string | null;
    secondaryHelperName?: string | null;
  };

  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  };

  sourceKey?: string;
  notes?: string | null;
  cancelReason?: string | null;

  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

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

export default function ServiceTicketDetailPage({
  params,
}: ServiceTicketDetailPageProps) {
  const { appUser } = useAuthContext();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [error, setError] = useState("");

  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState("");

  const [profilesLoading, setProfilesLoading] = useState(true);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [profilesError, setProfilesError] = useState("");

  // ✅ Ticket update (non-legacy only)
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [status, setStatus] = useState<
    "new" | "scheduled" | "in_progress" | "follow_up" | "completed" | "cancelled"
  >("new");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
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

        const data = snap.data();

        const item: ServiceTicket = {
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

          // keep existing fields in type, but we won’t edit legacy scheduling here anymore
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
        };

        setTicket(item);

        setStatus(item.status);
        setEstimatedDurationMinutes(String(item.estimatedDurationMinutes || 60));
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
            const data = docSnap.data();
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
          const d = docSnap.data();
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
    const out: {
      uid: string;
      name: string;
      laborRole: string;
      defaultPairedTechUid?: string | null;
    }[] = [];

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
          const d = docSnap.data();
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
            createdAt: d.createdAt ?? undefined,
            createdByUid: d.createdByUid ?? null,
            updatedAt: d.updatedAt ?? undefined,
            updatedByUid: d.updatedByUid ?? null,
          };
        });

        setTrips(items);
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

    const match = helperCandidates.find(
      (h) => String(h.defaultPairedTechUid || "").trim() === techUid
    );
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
  // Save Ticket Updates (non-legacy)
  // -----------------------------
  async function handleSaveTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        internalNotes: internalNotes.trim() || null,
        updatedAt: nowIso,
      });

      setTicket({
        ...ticket,
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        internalNotes: internalNotes.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveSuccess("Ticket saved.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save ticket.");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------
  // Create Trip
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
      const nowIso = new Date().toISOString();

      const primaryName = findTechName(primaryUid) || "Unnamed Technician";
      const helperName = helperUid ? findHelperName(helperUid) || "Unnamed Helper" : null;
      const secondaryTechName = secondaryTechUid ? findTechName(secondaryTechUid) || "Unnamed Technician" : null;
      const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Unnamed Helper" : null;

      const sourceKey = `serviceTicket:${ticket.id}:${date}:${tripTimeWindow}`;

      const tripPayload = {
        active: true,
        cancelReason: null,

        createdAt: nowIso,
        createdByUid: appUser?.uid || null,
        updatedAt: nowIso,
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
      };

      const createdTripRef = await addDoc(collection(db, "trips"), tripPayload);

      const helperIds = helperUid ? [helperUid] : [];
      const helperNames = helperName ? [helperName] : [];

      const assignedTechnicianIds: string[] = [];
      assignedTechnicianIds.push(primaryUid);
      if (secondaryTechUid && secondaryTechUid !== primaryUid) assignedTechnicianIds.push(secondaryTechUid);
      for (const h of helperIds) if (!assignedTechnicianIds.includes(h)) assignedTechnicianIds.push(h);
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) assignedTechnicianIds.push(secondaryHelperUid);

      const nextStatus =
        tripSetTicketScheduled && ticket.status === "new" ? "scheduled" : ticket.status;

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,

        // Keep these for now because other pages may still read them (My Day, etc)
        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: primaryUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds: assignedTechnicianIds.length ? assignedTechnicianIds : null,

        updatedAt: nowIso,
      });

      setTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: nextStatus as ServiceTicket["status"],
          assignedTechnicianId: primaryUid,
          assignedTechnicianName: primaryName,
          primaryTechnicianId: primaryUid,
          secondaryTechnicianId: secondaryTechUid || undefined,
          secondaryTechnicianName: secondaryTechUid ? (secondaryTechName || undefined) : undefined,
          helperIds: helperIds.length ? helperIds : undefined,
          helperNames: helperNames.length ? helperNames : undefined,
          assignedTechnicianIds: assignedTechnicianIds.length ? assignedTechnicianIds : undefined,
          updatedAt: nowIso,
        };
      });

      setTrips((prev) =>
        [...prev, { id: createdTripRef.id, ...tripPayload } as any].sort((a, b) => {
          const byDate = (a.date || "").localeCompare(b.date || "");
          if (byDate !== 0) return byDate;
          return (a.startTime || "").localeCompare(b.startTime || "");
        })
      );

      setTripSaveSuccess(`✅ Trip scheduled (${formatTripWindow(tripTimeWindow)}). Trip ID: ${createdTripRef.id}`);
      setTripNotes("");
    } catch (err: unknown) {
      setTripSaveError(err instanceof Error ? err.message : "Failed to create trip.");
    } finally {
      setTripSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading service ticket...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && ticket ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
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

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>Customer</h2>
              <p><strong>Customer Name:</strong> {ticket.customerDisplayName}</p>
              <p><strong>Customer ID:</strong> {ticket.customerId}</p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>Service Address</h2>
              <p><strong>Label:</strong> {ticket.serviceAddressLabel || "—"}</p>
              <p>{ticket.serviceAddressLine1 || "—"}</p>
              <p>{ticket.serviceAddressLine2 || ""}</p>
              <p>{ticket.serviceCity}, {ticket.serviceState} {ticket.servicePostalCode}</p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>Ticket Overview</h2>
              <p><strong>Current Status:</strong> {formatTicketStatus(ticket.status)}</p>
              <p><strong>Estimated Duration:</strong> {ticket.estimatedDurationMinutes} minutes</p>
              <p style={{ marginTop: "10px" }}><strong>Issue Details:</strong></p>
              <p>{ticket.issueDetails || "No additional issue details."}</p>
            </div>

            {/* Trips Panel */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>
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

                        return (
                          <Link
                            key={t.id}
                            href={`/trips/${t.id}`}
                            style={{
                              display: "block",
                              border: "1px solid #eee",
                              borderRadius: "10px",
                              padding: "12px",
                              background: "white",
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            <div style={{ fontWeight: 900 }}>
                              🧳 {t.date} • {formatTripWindow(String(t.timeWindow || ""))} • {t.startTime}-{t.endTime}
                            </div>
                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                              Status: <strong>{t.status}</strong>{" "}
                              {t.active === false ? <span style={{ color: "#b00" }}>• (Inactive)</span> : null}
                            </div>
                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                              Tech: {primary}
                              {helper ? <div style={{ marginTop: "4px" }}>{helper}</div> : null}
                              {secondary ? <div style={{ marginTop: "4px" }}>{secondary}</div> : null}
                              {secondaryHelper ? <div style={{ marginTop: "4px" }}>{secondaryHelper}</div> : null}
                            </div>
                            {t.cancelReason ? (
                              <div style={{ marginTop: "8px", fontSize: "12px", color: "#b00" }}>
                                Cancel Reason: {t.cancelReason}
                              </div>
                            ) : null}
                            {t.notes ? (
                              <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                                Notes: {t.notes}
                              </div>
                            ) : null}
                            <div style={{ marginTop: "8px", fontSize: "11px", color: "#999" }}>
                              Click to edit • Trip ID: {t.id}
                            </div>
                          </Link>
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

            {/* Ticket edits (non-legacy) */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "12px" }}>
                Update Ticket
              </h2>

              <form onSubmit={handleSaveTicket} style={{ display: "grid", gap: "12px", maxWidth: "800px" }}>
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
                    disabled={!canDispatch && appUser?.role !== "admin"}
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
                  {saving ? "Saving..." : "Save Ticket"}
                </button>
              </form>
            </div>

            {/* Assignment snapshot */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>
                Assignment Snapshot
              </h2>
              <p><strong>Primary Tech:</strong> {ticket.assignedTechnicianName || "Not assigned yet"}</p>
              <p>
                <strong>Helper:</strong>{" "}
                {Array.isArray(ticket.helperNames) && ticket.helperNames.length
                  ? ticket.helperNames.join(", ")
                  : "—"}
              </p>
              <p><strong>Secondary Tech:</strong> {ticket.secondaryTechnicianName || "—"}</p>
            </div>

            {/* System */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>System</h2>
              <p><strong>Active:</strong> {String(ticket.active)}</p>
              <p><strong>Created At:</strong> {ticket.createdAt || "—"}</p>
              <p><strong>Updated At:</strong> {ticket.updatedAt || "—"}</p>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}