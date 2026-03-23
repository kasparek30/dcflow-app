// app/time-entries/[timeEntryId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { TimeEntry } from "../../../src/types/time-entry";
import type { WeeklyTimesheet } from "../../../src/types/weekly-timesheet";

type Props = {
  params: Promise<{ timeEntryId: string }>;
};

type LocalTimeEntry = TimeEntry & {
  tripId?: string;
  companyEventId?: string;
  title?: string | null;
  location?: string | null;
  hoursLocked?: boolean | null;
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
  type?: string;
  status?: string;
  date?: string;
  timeWindow?: string;
  startTime?: string;
  endTime?: string;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  } | null;

  crewConfirmed?: TripCrew | null;
  crew?: TripCrew | null;

  workNotes?: string | null;
  resolutionNotes?: string | null;
  followUpNotes?: string | null;
  outcome?: string | null;

  actualMinutes?: number | null;

  updatedAt?: string | null;
};

type ServiceTicketLite = {
  id: string;
  customerDisplayName?: string;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string;
  serviceCity?: string;
  serviceState?: string;
  servicePostalCode?: string;
  issueSummary?: string;
};

type ProjectLite = {
  id: string;
  name?: string;
  projectName?: string;
  title?: string;
};

type CompanyEventLite = {
  id: string;
  title?: string;
  date?: string;
  timeWindow?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  type?: string;
};

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function normalize(s: unknown) {
  return safeStr(s).trim();
}

function formatCategory(category: TimeEntry["category"]) {
  switch (category) {
    case "service_ticket":
      return "Service Ticket";
    case "project_stage":
      return "Project Stage";
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
      return "Manual Other";
    default:
      return String(category || "");
  }
}

function formatStage(stageKey?: string) {
  const s = (stageKey || "").toLowerCase();
  if (s === "roughin") return "Rough-In";
  if (s === "topoutvent") return "Top-Out / Vent";
  if (s === "trimfinish") return "Trim / Finish";
  if (s === "roughin" || s === "roughin") return "Rough-In";
  if (s === "topoutvent") return "Top-Out / Vent";
  if (s === "trimfinish") return "Trim / Finish";
  return stageKey || "—";
}

function buildAddressLine(t: ServiceTicketLite) {
  const parts: string[] = [];
  const l1 = normalize(t.serviceAddressLine1);
  const l2 = normalize(t.serviceAddressLine2);
  const city = normalize(t.serviceCity);
  const state = normalize(t.serviceState);
  const zip = normalize(t.servicePostalCode);

  if (l1) parts.push(l1);
  if (l2) parts.push(l2);
  const csz = [city, state, zip].filter(Boolean).join(" ");
  if (csz) parts.push(csz);

  return parts.join(" • ");
}

function compactLines(lines: string[]) {
  return lines.map((x) => x.trim()).filter(Boolean);
}

function buildAutoNotes(args: {
  entry: LocalTimeEntry;
  trip?: TripDoc | null;
  ticket?: ServiceTicketLite | null;
  project?: ProjectLite | null;
  event?: CompanyEventLite | null;
}) {
  const { entry, trip, ticket, project, event } = args;

  const lines: string[] = [];

  // Header
  lines.push(`AUTO • ${formatCategory(entry.category)} • ${entry.entryDate}`);

  // Meeting
  if (entry.category === "meeting") {
    const title = normalize(entry.title) || normalize(event?.title) || "Meeting";
    const loc = normalize(entry.location) || normalize(event?.location);
    lines.push(`📣 ${title}${loc ? ` • ${loc}` : ""}`);
    if (normalize(event?.notes)) {
      lines.push(`Notes: ${normalize(event?.notes)}`);
    }
    if (normalize(entry.companyEventId)) lines.push(`companyEventId: ${normalize(entry.companyEventId)}`);
    return compactLines(lines).join("\n");
  }

  // Trip-based (service/project)
  const tripId = normalize(entry.tripId);
  const stId = normalize(entry.serviceTicketId);
  const projId = normalize(entry.projectId);

  if (trip || tripId || stId || projId) {
    if (ticket) {
      const cust = normalize(ticket.customerDisplayName);
      const addr = buildAddressLine(ticket);
      const issue = normalize(ticket.issueSummary);
      if (cust || addr) lines.push(`Customer: ${[cust, addr].filter(Boolean).join(" — ")}`);
      if (issue) lines.push(`Issue: ${issue}`);
    }

    if (project) {
      const name = normalize(project.name) || normalize(project.projectName) || normalize(project.title) || "";
      if (name) lines.push(`Project: ${name}`);
    }

    if (trip) {
      const window = normalize(trip.timeWindow);
      const time = [normalize(trip.startTime), normalize(trip.endTime)].filter(Boolean).join("-");
      const when = [normalize(trip.date), window || "", time || ""].filter(Boolean).join(" • ");
      if (when) lines.push(`Trip: ${when}`);

      const outcome = normalize(trip.outcome).toLowerCase();
      if (outcome) lines.push(`Outcome: ${outcome}`);

      const follow = normalize(trip.followUpNotes);
      const res = normalize(trip.resolutionNotes);
      const work = normalize(trip.workNotes);

      if (outcome === "follow_up" && follow) lines.push(`Follow-up notes: ${follow}`);
      if (outcome === "resolved" && res) lines.push(`Resolution notes: ${res}`);
      if (!outcome && (follow || res)) {
        if (follow) lines.push(`Follow-up notes: ${follow}`);
        if (res) lines.push(`Resolution notes: ${res}`);
      }
      if (work) lines.push(`Work notes: ${work}`);

      if (typeof trip.actualMinutes === "number" && Number.isFinite(trip.actualMinutes)) {
        lines.push(`Trip minutes: ${trip.actualMinutes}`);
      }
    }

    if (tripId) lines.push(`tripId: ${tripId}`);
    if (stId) lines.push(`serviceTicketId: ${stId}`);
    if (projId) {
      lines.push(
        `projectId: ${projId}${entry.projectStageKey ? ` • stage: ${formatStage(entry.projectStageKey)}` : ""}`
      );
    }
  }

  return compactLines(lines).join("\n");
}

export default function TimeEntryDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timeEntryId, setTimeEntryId] = useState("");
  const [entry, setEntry] = useState<LocalTimeEntry | null>(null);
  const [matchingTimesheet, setMatchingTimesheet] = useState<WeeklyTimesheet | null>(null);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [hours, setHours] = useState(0);
  const [billable, setBillable] = useState(false);
  const [serviceTicketId, setServiceTicketId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectStageKey, setProjectStageKey] = useState<"" | "roughIn" | "topOutVent" | "trimFinish">("");
  const [linkedTechnicianId, setLinkedTechnicianId] = useState("");
  const [linkedTechnicianName, setLinkedTechnicianName] = useState("");
  const [notes, setNotes] = useState("");

  // ✅ Auto details state
  const [trip, setTrip] = useState<TripDoc | null>(null);
  const [ticket, setTicket] = useState<ServiceTicketLite | null>(null);
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [event, setEvent] = useState<CompanyEventLite | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  const canEditOtherUsers =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadEntry() {
      try {
        const resolved = await params;
        const nextId = resolved.timeEntryId;
        setTimeEntryId(nextId);

        const entrySnap = await getDoc(doc(db, "timeEntries", nextId));

        if (!entrySnap.exists()) {
          setError("Time entry not found.");
          setLoading(false);
          return;
        }

        const data = entrySnap.data() as any;

        const item: LocalTimeEntry = {
          id: entrySnap.id,
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
          billable: data.billable ?? false,
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

          // ✅ extra linkage fields
          tripId: data.tripId ?? undefined,
          companyEventId: data.companyEventId ?? undefined,
          title: data.title ?? null,
          location: data.location ?? null,
          hoursLocked: typeof data.hoursLocked === "boolean" ? data.hoursLocked : null,
        };

        setEntry(item);

        setHours(item.hours);
        setBillable(item.billable);
        setServiceTicketId(item.serviceTicketId ?? "");
        setProjectId(item.projectId ?? "");
        setProjectStageKey(
          (item.projectStageKey as "" | "roughIn" | "topOutVent" | "trimFinish") ?? ""
        );
        setLinkedTechnicianId(item.linkedTechnicianId ?? "");
        setLinkedTechnicianName(item.linkedTechnicianName ?? "");
        setNotes(item.notes ?? "");

        const weeklyQ = query(
          collection(db, "weeklyTimesheets"),
          where("employeeId", "==", item.employeeId),
          where("weekStartDate", "==", item.weekStartDate),
          where("weekEndDate", "==", item.weekEndDate)
        );

        const weeklySnap = await getDocs(weeklyQ);

        if (!weeklySnap.empty) {
          const tsDoc = weeklySnap.docs[0];
          const tsData = tsDoc.data();

          const ts: WeeklyTimesheet = {
            id: tsDoc.id,
            employeeId: tsData.employeeId ?? "",
            employeeName: tsData.employeeName ?? "",
            employeeRole: tsData.employeeRole ?? "",
            weekStartDate: tsData.weekStartDate ?? "",
            weekEndDate: tsData.weekEndDate ?? "",
            timeEntryIds: Array.isArray(tsData.timeEntryIds) ? tsData.timeEntryIds : [],
            totalHours: typeof tsData.totalHours === "number" ? tsData.totalHours : 0,
            regularHours: typeof tsData.regularHours === "number" ? tsData.regularHours : 0,
            overtimeHours: typeof tsData.overtimeHours === "number" ? tsData.overtimeHours : 0,
            ptoHours: typeof tsData.ptoHours === "number" ? tsData.ptoHours : 0,
            holidayHours: typeof tsData.holidayHours === "number" ? tsData.holidayHours : 0,
            billableHours: typeof tsData.billableHours === "number" ? tsData.billableHours : 0,
            nonBillableHours: typeof tsData.nonBillableHours === "number" ? tsData.nonBillableHours : 0,
            status: tsData.status ?? "draft",
            submittedAt: tsData.submittedAt ?? undefined,
            submittedById: tsData.submittedById ?? undefined,
            approvedAt: tsData.approvedAt ?? undefined,
            approvedById: tsData.approvedById ?? undefined,
            approvedByName: tsData.approvedByName ?? undefined,
            rejectedAt: tsData.rejectedAt ?? undefined,
            rejectedById: tsData.rejectedById ?? undefined,
            rejectionReason: tsData.rejectionReason ?? undefined,
            quickbooksExportStatus: tsData.quickbooksExportStatus ?? "not_ready",
            quickbooksExportedAt: tsData.quickbooksExportedAt ?? undefined,
            quickbooksPayrollBatchId: tsData.quickbooksPayrollBatchId ?? undefined,
            employeeNote: tsData.employeeNote ?? undefined,
            managerNote: tsData.managerNote ?? undefined,
            createdAt: tsData.createdAt ?? undefined,
            updatedAt: tsData.updatedAt ?? undefined,
          };

          setMatchingTimesheet(ts);
        } else {
          setMatchingTimesheet(null);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load time entry.");
      } finally {
        setLoading(false);
      }
    }

    loadEntry();
  }, [params]);

  // ✅ Load auto context (trip/ticket/project/event)
  useEffect(() => {
    async function loadAutoContext() {
      if (!entry) return;

      setAutoLoading(true);
      setTrip(null);
      setTicket(null);
      setProject(null);
      setEvent(null);

      try {
        if (entry.category === "meeting") {
          const ceid = normalize(entry.companyEventId);
          if (ceid) {
            const es = await getDoc(doc(db, "companyEvents", ceid));
            if (es.exists()) {
              const d = es.data() as any;
              setEvent({
                id: es.id,
                title: d.title ?? d.name ?? "Meeting",
                date: d.date ?? "",
                timeWindow: d.timeWindow ?? "",
                startTime: d.startTime ?? null,
                endTime: d.endTime ?? null,
                location: d.location ?? null,
                notes: d.notes ?? null,
                type: d.type ?? "meeting",
              });
            }
          }
          return;
        }

        const tid = normalize(entry.tripId);
        if (tid) {
          const ts = await getDoc(doc(db, "trips", tid));
          if (ts.exists()) {
            const d = ts.data() as any;
            setTrip({
              id: ts.id,
              type: d.type ?? undefined,
              status: d.status ?? undefined,
              date: d.date ?? undefined,
              timeWindow: d.timeWindow ?? undefined,
              startTime: d.startTime ?? undefined,
              endTime: d.endTime ?? undefined,
              link: d.link ?? null,
              crewConfirmed: d.crewConfirmed ?? null,
              crew: d.crew ?? null,
              workNotes: d.workNotes ?? null,
              resolutionNotes: d.resolutionNotes ?? null,
              followUpNotes: d.followUpNotes ?? null,
              outcome: d.outcome ?? null,
              actualMinutes: typeof d.actualMinutes === "number" ? d.actualMinutes : null,
              updatedAt: d.updatedAt ?? null,
            });
          }
        }

        const stid = normalize(entry.serviceTicketId);
        if (stid) {
          const ss = await getDoc(doc(db, "serviceTickets", stid));
          if (ss.exists()) {
            const d = ss.data() as any;
            setTicket({
              id: ss.id,
              customerDisplayName: d.customerDisplayName ?? "",
              serviceAddressLine1: d.serviceAddressLine1 ?? "",
              serviceAddressLine2: d.serviceAddressLine2 ?? "",
              serviceCity: d.serviceCity ?? "",
              serviceState: d.serviceState ?? "",
              servicePostalCode: d.servicePostalCode ?? "",
              issueSummary: d.issueSummary ?? "",
            });
          }
        }

        const pid = normalize(entry.projectId);
        if (pid) {
          const ps = await getDoc(doc(db, "projects", pid));
          if (ps.exists()) {
            const d = ps.data() as any;
            setProject({
              id: ps.id,
              name: d.name ?? undefined,
              projectName: d.projectName ?? undefined,
              title: d.title ?? undefined,
            });
          }
        }
      } catch {
        // best-effort
      } finally {
        setAutoLoading(false);
      }
    }

    loadAutoContext();
  }, [entry?.id]);

  const isOwnEntry = useMemo(() => {
    if (!entry || !appUser?.uid) return false;
    return entry.employeeId === appUser.uid;
  }, [entry, appUser?.uid]);

  const isTimesheetLocked = useMemo(() => {
    if (!matchingTimesheet) return false;
    return (
      matchingTimesheet.status === "submitted" ||
      matchingTimesheet.status === "approved" ||
      matchingTimesheet.status === "exported_to_quickbooks"
    );
  }, [matchingTimesheet]);

  const isEntryHoursLocked = useMemo(() => {
    return Boolean(entry?.hoursLocked);
  }, [entry?.hoursLocked]);

  const canEdit = useMemo(() => {
    if (!entry || !appUser) return false;
    if (!isOwnEntry && !canEditOtherUsers) return false;
    if (isTimesheetLocked) return false;
    if (isEntryHoursLocked) return false;
    return true;
  }, [entry, appUser, isOwnEntry, canEditOtherUsers, isTimesheetLocked, isEntryHoursLocked]);

  const suggestedAutoNotes = useMemo(() => {
    if (!entry) return "";
    return buildAutoNotes({ entry, trip, ticket, project, event });
  }, [entry, trip, ticket, project, event]);

  function appendAutoToNotes() {
    const auto = (suggestedAutoNotes || "").trim();
    if (!auto) return;

    const cur = (notes || "").trim();
    if (!cur) {
      setNotes(auto);
      return;
    }

    if (cur.includes("AUTO •")) {
      setNotes(cur);
      return;
    }

    setNotes(`${cur}\n\n${auto}`);
  }

  function replaceNotesWithAuto() {
    const auto = (suggestedAutoNotes || "").trim();
    if (!auto) return;
    setNotes(auto);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!entry) {
      setError("Missing time entry.");
      return;
    }

    if (!canEdit) {
      setError("This time entry is read-only.");
      return;
    }

    if (hours <= 0) {
      setError("Hours must be greater than 0.");
      return;
    }

    if (entry.category === "service_ticket" && !serviceTicketId.trim()) {
      setError("Service Ticket ID is required for service ticket entries.");
      return;
    }

    if (entry.category === "project_stage") {
      if (!projectId.trim()) {
        setError("Project ID is required for project stage entries.");
        return;
      }
      if (!projectStageKey) {
        setError("Project stage is required for project stage entries.");
        return;
      }
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "timeEntries", entry.id), {
        hours,
        billable,

        serviceTicketId: serviceTicketId.trim() || null,
        projectId: projectId.trim() || null,
        projectStageKey: projectStageKey || null,

        linkedTechnicianId: linkedTechnicianId.trim() || null,
        linkedTechnicianName: linkedTechnicianName.trim() || null,

        notes: notes.trim() || null,
        updatedAt: nowIso,
      });

      setEntry({
        ...entry,
        hours,
        billable,
        serviceTicketId: serviceTicketId.trim() || undefined,
        projectId: projectId.trim() || undefined,
        projectStageKey: projectStageKey || undefined,
        linkedTechnicianId: linkedTechnicianId.trim() || undefined,
        linkedTechnicianName: linkedTechnicianName.trim() || undefined,
        notes: notes.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveMsg("Time entry saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save time entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Edit Time Entry">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              Edit Time Entry
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Entries remain editable until the weekly timesheet is submitted/approved/exported (or an entry is explicitly locked).
            </p>
          </div>

          <Link
            href="/time-entries"
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
              height: "fit-content",
            }}
          >
            Back to Time Entries
          </Link>
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading time entry...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ marginTop: "16px", color: "green" }}>{saveMsg}</p> : null}

        {!loading && entry ? (
          <>
            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "900px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                {formatCategory(entry.category)}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Employee: {entry.employeeName}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Entry Date: {entry.entryDate}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Payroll Week: {entry.weekStartDate} through {entry.weekEndDate}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Source: {entry.source === "auto_suggested" ? "Auto-Suggested" : entry.source || "Manual"}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Hours Locked: <strong>{String(Boolean(entry.hoursLocked))}</strong>
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Time Entry ID: {timeEntryId}
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: canEdit ? "#fafafa" : "#f7f7f7",
                maxWidth: "900px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>Edit Rules</div>

              <div style={{ fontSize: "13px", color: "#555" }}>
                Your entry is {canEdit ? "currently editable." : "currently read-only."}
              </div>

              {isTimesheetLocked ? (
                <div style={{ fontSize: "12px", color: "#8a5a00" }}>
                  The matching weekly timesheet is <strong>{matchingTimesheet?.status}</strong>, so this entry is locked.
                </div>
              ) : null}

              {isEntryHoursLocked ? (
                <div style={{ fontSize: "12px", color: "#8a5a00" }}>
                  This entry has <strong>hoursLocked = true</strong> (used for meetings and other system-controlled entries).
                </div>
              ) : null}

              {!isOwnEntry && !canEditOtherUsers ? (
                <div style={{ fontSize: "12px", color: "#8a5a00" }}>
                  You can only edit your own entries.
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSave}
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: canEdit ? "#fafafa" : "#f7f7f7",
                maxWidth: "900px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: "18px" }}>Entry Details</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Hours</label>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: canEdit ? "white" : "#f1f1f1",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="checkbox"
                      checked={billable}
                      onChange={(e) => setBillable(e.target.checked)}
                      disabled={!canEdit}
                    />
                    Billable
                  </label>
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  disabled={!canEdit}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: canEdit ? "white" : "#f1f1f1",
                  }}
                />
              </div>

              {canEdit ? (
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: "pointer",
                    width: "fit-content",
                    fontWeight: 800,
                  }}
                >
                  {saving ? "Saving..." : "Save Time Entry"}
                </button>
              ) : (
                <span
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ddd",
                    background: "#f1f1f1",
                    color: "#777",
                    width: "fit-content",
                    fontWeight: 800,
                  }}
                >
                  Read-Only Entry
                </span>
              )}
            </form>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}