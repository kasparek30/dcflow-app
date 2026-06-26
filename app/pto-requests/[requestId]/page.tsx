// app/pto-requests/[requestId]/page.tsx

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
  writeBatch,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";
import { normalizeCompanyHoliday } from "../../../src/lib/trip-availability";
import {
  applyCrewStaffingImpactAction,
  buildCrewStaffingImpactTrips,
  buildServiceTicketAssignmentFromCrew,
  formatCrewStaffingDateRange,
  getDefaultCrewStaffingActionForImpact,
  getCrewStaffingReplacementRole,
  isReplacementCandidateForImpact,
  type CrewStaffingActionSelection,
  type CrewStaffingImpactTrip,
  type CrewStaffingReplacementCandidate,
  type CrewStaffingTicketLite,
  type CrewStaffingTripLite,
} from "../../../src/lib/crew-staffing-impact";
import type {
  PTORequest,
  PTORequestDayType,
  PTORequestPartialDayType,
} from "../../../src/types/pto-request";

type Props = {
  params: Promise<{ requestId: string }>;
};

type HolidayLite = {
  date: string;
  active: boolean;
};

type TimeEntryLite = {
  id: string;
  employeeId: string;
  entryDate: string;
  category: string;
  source: string;
  notes?: string;
};

type UnavailabilityLite = {
  id: string;
  uid: string;
  date: string;
  type: string;
  source: string;
  ptoRequestId?: string;
  active: boolean;
};

type ImpactActionByTripId = Record<string, CrewStaffingActionSelection>;

type RawUserLite = {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
};

type RawEmployeeProfileLite = {
  userUid: string;
  displayName: string;
  employmentStatus: string;
  laborRole: string;
};

type PtoCandidateRequestLite = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
};

function formatStatus(status: PTORequest["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getStatusChipColor(
  status: PTORequest["status"]
): "default" | "success" | "error" | "warning" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "pending":
      return "warning";
    default:
      return "default";
  }
}

function getStatusIcon(status: PTORequest["status"]) {
  switch (status) {
    case "approved":
      return <CheckCircleRoundedIcon fontSize="small" />;
    case "rejected":
      return <EventBusyRoundedIcon fontSize="small" />;
    case "pending":
      return <HourglassTopRoundedIcon fontSize="small" />;
    default:
      return <InfoRoundedIcon fontSize="small" />;
  }
}

function getWeekdayDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  if (end < start) return [];

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, "0");
      const date = String(cursor.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${date}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function formatTime12h(hhmm?: string | null) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hhRaw) || !Number.isFinite(mmRaw)) return "—";

  const suffix = hhRaw >= 12 ? "PM" : "AM";
  let hh = hhRaw % 12;
  if (hh === 0) hh = 12;

  if (mmRaw === 0) return `${hh}${suffix}`;
  return `${hh}:${String(mmRaw).padStart(2, "0")}${suffix}`;
}

function normalizeRequestDayType(value?: string | null): PTORequestDayType {
  return String(value || "").trim().toLowerCase() === "partial_day"
    ? "partial_day"
    : "full_day";
}

function normalizePartialDayType(value?: string | null): PTORequestPartialDayType {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "am" || normalized === "pm" || normalized === "custom") {
    return normalized;
  }
  return "custom";
}

function buildTimingLabel(request: PTORequest) {
  const requestDayType = normalizeRequestDayType(request.requestDayType);

  if (requestDayType !== "partial_day") {
    return "Full Day";
  }

  const partialDayType = normalizePartialDayType(request.partialDayType);

  if (partialDayType === "am") return "Partial Day • AM";
  if (partialDayType === "pm") return "Partial Day • PM";

  return `Partial Day • ${formatTime12h(request.partialStartTime)}–${formatTime12h(
    request.partialEndTime
  )}`;
}

function normalizeRole(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function ptoRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const rangeAStart = String(aStart || "").trim();
  const rangeAEnd = String(aEnd || aStart || "").trim();
  const rangeBStart = String(bStart || "").trim();
  const rangeBEnd = String(bEnd || bStart || "").trim();

  if (!rangeAStart || !rangeAEnd || !rangeBStart || !rangeBEnd) return false;
  return rangeAStart <= rangeBEnd && rangeBStart <= rangeAEnd;
}

function isCandidateUnavailableDuringRequest(
  candidateUid: string,
  request: PTORequest,
  ptoRequests: PtoCandidateRequestLite[]
) {
  const uid = String(candidateUid || "").trim();
  if (!uid) return false;

  return ptoRequests.some((pto) => {
    if (String(pto.employeeId || "").trim() !== uid) return false;
    if (String(pto.id || "").trim() === request.id) return false;
    if (String(pto.status || "").trim().toLowerCase() !== "approved") return false;
    return ptoRangesOverlap(request.startDate, request.endDate, pto.startDate, pto.endDate);
  });
}

function formatTripTimeRange(start?: string | null, end?: string | null) {
  const startLabel = formatTime12h(start);
  const endLabel = formatTime12h(end);
  if (startLabel === "—" && endLabel === "—") return "No time set";
  return `${startLabel}–${endLabel}`;
}

function getImpactCustomerLabel(impact: CrewStaffingImpactTrip) {
  return (
    String(impact.ticket?.customerDisplayName || "").trim() ||
    String(impact.ticket?.issueSummary || "").trim() ||
    String(impact.trip.link?.projectId || "Project Trip").trim() ||
    "Trip"
  );
}

function encodeImpactAction(action?: CrewStaffingActionSelection | null) {
  if (!action) return "needs_staffing::";
  return [action.type, action.replacementUid || "", action.replacementName || ""].join("::");
}

function decodeImpactAction(value: string): CrewStaffingActionSelection {
  const [type, replacementUid, replacementName] = String(value || "").split("::");
  const safeType =
    type === "remove_worker" ||
    type === "replace_worker" ||
    type === "needs_staffing" ||
    type === "reschedule_trip" ||
    type === "review_only"
      ? type
      : "needs_staffing";

  return {
    type: safeType,
    replacementUid: replacementUid || null,
    replacementName: replacementName || null,
  };
}

export default function PTORequestDetailPage({ params }: Props) {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [requestId, setRequestId] = useState("");
  const [requestItem, setRequestItem] = useState<PTORequest | null>(null);

  const [managerNote, setManagerNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [impactLoading, setImpactLoading] = useState(false);
  const [impactDialogOpen, setImpactDialogOpen] = useState(false);
  const [impactTrips, setImpactTrips] = useState<CrewStaffingImpactTrip[]>([]);
  const [impactActions, setImpactActions] = useState<ImpactActionByTripId>({});
  const [leadReplacementCandidates, setLeadReplacementCandidates] = useState<
    CrewStaffingReplacementCandidate[]
  >([]);
  const [helperReplacementCandidates, setHelperReplacementCandidates] = useState<
    CrewStaffingReplacementCandidate[]
  >([]);

  const canReview =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadRequest() {
      try {
        const resolved = await params;
        const nextId = resolved.requestId;
        setRequestId(nextId);

        const snap = await getDoc(doc(db, "ptoRequests", nextId));

        if (!snap.exists()) {
          setError("PTO request not found.");
          setLoading(false);
          return;
        }

        const data: any = snap.data();

        const nextRequestDayType = normalizeRequestDayType(
          data.requestDayType ??
            (data.partialDayType || data.partialStartTime || data.partialEndTime
              ? "partial_day"
              : "full_day")
        );

        const item: PTORequest = {
          id: snap.id,
          employeeId: data.employeeId ?? "",
          employeeName: data.employeeName ?? "",
          employeeRole: data.employeeRole ?? "",
          startDate: data.startDate ?? "",
          endDate: data.endDate ?? "",
          hoursPerDay: typeof data.hoursPerDay === "number" ? data.hoursPerDay : 8,
          totalRequestedHours:
            typeof data.totalRequestedHours === "number"
              ? data.totalRequestedHours
              : 0,
          status: data.status ?? "pending",
          requestDayType: nextRequestDayType,
          partialDayType:
            nextRequestDayType === "partial_day"
              ? normalizePartialDayType(data.partialDayType)
              : undefined,
          partialStartTime: data.partialStartTime ?? undefined,
          partialEndTime: data.partialEndTime ?? undefined,
          notes: data.notes ?? undefined,
          managerNote: data.managerNote ?? undefined,
          rejectionReason: data.rejectionReason ?? undefined,
          approvedAt: data.approvedAt ?? undefined,
          approvedById: data.approvedById ?? undefined,
          approvedByName: data.approvedByName ?? undefined,
          rejectedAt: data.rejectedAt ?? undefined,
          rejectedById: data.rejectedById ?? undefined,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        };

        setRequestItem(item);
        setManagerNote(item.managerNote ?? "");
        setRejectionReason(item.rejectionReason ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load PTO request.");
      } finally {
        setLoading(false);
      }
    }

    loadRequest();
  }, [params]);

  const weekdayDates = useMemo(() => {
    if (!requestItem) return [];
    return getWeekdayDates(requestItem.startDate, requestItem.endDate);
  }, [requestItem]);

  const timingLabel = useMemo(() => {
    if (!requestItem) return "—";
    return buildTimingLabel(requestItem);
  }, [requestItem]);

  const canTakeAction = useMemo(() => {
    if (!requestItem) return false;
    return canReview && requestItem.status === "pending";
  }, [canReview, requestItem]);

  function getCandidatesForImpact(impact: CrewStaffingImpactTrip) {
    const replacementRole = getCrewStaffingReplacementRole(impact.primaryAffectedPosition);
    const baseCandidates =
      replacementRole === "lead" ? leadReplacementCandidates : helperReplacementCandidates;

    return baseCandidates.filter((candidate) =>
      isReplacementCandidateForImpact(candidate, impact, requestItem?.employeeId || "")
    );
  }

  function getActionOptionsForImpact(impact: CrewStaffingImpactTrip) {
    const candidates = getCandidatesForImpact(impact);
    const replacementRole = getCrewStaffingReplacementRole(impact.primaryAffectedPosition);

    if (impact.isInProgress) {
      return [
        {
          value: encodeImpactAction({ type: "review_only" }),
          label: "Review manually — trip is in progress",
        },
      ];
    }

    const base =
      replacementRole === "lead"
        ? [
            {
              value: encodeImpactAction({ type: "needs_staffing" }),
              label: "Remove lead tech + mark Needs Staffing",
            },
            {
              value: encodeImpactAction({ type: "reschedule_trip" }),
              label: "Remove lead tech + needs reschedule",
            },
          ]
        : [
            {
              value: encodeImpactAction({ type: "remove_worker" }),
              label: "Remove helper",
            },
            {
              value: encodeImpactAction({ type: "needs_staffing" }),
              label: "Remove helper + mark Needs Staffing",
            },
          ];

    const replacementOptions = candidates.map((candidate) => ({
      value: encodeImpactAction({
        type: "replace_worker",
        replacementUid: candidate.uid,
        replacementName: candidate.name,
      }),
      label:
        replacementRole === "lead"
          ? `Replace lead with ${candidate.name}`
          : `Replace helper with ${candidate.name}`,
    }));

    return [...base, ...replacementOptions];
  }

  async function loadPtoImpactReview() {
    if (!requestItem) return null;

    setImpactLoading(true);
    setError("");
    setSaveMsg("");

    try {
      const [tripSnap, usersSnap, profilesSnap, ptoSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "trips"),
            where("date", ">=", requestItem.startDate),
            where("date", "<=", requestItem.endDate)
          )
        ),
        getDocs(query(collection(db, "users"))),
        getDocs(query(collection(db, "employeeProfiles"))),
        getDocs(query(collection(db, "ptoRequests"))),
      ]);

      const trips: CrewStaffingTripLite[] = tripSnap.docs.map((docSnap) => {
        const trip = docSnap.data() as any;
        return {
          id: docSnap.id,
          active: trip.active ?? true,
          type: trip.type ?? "service",
          status: trip.status ?? "planned",
          date: trip.date ?? "",
          timeWindow: trip.timeWindow ?? "custom",
          startTime: trip.startTime ?? "",
          endTime: trip.endTime ?? "",
          crew: trip.crew ?? null,
          link: trip.link ?? null,
          notes: trip.notes ?? null,
        };
      });

      const serviceTicketIds = Array.from(
        new Set(
          trips
            .map((trip) => String(trip.link?.serviceTicketId || "").trim())
            .filter(Boolean)
        )
      );

      const ticketEntries = await Promise.all(
        serviceTicketIds.map(async (serviceTicketId) => {
          const snap = await getDoc(doc(db, "serviceTickets", serviceTicketId));
          if (!snap.exists()) return [serviceTicketId, null] as const;

          const ticket = snap.data() as any;
          return [
            serviceTicketId,
            {
              id: serviceTicketId,
              customerDisplayName: ticket.customerDisplayName ?? null,
              issueSummary: ticket.issueSummary ?? null,
              serviceAddressLine1: ticket.serviceAddressLine1 ?? null,
              serviceCity: ticket.serviceCity ?? null,
              serviceState: ticket.serviceState ?? null,
              status: ticket.status ?? null,
            } satisfies CrewStaffingTicketLite,
          ] as const;
        })
      );

      const ticketsById = Object.fromEntries(ticketEntries);
      const nextImpacts = buildCrewStaffingImpactTrips({
        employeeUid: requestItem.employeeId,
        trips,
        ticketsById,
      });

      const ptoRequests: PtoCandidateRequestLite[] = ptoSnap.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          employeeId: String(data.employeeId || "").trim(),
          startDate: String(data.startDate || "").trim(),
          endDate: String(data.endDate || data.startDate || "").trim(),
          status: String(data.status || "pending").trim().toLowerCase(),
        };
      });

      const rawUsers: RawUserLite[] = usersSnap.docs.map((docSnap) => {
        const user = docSnap.data() as any;
        return {
          uid: String(user.uid || docSnap.id).trim(),
          displayName: String(user.displayName || user.name || "Unnamed").trim(),
          role: String(user.role || "").trim(),
          active: Boolean(user.active ?? true),
        };
      });

      const rawProfiles: RawEmployeeProfileLite[] = profilesSnap.docs.map((docSnap) => {
        const profile = docSnap.data() as any;
        return {
          userUid: String(profile.userUid || "").trim(),
          displayName: String(profile.displayName || "Unnamed").trim(),
          employmentStatus: String(profile.employmentStatus || "current").trim(),
          laborRole: String(profile.laborRole || "").trim(),
        };
      });

      const nextLeadCandidates: CrewStaffingReplacementCandidate[] = rawUsers
        .filter((user) => user.active)
        .filter((user) => {
          const role = normalizeRole(user.role);
          return role === "technician" || role === "manager";
        })
        .map((user) => ({
          uid: user.uid,
          name: user.displayName,
          role: "lead" as const,
          unavailable: isCandidateUnavailableDuringRequest(user.uid, requestItem, ptoRequests),
          unavailableReason: "Approved PTO",
        }))
        .filter((candidate) => candidate.uid !== requestItem.employeeId)
        .sort((a, b) => a.name.localeCompare(b.name));

      const nextHelperCandidates: CrewStaffingReplacementCandidate[] = rawProfiles
        .filter(
          (profile) =>
            normalizeRole(profile.employmentStatus || "current") === "current" &&
            (normalizeRole(profile.laborRole) === "helper" ||
              normalizeRole(profile.laborRole) === "apprentice")
        )
        .map((profile) => ({
          uid: profile.userUid,
          name: profile.displayName,
          role: "helper" as const,
          unavailable: isCandidateUnavailableDuringRequest(profile.userUid, requestItem, ptoRequests),
          unavailableReason: "Approved PTO",
        }))
        .filter((candidate) => Boolean(candidate.uid) && candidate.uid !== requestItem.employeeId)
        .sort((a, b) => a.name.localeCompare(b.name));

      const nextActions: ImpactActionByTripId = {};
      for (const impact of nextImpacts) {
        nextActions[impact.trip.id] = getDefaultCrewStaffingActionForImpact(impact);
      }

      setImpactTrips(nextImpacts);
      setImpactActions(nextActions);
      setLeadReplacementCandidates(nextLeadCandidates);
      setHelperReplacementCandidates(nextHelperCandidates);

      return nextImpacts;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to review affected trips.");
      return null;
    } finally {
      setImpactLoading(false);
    }
  }

  async function handleApprove() {
    if (!requestItem || !appUser?.uid) return;

    const impacts = await loadPtoImpactReview();
    if (!impacts) return;

    if (impacts.length > 0) {
      setImpactDialogOpen(true);
      return;
    }

    await approvePtoRequestWithImpactActions({});
  }

  async function handleApproveImpactConfirmed() {
    await approvePtoRequestWithImpactActions(impactActions);
  }

  async function approvePtoRequestWithImpactActions(
    impactActionsToApply: ImpactActionByTripId = {}
  ) {
    if (!requestItem || !appUser?.uid) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      const [holidaySnap, timeEntriesSnap, unavailSnap] = await Promise.all([
        getDocs(query(collection(db, "companyHolidays"))),
        getDocs(query(collection(db, "timeEntries"))),
        getDocs(query(collection(db, "employeeUnavailability"))),
      ]);

      const holidays: HolidayLite[] = holidaySnap.docs
        .map((docSnap) => normalizeCompanyHoliday(docSnap.data(), docSnap.id))
        .filter((item): item is { id: string; date: string; name: string; active: boolean } => Boolean(item))
        .map((item) => ({
          date: item.date,
          active: item.active,
        }));

      const activeHolidayDates = new Set(
        holidays.filter((h) => h.active).map((h) => h.date)
      );

      const allTimeEntries: TimeEntryLite[] = timeEntriesSnap.docs.map((docSnap) => {
        const data: any = docSnap.data();
        return {
          id: docSnap.id,
          employeeId: data.employeeId ?? "",
          entryDate: data.entryDate ?? "",
          category: data.category ?? "",
          source: data.source ?? "",
          notes: data.notes ?? undefined,
        };
      });

      const allUnavailability: UnavailabilityLite[] = unavailSnap.docs.map((docSnap) => {
        const data: any = docSnap.data();
        return {
          id: docSnap.id,
          uid: data.uid ?? "",
          date: data.date ?? "",
          type: data.type ?? "",
          source: data.source ?? "",
          ptoRequestId: data.ptoRequestId ?? undefined,
          active: data.active ?? true,
        };
      });

      let createdTimeEntryCount = 0;
      let createdUnavailabilityCount = 0;

      for (const entryDate of weekdayDates) {
        if (activeHolidayDates.has(entryDate)) continue;

        const notesPrefix = `AUTO_PTO:${requestItem.id}:${entryDate}`;

        const alreadyHasTimeEntry = allTimeEntries.find((entry) => {
          if (entry.employeeId !== requestItem.employeeId) return false;
          if (entry.entryDate !== entryDate) return false;
          if (entry.category !== "pto") return false;
          if (entry.source !== "system_generated_pto") return false;
          return (entry.notes ?? "").startsWith(notesPrefix);
        });

        if (!alreadyHasTimeEntry) {
          const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

          const newDoc = await addDoc(collection(db, "timeEntries"), {
            employeeId: requestItem.employeeId,
            employeeName: requestItem.employeeName,
            employeeRole: requestItem.employeeRole,
            laborRoleType: null,

            entryDate,
            weekStartDate,
            weekEndDate,

            category: "pto",
            hours: requestItem.hoursPerDay,
            payType: "pto",
            billable: false,
            source: "system_generated_pto",

            serviceTicketId: null,
            projectId: null,
            projectStageKey: null,

            linkedTechnicianId: null,
            linkedTechnicianName: null,

            notes: `${notesPrefix} • Approved PTO request • ${timingLabel}`,
            timesheetId: null,

            entryStatus: "draft",

            createdAt: nowIso,
            updatedAt: nowIso,
          } as any);

          allTimeEntries.push({
            id: newDoc.id,
            employeeId: requestItem.employeeId,
            entryDate,
            category: "pto",
            source: "system_generated_pto",
            notes: `${notesPrefix} • Approved PTO request • ${timingLabel}`,
          });

          createdTimeEntryCount += 1;
        }

        const alreadyHasUnavailability = allUnavailability.find((u) => {
          if (u.uid !== requestItem.employeeId) return false;
          if (u.date !== entryDate) return false;
          if (u.active === false) return false;

          if ((u.ptoRequestId || "") === requestItem.id) return true;

          if (
            u.type === "pto" &&
            (u.source === "pto_request_approved" || u.source === "admin_override")
          ) {
            return true;
          }

          return false;
        });

        if (!alreadyHasUnavailability) {
          const employeeName = requestItem.employeeName || "Unknown";
          const approverName = appUser.displayName || "Unknown Approver";

          const unavailDoc = await addDoc(collection(db, "employeeUnavailability"), {
            uid: requestItem.employeeId,
            displayName: employeeName,

            date: entryDate,
            type: "pto",
            reason: (managerNote.trim() || requestItem.notes || "").trim() || null,

            requestDayType:
              normalizeRequestDayType(requestItem.requestDayType) || "full_day",
            partialDayType:
              normalizeRequestDayType(requestItem.requestDayType) === "partial_day"
                ? normalizePartialDayType(requestItem.partialDayType)
                : null,
            startTime:
              normalizeRequestDayType(requestItem.requestDayType) === "partial_day"
                ? requestItem.partialStartTime || null
                : null,
            endTime:
              normalizeRequestDayType(requestItem.requestDayType) === "partial_day"
                ? requestItem.partialEndTime || null
                : null,
            hours: requestItem.hoursPerDay,

            source: "pto_request_approved",
            ptoRequestId: requestItem.id,

            active: true,
            createdAt: nowIso,
            createdByUid: appUser.uid,
            createdByName: approverName,

            updatedAt: nowIso,
            updatedByUid: appUser.uid,
            updatedByName: approverName,
          } as any);

          allUnavailability.push({
            id: unavailDoc.id,
            uid: requestItem.employeeId,
            date: entryDate,
            type: "pto",
            source: "pto_request_approved",
            ptoRequestId: requestItem.id,
            active: true,
          });

          createdUnavailabilityCount += 1;
        }
      }

      let updatedTripCount = 0;
      let flaggedTripCount = 0;

      if (impactTrips.length > 0) {
        const batch = writeBatch(db);
        let batchHasWrites = false;
        const dateRangeLabel = formatCrewStaffingDateRange(
          requestItem.startDate,
          requestItem.endDate
        );

        for (const impact of impactTrips) {
          const action =
            impactActionsToApply[impact.trip.id] ||
            getDefaultCrewStaffingActionForImpact(impact);

          const result = applyCrewStaffingImpactAction({
            trip: impact.trip,
            employeeUid: requestItem.employeeId,
            employeeName: requestItem.employeeName,
            action,
            approvedPtoRequestId: requestItem.id,
            approvedPtoDateRange: dateRangeLabel,
            updatedAt: nowIso,
          });

          const tripRef = doc(db, "trips", impact.trip.id);
          batch.update(tripRef, {
            crew: result.nextCrew,
            crewConfirmed: null,
            staffingStatus: result.staffingStatus,
            staffingIssue: result.staffingIssue,
            updatedAt: nowIso,
            updatedByUid: appUser.uid,
          });
          batchHasWrites = true;
          updatedTripCount += 1;
          if (result.needsStaffing) flaggedTripCount += 1;

          const serviceTicketId = String(impact.trip.link?.serviceTicketId || "").trim();
          if (serviceTicketId) {
            const ticketRef = doc(db, "serviceTickets", serviceTicketId);
            batch.update(ticketRef, {
              ...buildServiceTicketAssignmentFromCrew(result.nextCrew),
              staffingStatus: result.staffingStatus,
              staffingIssue: result.staffingIssue,
              updatedAt: nowIso,
              updatedByUid: appUser.uid,
            });

            const activityRef = doc(
              collection(db, "serviceTickets", serviceTicketId, "activity")
            );
            batch.set(activityRef, {
              type: "pto_staffing_impact_review",
              title: "PTO Staffing Update",
              description: `${requestItem.employeeName} was approved for PTO and this trip was reviewed for staffing impact.`,
              details: result.activityDetails,
              createdAt: nowIso,
              createdByUid: appUser.uid,
              createdByName: appUser.displayName || "Unknown Approver",
              createdByRole: appUser.role || null,
            });
          }
        }

        if (batchHasWrites) {
          await batch.commit();
        }
      }

      await updateDoc(doc(db, "ptoRequests", requestItem.id), {
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || null,
        rejectionReason: null,
        updatedAt: nowIso,
      });

      setRequestItem({
        ...requestItem,
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || undefined,
        rejectionReason: undefined,
        updatedAt: nowIso,
      });

      setImpactDialogOpen(false);

      setSaveMsg(
        `PTO request approved. Created ${createdTimeEntryCount} PTO time entr${
          createdTimeEntryCount === 1 ? "y" : "ies"
        }, ${createdUnavailabilityCount} unavailability block${
          createdUnavailabilityCount === 1 ? "" : "s"
        }, and reviewed ${updatedTripCount} affected trip${
          updatedTripCount === 1 ? "" : "s"
        }${flaggedTripCount > 0 ? ` (${flaggedTripCount} flagged for staffing)` : ""}.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve PTO request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!requestItem || !appUser?.uid) return;

    if (!rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "ptoRequests", requestItem.id), {
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || null,
        updatedAt: nowIso,
      });

      setRequestItem({
        ...requestItem,
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveMsg("PTO request rejected.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject PTO request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="PTO Request Detail">
      <AppShell appUser={appUser}>
        <Dialog
          open={impactDialogOpen}
          onClose={() => {
            if (!saving) setImpactDialogOpen(false);
          }}
          fullWidth
          maxWidth="lg"
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Approve PTO & Review Affected Trips
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Review planned and in-progress trips before this PTO becomes final.
                </Typography>
              </Box>

              <Chip
                color="warning"
                icon={<ScheduleRoundedIcon />}
                label={`${impactTrips.length} affected trip${impactTrips.length === 1 ? "" : "s"}`}
                sx={{ borderRadius: 999, fontWeight: 700 }}
              />
            </Stack>
          </DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="info" icon={<InfoRoundedIcon />}>
                {requestItem?.employeeName || "This employee"} is assigned to {impactTrips.length} open trip
                {impactTrips.length === 1 ? "" : "s"} during this PTO period. Choose how DCFlow should update each trip before approving.
              </Alert>

              <Box
                sx={{
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "1fr 1fr 1fr",
                  },
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Typography variant="h4" sx={{ fontWeight: 850 }}>
                    {impactTrips.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    affected trips
                  </Typography>
                </Paper>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Typography variant="h4" sx={{ fontWeight: 850 }}>
                    {impactTrips.filter((impact) => impact.isInProgress).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    in-progress review only
                  </Typography>
                </Paper>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Typography variant="h4" sx={{ fontWeight: 850 }}>
                    {leadReplacementCandidates.filter((c) => !c.unavailable).length +
                      helperReplacementCandidates.filter((c) => !c.unavailable).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    available replacements
                  </Typography>
                </Paper>
              </Box>

              <Stack spacing={1.25}>
                {impactTrips.map((impact) => {
                  const selectedAction =
                    impactActions[impact.trip.id] ||
                    getDefaultCrewStaffingActionForImpact(impact);
                  const options = getActionOptionsForImpact(impact);

                  return (
                    <Paper
                      key={impact.trip.id}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: impact.isInProgress
                          ? alpha(theme.palette.warning.main, 0.06)
                          : theme.palette.background.paper,
                      }}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: "1fr 1.15fr 1.5fr",
                          },
                          alignItems: "center",
                        }}
                      >
                        <Stack spacing={0.5}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                            {impact.trip.date || "No date"} • {formatTripTimeRange(impact.trip.startTime, impact.trip.endTime)}
                          </Typography>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip
                              size="small"
                              label={impact.affectedRoleLabel}
                              color={getCrewStaffingReplacementRole(impact.primaryAffectedPosition) === "lead" ? "primary" : "default"}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              size="small"
                              label={impact.status || "planned"}
                              color={impact.isInProgress ? "warning" : "default"}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                          </Stack>
                        </Stack>

                        <Stack spacing={0.35}>
                          <Typography variant="body2" sx={{ fontWeight: 750 }}>
                            {getImpactCustomerLabel(impact)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Lead: {impact.trip.crew?.primaryTechName || "None"} • Helper: {impact.trip.crew?.helperName || "None"}
                          </Typography>
                        </Stack>

                        <FormControl fullWidth size="small">
                          <InputLabel>Staffing Action</InputLabel>
                          <Select
                            label="Staffing Action"
                            value={encodeImpactAction(selectedAction)}
                            onChange={(event: SelectChangeEvent) => {
                              const nextAction = decodeImpactAction(event.target.value);
                              setImpactActions((prev) => ({
                                ...prev,
                                [impact.trip.id]: nextAction,
                              }));
                            }}
                            disabled={saving}
                          >
                            {options.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => setImpactDialogOpen(false)}
              disabled={saving}
              sx={{ borderRadius: 999 }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="contained"
              onClick={handleApproveImpactConfirmed}
              disabled={saving || impactLoading}
              startIcon={<CheckCircleRoundedIcon />}
              sx={{ borderRadius: 999 }}
            >
              {saving ? "Saving..." : "Approve PTO & Update Trips"}
            </Button>
          </DialogActions>
        </Dialog>

        <Box sx={{ maxWidth: 1200, mx: "auto", pb: 4 }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 3 },
                borderRadius: 5,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems={{ xs: "flex-start", md: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.4 }}>
                    PTO Request Detail
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
                    Review the request, verify generated PTO dates, and approve or reject
                    when ready.
                  </Typography>
                </Box>

                <Button
                  component={Link}
                  href="/pto-requests"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{ borderRadius: 999 }}
                >
                  Back to PTO Requests
                </Button>
              </Stack>
            </Paper>

            {loading ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 4,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Loading PTO request...
                </Typography>
              </Paper>
            ) : null}

            {error ? (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {error}
              </Alert>
            ) : null}

            {saveMsg ? (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                {saveMsg}
              </Alert>
            ) : null}

            {!loading && requestItem ? (
              <>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  useFlexGap
                  flexWrap="wrap"
                >
                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.primary.main, 0.06),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <PersonRoundedIcon sx={{ color: "primary.main" }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Employee
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {requestItem.employeeName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {requestItem.employeeRole}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.warning.main, 0.06),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <CalendarMonthRoundedIcon sx={{ color: "warning.main" }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Date Range
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {requestItem.startDate} → {requestItem.endDate}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.secondary.main, 0.06),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <ScheduleRoundedIcon sx={{ color: "secondary.main" }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Requested Hours
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {requestItem.totalRequestedHours.toFixed(2)} total
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {requestItem.hoursPerDay.toFixed(2)} hrs/day
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor:
                        requestItem.status === "approved"
                          ? alpha(theme.palette.success.main, 0.07)
                          : requestItem.status === "rejected"
                            ? alpha(theme.palette.error.main, 0.07)
                            : alpha(theme.palette.warning.main, 0.07),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {getStatusIcon(requestItem.status)}
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Status
                        </Typography>
                        <Chip
                          label={formatStatus(requestItem.status)}
                          color={getStatusChipColor(requestItem.status)}
                          size="small"
                          sx={{ mt: 0.5, borderRadius: 999, fontWeight: 600 }}
                        />
                      </Box>
                    </Stack>
                  </Paper>
                </Stack>

                <Stack direction={{ xs: "column", xl: "row" }} spacing={3} alignItems="stretch">
                  <Stack spacing={3} sx={{ flex: 1.05, minWidth: 0 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: { xs: 2, md: 3 },
                        borderRadius: 5,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                      }}
                    >
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Request Overview
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Core PTO request details and tracking metadata.
                          </Typography>
                        </Box>

                        <Divider />

                        <Stack spacing={1.25}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                          >
                            <Chip
                              icon={<PersonRoundedIcon />}
                              label={`${requestItem.employeeName} (${requestItem.employeeRole})`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<CalendarMonthRoundedIcon />}
                              label={`${requestItem.startDate} → ${requestItem.endDate}`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<ScheduleRoundedIcon />}
                              label={`${requestItem.hoursPerDay.toFixed(2)} hrs/day`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<EventAvailableRoundedIcon />}
                              label={`${requestItem.totalRequestedHours.toFixed(2)} total hrs`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<AccessTimeRoundedIcon />}
                              label={timingLabel}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                          </Stack>

                          <Typography variant="body2" color="text.secondary">
                            PTO Request ID: {requestId}
                          </Typography>

                          {requestItem.approvedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              Approved at: {requestItem.approvedAt}
                            </Typography>
                          ) : null}

                          {requestItem.approvedByName ? (
                            <Typography variant="body2" color="text.secondary">
                              Approved by: {requestItem.approvedByName}
                            </Typography>
                          ) : null}

                          {requestItem.rejectedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              Rejected at: {requestItem.rejectedAt}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Stack>
                    </Paper>

                    <Paper
                      elevation={0}
                      sx={{
                        p: { xs: 2, md: 3 },
                        borderRadius: 5,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                      }}
                    >
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            PTO Dates That Will Generate
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            These weekday dates are eligible for PTO generation from this request.
                          </Typography>
                        </Box>

                        <Divider />

                        {weekdayDates.length === 0 ? (
                          <Paper
                            elevation={0}
                            sx={{
                              p: 2,
                              borderRadius: 3,
                              border: `1px dashed ${theme.palette.divider}`,
                              backgroundColor: alpha(theme.palette.text.primary, 0.02),
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              No weekdays fall within this request range.
                            </Typography>
                          </Paper>
                        ) : (
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                          >
                            {weekdayDates.map((date) => (
                              <Chip
                                key={date}
                                icon={<CalendarMonthRoundedIcon />}
                                label={`${date} • ${requestItem.hoursPerDay.toFixed(
                                  2
                                )} hr • ${timingLabel}`}
                                variant="outlined"
                                sx={{ borderRadius: 999 }}
                              />
                            ))}
                          </Stack>
                        )}

                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.info.main, 0.06),
                          }}
                        >
                          <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <InfoRoundedIcon sx={{ color: "info.main", mt: "2px" }} />
                            <Typography variant="body2" color="text.secondary">
                              Weekends are skipped. Active company holidays are also skipped to
                              avoid double-counting PTO and holiday pay on the same day.
                            </Typography>
                          </Stack>
                        </Paper>
                      </Stack>
                    </Paper>

                    {requestItem.notes ? (
                      <Paper
                        elevation={0}
                        sx={{
                          p: { xs: 2, md: 3 },
                          borderRadius: 5,
                          border: `1px solid ${theme.palette.divider}`,
                          backgroundColor: theme.palette.background.paper,
                        }}
                      >
                        <Stack spacing={2}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Employee Note
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              Additional context provided by the employee.
                            </Typography>
                          </Box>

                          <Divider />

                          <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <NotesRoundedIcon
                              sx={{ color: "text.secondary", mt: "2px", flexShrink: 0 }}
                            />
                            <Typography
                              variant="body1"
                              sx={{ whiteSpace: "pre-wrap", color: "text.primary" }}
                            >
                              {requestItem.notes}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    ) : null}
                  </Stack>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: 0.95,
                      p: { xs: 2, md: 3 },
                      borderRadius: 5,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: theme.palette.background.paper,
                      minWidth: 0,
                    }}
                  >
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          Manager Review
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Add review notes and approve or reject this PTO request.
                        </Typography>
                      </Box>

                      <Divider />

                      <TextField
                        label="Manager Note"
                        value={managerNote}
                        onChange={(e) => setManagerNote(e.target.value)}
                        multiline
                        minRows={5}
                        disabled={!canTakeAction || saving}
                        fullWidth
                        placeholder="Optional internal note for context or documentation"
                      />

                      <TextField
                        label="Rejection Reason"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        multiline
                        minRows={4}
                        disabled={!canTakeAction || saving}
                        fullWidth
                        placeholder="Required when rejecting this request"
                      />

                      {requestItem.managerNote && !canTakeAction ? (
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.secondary.main, 0.05),
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                            Saved Manager Note
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ whiteSpace: "pre-wrap" }}
                          >
                            {requestItem.managerNote}
                          </Typography>
                        </Paper>
                      ) : null}

                      {requestItem.rejectionReason ? (
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.error.main, 0.05),
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                            Rejection Reason
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ whiteSpace: "pre-wrap" }}
                          >
                            {requestItem.rejectionReason}
                          </Typography>
                        </Paper>
                      ) : null}

                      {canTakeAction ? (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                          <Button
                            type="button"
                            onClick={handleApprove}
                            disabled={saving}
                            variant="contained"
                            startIcon={<CheckCircleRoundedIcon />}
                            size="large"
                            sx={{ borderRadius: 999, px: 2.5 }}
                          >
                            {saving ? "Saving..." : "Approve PTO Request"}
                          </Button>

                          <Button
                            type="button"
                            onClick={handleReject}
                            disabled={saving}
                            variant="outlined"
                            color="error"
                            startIcon={<CloseRoundedIcon />}
                            size="large"
                            sx={{ borderRadius: 999, px: 2.5 }}
                          >
                            {saving ? "Saving..." : "Reject PTO Request"}
                          </Button>
                        </Stack>
                      ) : (
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.text.primary, 0.04),
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Review Locked
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            This request is no longer in a pending state, or your role does not
                            have review permission.
                          </Typography>
                        </Paper>
                      )}
                    </Stack>
                  </Paper>
                </Stack>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}