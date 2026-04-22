// app/time-entries/[timeEntryId]/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Alert,
  Autocomplete,
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
  Divider,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";
import type { TimeEntry } from "../../../src/types/time-entry";
import type { WeeklyTimesheet } from "../../../src/types/weekly-timesheet";

type Props = {
  params: Promise<{ timeEntryId: string }>;
};

type ProjectStageValue = "" | "roughIn" | "topOutVent" | "trimFinish";

type UserOption = {
  uid: string;
  displayName: string;
  email: string;
  role: AppUser["role"];
  active: boolean;
  laborRoleType?: AppUser["laborRoleType"];
  preferredTechnicianId?: string | null;
  preferredTechnicianName?: string | null;
  holidayEligible?: boolean;
  defaultDailyHolidayHours?: number;
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

function safeTrim(x: unknown) {
  return safeStr(x).trim();
}

function normalizeProjectStageKey(value: unknown): ProjectStageValue {
  const raw = safeTrim(value).toLowerCase();

  if (!raw) return "";
  if (raw === "roughin" || raw === "rough_in") return "roughIn";
  if (raw === "topoutvent" || raw === "top_out_vent") return "topOutVent";
  if (raw === "trimfinish" || raw === "trim_finish") return "trimFinish";

  return "";
}

function normalizeCategory(raw: unknown) {
  const c = safeTrim(raw).toLowerCase();

  if (c === "service_ticket") return "service";
  if (c === "project_stage") return "project";

  if (c === "service") return "service";
  if (c === "project") return "project";
  if (c === "meeting") return "meeting";
  if (c === "shop") return "shop";
  if (c === "office") return "office";
  if (c === "pto") return "pto";
  if (c === "holiday") return "holiday";
  if (c === "manual_other") return "manual_other";

  return c || "other";
}

function formatCategoryLabel(raw: unknown) {
  const c = normalizeCategory(raw);
  switch (c) {
    case "service":
      return "Service";
    case "project":
      return "Project";
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
      return "Manual";
    default:
      return "Other";
  }
}

function formatPayType(payType: TimeEntry["payType"]) {
  switch (payType) {
    case "regular":
      return "Regular";
    case "overtime":
      return "Overtime";
    case "pto":
      return "PTO";
    case "holiday":
      return "Holiday";
    default:
      return String(payType || "—");
  }
}

function formatStatus(status: TimeEntry["entryStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported":
      return "Exported";
    default:
      return String(status || "—");
  }
}

function formatSourceLabel(source?: string) {
  const s = safeTrim(source).toLowerCase();
  switch (s) {
    case "manual_entry":
      return "Manual";
    case "auto_suggested":
      return "Auto";
    case "system_generated_pto":
      return "Generated PTO";
    case "system_generated_holiday":
      return "Generated Holiday";
    case "system_generated_meeting":
      return "Generated Meeting";
    case "trip_timer":
      return "Trip";
    default:
      return s ? s.replace(/_/g, " ") : "Source";
  }
}

function formatStage(stageKey?: string) {
  const normalized = normalizeProjectStageKey(stageKey);
  if (normalized === "roughIn") return "Rough-In";
  if (normalized === "topOutVent") return "Top-Out / Vent";
  if (normalized === "trimFinish") return "Trim / Finish";
  return safeTrim(stageKey) || "—";
}

function formatRoleLabel(role?: string | null) {
  const raw = safeTrim(role).toLowerCase();
  if (!raw) return "Employee";
  return raw
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function buildUserOptionLabel(user: UserOption | null | undefined) {
  if (!user) return "";
  const name = safeTrim(user.displayName) || safeTrim(user.uid) || "Unnamed User";
  const role = formatRoleLabel(user.role);
  const inactive = user.active === false ? " • Inactive" : "";
  return `${name} (${role})${inactive}`;
}

function buildAddressLine(ticket: ServiceTicketLite) {
  const parts: string[] = [];
  const l1 = safeTrim(ticket.serviceAddressLine1);
  const l2 = safeTrim(ticket.serviceAddressLine2);
  const city = safeTrim(ticket.serviceCity);
  const state = safeTrim(ticket.serviceState);
  const zip = safeTrim(ticket.servicePostalCode);

  if (l1) parts.push(l1);
  if (l2) parts.push(l2);

  const csz = [city, state, zip].filter(Boolean).join(" ");
  if (csz) parts.push(csz);

  return parts.join(" • ");
}

function compactLines(lines: string[]) {
  return lines.map((x) => x.trim()).filter(Boolean);
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `${employeeId}_${weekStartDate}`;
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
  lines.push(`AUTO • ${formatCategoryLabel(entry.category)} • ${entry.entryDate}`);

  if (normalizeCategory(entry.category) === "meeting") {
    const title = safeTrim(entry.title) || safeTrim(event?.title) || "Meeting";
    const loc = safeTrim(entry.location) || safeTrim(event?.location);
    lines.push(`📣 ${title}${loc ? ` • ${loc}` : ""}`);

    if (safeTrim(event?.notes)) {
      lines.push(`Notes: ${safeTrim(event?.notes)}`);
    }

    if (safeTrim(entry.companyEventId)) {
      lines.push(`companyEventId: ${safeTrim(entry.companyEventId)}`);
    }

    return compactLines(lines).join("\n");
  }

  if (normalizeCategory(entry.category) === "pto") {
    lines.push("Approved PTO entry");
    if (safeTrim(entry.notes)) lines.push(`Notes: ${safeTrim(entry.notes)}`);
    return compactLines(lines).join("\n");
  }

  if (normalizeCategory(entry.category) === "holiday") {
    lines.push("Company holiday entry");
    if (safeTrim(entry.notes)) lines.push(`Notes: ${safeTrim(entry.notes)}`);
    return compactLines(lines).join("\n");
  }

  const tripId = safeTrim(entry.tripId);
  const stId = safeTrim(entry.serviceTicketId);
  const projId = safeTrim(entry.projectId);

  if (trip || tripId || stId || projId) {
    if (ticket) {
      const cust = safeTrim(ticket.customerDisplayName);
      const addr = buildAddressLine(ticket);
      const issue = safeTrim(ticket.issueSummary);

      if (cust || addr) lines.push(`Customer: ${[cust, addr].filter(Boolean).join(" — ")}`);
      if (issue) lines.push(`Issue: ${issue}`);
    }

    if (project) {
      const name =
        safeTrim(project.name) ||
        safeTrim(project.projectName) ||
        safeTrim(project.title);

      if (name) lines.push(`Project: ${name}`);
    }

    if (trip) {
      const window = safeTrim(trip.timeWindow);
      const time = [safeTrim(trip.startTime), safeTrim(trip.endTime)].filter(Boolean).join(" - ");
      const when = [safeTrim(trip.date), window, time].filter(Boolean).join(" • ");
      if (when) lines.push(`Trip: ${when}`);

      const outcome = safeTrim(trip.outcome).toLowerCase();
      if (outcome) lines.push(`Outcome: ${outcome}`);

      const follow = safeTrim(trip.followUpNotes);
      const res = safeTrim(trip.resolutionNotes);
      const work = safeTrim(trip.workNotes);

      if (outcome === "follow_up" && follow) lines.push(`Follow-up notes: ${follow}`);
      if (outcome === "resolved" && res) lines.push(`Resolution notes: ${res}`);
      if (!outcome && follow) lines.push(`Follow-up notes: ${follow}`);
      if (!outcome && res) lines.push(`Resolution notes: ${res}`);
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

function isTimesheetLockedStatus(status: unknown) {
  const s = safeTrim(status).toLowerCase();
  return s === "submitted" || s === "approved" || s === "exported" || s === "exported_to_quickbooks";
}

function getStatusChipColor(status: TimeEntry["entryStatus"]): "default" | "warning" | "success" | "error" | "info" {
  switch (status) {
    case "draft":
      return "warning";
    case "submitted":
      return "info";
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "exported":
      return "default";
    default:
      return "default";
  }
}

export default function TimeEntryDetailPage({ params }: Props) {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [timeEntryId, setTimeEntryId] = useState("");
  const [entry, setEntry] = useState<LocalTimeEntry | null>(null);
  const [matchingTimesheet, setMatchingTimesheet] = useState<WeeklyTimesheet | null>(null);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [hours, setHours] = useState(0);
  const [billable, setBillable] = useState(false);
  const [serviceTicketId, setServiceTicketId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectStageKey, setProjectStageKey] = useState<ProjectStageValue>("");
  const [linkedTechnicianId, setLinkedTechnicianId] = useState("");
  const [linkedTechnicianName, setLinkedTechnicianName] = useState("");
  const [notes, setNotes] = useState("");

  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState<AppUser["role"] | "">("");
  const [employeeLaborRoleType, setEmployeeLaborRoleType] = useState<AppUser["laborRoleType"] | null>(null);

  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

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
    async function loadUsers() {
      if (!canEditOtherUsers) return;

      setUsersLoading(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const items: UserOption[] = snap.docs.map((docSnap) => {
          const data: any = docSnap.data();
          return {
            uid: data.uid ?? docSnap.id,
            displayName: data.displayName ?? "Unnamed User",
            email: data.email ?? "",
            role: (data.role ?? "technician") as AppUser["role"],
            active: typeof data.active === "boolean" ? data.active : true,
            laborRoleType: (data.laborRoleType ?? undefined) as AppUser["laborRoleType"],
            preferredTechnicianId: data.preferredTechnicianId ?? null,
            preferredTechnicianName: data.preferredTechnicianName ?? null,
            holidayEligible: data.holidayEligible ?? undefined,
            defaultDailyHolidayHours: data.defaultDailyHolidayHours ?? undefined,
          };
        });

        items.sort((a, b) => buildUserOptionLabel(a).localeCompare(buildUserOptionLabel(b)));
        setUserOptions(items);
      } catch {
        setUserOptions([]);
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
  }, [canEditOtherUsers]);

  useEffect(() => {
    async function loadEntry() {
      try {
        setLoading(true);
        setError("");

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
          billable: Boolean(data.billable),
          source: data.source ?? "manual_entry",

          serviceTicketId: data.serviceTicketId ?? undefined,
          projectId: data.projectId ?? undefined,
          projectStageKey: normalizeProjectStageKey(data.projectStageKey) || undefined,

          linkedTechnicianId: data.linkedTechnicianId ?? undefined,
          linkedTechnicianName: data.linkedTechnicianName ?? undefined,

          notes: data.notes ?? undefined,
          timesheetId: data.timesheetId ?? undefined,
          entryStatus: data.entryStatus ?? "draft",

          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,

          tripId: data.tripId ?? undefined,
          companyEventId: data.companyEventId ?? undefined,
          title: data.title ?? null,
          location: data.location ?? null,
          hoursLocked: typeof data.hoursLocked === "boolean" ? data.hoursLocked : null,
        };

        setEntry(item);
        setHours(item.hours);
        setBillable(Boolean(item.billable));
        setServiceTicketId(item.serviceTicketId ?? "");
        setProjectId(item.projectId ?? "");
        setProjectStageKey(normalizeProjectStageKey(item.projectStageKey));
        setLinkedTechnicianId(item.linkedTechnicianId ?? "");
        setLinkedTechnicianName(item.linkedTechnicianName ?? "");
        setNotes(item.notes ?? "");

        setEmployeeId(item.employeeId ?? "");
        setEmployeeName(item.employeeName ?? "");
        setEmployeeRole((item.employeeRole as AppUser["role"]) ?? "");
        setEmployeeLaborRoleType((item.laborRoleType as AppUser["laborRoleType"]) ?? null);

        const directTimesheetId = buildWeeklyTimesheetId(item.employeeId, item.weekStartDate);
        const directTimesheetSnap = await getDoc(doc(db, "weeklyTimesheets", directTimesheetId));

        if (directTimesheetSnap.exists()) {
          const tsData: any = directTimesheetSnap.data();
          setMatchingTimesheet({
            id: directTimesheetSnap.id,
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
          });
        } else {
          const weeklyQ = query(
            collection(db, "weeklyTimesheets"),
            where("employeeId", "==", item.employeeId),
            where("weekStartDate", "==", item.weekStartDate),
            where("weekEndDate", "==", item.weekEndDate)
          );

          const weeklySnap = await getDocs(weeklyQ);
          if (!weeklySnap.empty) {
            const tsDoc = weeklySnap.docs[0];
            const tsData: any = tsDoc.data();

            setMatchingTimesheet({
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
            });
          } else {
            setMatchingTimesheet(null);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load time entry.");
      } finally {
        setLoading(false);
      }
    }

    loadEntry();
  }, [params]);

  useEffect(() => {
    async function loadAutoContext() {
      if (!entry) return;

      setAutoLoading(true);
      setTrip(null);
      setTicket(null);
      setProject(null);
      setEvent(null);

      try {
        const category = normalizeCategory(entry.category);

        if (category === "meeting") {
          const eventId = safeTrim(entry.companyEventId);
          if (eventId) {
            const es = await getDoc(doc(db, "companyEvents", eventId));
            if (es.exists()) {
              const d: any = es.data();
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

        const tripId = safeTrim(entry.tripId);
        if (tripId) {
          const ts = await getDoc(doc(db, "trips", tripId));
          if (ts.exists()) {
            const d: any = ts.data();
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

        const serviceId = safeTrim(entry.serviceTicketId);
        if (serviceId) {
          const ss = await getDoc(doc(db, "serviceTickets", serviceId));
          if (ss.exists()) {
            const d: any = ss.data();
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

        const pid = safeTrim(entry.projectId);
        if (pid) {
          const ps = await getDoc(doc(db, "projects", pid));
          if (ps.exists()) {
            const d: any = ps.data();
            setProject({
              id: ps.id,
              name: d.name ?? undefined,
              projectName: d.projectName ?? undefined,
              title: d.title ?? undefined,
            });
          }
        }
      } catch {
        // best-effort only
      } finally {
        setAutoLoading(false);
      }
    }

    loadAutoContext();
  }, [
    entry?.id,
    entry?.category,
    entry?.tripId,
    entry?.serviceTicketId,
    entry?.projectId,
    entry?.companyEventId,
  ]);

  const isOwnEntry = useMemo(() => {
    if (!entry || !appUser?.uid) return false;
    return entry.employeeId === appUser.uid;
  }, [appUser?.uid, entry]);

  const isTimesheetLocked = useMemo(() => {
    if (!matchingTimesheet) return false;
    return isTimesheetLockedStatus(matchingTimesheet.status);
  }, [matchingTimesheet]);

  const isEntryHoursLocked = useMemo(() => {
    return Boolean(entry?.hoursLocked);
  }, [entry?.hoursLocked]);

  const normalizedEntryCategory = useMemo(() => normalizeCategory(entry?.category), [entry?.category]);
  const isHolidayEntry = normalizedEntryCategory === "holiday";
  const isPtoEntry = normalizedEntryCategory === "pto";
  const isMeetingEntry = normalizedEntryCategory === "meeting";
  const isManualEntry = safeTrim(entry?.source).toLowerCase() === "manual_entry";
  const isAdminOverride = canEditOtherUsers;

  const selectedEmployeeOption = useMemo<UserOption | null>(() => {
    const found = userOptions.find((user) => user.uid === employeeId);
    if (found) return found;
    if (!employeeId) return null;

    return {
      uid: employeeId,
      displayName: employeeName || employeeId,
      email: "",
      role: ((employeeRole || "technician") as AppUser["role"]),
      active: true,
      laborRoleType: (employeeLaborRoleType ?? undefined) as AppUser["laborRoleType"],
      preferredTechnicianId: null,
      preferredTechnicianName: null,
      holidayEligible: undefined,
      defaultDailyHolidayHours: undefined,
    };
  }, [employeeId, employeeLaborRoleType, employeeName, employeeRole, userOptions]);

  const technicianOptions = useMemo<UserOption[]>(() => {
    const filtered = userOptions.filter(
      (user) => safeTrim(user.role).toLowerCase() === "technician"
    );

    const currentLinkedMissing =
      linkedTechnicianId &&
      !filtered.some((user) => user.uid === linkedTechnicianId);

    if (currentLinkedMissing) {
      filtered.push({
        uid: linkedTechnicianId,
        displayName: linkedTechnicianName || linkedTechnicianId,
        email: "",
        role: "technician" as AppUser["role"],
        active: true,
        laborRoleType: undefined,
        preferredTechnicianId: null,
        preferredTechnicianName: null,
        holidayEligible: undefined,
        defaultDailyHolidayHours: undefined,
      });
    }

    filtered.sort((a, b) => buildUserOptionLabel(a).localeCompare(buildUserOptionLabel(b)));
    return filtered;
  }, [linkedTechnicianId, linkedTechnicianName, userOptions]);

  const selectedLinkedTechOption = useMemo<UserOption | null>(() => {
    if (!linkedTechnicianId) return null;
    return technicianOptions.find((user) => user.uid === linkedTechnicianId) ?? null;
  }, [linkedTechnicianId, technicianOptions]);

  const selectedEmployeeIsSupportLabor = useMemo(() => {
    const role = safeTrim(selectedEmployeeOption?.role || employeeRole).toLowerCase();
    return role === "helper" || role === "apprentice";
  }, [employeeRole, selectedEmployeeOption?.role]);

  const canEdit = useMemo(() => {
    if (!entry || !appUser) return false;

    if (isAdminOverride) return true;
    if (!isOwnEntry) return false;
    if (isTimesheetLocked) return false;
    if (isEntryHoursLocked) return false;
    if (isHolidayEntry) return false;

    return true;
  }, [
    appUser,
    entry,
    isAdminOverride,
    isEntryHoursLocked,
    isHolidayEntry,
    isOwnEntry,
    isTimesheetLocked,
  ]);

  const canDelete = useMemo(() => {
    if (!entry) return false;
    if (!isManualEntry) return false;

    if (isAdminOverride) return true;
    if (!canEdit) return false;
    if (isTimesheetLocked) return false;
    if (isEntryHoursLocked) return false;

    return true;
  }, [canEdit, entry, isAdminOverride, isEntryHoursLocked, isManualEntry, isTimesheetLocked]);

  const canEditBillable = useMemo(() => {
    if (!canEdit) return false;
    if (isPtoEntry || isHolidayEntry || isMeetingEntry) return false;
    return true;
  }, [canEdit, isHolidayEntry, isMeetingEntry, isPtoEntry]);

  const suggestedAutoNotes = useMemo(() => {
    if (!entry) return "";
    return buildAutoNotes({ entry, trip, ticket, project, event });
  }, [entry, trip, ticket, project, event]);

  function handleEmployeeSelection(nextEmployee: UserOption | null) {
    if (!nextEmployee) {
      setEmployeeId("");
      setEmployeeName("");
      setEmployeeRole("");
      setEmployeeLaborRoleType(null);
      setLinkedTechnicianId("");
      setLinkedTechnicianName("");
      return;
    }

    setEmployeeId(nextEmployee.uid);
    setEmployeeName(nextEmployee.displayName || nextEmployee.uid);
    setEmployeeRole(nextEmployee.role || ("technician" as AppUser["role"]));
    setEmployeeLaborRoleType(nextEmployee.laborRoleType ?? null);

    const normalizedRole = safeTrim(nextEmployee.role).toLowerCase();
    if (normalizedRole === "helper" || normalizedRole === "apprentice") {
      setLinkedTechnicianId(safeTrim(nextEmployee.preferredTechnicianId) || "");
      setLinkedTechnicianName(safeTrim(nextEmployee.preferredTechnicianName) || "");
    } else {
      setLinkedTechnicianId("");
      setLinkedTechnicianName("");
    }
  }

  function handleLinkedTechSelection(nextTech: UserOption | null) {
    if (!nextTech) {
      setLinkedTechnicianId("");
      setLinkedTechnicianName("");
      return;
    }

    setLinkedTechnicianId(nextTech.uid);
    setLinkedTechnicianName(nextTech.displayName || nextTech.uid);
  }

  function appendAutoToNotes() {
    const auto = safeTrim(suggestedAutoNotes);
    if (!auto) return;

    const current = safeTrim(notes);
    if (!current) {
      setNotes(auto);
      return;
    }

    if (current.includes("AUTO •")) return;
    setNotes(`${current}\n\n${auto}`);
  }

  function replaceNotesWithAuto() {
    const auto = safeTrim(suggestedAutoNotes);
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

    const normalizedStageKey = normalizeProjectStageKey(projectStageKey);

    const nextEmployeeResolved = selectedEmployeeOption;
    const nextEmployeeId = safeTrim(employeeId) || safeTrim(entry.employeeId);
    const nextEmployeeName =
      safeTrim(nextEmployeeResolved?.displayName) ||
      safeTrim(employeeName) ||
      safeTrim(entry.employeeName);
    const nextEmployeeRole =
      (nextEmployeeResolved?.role ||
        employeeRole ||
        (entry.employeeRole as AppUser["role"]) ||
        ("technician" as AppUser["role"])) as AppUser["role"];
    const nextLaborRoleType =
      (nextEmployeeResolved?.laborRoleType ??
        employeeLaborRoleType ??
        (entry.laborRoleType as AppUser["laborRoleType"]) ??
        null) as AppUser["laborRoleType"] | null;

    if (hours <= 0) {
      setError("Hours must be greater than 0.");
      return;
    }

    if (isAdminOverride && !nextEmployeeId) {
      setError("Employee is required.");
      return;
    }

    if (normalizedEntryCategory === "service" && !safeTrim(serviceTicketId)) {
      setError("Service Ticket ID is required for service entries.");
      return;
    }

    if (normalizedEntryCategory === "project") {
      if (!safeTrim(projectId)) {
        setError("Project ID is required for project entries.");
        return;
      }
      if (!normalizedStageKey) {
        setError("Project stage is required for project entries.");
        return;
      }
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const employeeChanged = nextEmployeeId !== safeTrim(entry.employeeId);

      await updateDoc(doc(db, "timeEntries", entry.id), {
        employeeId: nextEmployeeId,
        employeeName: nextEmployeeName,
        employeeRole: nextEmployeeRole,
        laborRoleType: nextLaborRoleType,

        hours,
        billable: canEditBillable ? billable : false,

        serviceTicketId: safeTrim(serviceTicketId) || null,
        projectId: safeTrim(projectId) || null,
        projectStageKey: normalizedStageKey || null,

        linkedTechnicianId: safeTrim(linkedTechnicianId) || null,
        linkedTechnicianName: safeTrim(linkedTechnicianName) || null,

        notes: safeTrim(notes) || null,
        timesheetId: employeeChanged ? null : entry.timesheetId ?? null,
        updatedAt: nowIso,
      });

      setEntry((prev) =>
        prev
          ? {
              ...prev,
              employeeId: nextEmployeeId,
              employeeName: nextEmployeeName,
              employeeRole: nextEmployeeRole,
              laborRoleType: nextLaborRoleType ?? undefined,
              hours,
              billable: canEditBillable ? billable : false,
              serviceTicketId: safeTrim(serviceTicketId) || undefined,
              projectId: safeTrim(projectId) || undefined,
              projectStageKey: normalizedStageKey || undefined,
              linkedTechnicianId: safeTrim(linkedTechnicianId) || undefined,
              linkedTechnicianName: safeTrim(linkedTechnicianName) || undefined,
              notes: safeTrim(notes) || undefined,
              timesheetId: employeeChanged ? undefined : prev.timesheetId,
              updatedAt: nowIso,
            }
          : prev
      );

      if (employeeChanged) {
        setMatchingTimesheet(null);
      }

      setProjectStageKey(normalizedStageKey);
      setSaveMsg("Time entry saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save time entry.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) {
      setError("Missing time entry.");
      return;
    }

    if (!canDelete) {
      setError("Only allowed manual entries can be deleted here.");
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await deleteDoc(doc(db, "timeEntries", entry.id));
      router.push("/time-entries");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete time entry.");
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Time Entry">
      <AppShell appUser={appUser}>
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
            spacing={1.5}
          >
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                Time Entry
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Review, adjust, and confirm this payroll entry.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Button
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
                onClick={() => router.push("/time-entries")}
              >
                Back to Time Entries
              </Button>

              <Button
                variant="contained"
                onClick={() =>
                  router.push(
                    entry?.weekStartDate
                      ? `/weekly-timesheet?weekStart=${entry.weekStartDate}`
                      : "/weekly-timesheet"
                  )
                }
              >
                Review Weekly Timesheet
              </Button>
            </Stack>
          </Stack>

          {loading ? <Alert severity="info">Loading time entry…</Alert> : null}
          {!loading && error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && entry ? (
            <>
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>
                          {formatCategoryLabel(entry.category)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {entry.employeeName} • {entry.entryDate}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Payroll week: {entry.weekStartDate} – {entry.weekEndDate}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={formatStatus(entry.entryStatus)} color={getStatusChipColor(entry.entryStatus)} />
                        <Chip label={formatPayType(entry.payType)} variant="outlined" />
                        <Chip label={formatSourceLabel(entry.source)} variant="outlined" />
                        <Chip
                          label={isHolidayEntry ? "Holiday pay" : isPtoEntry ? "PTO pay" : "Worked"}
                          color={isHolidayEntry ? "success" : isPtoEntry ? "secondary" : "info"}
                          variant={isHolidayEntry || isPtoEntry ? "filled" : "outlined"}
                        />
                      </Stack>
                    </Stack>

                    <Divider />

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
                        gap: 1.5,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        <strong>Hours:</strong> {Number(entry.hours || 0).toFixed(2)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Billable:</strong> {entry.billable ? "Yes" : "No"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Hours Locked:</strong> {String(Boolean(entry.hoursLocked))}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>ID:</strong> {timeEntryId}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      Edit Rules
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={canEdit ? "Editable" : "Read-only"}
                        color={canEdit ? "success" : "warning"}
                      />
                      {isAdminOverride ? (
                        <Chip label="Admin override" color="info" variant="outlined" />
                      ) : null}
                      {isTimesheetLocked ? <Chip label="Timesheet locked" color="warning" variant="outlined" /> : null}
                      {isEntryHoursLocked ? <Chip label="Hours locked" color="warning" variant="outlined" /> : null}
                      {isHolidayEntry ? <Chip label="Holiday entry" color="success" variant="outlined" /> : null}
                      {isPtoEntry ? <Chip label="PTO entry" color="secondary" variant="outlined" /> : null}
                    </Stack>

                    {isAdminOverride ? (
                      <Alert severity="info">
                        Admin / Manager / Dispatcher override is active. You can edit this entry even if it came from trip workflow or belongs to a locked weekly timesheet.
                      </Alert>
                    ) : null}

                    {!isAdminOverride && isTimesheetLocked ? (
                      <Alert severity="warning">
                        The matching weekly timesheet is <strong>{matchingTimesheet?.status}</strong>, so this entry is locked.
                      </Alert>
                    ) : null}

                    {!isAdminOverride && isEntryHoursLocked ? (
                      <Alert severity="warning">
                        This entry has <strong>hoursLocked = true</strong> and is controlled by system workflow.
                      </Alert>
                    ) : null}

                    {!isAdminOverride && isHolidayEntry ? (
                      <Alert severity="info">
                        Holiday entries are included for payroll review, but employees do not directly edit holiday hours here.
                      </Alert>
                    ) : null}

                    {isPtoEntry ? (
                      <Alert severity="info">
                        PTO entries can be adjusted to match the actual payable PTO for the day. For example, if you worked part of the day, reduce PTO hours to the real amount taken.
                      </Alert>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Box
                    component="form"
                    onSubmit={handleSave}
                    sx={{ display: "grid", gap: 2.25 }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      Entry Details
                    </Typography>

                    {canEditOtherUsers ? (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                          gap: 2,
                        }}
                      >
                        <Autocomplete<UserOption, false, false, false>
                          options={userOptions}
                          value={selectedEmployeeOption}
                          onChange={(_, value) => handleEmployeeSelection(value)}
                          getOptionLabel={(option) => buildUserOptionLabel(option)}
                          isOptionEqualToValue={(option, value) => option.uid === value.uid}
                          loading={usersLoading}
                          disabled={!canEdit}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="Employee"
                              helperText="Admin can reassign this entry to a different employee."
                              fullWidth
                            />
                          )}
                        />

                        <TextField
                          label="Employee Role"
                          value={formatRoleLabel(selectedEmployeeOption?.role || employeeRole)}
                          disabled
                          fullWidth
                        />
                      </Box>
                    ) : null}

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        label="Hours"
                        type="number"
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                        inputProps={{ min: 0.25, step: 0.25 }}
                        disabled={!canEdit}
                        helperText={
                          isPtoEntry
                            ? "Adjust to actual PTO taken for the day."
                            : isHolidayEntry
                            ? "Holiday hours are normally controlled by admin/company holiday setup."
                            : "Quarter-hour increments recommended."
                        }
                        fullWidth
                      />

                      <Box sx={{ display: "flex", alignItems: "center", minHeight: 56 }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={billable}
                              onChange={(e) => setBillable(e.target.checked)}
                              disabled={!canEditBillable}
                            />
                          }
                          label="Billable"
                        />
                      </Box>
                    </Box>

                    {normalizedEntryCategory === "service" ? (
                      <TextField
                        label="Service Ticket ID"
                        value={serviceTicketId}
                        onChange={(e) => setServiceTicketId(e.target.value)}
                        disabled={!canEdit}
                        fullWidth
                      />
                    ) : null}

                    {normalizedEntryCategory === "project" ? (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          label="Project ID"
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          disabled={!canEdit}
                          fullWidth
                        />
                        <TextField
                          label="Project Stage"
                          select
                          value={projectStageKey}
                          onChange={(e) =>
                            setProjectStageKey(normalizeProjectStageKey(e.target.value))
                          }
                          disabled={!canEdit}
                          fullWidth
                        >
                          <MenuItem value="">Select stage</MenuItem>
                          <MenuItem value="roughIn">Rough-In</MenuItem>
                          <MenuItem value="topOutVent">Top-Out / Vent</MenuItem>
                          <MenuItem value="trimFinish">Trim / Finish</MenuItem>
                        </TextField>
                      </Box>
                    ) : null}

                    {!isPtoEntry && !isHolidayEntry ? (
                      canEditOtherUsers ? (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                            gap: 2,
                          }}
                        >
                          <Autocomplete<UserOption, false, false, false>
                            options={technicianOptions}
                            value={selectedLinkedTechOption}
                            onChange={(_, value) => handleLinkedTechSelection(value)}
                            getOptionLabel={(option) => buildUserOptionLabel(option)}
                            isOptionEqualToValue={(option, value) => option.uid === value.uid}
                            loading={usersLoading}
                            disabled={!canEdit}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Linked Technician"
                                helperText={
                                  selectedEmployeeIsSupportLabor
                                    ? "Support labor selected — choose or confirm the supervising technician."
                                    : "Optional technician link for payroll support."
                                }
                                fullWidth
                              />
                            )}
                          />

                          <TextField
                            label="Linked Technician ID"
                            value={linkedTechnicianId}
                            disabled
                            fullWidth
                          />
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                            gap: 2,
                          }}
                        >
                          <TextField
                            label="Linked Technician ID"
                            value={linkedTechnicianId}
                            onChange={(e) => setLinkedTechnicianId(e.target.value)}
                            disabled={!canEdit}
                            fullWidth
                          />
                          <TextField
                            label="Linked Technician Name"
                            value={linkedTechnicianName}
                            onChange={(e) => setLinkedTechnicianName(e.target.value)}
                            disabled={!canEdit}
                            fullWidth
                          />
                        </Box>
                      )
                    ) : null}

                    <TextField
                      label="Notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={!canEdit}
                      multiline
                      minRows={5}
                      helperText={
                        isPtoEntry
                          ? "Use notes to explain partial-day PTO adjustments if needed."
                          : "Add payroll or work context here."
                      }
                      fullWidth
                    />

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                      {canEdit ? (
                        <Button
                          type="submit"
                          variant="contained"
                          startIcon={<SaveRoundedIcon />}
                          disabled={saving}
                        >
                          {saving ? "Saving…" : "Save Time Entry"}
                        </Button>
                      ) : (
                        <Button variant="outlined" disabled>
                          Read-Only Entry
                        </Button>
                      )}

                      {canDelete ? (
                        <Button
                          color="error"
                          variant="outlined"
                          startIcon={<DeleteRoundedIcon />}
                          onClick={() => setDeleteDialogOpen(true)}
                          disabled={deleting}
                        >
                          Delete Entry
                        </Button>
                      ) : null}
                    </Stack>
                  </Box>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                      spacing={1.25}
                    >
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          Auto Context
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Helpful context pulled from linked trip, event, ticket, or project records.
                        </Typography>
                      </Box>

                      <Chip
                        icon={<AutoAwesomeRoundedIcon />}
                        label={autoLoading ? "Loading…" : "Ready"}
                        color={autoLoading ? "default" : "info"}
                        variant="outlined"
                      />
                    </Stack>

                    {ticket || project || trip || event ? (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                          gap: 1.5,
                        }}
                      >
                        {ticket ? (
                          <Card variant="outlined" sx={{ borderRadius: 3 }}>
                            <CardContent>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                Service Ticket
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                {safeTrim(ticket.customerDisplayName) || "Customer"}
                              </Typography>
                              {safeTrim(ticket.issueSummary) ? (
                                <Typography variant="body2" color="text.secondary">
                                  {safeTrim(ticket.issueSummary)}
                                </Typography>
                              ) : null}
                              {buildAddressLine(ticket) ? (
                                <Typography variant="caption" color="text.secondary">
                                  {buildAddressLine(ticket)}
                                </Typography>
                              ) : null}
                            </CardContent>
                          </Card>
                        ) : null}

                        {project ? (
                          <Card variant="outlined" sx={{ borderRadius: 3 }}>
                            <CardContent>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                Project
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                {safeTrim(project.projectName) || safeTrim(project.name) || safeTrim(project.title) || "Project"}
                              </Typography>
                              {entry.projectStageKey ? (
                                <Typography variant="caption" color="text.secondary">
                                  {formatStage(entry.projectStageKey)}
                                </Typography>
                              ) : null}
                            </CardContent>
                          </Card>
                        ) : null}

                        {trip ? (
                          <Card variant="outlined" sx={{ borderRadius: 3 }}>
                            <CardContent>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                Trip
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                {[safeTrim(trip.date), safeTrim(trip.timeWindow)].filter(Boolean).join(" • ") || "Trip linked"}
                              </Typography>
                              {[safeTrim(trip.startTime), safeTrim(trip.endTime)].filter(Boolean).length ? (
                                <Typography variant="body2" color="text.secondary">
                                  {[safeTrim(trip.startTime), safeTrim(trip.endTime)].filter(Boolean).join(" - ")}
                                </Typography>
                              ) : null}
                              {safeTrim(trip.outcome) ? (
                                <Typography variant="caption" color="text.secondary">
                                  Outcome: {safeTrim(trip.outcome)}
                                </Typography>
                              ) : null}
                            </CardContent>
                          </Card>
                        ) : null}

                        {event ? (
                          <Card variant="outlined" sx={{ borderRadius: 3 }}>
                            <CardContent>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                Company Event
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                {safeTrim(event.title) || "Meeting"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {[safeTrim(event.date), safeTrim(event.timeWindow)].filter(Boolean).join(" • ")}
                              </Typography>
                              {safeTrim(event.location) ? (
                                <Typography variant="caption" color="text.secondary">
                                  {safeTrim(event.location)}
                                </Typography>
                              ) : null}
                            </CardContent>
                          </Card>
                        ) : null}
                      </Box>
                    ) : (
                      <Alert severity="info">
                        No linked trip, event, ticket, or project context was found for this entry.
                      </Alert>
                    )}

                    <Divider />

                    <Stack spacing={1.25}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        Suggested Auto Notes
                      </Typography>

                      <Box
                        sx={{
                          p: 2,
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 3,
                          bgcolor: "background.default",
                          whiteSpace: "pre-wrap",
                          fontFamily: "inherit",
                          fontSize: 14,
                          color: "text.secondary",
                          minHeight: 120,
                        }}
                      >
                        {safeTrim(suggestedAutoNotes) || "No auto context available for this entry."}
                      </Box>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                        <Button
                          variant="outlined"
                          onClick={appendAutoToNotes}
                          disabled={!canEdit || !safeTrim(suggestedAutoNotes)}
                        >
                          Append to Notes
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={replaceNotesWithAuto}
                          disabled={!canEdit || !safeTrim(suggestedAutoNotes)}
                        >
                          Replace Notes with Auto
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </>
          ) : null}
        </Stack>

        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Delete time entry?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              This only deletes the time entry itself. Manual entries can be deleted here. Admin override also allows manual-entry cleanup when needed during payroll support.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={Boolean(saveMsg)}
          autoHideDuration={3000}
          onClose={() => setSaveMsg("")}
          message={saveMsg}
        />
      </AppShell>
    </ProtectedPage>
  );
}