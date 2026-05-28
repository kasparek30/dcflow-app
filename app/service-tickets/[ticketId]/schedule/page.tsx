// app/service-tickets/[ticketId]/schedule/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import DispatchAvailabilityPlanner, {
  type PlannerCrewSummary,
  type PlannerCrewSummaryReason,
  type PlannerSlotStatus,
  type PlannerSlotStatusKind,
  type TripTimeWindow,
} from "../../../../components/DispatchAvailabilityPlanner";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import { normalizeCompanyHoliday } from "../../../../src/lib/trip-availability";

type Props = {
  params: Promise<{ ticketId: string }>;
};

type TicketStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "invoiced"
  | "cancelled";

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

type TripLinkLite = {
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TicketLite = {
  id: string;
  status: TicketStatus;
  customerDisplayName: string;
  issueSummary: string;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: string;
};

type HelperOption = {
  uid: string;
  name: string;
  laborRole: string;
  defaultPairedTechUid?: string | null;
};

type PtoRequestLite = {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  hoursPerDay?: number;
  requestDayType?: "full_day" | "partial_day";
  partialDayType?: "am" | "pm" | "custom" | null;
  partialStartTime?: string | null;
  partialEndTime?: string | null;
};

type CompanyHolidayLite = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

type DispatchOverrideInfo = {
  enabled: boolean;
  reason?: string | null;
  createdAt?: string;
  createdByUid?: string | null;
  createdByName?: string | null;
  conflictTypes?: string[];
  conflictTripIds?: string[];
};

type TripDocLite = {
  id: string;
  active: boolean;
  type?: string | null;
  status: string;
  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;
  crew?: TripCrew | null;
  timerState?: string | null;
  dispatchOverride?: DispatchOverrideInfo | null;
  link?: TripLinkLite | null;
  previewTitle?: string | null;
  previewSubtitle?: string | null;
  estimatedDurationMinutes?: number | null;
};

type SelectedOverlapConflict = {
  memberUid: string;
  memberName: string;
  tripId: string;
  tripType: "service" | "project" | "trip";
  previewTitle: string;
  previewSubtitle?: string;
  estimatedDurationLabel: string;
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

function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDayShort(iso: string) {
  return parseIsoDate(iso)
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
}

function formatMonthDay(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isWeekend(iso: string) {
  const day = parseIsoDate(iso).getDay();
  return day === 0 || day === 6;
}

function firstBusinessDayOnOrAfter(iso: string) {
  let cursor = iso;
  while (isWeekend(cursor)) {
    cursor = addDaysIso(cursor, 1);
  }
  return cursor;
}

function addDaysIso(iso: string, delta: number) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + delta);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNextBusinessDays(startIso: string, count: number) {
  const out: string[] = [];
  let cursor = firstBusinessDayOnOrAfter(startIso);

  while (out.length < count) {
    if (!isWeekend(cursor)) {
      out.push(cursor);
    }
    cursor = addDaysIso(cursor, 1);
  }

  return out;
}

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTripType(value?: string | null): "service" | "project" | "trip" {
  const normalized = normalizeStatus(value);
  if (normalized === "project") return "project";
  if (normalized === "service") return "service";
  return "trip";
}

function normalizeRequestDayType(value?: string | null): "full_day" | "partial_day" {
  return String(value || "").trim().toLowerCase() === "partial_day"
    ? "partial_day"
    : "full_day";
}

function normalizePartialDayType(value?: string | null): "am" | "pm" | "custom" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "am" || normalized === "pm" || normalized === "custom") {
    return normalized;
  }
  return "custom";
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

function windowToTimes(window: TripTimeWindow) {
  if (window === "am") return { start: "08:00", end: "12:00" };
  if (window === "pm") return { start: "13:00", end: "17:00" };
  if (window === "all_day") return { start: "08:00", end: "17:00" };
  return { start: "09:00", end: "10:00" };
}

function formatTime12h(hhmm?: string | null) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map((x) => Number(x));
  let hh = hhRaw;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mmRaw === 0) return `${hh}${ampm}`;
  return `${hh}:${String(mmRaw).padStart(2, "0")}${ampm}`;
}

function toMinutes(hhmm?: string | null) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function formatEstimatedDurationLabel(minutes?: number | null) {
  const safeMinutes = Number(minutes || 0);
  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) return "—";

  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours = safeMinutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  return `${hours.toFixed(1)} hrs`;
}

function getMinutesBetween(startTime?: string | null, endTime?: string | null) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function formatStageKey(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isTicketTerminal(status?: string) {
  const s = normalizeStatus(status);
  return s === "completed" || s === "cancelled" || s === "invoiced";
}

function isOpenTripStatus(status?: string) {
  const s = normalizeStatus(status);
  return s === "planned" || s === "in_progress";
}

function hasOpenTrips(trips: TripDocLite[]) {
  return trips.some((trip) => trip.active !== false && isOpenTripStatus(trip.status));
}

function tripHasCrewUid(trip: TripDocLite, uid: string) {
  if (!uid) return false;
  return (
    trip.crew?.primaryTechUid === uid ||
    trip.crew?.helperUid === uid ||
    trip.crew?.secondaryTechUid === uid ||
    trip.crew?.secondaryHelperUid === uid
  );
}

function getRangeForWindow(args: {
  timeWindow: TripTimeWindow;
  startTime?: string;
  endTime?: string;
}) {
  if (args.timeWindow === "custom") {
    return {
      start: String(args.startTime || ""),
      end: String(args.endTime || ""),
    };
  }

  return windowToTimes(args.timeWindow);
}

function getTripRange(trip: TripDocLite) {
  const timeWindow = String(trip.timeWindow || "").toLowerCase();
  if (timeWindow === "am") return windowToTimes("am");
  if (timeWindow === "pm") return windowToTimes("pm");
  if (timeWindow === "all_day") return windowToTimes("all_day");
  return {
    start: String(trip.startTime || ""),
    end: String(trip.endTime || ""),
  };
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

function dateFallsWithinPto(date: string, request: PtoRequestLite) {
  return date >= request.startDate && date <= request.endDate;
}

function buildReason(
  kind: PlannerSlotStatusKind,
  label: string,
  detail: string
): PlannerCrewSummaryReason {
  return { kind, label, detail };
}

function getPtoRangeForRequest(request: PtoRequestLite) {
  const requestDayType = normalizeRequestDayType(request.requestDayType);

  if (requestDayType !== "partial_day") {
    return {
      start: "00:00",
      end: "23:59",
      label: "All Day",
    };
  }

  const partialDayType = normalizePartialDayType(request.partialDayType);

  if (partialDayType === "am") {
    const times = windowToTimes("am");
    return {
      start: times.start,
      end: times.end,
      label: `${formatTime12h(times.start)}–${formatTime12h(times.end)}`,
    };
  }

  if (partialDayType === "pm") {
    const times = windowToTimes("pm");
    return {
      start: times.start,
      end: times.end,
      label: `${formatTime12h(times.start)}–${formatTime12h(times.end)}`,
    };
  }

  const start = String(request.partialStartTime || "").trim();
  const end = String(request.partialEndTime || "").trim();

  if (getMinutesBetween(start, end) > 0) {
    return {
      start,
      end,
      label: `${formatTime12h(start)}–${formatTime12h(end)}`,
    };
  }

  return {
    start: "00:00",
    end: "23:59",
    label: "All Day",
  };
}

function ptoBlocksSelection(args: {
  request: PtoRequestLite;
  date: string;
  timeWindow: TripTimeWindow;
  startTime: string;
  endTime: string;
}) {
  if (!dateFallsWithinPto(args.date, args.request)) return false;

  const requestDayType = normalizeRequestDayType(args.request.requestDayType);
  if (requestDayType !== "partial_day") return true;

  const requestRange = getPtoRangeForRequest(args.request);
  const selectedRange = getRangeForWindow({
    timeWindow: args.timeWindow,
    startTime: args.startTime,
    endTime: args.endTime,
  });

  return rangesOverlap(
    selectedRange.start,
    selectedRange.end,
    requestRange.start,
    requestRange.end
  );
}

function buildPtoDetailLabel(request: PtoRequestLite) {
  return getPtoRangeForRequest(request).label;
}

function getTripEstimatedDurationMinutes(trip: TripDocLite) {
  const stored = Number(trip.estimatedDurationMinutes);
  if (Number.isFinite(stored) && stored > 0) {
    return stored;
  }

  const range = getTripRange(trip);
  return getMinutesBetween(range.start, range.end);
}

function mapTripDocLite(id: string, trip: any): TripDocLite {
  return {
    id,
    active: trip.active ?? true,
    type: String(trip.type || ""),
    status: String(trip.status || ""),
    date: String(trip.date || ""),
    timeWindow: String(trip.timeWindow || "custom"),
    startTime: String(trip.startTime || ""),
    endTime: String(trip.endTime || ""),
    crew: (trip.crew || null) as TripCrew | null,
    timerState: trip.timerState ?? null,
    dispatchOverride: (trip.dispatchOverride || null) as DispatchOverrideInfo | null,
    link: (trip.link || null) as TripLinkLite | null,
    previewTitle: trip.previewTitle ?? null,
    previewSubtitle: trip.previewSubtitle ?? null,
    estimatedDurationMinutes:
      typeof trip.estimatedDurationMinutes === "number"
        ? trip.estimatedDurationMinutes
        : null,
  };
}

async function hydrateTripPreviewData(items: TripDocLite[]) {
  const serviceCache = new Map<string, { title?: string | null; subtitle?: string | null }>();
  const projectCache = new Map<string, { title?: string | null; subtitle?: string | null }>();

  return Promise.all(
    items.map(async (item) => {
      let previewTitle = String(item.previewTitle || "").trim();
      let previewSubtitle = String(item.previewSubtitle || "").trim();

      if (!previewTitle && item.link?.serviceTicketId) {
        const serviceTicketId = String(item.link.serviceTicketId).trim();

        if (serviceTicketId) {
          if (!serviceCache.has(serviceTicketId)) {
            try {
              const snap = await getDoc(doc(db, "serviceTickets", serviceTicketId));
              if (snap.exists()) {
                const data: any = snap.data();
                serviceCache.set(serviceTicketId, {
                  title: String(data.customerDisplayName || "Service Trip").trim(),
                  subtitle: String(data.issueSummary || "").trim() || null,
                });
              } else {
                serviceCache.set(serviceTicketId, {});
              }
            } catch {
              serviceCache.set(serviceTicketId, {});
            }
          }

          const cached = serviceCache.get(serviceTicketId);
          previewTitle = String(cached?.title || "").trim();
          previewSubtitle = String(cached?.subtitle || "").trim();
        }
      }

      if (!previewTitle && item.link?.projectId) {
        const projectId = String(item.link.projectId).trim();

        if (projectId) {
          if (!projectCache.has(projectId)) {
            try {
              const snap = await getDoc(doc(db, "projects", projectId));
              if (snap.exists()) {
                const data: any = snap.data();
                projectCache.set(projectId, {
                  title: String(
                    data.projectName ||
                      data.name ||
                      data.title ||
                      data.customerDisplayName ||
                      "Project"
                  ).trim(),
                  subtitle:
                    String(
                      data.description ||
                        data.projectType ||
                        formatStageKey(item.link?.projectStageKey) ||
                        ""
                    ).trim() || null,
                });
              } else {
                projectCache.set(projectId, {});
              }
            } catch {
              projectCache.set(projectId, {});
            }
          }

          const cached = projectCache.get(projectId);
          previewTitle = String(cached?.title || "").trim();
          previewSubtitle = String(cached?.subtitle || "").trim();
        }
      }

      const tripType = normalizeTripType(item.type);

      if (!previewTitle) {
        previewTitle =
          tripType === "project"
            ? "Project Trip"
            : tripType === "service"
              ? "Service Trip"
              : "Trip";
      }

      if (!previewSubtitle && tripType === "project" && item.link?.projectStageKey) {
        previewSubtitle = formatStageKey(item.link.projectStageKey);
      }

      return {
        ...item,
        previewTitle,
        previewSubtitle: previewSubtitle || null,
        estimatedDurationMinutes:
          item.estimatedDurationMinutes ?? getTripEstimatedDurationMinutes(item),
      };
    })
  );
}

function analyzeMemberAvailability(args: {
  uid: string;
  name: string;
  date: string;
  timeWindow: TripTimeWindow;
  startTime: string;
  endTime: string;
  holidays: CompanyHolidayLite[];
  ptoRequests: PtoRequestLite[];
  dayTrips: TripDocLite[];
  holidayOverrideEnabled: boolean;
}) {
  const reasons: PlannerCrewSummaryReason[] = [];

  const approvedPto = args.ptoRequests.find(
    (request) =>
      request.employeeId === args.uid &&
      request.status === "approved" &&
      ptoBlocksSelection({
        request,
        date: args.date,
        timeWindow: args.timeWindow,
        startTime: args.startTime,
        endTime: args.endTime,
      })
  );

  if (approvedPto) {
    reasons.push(
      buildReason(
        "approved_pto",
        "Approved PTO",
        buildPtoDetailLabel(approvedPto)
      )
    );
  }

  const selectedRange = getRangeForWindow({
    timeWindow: args.timeWindow,
    startTime: args.startTime,
    endTime: args.endTime,
  });

  const overlappingTrips = args.dayTrips.filter((trip) => {
    if (trip.active === false) return false;
    if (!isOpenTripStatus(trip.status)) return false;
    if (!tripHasCrewUid(trip, args.uid)) return false;

    const tripRange = getTripRange(trip);
    return rangesOverlap(
      selectedRange.start,
      selectedRange.end,
      tripRange.start,
      tripRange.end
    );
  });

  if (overlappingTrips.length > 0) {
    const first = overlappingTrips[0];
    const tripType =
      normalizeTripType(first.type) === "project"
        ? "Project"
        : normalizeTripType(first.type) === "service"
          ? "Service"
          : "Trip";

    reasons.push(
      buildReason(
        "overlap",
        "Overlapping Trip",
        `${tripType} • ${
          String(first.previewTitle || "").trim() || "Scheduled Trip"
        } • Est. ${formatEstimatedDurationLabel(getTripEstimatedDurationMinutes(first))}`
      )
    );
  }

  if (args.holidays.length > 0 && !args.holidayOverrideEnabled) {
    reasons.push(
      buildReason(
        "holiday",
        "Company Holiday",
        args.holidays.map((holiday) => holiday.name).join(", ")
      )
    );
  }

  const pendingPto = args.ptoRequests.find(
    (request) =>
      request.employeeId === args.uid &&
      request.status === "pending" &&
      ptoBlocksSelection({
        request,
        date: args.date,
        timeWindow: args.timeWindow,
        startTime: args.startTime,
        endTime: args.endTime,
      })
  );

  if (pendingPto) {
    reasons.push(
      buildReason(
        "pending_pto",
        "Pending PTO",
        buildPtoDetailLabel(pendingPto)
      )
    );
  }

  let status: PlannerSlotStatus = {
    kind: "available",
    label: "Open",
    disabled: false,
  };

  const approvedReason = reasons.find((reason) => reason.kind === "approved_pto");
  const overlapReason = reasons.find((reason) => reason.kind === "overlap");
  const holidayReason = reasons.find((reason) => reason.kind === "holiday");
  const pendingReason = reasons.find((reason) => reason.kind === "pending_pto");

  if (approvedReason) {
    status = {
      kind: "approved_pto",
      label: "PTO",
      detail: approvedReason.detail,
      disabled: true,
    };
  } else if (overlapReason) {
    status = {
      kind: "overlap",
      label: "Booked",
      detail: overlapReason.detail,
      disabled: false,
      tooltipItems: overlappingTrips.map((trip) => ({
        tripId: trip.id,
        tripType: normalizeTripType(trip.type),
        title:
          String(trip.previewTitle || "").trim() ||
          (normalizeTripType(trip.type) === "project"
            ? "Project Trip"
            : normalizeTripType(trip.type) === "service"
              ? "Service Trip"
              : "Trip"),
        subtitle: String(trip.previewSubtitle || "").trim() || undefined,
        estimatedDurationLabel: formatEstimatedDurationLabel(
          getTripEstimatedDurationMinutes(trip)
        ),
      })),
    };
  } else if (holidayReason) {
    status = {
      kind: "holiday",
      label: "Holiday",
      detail: holidayReason.detail,
      disabled: true,
    };
  } else if (pendingReason) {
    status = {
      kind: "pending_pto",
      label: "Open w/ Note",
      detail: pendingReason.detail,
      disabled: false,
    };
  }

  return {
    status,
    summary: {
      uid: args.uid,
      name: args.name,
      reasons,
    } satisfies PlannerCrewSummary,
  };
}

async function findOpenTripsForTicketId(serviceTicketId: string) {
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

  const byId = new Map<string, TripDocLite>();

  for (const snap of snaps) {
    if (!snap) continue;

    for (const docSnap of snap.docs) {
      const candidate = mapTripDocLite(docSnap.id, docSnap.data());

      if (!isOpenTripStatus(candidate.status) || candidate.active === false) continue;
      byId.set(candidate.id, candidate);
    }
  }

  return Array.from(byId.values());
}

export default function ServiceTicketSchedulePage({ params }: Props) {
  const { appUser } = useAuthContext();
  const theme = useTheme();
  const router = useRouter();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canOverrideHoliday = canDispatch;
  const canOverrideOverlap = canDispatch;

  const initialBusinessDate = useMemo(
    () => firstBusinessDayOnOrAfter(isoTodayLocal()),
    []
  );

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<TicketLite | null>(null);
  const [error, setError] = useState("");

  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [helpers, setHelpers] = useState<HelperOption[]>([]);
  const [ticketTrips, setTicketTrips] = useState<TripDocLite[]>([]);

  const [allPtoRequests, setAllPtoRequests] = useState<PtoRequestLite[]>([]);
  const [allHolidays, setAllHolidays] = useState<CompanyHolidayLite[]>([]);
  const [dayTrips, setDayTrips] = useState<TripDocLite[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(initialBusinessDate);
  const [visibleBusinessDayCount, setVisibleBusinessDayCount] = useState(7);

  const [selectedWindow, setSelectedWindow] = useState<TripTimeWindow>("am");
  const [selectedStartTime, setSelectedStartTime] = useState("08:00");
  const [selectedEndTime, setSelectedEndTime] = useState("12:00");
  const [selectedPrimaryUid, setSelectedPrimaryUid] = useState("");
  const [selectedSecondaryUid, setSelectedSecondaryUid] = useState("");
  const [showAdditionalTechnician, setShowAdditionalTechnician] = useState(false);
  const [useDefaultHelper, setUseDefaultHelper] = useState(true);
  const [selectedHelperUid, setSelectedHelperUid] = useState("");
  const [selectedSecondaryHelperUid, setSelectedSecondaryHelperUid] = useState("");
  const [notes, setNotes] = useState("");
  const [holidayOverrideEnabled, setHolidayOverrideEnabled] = useState(false);
  const [dispatchOverrideEnabled, setDispatchOverrideEnabled] = useState(false);
  const [dispatchOverrideReason, setDispatchOverrideReason] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    async function loadPage() {
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

        const data = ticketSnap.data() as any;

        setTicket({
          id: ticketSnap.id,
          status: (data.status ?? "new") as TicketStatus,
          customerDisplayName: String(data.customerDisplayName || ""),
          issueSummary: String(data.issueSummary || ""),
        });

        const [usersSnap, profilesSnap, tripsSnap, ptoSnap, holidaysSnap] =
          await Promise.all([
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
            getDocs(collection(db, "ptoRequests")),
            getDocs(collection(db, "companyHolidays")),
          ]);

        const nextTechnicians = usersSnap.docs
          .map((ds) => {
            const user = ds.data() as any;
            return {
              uid: String(user.uid ?? ds.id),
              displayName: String(user.displayName ?? "Unnamed Technician"),
              active: Boolean(user.active ?? false),
              role: String(user.role ?? ""),
            } satisfies TechnicianOption;
          })
          .filter((user) => user.active && user.role === "technician")
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        // Regular DCFlow crew pairing is now managed from Admin > Users using
        // users.preferredTechnicianId. Employee Profile pairing remains a
        // backward-compatible fallback for users not yet reviewed there.
        const legacyPairingByUserUid = new Map(
          profilesSnap.docs
            .map((ds) => {
              const profile = ds.data() as any;
              return [
                String(profile.userUid || "").trim(),
                String(profile.defaultPairedTechUid || "").trim() || null,
              ] as const;
            })
            .filter(([uid]) => Boolean(uid))
        );

        const nextHelpers = usersSnap.docs
          .map((ds) => {
            const user = ds.data() as any;
            const uid = String(user.uid ?? ds.id).trim();
            const role = String(user.role || "").trim().toLowerCase();
            const preferredTechnicianId =
              String(user.preferredTechnicianId || "").trim() ||
              legacyPairingByUserUid.get(uid) ||
              null;

            return {
              uid,
              name: String(user.displayName || "Unnamed"),
              laborRole: role,
              defaultPairedTechUid: preferredTechnicianId,
              active: Boolean(user.active ?? false),
            };
          })
          .filter(
            (helper) =>
              helper.active &&
              helper.uid &&
              (helper.laborRole === "helper" || helper.laborRole === "apprentice")
          )
          .map(({ active: _active, ...helper }) => helper satisfies HelperOption)
          .sort((a, b) => a.name.localeCompare(b.name));

        const rawTicketTrips = tripsSnap.docs.map((ds) => mapTripDocLite(ds.id, ds.data()));
        const nextTicketTrips = await hydrateTripPreviewData(rawTicketTrips);

        const nextPto = ptoSnap.docs.map((ds) => {
          const item: any = ds.data();
          return {
            id: ds.id,
            employeeId: String(item.employeeId || ""),
            employeeName: String(item.employeeName || ""),
            startDate: String(item.startDate || ""),
            endDate: String(item.endDate || ""),
            status: (item.status || "pending") as PtoRequestLite["status"],
            hoursPerDay:
              typeof item.hoursPerDay === "number" ? item.hoursPerDay : undefined,
            requestDayType: normalizeRequestDayType(
              item.requestDayType ??
                (item.partialDayType || item.partialStartTime || item.partialEndTime
                  ? "partial_day"
                  : "full_day")
            ),
            partialDayType:
              item.partialDayType != null
                ? normalizePartialDayType(item.partialDayType)
                : null,
            partialStartTime: item.partialStartTime ?? null,
            partialEndTime: item.partialEndTime ?? null,
          } satisfies PtoRequestLite;
        });

        const nextHolidays = holidaysSnap.docs
          .map((ds) => normalizeCompanyHoliday(ds.data(), ds.id))
          .filter((holiday): holiday is CompanyHolidayLite => Boolean(holiday));

        setTechnicians(nextTechnicians);
        setHelpers(nextHelpers);
        setTicketTrips(nextTicketTrips);
        setAllPtoRequests(nextPto);
        setAllHolidays(nextHolidays);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load schedule page."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [params]);

  useEffect(() => {
    const times = windowToTimes(selectedWindow === "custom" ? "am" : selectedWindow);
    if (selectedWindow !== "custom") {
      setSelectedStartTime(times.start);
      setSelectedEndTime(times.end);
    }
  }, [selectedWindow]);

  const businessDayCards = useMemo(() => {
    return getNextBusinessDays(initialBusinessDate, visibleBusinessDayCount);
  }, [initialBusinessDate, visibleBusinessDayCount]);

  const defaultHelpersForPrimary = useMemo(() => {
    if (!selectedPrimaryUid) return [] as HelperOption[];

    return helpers
      .filter(
        (helper) =>
          String(helper.defaultPairedTechUid || "").trim() === selectedPrimaryUid
      )
      .slice(0, 2);
  }, [helpers, selectedPrimaryUid]);

  const primaryTechnicianName = useMemo(
    () =>
      technicians.find((tech) => tech.uid === selectedPrimaryUid)?.displayName ||
      "Selected technician",
    [technicians, selectedPrimaryUid]
  );

  useEffect(() => {
    if (!useDefaultHelper) return;
    if (!selectedPrimaryUid) {
      setSelectedHelperUid("");
      setSelectedSecondaryHelperUid("");
      setSelectedSecondaryUid("");
      setShowAdditionalTechnician(false);
      return;
    }

    setSelectedHelperUid(defaultHelpersForPrimary[0]?.uid || "");
    setSelectedSecondaryHelperUid(defaultHelpersForPrimary[1]?.uid || "");
  }, [useDefaultHelper, selectedPrimaryUid, defaultHelpersForPrimary]);

  useEffect(() => {
    setHolidayOverrideEnabled(false);
  }, [selectedDate]);

  useEffect(() => {
    async function loadDayTrips() {
      if (!selectedDate) {
        setDayTrips([]);
        return;
      }

      setAvailabilityLoading(true);

      try {
        const snap = await getDocs(
          query(collection(db, "trips"), where("date", "==", selectedDate))
        );

        const rawItems = snap.docs.map((ds) => mapTripDocLite(ds.id, ds.data()));
        const items = await hydrateTripPreviewData(rawItems);

        setDayTrips(items);
      } catch (err: unknown) {
        setSaveError(
          err instanceof Error
            ? err.message
            : "Failed to load daily availability."
        );
      } finally {
        setAvailabilityLoading(false);
      }
    }

    loadDayTrips();
  }, [selectedDate]);

  const selectedDateHolidays = useMemo(() => {
    return allHolidays.filter(
      (holiday) => holiday.active !== false && holiday.date === selectedDate
    );
  }, [allHolidays, selectedDate]);

  const holidayNames = useMemo(
    () => selectedDateHolidays.map((holiday) => holiday.name),
    [selectedDateHolidays]
  );

  const selectedDatePto = useMemo(() => {
    return allPtoRequests.filter((request) => dateFallsWithinPto(selectedDate, request));
  }, [allPtoRequests, selectedDate]);

  const selectedMembers = useMemo(() => {
    const techMap = new Map(technicians.map((tech) => [tech.uid, tech.displayName]));
    const helperMap = new Map(helpers.map((helper) => [helper.uid, helper.name]));

    const out: Array<{ uid: string; name: string }> = [];

    const pushUnique = (uid: string, name: string) => {
      if (!uid) return;
      if (out.some((item) => item.uid === uid)) return;
      out.push({ uid, name });
    };

    pushUnique(selectedPrimaryUid, techMap.get(selectedPrimaryUid) || "Primary Tech");
    pushUnique(
      selectedSecondaryUid,
      techMap.get(selectedSecondaryUid) || "Secondary Tech"
    );
    pushUnique(selectedHelperUid, helperMap.get(selectedHelperUid) || "Helper");
    pushUnique(
      selectedSecondaryHelperUid,
      helperMap.get(selectedSecondaryHelperUid) || "Secondary Helper"
    );

    return out;
  }, [
    helpers,
    technicians,
    selectedPrimaryUid,
    selectedSecondaryUid,
    selectedHelperUid,
    selectedSecondaryHelperUid,
  ]);

  const slotStatusByTech = useMemo(() => {
    const out: Record<
      string,
      {
        am: PlannerSlotStatus;
        pm: PlannerSlotStatus;
        all_day: PlannerSlotStatus;
      }
    > = {};

    for (const tech of technicians) {
      const am = analyzeMemberAvailability({
        uid: tech.uid,
        name: tech.displayName,
        date: selectedDate,
        timeWindow: "am",
        startTime: windowToTimes("am").start,
        endTime: windowToTimes("am").end,
        holidays: selectedDateHolidays,
        ptoRequests: selectedDatePto,
        dayTrips,
        holidayOverrideEnabled,
      }).status;

      const pm = analyzeMemberAvailability({
        uid: tech.uid,
        name: tech.displayName,
        date: selectedDate,
        timeWindow: "pm",
        startTime: windowToTimes("pm").start,
        endTime: windowToTimes("pm").end,
        holidays: selectedDateHolidays,
        ptoRequests: selectedDatePto,
        dayTrips,
        holidayOverrideEnabled,
      }).status;

      const allDay = analyzeMemberAvailability({
        uid: tech.uid,
        name: tech.displayName,
        date: selectedDate,
        timeWindow: "all_day",
        startTime: windowToTimes("all_day").start,
        endTime: windowToTimes("all_day").end,
        holidays: selectedDateHolidays,
        ptoRequests: selectedDatePto,
        dayTrips,
        holidayOverrideEnabled,
      }).status;

      out[tech.uid] = {
        am,
        pm,
        all_day: allDay,
      };
    }

    return out;
  }, [
    technicians,
    selectedDate,
    selectedDateHolidays,
    selectedDatePto,
    dayTrips,
    holidayOverrideEnabled,
  ]);

  const selectedCrewSummary = useMemo(() => {
    return selectedMembers.map((member) => {
      const analysis = analyzeMemberAvailability({
        uid: member.uid,
        name: member.name,
        date: selectedDate,
        timeWindow: selectedWindow,
        startTime: selectedStartTime,
        endTime: selectedEndTime,
        holidays: selectedDateHolidays,
        ptoRequests: selectedDatePto,
        dayTrips,
        holidayOverrideEnabled,
      });

      return analysis.summary;
    });
  }, [
    selectedMembers,
    selectedDate,
    selectedWindow,
    selectedStartTime,
    selectedEndTime,
    selectedDateHolidays,
    selectedDatePto,
    dayTrips,
    holidayOverrideEnabled,
  ]);

  const selectedOverlapConflicts = useMemo(() => {
    const selectedRange = getRangeForWindow({
      timeWindow: selectedWindow,
      startTime: selectedStartTime,
      endTime: selectedEndTime,
    });

    const dedup = new Map<string, SelectedOverlapConflict>();

    for (const member of selectedMembers) {
      for (const trip of dayTrips) {
        if (trip.active === false) continue;
        if (!isOpenTripStatus(trip.status)) continue;
        if (!tripHasCrewUid(trip, member.uid)) continue;

        const tripRange = getTripRange(trip);
        const overlaps = rangesOverlap(
          selectedRange.start,
          selectedRange.end,
          tripRange.start,
          tripRange.end
        );

        if (!overlaps) continue;

        const tripType = normalizeTripType(trip.type);
        const key = `${member.uid}_${trip.id}`;

        dedup.set(key, {
          memberUid: member.uid,
          memberName: member.name,
          tripId: trip.id,
          tripType,
          previewTitle:
            String(trip.previewTitle || "").trim() ||
            (tripType === "project"
              ? "Project Trip"
              : tripType === "service"
                ? "Service Trip"
                : "Trip"),
          previewSubtitle: String(trip.previewSubtitle || "").trim() || undefined,
          estimatedDurationLabel: formatEstimatedDurationLabel(
            getTripEstimatedDurationMinutes(trip)
          ),
        });
      }
    }

    return Array.from(dedup.values());
  }, [
    selectedMembers,
    dayTrips,
    selectedWindow,
    selectedStartTime,
    selectedEndTime,
  ]);

  const overlapConflictTripIds = useMemo(() => {
    return Array.from(new Set(selectedOverlapConflicts.map((item) => item.tripId)));
  }, [selectedOverlapConflicts]);

  const existingOpenTrips = useMemo(() => {
    return ticketTrips.filter((trip) => trip.active !== false && isOpenTripStatus(trip.status));
  }, [ticketTrips]);

  useEffect(() => {
    if (selectedOverlapConflicts.length === 0) {
      setDispatchOverrideEnabled(false);
      setDispatchOverrideReason("");
    }
  }, [selectedOverlapConflicts]);

  function handlePickSlot(uid: string, window: Exclude<TripTimeWindow, "custom">) {
    setSelectedPrimaryUid(uid);
    setSelectedWindow(window);
    const times = windowToTimes(window);
    setSelectedStartTime(times.start);
    setSelectedEndTime(times.end);
  }

  function findTechName(uid: string) {
    return technicians.find((tech) => tech.uid === uid)?.displayName || "";
  }

  function findHelperName(uid: string) {
    return helpers.find((helper) => helper.uid === uid)?.name || "";
  }

  async function handleScheduleTrip() {
    if (!ticket || !ticketId || !canDispatch) return;

    setSaveError("");
    setSaveSuccess("");

    if (ticket.status === "invoiced") {
      setSaveError("Invoiced tickets are locked and cannot receive new trips.");
      return;
    }

    if (isTicketTerminal(ticket.status)) {
      setSaveError("Completed or cancelled tickets cannot receive new trips.");
      return;
    }

    if (hasOpenTrips(existingOpenTrips)) {
      setSaveError(
        "This ticket already has an open trip. Complete or cancel it before scheduling another."
      );
      return;
    }

    const remoteOpenTrips = await findOpenTripsForTicketId(ticketId);
    if (remoteOpenTrips.length > 0) {
      setSaveError(
        "This ticket already has an open trip in Firestore. Refresh and use that trip instead."
      );
      return;
    }

    if (!selectedDate.trim()) {
      setSaveError("Trip date is required.");
      return;
    }

    if (!selectedPrimaryUid.trim()) {
      setSaveError("Primary technician is required.");
      return;
    }

    if (
      !selectedStartTime.trim() ||
      !selectedEndTime.trim() ||
      selectedEndTime <= selectedStartTime
    ) {
      setSaveError("Enter a valid start and end time.");
      return;
    }

    if (selectedDateHolidays.length > 0 && !holidayOverrideEnabled) {
      setSaveError(
        `Selected day is a company holiday (${selectedDateHolidays
          .map((holiday) => holiday.name)
          .join(", ")}). Enable Holiday Override to continue.`
      );
      return;
    }

    if (selectedOverlapConflicts.length > 0 && !dispatchOverrideEnabled) {
      setSaveError(
        "One or more selected crew members already have an overlapping trip. Enable Dispatch Override to continue."
      );
      return;
    }

    if (dispatchOverrideEnabled && !dispatchOverrideReason.trim()) {
      setSaveError("Dispatch override reason is required.");
      return;
    }

    const blockingReasons = selectedCrewSummary.flatMap((member) =>
      member.reasons.filter(
        (reason) =>
          reason.kind === "approved_pto" ||
          reason.kind === "holiday" ||
          (reason.kind === "overlap" && !dispatchOverrideEnabled)
      )
    );

    if (blockingReasons.length > 0) {
      setSaveError(
        "One or more selected crew members have a hard conflict. Pick a different slot or use holiday / dispatch override when allowed."
      );
      return;
    }

    setSaving(true);

    try {
      const now = nowIso();

      const helperUid = selectedHelperUid.trim() || "";
      const secondaryTechUid = selectedSecondaryUid.trim() || "";
      const secondaryHelperUid = selectedSecondaryHelperUid.trim() || "";

      const primaryName = findTechName(selectedPrimaryUid) || "Unnamed Technician";
      const helperName = helperUid
        ? findHelperName(helperUid) || "Unnamed Helper"
        : null;
      const secondaryTechName = secondaryTechUid
        ? findTechName(secondaryTechUid) || "Unnamed Technician"
        : null;
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Unnamed Helper"
        : null;

      const dispatchOverridePayload =
        dispatchOverrideEnabled && selectedOverlapConflicts.length > 0
          ? {
              enabled: true,
              reason: dispatchOverrideReason.trim(),
              createdAt: now,
              createdByUid: appUser?.uid || null,
              createdByName: (appUser as any)?.displayName || null,
              conflictTypes: Array.from(
                new Set(
                  selectedOverlapConflicts.map((conflict) =>
                    conflict.tripType === "project"
                      ? "project_overlap"
                      : conflict.tripType === "service"
                        ? "service_overlap"
                        : "trip_overlap"
                  )
                )
              ),
              conflictTripIds: overlapConflictTripIds,
            }
          : null;

      const estimatedDurationMinutes = getMinutesBetween(
        selectedStartTime,
        selectedEndTime
      );

      const payload = {
        active: true,
        type: "service",
        status: "planned",
        date: selectedDate,
        timeWindow: selectedWindow,
        startTime: selectedStartTime,
        endTime: selectedEndTime,
        billableHours: null,
        noMaterialsUsed: false,
        crew: {
          primaryTechUid: selectedPrimaryUid,
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
        previewTitle: ticket.customerDisplayName || "Customer",
        previewSubtitle: ticket.issueSummary || "Service Ticket",
        estimatedDurationMinutes,
        notes: notes.trim() || null,
        dispatchOverride: dispatchOverridePayload,
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

      await addDoc(collection(db, "trips"), payload as any);

      const helperIds = Array.from(
        new Set([helperUid, secondaryHelperUid].filter(Boolean))
      );
      const helperNames = helperIds
        .map((uid) => findHelperName(uid) || "Unnamed Helper")
        .filter(Boolean);

      const assignedTechnicianIds = [selectedPrimaryUid];
      if (secondaryTechUid && !assignedTechnicianIds.includes(secondaryTechUid)) {
        assignedTechnicianIds.push(secondaryTechUid);
      }
      if (helperUid && !assignedTechnicianIds.includes(helperUid)) {
        assignedTechnicianIds.push(helperUid);
      }
      if (
        secondaryHelperUid &&
        !assignedTechnicianIds.includes(secondaryHelperUid)
      ) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      const nextStatus: TicketStatus =
        ticket.status === "follow_up" ? "follow_up" : "scheduled";

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,
        assignedTechnicianId: selectedPrimaryUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: selectedPrimaryUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds,
        updatedAt: now,
      });

      setSaveSuccess(
        dispatchOverridePayload
          ? "Trip scheduled with dispatch override."
          : "Trip scheduled successfully."
      );

      setTimeout(() => {
        router.push(`/service-tickets/${ticket.id}`);
      }, 500);
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to schedule trip."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canDispatch) {
    return (
      <ProtectedPage fallbackTitle="Schedule Trip">
        <AppShell appUser={appUser}>
          <Alert severity="error" variant="outlined">
            You do not have permission to access the scheduler.
          </Alert>
        </AppShell>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Schedule Trip">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 1400, mx: "auto", pb: 4 }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                spacing={2}
              >
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      icon={<ScheduleRoundedIcon />}
                      label="Full-Screen Scheduler"
                      color="primary"
                      variant="outlined"
                      sx={{ borderRadius: 999 }}
                    />
                    {ticket ? (
                      <Chip
                        label={formatTicketStatus(ticket.status)}
                        variant="outlined"
                        sx={{ borderRadius: 999 }}
                      />
                    ) : null}
                  </Stack>

                  <Typography variant="h4" fontWeight={800}>
                    Schedule Trip
                  </Typography>

                  <Typography variant="body1" color="text.secondary">
                    {ticket
                      ? `${ticket.customerDisplayName || "Customer"} — ${
                          ticket.issueSummary || "Service Ticket"
                        }`
                      : "Loading ticket..."}
                  </Typography>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    component={Link}
                    href={ticketId ? `/service-tickets/${ticketId}` : "/service-tickets"}
                    variant="outlined"
                    startIcon={<ArrowBackRoundedIcon />}
                  >
                    Back to Ticket
                  </Button>

                  <Button
                    variant="contained"
                    onClick={handleScheduleTrip}
                    disabled={saving || loading || availabilityLoading || !ticket}
                    startIcon={
                      saving ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <CheckCircleRoundedIcon />
                      )
                    }
                  >
                    {saving ? "Scheduling..." : "Schedule Trip"}
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            {loading ? (
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                Loading scheduler...
              </Alert>
            ) : null}

            {error ? (
              <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
                {error}
              </Alert>
            ) : null}

            {!loading && ticket ? (
              <>
                {ticket.status === "invoiced" ? (
                  <Alert severity="warning" variant="outlined" sx={{ borderRadius: 3 }}>
                    This ticket has been invoiced and cannot receive new trips.
                  </Alert>
                ) : null}

                {existingOpenTrips.length > 0 ? (
                  <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
                    This ticket already has an open trip. Complete or cancel that trip before
                    scheduling another one.
                  </Alert>
                ) : null}

                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 3 },
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                  }}
                >
                  <Stack spacing={2.5}>
                    <Box>
                      <Typography variant="h6" fontWeight={800}>
                        Next Business Days
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Pick a working day first, then choose an available technician / time
                        block below. Company holidays stay blocked unless explicitly overridden.
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gap: 1.25,
                        gridTemplateColumns: {
                          xs: "repeat(2, minmax(0, 1fr))",
                          sm: "repeat(3, minmax(0, 1fr))",
                          md: "repeat(4, minmax(0, 1fr))",
                          lg: "repeat(7, minmax(0, 1fr))",
                        },
                      }}
                    >
                      {businessDayCards.map((dayIso) => {
                        const isSelected = selectedDate === dayIso;
                        const dayHolidayNames = allHolidays
                          .filter(
                            (holiday) =>
                              holiday.active !== false && holiday.date === dayIso
                          )
                          .map((holiday) => holiday.name);

                        return (
                          <Card
                            key={dayIso}
                            elevation={0}
                            sx={{
                              borderRadius: 3,
                              border: `1px solid ${
                                isSelected
                                  ? alpha(theme.palette.primary.main, 0.5)
                                  : theme.palette.divider
                              }`,
                              backgroundColor: isSelected
                                ? alpha(theme.palette.primary.main, 0.08)
                                : theme.palette.background.paper,
                              overflow: "hidden",
                            }}
                          >
                            <CardActionArea onClick={() => setSelectedDate(dayIso)}>
                              <CardContent sx={{ p: 1.5 }}>
                                <Stack spacing={1}>
                                  <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="flex-start"
                                    spacing={1}
                                  >
                                    <Box>
                                      <Typography variant="overline" sx={{ lineHeight: 1 }}>
                                        {formatDayShort(dayIso)}
                                      </Typography>
                                      <Typography variant="subtitle1" fontWeight={800}>
                                        {formatMonthDay(dayIso)}
                                      </Typography>
                                    </Box>

                                    {isSelected ? (
                                      <Chip
                                        size="small"
                                        label="Selected"
                                        color="primary"
                                        sx={{ borderRadius: 999 }}
                                      />
                                    ) : null}
                                  </Stack>

                                  {dayHolidayNames.length > 0 ? (
                                    <Chip
                                      size="small"
                                      icon={<WarningAmberRoundedIcon />}
                                      label={dayHolidayNames.join(", ")}
                                      color="warning"
                                      variant="outlined"
                                      sx={{ width: "fit-content", borderRadius: 999 }}
                                    />
                                  ) : (
                                    <Chip
                                      size="small"
                                      icon={<CalendarMonthRoundedIcon />}
                                      label="Working Day"
                                      variant="outlined"
                                      sx={{ width: "fit-content", borderRadius: 999 }}
                                    />
                                  )}
                                </Stack>
                              </CardContent>
                            </CardActionArea>
                          </Card>
                        );
                      })}
                    </Box>

                    <Stack direction="row" justifyContent="flex-start">
                      <Button
                        variant="outlined"
                        onClick={() =>
                          setVisibleBusinessDayCount((prev) => prev + 7)
                        }
                      >
                        Show More Days
                      </Button>
                    </Stack>

                    <DispatchAvailabilityPlanner
                      date={selectedDate}
                      technicians={technicians.map((tech) => ({
                        uid: tech.uid,
                        displayName: tech.displayName,
                      }))}
                      slotStatusByTech={slotStatusByTech}
                      selectedPrimaryUid={selectedPrimaryUid}
                      selectedWindow={selectedWindow}
                      selectedCrewSummary={selectedCrewSummary}
                      holidayNames={holidayNames}
                      holidayOverrideEnabled={holidayOverrideEnabled}
                      canOverrideHoliday={canOverrideHoliday}
                      onHolidayOverrideChange={setHolidayOverrideEnabled}
                      onPickSlot={handlePickSlot}
                    />
                  </Stack>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 3 },
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                  }}
                >
                  <Stack spacing={2.5}>
                    <Typography variant="h6" fontWeight={800}>
                      Trip Details
                    </Typography>

                    <Divider />

                    <Box
                      sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                      }}
                    >
                      <TextField
                        select
                        label="Primary Technician"
                        value={selectedPrimaryUid}
                        onChange={(e) => setSelectedPrimaryUid(e.target.value)}
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
                        label="Time Window"
                        value={selectedWindow}
                        onChange={(e) =>
                          setSelectedWindow(e.target.value as TripTimeWindow)
                        }
                      >
                        <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                        <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                        <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                        <MenuItem value="custom">Custom</MenuItem>
                      </TextField>
                    </Box>

                    {selectedWindow === "custom" ? (
                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        }}
                      >
                        <TextField
                          type="time"
                          label="Start Time"
                          value={selectedStartTime}
                          onChange={(e) => setSelectedStartTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                          type="time"
                          label="End Time"
                          value={selectedEndTime}
                          onChange={(e) => setSelectedEndTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Box>
                    ) : null}

                    {selectedPrimaryUid ? (
                      <Stack spacing={2}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            borderColor: alpha(theme.palette.primary.main, 0.18),
                            backgroundColor: alpha(theme.palette.primary.main, 0.04),
                          }}
                        >
                          <Stack spacing={1.25}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                              alignItems={{ xs: "flex-start", sm: "center" }}
                              justifyContent="space-between"
                            >
                              <Box>
                                <Typography variant="subtitle2" fontWeight={800}>
                                  Regular Support Crew
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Load the usual helper / apprentice pairing for {primaryTechnicianName}.
                                </Typography>
                              </Box>

                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={useDefaultHelper}
                                    onChange={(e) => setUseDefaultHelper(e.target.checked)}
                                  />
                                }
                                label="Use regular crew"
                                sx={{ mr: 0 }}
                              />
                            </Stack>

                            {useDefaultHelper ? (
                              defaultHelpersForPrimary.length > 0 ? (
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                  Regular crew loaded: {defaultHelpersForPrimary
                                    .map((helper) => helper.name)
                                    .join(" and ")}. Adjust below only if this trip uses a different crew.
                                </Alert>
                              ) : (
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                  No regular helper / apprentice pairing is saved for {primaryTechnicianName}.
                                </Alert>
                              )
                            ) : null}
                          </Stack>
                        </Paper>

                        <Box
                          sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                          }}
                        >
                          <TextField
                            select
                            label="Helper / Apprentice (optional)"
                            value={selectedHelperUid}
                            onChange={(e) => {
                              setUseDefaultHelper(false);
                              setSelectedHelperUid(e.target.value);
                            }}
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {helpers
                              .filter((helper) => helper.uid !== selectedSecondaryHelperUid)
                              .map((helper) => (
                                <MenuItem key={helper.uid} value={helper.uid}>
                                  {helper.name} ({helper.laborRole})
                                </MenuItem>
                              ))}
                          </TextField>

                          <TextField
                            select
                            label="Additional Helper / Apprentice (optional)"
                            value={selectedSecondaryHelperUid}
                            onChange={(e) => {
                              setUseDefaultHelper(false);
                              setSelectedSecondaryHelperUid(e.target.value);
                            }}
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {helpers
                              .filter((helper) => helper.uid !== selectedHelperUid)
                              .map((helper) => (
                                <MenuItem key={helper.uid} value={helper.uid}>
                                  {helper.name} ({helper.laborRole})
                                </MenuItem>
                              ))}
                          </TextField>
                        </Box>

                        {!showAdditionalTechnician && !selectedSecondaryUid ? (
                          <Button
                            type="button"
                            variant="outlined"
                            onClick={() => setShowAdditionalTechnician(true)}
                            sx={{ alignSelf: "flex-start", borderRadius: 999 }}
                          >
                            Add Another Technician
                          </Button>
                        ) : (
                          <Stack spacing={1}>
                            <Box
                              sx={{
                                display: "grid",
                                gap: 2,
                                gridTemplateColumns: { xs: "1fr", md: "1fr auto" },
                                alignItems: "center",
                              }}
                            >
                              <TextField
                                select
                                label="Additional Technician (optional)"
                                value={selectedSecondaryUid}
                                onChange={(e) => setSelectedSecondaryUid(e.target.value)}
                              >
                                <MenuItem value="">— None —</MenuItem>
                                {technicians
                                  .filter((tech) => tech.uid !== selectedPrimaryUid)
                                  .map((tech) => (
                                    <MenuItem key={tech.uid} value={tech.uid}>
                                      {tech.displayName}
                                    </MenuItem>
                                  ))}
                              </TextField>

                              <Button
                                type="button"
                                variant="text"
                                onClick={() => {
                                  setSelectedSecondaryUid("");
                                  setShowAdditionalTechnician(false);
                                }}
                                sx={{ borderRadius: 999 }}
                              >
                                Remove
                              </Button>
                            </Box>

                            {selectedSecondaryUid &&
                            selectedHelperUid &&
                            selectedSecondaryHelperUid ? (
                              <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                This trip now uses all four currently supported crew positions. A second technician can be assigned, but no additional helper slot is available on this trip.
                              </Alert>
                            ) : null}
                          </Stack>
                        )}
                      </Stack>
                    ) : (
                      <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                        Select the primary technician to load regular crew and additional assignment options.
                      </Alert>
                    )}

                    {selectedOverlapConflicts.length > 0 ? (
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 3,
                          borderColor: alpha(theme.palette.warning.main, 0.4),
                          backgroundColor: alpha(theme.palette.warning.main, 0.06),
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                            One or more selected crew members already have an overlapping trip in this time slot.
                            You can still dispatch this service trip by using Dispatch Override.
                          </Alert>

                          <Stack spacing={0.75}>
                            {selectedOverlapConflicts.map((conflict) => (
                              <Stack
                                key={`${conflict.memberUid}_${conflict.tripId}`}
                                direction="row"
                                spacing={1}
                                alignItems="flex-start"
                              >
                                {conflict.tripType === "service" ? (
                                  <BuildRoundedIcon
                                    fontSize="small"
                                    sx={{ mt: "2px", color: "primary.main" }}
                                  />
                                ) : conflict.tripType === "project" ? (
                                  <ConstructionRoundedIcon
                                    fontSize="small"
                                    sx={{ mt: "2px", color: "secondary.main" }}
                                  />
                                ) : (
                                  <ScheduleRoundedIcon
                                    fontSize="small"
                                    sx={{ mt: "2px", color: "text.secondary" }}
                                  />
                                )}

                                <Box>
                                  <Typography variant="body2" color="text.secondary">
                                    <strong>{conflict.memberName}</strong> already assigned to{" "}
                                    <strong>{conflict.previewTitle}</strong>
                                  </Typography>

                                  {conflict.previewSubtitle ? (
                                    <Typography variant="caption" color="text.secondary">
                                      {conflict.previewSubtitle}
                                    </Typography>
                                  ) : null}

                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block" }}
                                  >
                                    Est. {conflict.estimatedDurationLabel}
                                  </Typography>
                                </Box>
                              </Stack>
                            ))}
                          </Stack>

                          {canOverrideOverlap ? (
                            <>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={dispatchOverrideEnabled}
                                    onChange={(e) => setDispatchOverrideEnabled(e.target.checked)}
                                  />
                                }
                                label="Enable Dispatch Override for this overlapping service dispatch"
                              />

                              {dispatchOverrideEnabled ? (
                                <TextField
                                  label="Dispatch Override Reason"
                                  value={dispatchOverrideReason}
                                  onChange={(e) => setDispatchOverrideReason(e.target.value)}
                                  multiline
                                  minRows={3}
                                  placeholder="Example: emergency no-water call, quick diagnostic, high-priority customer, etc."
                                />
                              ) : null}
                            </>
                          ) : null}
                        </Stack>
                      </Paper>
                    ) : null}

                    <TextField
                      label="Trip Notes"
                      multiline
                      minRows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional scheduling or dispatch notes"
                    />

                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        backgroundColor: alpha(theme.palette.primary.main, 0.03),
                      }}
                    >
                      <Stack spacing={1}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          Selected Schedule Summary
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {selectedDate} •{" "}
                          {selectedWindow === "custom"
                            ? `Custom (${formatTime12h(selectedStartTime)}–${formatTime12h(
                                selectedEndTime
                              )})`
                            : selectedWindow === "all_day"
                              ? "All Day"
                              : selectedWindow === "pm"
                                ? "PM"
                                : "AM"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Primary Tech: {findTechName(selectedPrimaryUid) || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Helper: {findHelperName(selectedHelperUid) || "—"}
                        </Typography>
                        {dispatchOverrideEnabled && selectedOverlapConflicts.length > 0 ? (
                          <Typography variant="body2" color="warning.main">
                            Dispatch Override: Enabled
                          </Typography>
                        ) : null}
                      </Stack>
                    </Paper>

                    {availabilityLoading ? (
                      <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                        Loading availability for {selectedDate}...
                      </Alert>
                    ) : null}

                    {saveError ? (
                      <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
                        {saveError}
                      </Alert>
                    ) : null}

                    {saveSuccess ? (
                      <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                        {saveSuccess}
                      </Alert>
                    ) : null}

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="contained"
                        onClick={handleScheduleTrip}
                        disabled={
                          saving ||
                          loading ||
                          availabilityLoading ||
                          !ticket ||
                          existingOpenTrips.length > 0 ||
                          isTicketTerminal(ticket.status)
                        }
                        startIcon={
                          saving ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <CheckCircleRoundedIcon />
                          )
                        }
                      >
                        {saving ? "Scheduling..." : "Schedule Trip"}
                      </Button>

                      <Button
                        component={Link}
                        href={ticketId ? `/service-tickets/${ticketId}` : "/service-tickets"}
                        variant="outlined"
                        startIcon={<ArrowBackRoundedIcon />}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}