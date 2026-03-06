"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
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
  employmentStatus?: string; // current/inactive/seasonal
  laborRole?: string; // technician/helper/apprentice/etc
  defaultPairedTechUid?: string | null;
};

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

export default function ServiceTicketDetailPage({ params }: ServiceTicketDetailPageProps) {
  const { appUser } = useAuthContext();

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
  const [internalNotes, setInternalNotes] = useState("");

  // ✅ Assignment (real-world)
  const [primaryTechnicianUid, setPrimaryTechnicianUid] = useState("");
  const [secondaryTechnicianUid, setSecondaryTechnicianUid] = useState("");

  // Helper/Apprentice selection: auto from pairing by default, but editable
  const [helperUids, setHelperUids] = useState<string[]>([]);
  const [useDefaultHelper, setUseDefaultHelper] = useState(true);

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
          scheduledDate: data.scheduledDate ?? undefined,
          scheduledStartTime: data.scheduledStartTime ?? undefined,
          scheduledEndTime: data.scheduledEndTime ?? undefined,

          // legacy single-tech (keep)
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,

          // multi-tech (optional)
          primaryTechnicianId: data.primaryTechnicianId ?? undefined,
          assignedTechnicianIds: Array.isArray(data.assignedTechnicianIds)
            ? data.assignedTechnicianIds.filter(Boolean)
            : undefined,

          // secondary tech (optional)
          secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
          secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,

          // helpers (optional)
          helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
          helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,

          internalNotes: data.internalNotes ?? undefined,
          active: data.active ?? true,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        } as any;

        setTicket(item);

        // Seed form values
        setStatus(item.status);
        setEstimatedDurationMinutes(String(item.estimatedDurationMinutes || 60));
        setScheduledDate(item.scheduledDate ?? "");
        setScheduledStartTime(item.scheduledStartTime ?? "");
        setScheduledEndTime(item.scheduledEndTime ?? "");
        setInternalNotes(item.internalNotes ?? "");

        // Prefer new primary field, fallback to legacy
        const seededPrimary =
          (item as any).primaryTechnicianId ||
          item.assignedTechnicianId ||
          "";

        setPrimaryTechnicianUid(seededPrimary);

        // Secondary tech
        setSecondaryTechnicianUid(((item as any).secondaryTechnicianId as string) || "");

        // Helpers (if already stored)
        const seededHelpers = Array.isArray((item as any).helperIds)
          ? ((item as any).helperIds as string[])
          : [];

        setHelperUids(seededHelpers);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load service ticket.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [params]);

  // -----------------------------
  // Load Technicians (users)
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
          .filter((user) => user.role === "technician" && user.active);

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setTechnicians(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setTechniciansError(err.message);
        } else {
          setTechniciansError("Failed to load technicians.");
        }
      } finally {
        setTechniciansLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  // -----------------------------
  // Load Employee Profiles (for helper pairing)
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

  const primaryTechnician = useMemo(() => {
    return technicians.find((tech) => tech.uid === primaryTechnicianUid) ?? null;
  }, [technicians, primaryTechnicianUid]);

  const secondaryTechnician = useMemo(() => {
    return technicians.find((tech) => tech.uid === secondaryTechnicianUid) ?? null;
  }, [technicians, secondaryTechnicianUid]);

  // Build helper/apprentice candidates
  const helperCandidates = useMemo(() => {
    const currentHelperUids = new Set<string>();

    for (const p of employeeProfiles) {
      const status = (p.employmentStatus || "current").toLowerCase();
      if (status !== "current") continue;

      const labor = normalizeRole(p.laborRole);
      if (labor !== "helper" && labor !== "apprentice") continue;

      const uid = String(p.userUid || "").trim();
      if (uid) currentHelperUids.add(uid);
    }

    // Helpers are also "users" docs (we created them), but may not have role=technician.
    // We'll pull their display names from employeeProfiles first, fallback to users collection not available here.
    const candidates: { uid: string; name: string; laborRole: string }[] = [];

    for (const p of employeeProfiles) {
      const labor = normalizeRole(p.laborRole);
      if (labor !== "helper" && labor !== "apprentice") continue;
      const uid = String(p.userUid || "").trim();
      if (!uid) continue;
      if ((p.employmentStatus || "current").toLowerCase() !== "current") continue;

      candidates.push({
        uid,
        name: p.displayName || "Unnamed",
        laborRole: labor,
      });
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    return candidates;
  }, [employeeProfiles]);

  // Default helpers for primary tech
  const defaultHelpersForPrimary = useMemo(() => {
    const techUid = primaryTechnicianUid.trim();
    if (!techUid) return [];

    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current").toLowerCase() === "current")
      .filter((p) => ["helper", "apprentice"].includes(normalizeRole(p.laborRole)))
      .filter((p) => String(p.defaultPairedTechUid || "").trim() === techUid)
      .map((p) => String(p.userUid || "").trim())
      .filter(Boolean);
  }, [employeeProfiles, primaryTechnicianUid]);

  // When primary tech changes AND toggle enabled, auto-apply default helpers
  useEffect(() => {
    if (!useDefaultHelper) return;

    const techUid = primaryTechnicianUid.trim();
    if (!techUid) {
      setHelperUids([]);
      return;
    }

    const unique = Array.from(new Set(defaultHelpersForPrimary));
    setHelperUids(unique);
  }, [primaryTechnicianUid, defaultHelpersForPrimary, useDefaultHelper]);

  const helperDisplayNames = useMemo(() => {
    const profileMap = new Map<string, string>();
    for (const p of employeeProfiles) {
      const uid = String(p.userUid || "").trim();
      if (!uid) continue;
      if (p.displayName) profileMap.set(uid, p.displayName);
    }
    return helperUids.map((uid) => profileMap.get(uid) || uid);
  }, [helperUids, employeeProfiles]);

  const assignmentSummary = useMemo(() => {
    const primary = primaryTechnician ? primaryTechnician.displayName : "Unassigned";
    const secondary = secondaryTechnician ? secondaryTechnician.displayName : "";
    const helpers = helperDisplayNames;

    return {
      primary,
      secondary,
      helpers,
      hasSecondary: Boolean(secondaryTechnicianUid),
      helperCount: helpers.length,
    };
  }, [primaryTechnician, secondaryTechnician, helperDisplayNames, secondaryTechnicianUid]);

  function toggleHelper(uid: string) {
    setUseDefaultHelper(false); // once manually edited, stop auto-overwriting
    setHelperUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((x) => x !== uid);
      }
      return [...prev, uid];
    });
  }

  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const primaryUid = primaryTechnicianUid.trim() || null;
      const secondaryUid = secondaryTechnicianUid.trim() || null;

      // Assigned team ids (for backwards compatibility with schedule duplication logic)
      const teamIds: string[] = [];
      if (primaryUid) teamIds.push(primaryUid);
      if (secondaryUid && secondaryUid !== primaryUid) teamIds.push(secondaryUid);
      for (const h of helperUids) {
        if (h && !teamIds.includes(h)) teamIds.push(h);
      }

      const helperNames = helperDisplayNames;

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,

        // Legacy single-tech fields remain the "primary technician"
        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryUid ? primaryTechnician?.displayName || null : null,

        // New fields (real)
        primaryTechnicianId: primaryUid,
        secondaryTechnicianId: secondaryUid,
        secondaryTechnicianName: secondaryUid ? secondaryTechnician?.displayName || null : null,

        helperIds: helperUids.length ? helperUids : null,
        helperNames: helperUids.length ? helperNames : null,

        // Interim team array for schedule dual-visibility (will be used by weekly schedule + future tech view)
        assignedTechnicianIds: teamIds.length ? teamIds : null,

        internalNotes: internalNotes.trim() || null,
        updatedAt: nowIso,
      });

      setTicket({
        ...ticket,
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        scheduledDate: scheduledDate || undefined,
        scheduledStartTime: scheduledStartTime || undefined,
        scheduledEndTime: scheduledEndTime || undefined,

        assignedTechnicianId: primaryUid || undefined,
        assignedTechnicianName: primaryUid ? primaryTechnician?.displayName || undefined : undefined,

        primaryTechnicianId: primaryUid || undefined,
        secondaryTechnicianId: secondaryUid || undefined,
        secondaryTechnicianName: secondaryUid ? secondaryTechnician?.displayName || undefined : undefined,

        helperIds: helperUids.length ? helperUids : undefined,
        helperNames: helperUids.length ? helperNames : undefined,

        assignedTechnicianIds: teamIds.length ? teamIds : undefined,

        internalNotes: internalNotes.trim() || undefined,
        updatedAt: nowIso,
      } as any);

      setSaveSuccess("Ticket updates saved successfully.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to save ticket updates.");
      }
    } finally {
      setSaving(false);
    }
  }

  function getStatusLabel(value: ServiceTicket["status"]) {
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

  const canEdit = appUser?.role === "admin" || appUser?.role === "dispatcher";

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
                <h1 style={{ fontSize: "24px", fontWeight: 700 }}>{ticket.issueSummary}</h1>
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
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Customer
              </h2>
              <p>
                <strong>Customer Name:</strong> {ticket.customerDisplayName}
              </p>
              <p>
                <strong>Customer ID:</strong> {ticket.customerId}
              </p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Service Address
              </h2>
              <p>
                <strong>Label:</strong> {ticket.serviceAddressLabel || "—"}
              </p>
              <p>{ticket.serviceAddressLine1 || "—"}</p>
              <p>{ticket.serviceAddressLine2 || ""}</p>
              <p>
                {ticket.serviceCity}, {ticket.serviceState} {ticket.servicePostalCode}
              </p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Ticket Overview
              </h2>
              <p>
                <strong>Current Status:</strong> {getStatusLabel(ticket.status)}
              </p>
              <p>
                <strong>Estimated Duration:</strong> {ticket.estimatedDurationMinutes} minutes
              </p>
              <p>
                <strong>Schedule:</strong> {getScheduleSummary()}
              </p>
              <p style={{ marginTop: "10px" }}>
                <strong>Issue Details:</strong>
              </p>
              <p>{ticket.issueDetails || "No additional issue details."}</p>
            </div>

            {/* ✅ NEW: Assignment Snapshot (clear wording) */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Assignment Snapshot
              </h2>

              <p>
                <strong>Primary Technician:</strong> {assignmentSummary.primary}
              </p>

              <p>
                <strong>Secondary Technician:</strong>{" "}
                {assignmentSummary.hasSecondary ? assignmentSummary.secondary : "—"}
              </p>

              <p>
                <strong>Helper/Apprentice:</strong>{" "}
                {assignmentSummary.helperCount > 0
                  ? assignmentSummary.helpers.join(", ")
                  : "—"}
              </p>

              <p style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
                Note: Helper/apprentice is not a “second tech.” Secondary tech is optional and used only when two true technicians are assigned.
              </p>
            </div>

            {/* ✅ Update Ticket (now includes primary/secondary + helpers) */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>
                Update Ticket
              </h2>

              {techniciansLoading ? <p>Loading technicians...</p> : null}
              {techniciansError ? (
                <p style={{ color: "red", marginBottom: "12px" }}>{techniciansError}</p>
              ) : null}

              {profilesLoading ? <p>Loading employee profiles...</p> : null}
              {profilesError ? (
                <p style={{ color: "red", marginBottom: "12px" }}>{profilesError}</p>
              ) : null}

              <form
                onSubmit={handleSaveUpdates}
                style={{ display: "grid", gap: "12px", maxWidth: "800px" }}
              >
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
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
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
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                <div>
                  <label>Scheduled Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                <div>
                  <label>Scheduled Start Time</label>
                  <input
                    type="time"
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                <div>
                  <label>Scheduled End Time</label>
                  <input
                    type="time"
                    value={scheduledEndTime}
                    onChange={(e) => setScheduledEndTime(e.target.value)}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                {/* ✅ Primary Tech */}
                <div>
                  <label>Primary Technician</label>
                  <select
                    value={primaryTechnicianUid}
                    onChange={(e) => {
                      setPrimaryTechnicianUid(e.target.value);
                      setSaveError("");
                      setSaveSuccess("");
                    }}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  >
                    <option value="">Unassigned</option>
                    {technicians.map((tech) => (
                      <option key={tech.uid} value={tech.uid}>
                        {tech.displayName}
                      </option>
                    ))}
                  </select>

                  <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                    Most tickets start as <strong>New</strong> with no assignment. Dispatch assigns later.
                  </p>
                </div>

                {/* ✅ Secondary Tech (true 2nd tech, rare) */}
                <div>
                  <label>Secondary Technician (Optional)</label>
                  <select
                    value={secondaryTechnicianUid}
                    onChange={(e) => setSecondaryTechnicianUid(e.target.value)}
                    disabled={!canEdit || !primaryTechnicianUid}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  >
                    <option value="">— None —</option>
                    {technicians
                      .filter((t) => t.uid !== primaryTechnicianUid)
                      .map((tech) => (
                        <option key={tech.uid} value={tech.uid}>
                          {tech.displayName}
                        </option>
                      ))}
                  </select>

                  <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                    Only use this if two actual technicians are assigned. Helpers/apprentices go below.
                  </p>
                </div>

                {/* ✅ Helpers */}
                <div style={{ borderTop: "1px solid #eee", paddingTop: "12px" }}>
                  <label style={{ display: "block", fontWeight: 700 }}>Helper / Apprentice</label>

                  <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
                    <input
                      type="checkbox"
                      checked={useDefaultHelper}
                      onChange={(e) => setUseDefaultHelper(e.target.checked)}
                      disabled={!canEdit}
                    />
                    Use default helper pairing (recommended)
                  </label>

                  <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                    {helperCandidates.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "#666" }}>
                        No helper/apprentice profiles found. Set laborRole + pairing in Employee Profiles.
                      </p>
                    ) : (
                      helperCandidates.map((h) => {
                        const checked = helperUids.includes(h.uid);
                        return (
                          <label
                            key={h.uid}
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "center",
                              border: "1px solid #eee",
                              borderRadius: "10px",
                              padding: "8px",
                              background: "white",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleHelper(h.uid)}
                              disabled={!canEdit}
                            />
                            <div style={{ fontSize: "13px" }}>
                              <strong>{h.name}</strong>{" "}
                              <span style={{ color: "#777" }}>({h.laborRole})</span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  <p style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                    If you manually change helpers, we automatically turn off “use default pairing” so it won’t overwrite your selection.
                  </p>
                </div>

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
                {saveSuccess ? <p style={{ color: "green" }}>{saveSuccess}</p> : null}

                <button
                  type="submit"
                  disabled={saving || !canEdit}
                  style={{
                    padding: "10px 16px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    width: "fit-content",
                  }}
                >
                  {saving ? "Saving..." : canEdit ? "Save Ticket Updates" : "Read Only"}
                </button>
              </form>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                System
              </h2>
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