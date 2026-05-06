// app/service-tickets/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
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
  Collapse,
  Divider,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddHomeRoundedIcon from "@mui/icons-material/AddHomeRounded";
import AddTaskRoundedIcon from "@mui/icons-material/AddTaskRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import BuildCircleRoundedIcon from "@mui/icons-material/BuildCircleRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import AddressAutocompleteField from "../../../components/AddressAutocompleteField";
import DispatchAvailabilityPlanner, {
  type PlannerCrewSummary,
  type PlannerCrewSummaryReason,
  type PlannerSlotStatus,
  type PlannerSlotStatusKind,
  type TripTimeWindow,
} from "../../../components/DispatchAvailabilityPlanner";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { normalizeCompanyHoliday } from "../../../src/lib/trip-availability";
import type { ServiceAddress } from "../../../src/types/customer";

type ServiceAddressSource =
  | "manual"
  | "google_places"
  | "qbo_ship"
  | "qbo_bill"
  | "legacy";

type ServiceAddressOption = Omit<ServiceAddress, "source"> & {
  source?: ServiceAddressSource | null;
};

type AvailableServiceAddressOption = ServiceAddressOption & {
  isBillingFallback?: boolean;
};

type CustomerOption = {
  id: string;
  displayName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  serviceAddresses: ServiceAddressOption[];
};

type DcflowUserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role?: string;
  active?: boolean;
};

type EmployeeProfileOption = {
  id: string;
  userUid?: string | null;
  displayName?: string;
  employmentStatus?: string;
  laborRole?: string;
  defaultPairedTechUid?: string | null;
};

type HelperOption = {
  uid: string;
  name: string;
  laborRole: string;
  defaultPairedTechUid?: string | null;
};

type TicketStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

type GoogleAddressSelectionLike = {
  placeId?: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  source?: string;
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

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id_${Math.random().toString(36).slice(2, 11)}`;
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

function addDaysIso(iso: string, delta: number) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + delta);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
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

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
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

function formatAddress(params: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  const line1 = [params.addressLine1, params.addressLine2]
    .map((x) => safeStr(x))
    .filter(Boolean)
    .join(", ");

  const line2 = [params.city, params.state, params.postalCode]
    .map((x) => safeStr(x))
    .filter(Boolean)
    .join(" ");

  return [line1, line2].filter(Boolean).join(" • ");
}

function getCustomerSearchText(customer: CustomerOption) {
  return [
    customer.displayName,
    customer.phonePrimary,
    customer.phoneSecondary,
    customer.email,
    customer.billingAddressLine1,
    customer.billingAddressLine2,
    customer.billingCity,
    customer.billingState,
    customer.billingPostalCode,
    ...customer.serviceAddresses.flatMap((addr) => [
      addr.label,
      addr.addressLine1,
      addr.addressLine2,
      addr.city,
      addr.state,
      addr.postalCode,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getStatusLabel(status: TicketStatus) {
  switch (status) {
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
      return status;
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

  const [hhRaw, mmRaw] = hhmm.split(":").map(Number);
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

function getMinutesBetween(startTime?: string | null, endTime?: string | null) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start === null || end === null || end <= start) return 0;

  return end - start;
}

function formatEstimatedDurationLabel(minutes?: number | null) {
  const safeMinutes = Number(minutes || 0);

  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) return "—";

  if (safeMinutes < 60) return `${safeMinutes} min`;

  const hours = safeMinutes / 60;

  if (Number.isInteger(hours)) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  return `${hours.toFixed(1)} hrs`;
}

function formatStageKey(value?: string | null) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isOpenTripStatus(status?: string) {
  const s = normalizeStatus(status);
  return s === "planned" || s === "in_progress";
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
      buildReason("approved_pto", "Approved PTO", buildPtoDetailLabel(approvedPto))
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
      buildReason("pending_pto", "Pending PTO", buildPtoDetailLabel(pendingPto))
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

export default function NewServiceTicketPage() {
  const router = useRouter();
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const initialBusinessDate = useMemo(
    () => firstBusinessDayOnOrAfter(isoTodayLocal()),
    []
  );

  const [customersLoading, setCustomersLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedServiceAddressId, setSelectedServiceAddressId] = useState("");

  const [issueSummary, setIssueSummary] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [status, setStatus] = useState<TicketStatus>("new");
  const [estimatedDurationHours, setEstimatedDurationHours] = useState("4");
  const [internalNotes, setInternalNotes] = useState("");

  const [staffLoading, setStaffLoading] = useState(true);
  const [users, setUsers] = useState<DcflowUserOption[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [assignmentError, setAssignmentError] = useState("");

  const [quickAddServiceLocationOpen, setQuickAddServiceLocationOpen] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");
  const [quickServiceLabel, setQuickServiceLabel] = useState("");
  const [quickServiceAddressSearch, setQuickServiceAddressSearch] = useState("");
  const [quickServiceAddressLine1, setQuickServiceAddressLine1] = useState("");
  const [quickServiceAddressLine2, setQuickServiceAddressLine2] = useState("");
  const [quickServiceCity, setQuickServiceCity] = useState("");
  const [quickServiceState, setQuickServiceState] = useState("");
  const [quickServicePostalCode, setQuickServicePostalCode] = useState("");
  const [quickServiceNotes, setQuickServiceNotes] = useState("");
  const [quickServiceAddressSource, setQuickServiceAddressSource] =
    useState<ServiceAddressSource>("manual");

  const [scheduleNowExpanded, setScheduleNowExpanded] = useState(false);
  const [scheduleNowEnabled, setScheduleNowEnabled] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialBusinessDate);
  const [visibleBusinessDayCount, setVisibleBusinessDayCount] = useState(7);
  const [selectedWindow, setSelectedWindow] = useState<TripTimeWindow>("am");
  const [selectedStartTime, setSelectedStartTime] = useState("08:00");
  const [selectedEndTime, setSelectedEndTime] = useState("12:00");
  const [selectedPrimaryUid, setSelectedPrimaryUid] = useState("");
  const [selectedSecondaryUid, setSelectedSecondaryUid] = useState("");
  const [useDefaultHelper, setUseDefaultHelper] = useState(true);
  const [selectedHelperUid, setSelectedHelperUid] = useState("");
  const [selectedSecondaryHelperUid, setSelectedSecondaryHelperUid] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [holidayOverrideEnabled, setHolidayOverrideEnabled] = useState(false);
  const [dispatchOverrideEnabled, setDispatchOverrideEnabled] = useState(false);
  const [dispatchOverrideReason, setDispatchOverrideReason] = useState("");

  const [allPtoRequests, setAllPtoRequests] = useState<PtoRequestLite[]>([]);
  const [allHolidays, setAllHolidays] = useState<CompanyHolidayLite[]>([]);
  const [dayTrips, setDayTrips] = useState<TripDocLite[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        const snap = await getDocs(collection(db, "customers"));

        const items: CustomerOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            displayName:
              data.displayName ??
              data.customerDisplayName ??
              data.qboDisplayName ??
              "",
            phonePrimary: data.phonePrimary ?? data.phone ?? "",
            phoneSecondary: data.phoneSecondary ?? undefined,
            email: data.email ?? undefined,
            billingAddressLine1:
              data.billingAddressLine1 ?? data.billAddrLine1 ?? "",
            billingAddressLine2:
              data.billingAddressLine2 ??
              data.billAddrLine2 ??
              data.billAddrLine3 ??
              undefined,
            billingCity: data.billingCity ?? data.billAddrCity ?? "",
            billingState: data.billingState ?? data.billAddrState ?? "",
            billingPostalCode:
              data.billingPostalCode ?? data.billAddrPostalCode ?? "",
            serviceAddresses: Array.isArray(data.serviceAddresses)
              ? data.serviceAddresses.map((addr: any) => ({
                  id: addr.id ?? createId(),
                  label: addr.label ?? undefined,
                  addressLine1: addr.addressLine1 ?? "",
                  addressLine2: addr.addressLine2 ?? undefined,
                  city: addr.city ?? "",
                  state: addr.state ?? "",
                  postalCode: addr.postalCode ?? "",
                  notes: addr.notes ?? undefined,
                  active: addr.active ?? true,
                  isPrimary: addr.isPrimary ?? false,
                  source:
                    addr.source === "manual" ||
                    addr.source === "google_places" ||
                    addr.source === "qbo_ship" ||
                    addr.source === "qbo_bill" ||
                    addr.source === "legacy"
                      ? addr.source
                      : undefined,
                  createdAt: addr.createdAt ?? undefined,
                  updatedAt: addr.updatedAt ?? undefined,
                }))
              : [],
          };
        });

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setCustomers(items);
      } catch (err: unknown) {
        setCustomersError(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        setCustomersLoading(false);
      }
    }

    loadCustomers();
  }, []);

  useEffect(() => {
    async function loadStaffAndAvailabilityInputs() {
      setStaffLoading(true);
      setAssignmentError("");

      try {
        const [usersSnap, profilesSnap, ptoSnap, holidaysSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "employeeProfiles")),
          getDocs(collection(db, "ptoRequests")),
          getDocs(collection(db, "companyHolidays")),
        ]);

        const usersItems: DcflowUserOption[] = usersSnap.docs.map((docSnap) => {
          const d = docSnap.data();

          return {
            uid: String(d.uid ?? docSnap.id),
            displayName: String(d.displayName ?? ""),
            email: d.email ?? undefined,
            role: d.role ?? undefined,
            active: d.active ?? true,
          };
        });

        usersItems.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(usersItems);

        const profileItems: EmployeeProfileOption[] = profilesSnap.docs.map((docSnap) => {
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

        profileItems.sort((a, b) =>
          String(a.displayName || "").localeCompare(String(b.displayName || ""))
        );

        setEmployeeProfiles(profileItems);

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

        setAllPtoRequests(nextPto);
        setAllHolidays(nextHolidays);
      } catch (err: unknown) {
        setAssignmentError(
          err instanceof Error ? err.message : "Failed to load staff roster."
        );
      } finally {
        setStaffLoading(false);
      }
    }

    loadStaffAndAvailabilityInputs();
  }, []);

  useEffect(() => {
    const times = windowToTimes(selectedWindow === "custom" ? "am" : selectedWindow);

    if (selectedWindow !== "custom") {
      setSelectedStartTime(times.start);
      setSelectedEndTime(times.end);
    }
  }, [selectedWindow]);

  useEffect(() => {
    setHolidayOverrideEnabled(false);
  }, [selectedDate]);

  useEffect(() => {
    async function loadDayTrips() {
      if (!selectedDate || !scheduleNowExpanded) {
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
        setError(err instanceof Error ? err.message : "Failed to load daily availability.");
      } finally {
        setAvailabilityLoading(false);
      }
    }

    loadDayTrips();
  }, [selectedDate, scheduleNowExpanded]);

  const searchReady = customerSearch.trim().length >= 2;

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!searchReady) return [];

    return customers
      .filter((customer) => getCustomerSearchText(customer).includes(search))
      .slice(0, 6);
  }, [customers, customerSearch, searchReady]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const activeServiceAddressCount = useMemo(() => {
    return selectedCustomer?.serviceAddresses.filter((addr) => addr.active !== false).length ?? 0;
  }, [selectedCustomer]);

  const availableServiceAddresses = useMemo<AvailableServiceAddressOption[]>(() => {
    if (!selectedCustomer) return [];

    const activeAddresses = selectedCustomer.serviceAddresses.filter(
      (addr) => addr.active !== false
    );

    if (activeAddresses.length === 0) {
      return [
        {
          id: "billing-fallback",
          label: "Billing Address",
          addressLine1: selectedCustomer.billingAddressLine1,
          addressLine2: selectedCustomer.billingAddressLine2,
          city: selectedCustomer.billingCity,
          state: selectedCustomer.billingState,
          postalCode: selectedCustomer.billingPostalCode,
          active: true,
          isPrimary: true,
          isBillingFallback: true,
        },
      ];
    }

    return [...activeAddresses].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
  }, [selectedCustomer]);

  useEffect(() => {
    if (availableServiceAddresses.length > 0) {
      const stillExists = availableServiceAddresses.some(
        (addr) => addr.id === selectedServiceAddressId
      );

      if (!stillExists) {
        setSelectedServiceAddressId(availableServiceAddresses[0].id);
      }
    } else {
      setSelectedServiceAddressId("");
    }
  }, [availableServiceAddresses, selectedServiceAddressId]);

  const selectedServiceAddress = useMemo(() => {
    return (
      availableServiceAddresses.find((addr) => addr.id === selectedServiceAddressId) ??
      availableServiceAddresses[0] ??
      null
    );
  }, [availableServiceAddresses, selectedServiceAddressId]);

  const currentTechnicians = useMemo(() => {
    const currentUids = new Set<string>();

    for (const p of employeeProfiles) {
      if ((p.employmentStatus || "current") !== "current") continue;

      const uid = String(p.userUid || "").trim();
      if (uid) currentUids.add(uid);
    }

    return users
      .filter((u) => u.active !== false)
      .filter((u) => currentUids.has(u.uid))
      .filter((u) => normalizeRole(u.role) === "technician")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, employeeProfiles]);

  const helpers = useMemo<HelperOption[]>(() => {
    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current") === "current")
      .map((p) => ({
        uid: String(p.userUid || "").trim(),
        name: String(p.displayName || "Unnamed"),
        laborRole: normalizeRole(p.laborRole),
        defaultPairedTechUid: p.defaultPairedTechUid ?? null,
      }))
      .filter(
        (helper) =>
          helper.uid &&
          (helper.laborRole === "helper" || helper.laborRole === "apprentice")
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employeeProfiles]);

  const businessDayCards = useMemo(() => {
    return getNextBusinessDays(initialBusinessDate, visibleBusinessDayCount);
  }, [initialBusinessDate, visibleBusinessDayCount]);

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
    return allPtoRequests.filter((request) =>
      dateFallsWithinPto(selectedDate, request)
    );
  }, [allPtoRequests, selectedDate]);

  const defaultHelperForPrimary = useMemo(() => {
    if (!selectedPrimaryUid) return "";

    return (
      helpers.find(
        (helper) =>
          String(helper.defaultPairedTechUid || "").trim() === selectedPrimaryUid
      )?.uid || ""
    );
  }, [helpers, selectedPrimaryUid]);

  useEffect(() => {
    if (!useDefaultHelper) return;

    if (!selectedPrimaryUid) {
      setSelectedHelperUid("");
      return;
    }

    setSelectedHelperUid(defaultHelperForPrimary);
  }, [useDefaultHelper, selectedPrimaryUid, defaultHelperForPrimary]);

  const selectedMembers = useMemo(() => {
    const techMap = new Map(currentTechnicians.map((tech) => [tech.uid, tech.displayName]));
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
    currentTechnicians,
    helpers,
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

    for (const tech of currentTechnicians) {
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
    currentTechnicians,
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

  useEffect(() => {
    if (selectedOverlapConflicts.length === 0) {
      setDispatchOverrideEnabled(false);
      setDispatchOverrideReason("");
    }
  }, [selectedOverlapConflicts]);

  const assignedTeamNames = useMemo(() => {
    const techMap = new Map(currentTechnicians.map((u) => [u.uid, u.displayName]));
    const helperMap = new Map(helpers.map((h) => [h.uid, h.name]));

    const names: string[] = [];

    const push = (uid: string) => {
      if (!uid) return;
      const name = techMap.get(uid) || helperMap.get(uid) || uid;
      if (!names.includes(name)) names.push(name);
    };

    push(selectedPrimaryUid);
    push(selectedSecondaryUid);
    push(selectedHelperUid);
    push(selectedSecondaryHelperUid);

    return names;
  }, [
    currentTechnicians,
    helpers,
    selectedPrimaryUid,
    selectedSecondaryUid,
    selectedHelperUid,
    selectedSecondaryHelperUid,
  ]);

  function findTechName(uid: string) {
    return currentTechnicians.find((tech) => tech.uid === uid)?.displayName || "";
  }

  function findHelperName(uid: string) {
    return helpers.find((helper) => helper.uid === uid)?.name || "";
  }

  function handlePickSlot(uid: string, window: Exclude<TripTimeWindow, "custom">) {
    setSelectedPrimaryUid(uid);
    setSelectedWindow(window);

    const times = windowToTimes(window);

    setSelectedStartTime(times.start);
    setSelectedEndTime(times.end);
  }

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setQuickAddServiceLocationOpen(false);
    resetQuickAddServiceLocationForm();
    setError("");
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
    setSelectedServiceAddressId("");
    setCustomerSearch("");
    setQuickAddServiceLocationOpen(false);
    resetQuickAddServiceLocationForm();
    setError("");
  }

  function resetQuickAddServiceLocationForm() {
    setQuickAddError("");
    setQuickServiceLabel("");
    setQuickServiceAddressSearch("");
    setQuickServiceAddressLine1("");
    setQuickServiceAddressLine2("");
    setQuickServiceCity("");
    setQuickServiceState("");
    setQuickServicePostalCode("");
    setQuickServiceNotes("");
    setQuickServiceAddressSource("manual");
  }

  function markQuickServiceAddressManual() {
    setQuickServiceAddressSource((current) =>
      current === "google_places" ? "manual" : current
    );
  }

  function handleQuickServiceGoogleAddressSelected(selection: GoogleAddressSelectionLike) {
    setQuickServiceAddressSearch(selection.formattedAddress || "");
    setQuickServiceAddressLine1(selection.addressLine1 || "");
    setQuickServiceAddressLine2(selection.addressLine2 || "");
    setQuickServiceCity(selection.city || "");
    setQuickServiceState(selection.state || "");
    setQuickServicePostalCode(selection.postalCode || "");
    setQuickServiceAddressSource("google_places");
  }

  async function handleQuickAddServiceLocation() {
    if (!selectedCustomer) {
      setQuickAddError("Select a customer first.");
      return;
    }

    const addressLine1 = quickServiceAddressLine1.trim();
    const city = quickServiceCity.trim();
    const state = quickServiceState.trim();
    const postalCode = quickServicePostalCode.trim();

    if (!addressLine1) {
      setQuickAddError("Address line 1 is required.");
      return;
    }

    if (!city) {
      setQuickAddError("City is required.");
      return;
    }

    if (!state) {
      setQuickAddError("State is required.");
      return;
    }

    if (!postalCode) {
      setQuickAddError("Postal code is required.");
      return;
    }

    setQuickAddError("");
    setQuickAddSaving(true);

    try {
      const timestamp = nowIso();

      const activeExisting = selectedCustomer.serviceAddresses.filter(
        (addr) => addr.active !== false
      );

      const nextAddress: ServiceAddressOption = {
        id: createId(),
        label: quickServiceLabel.trim() || undefined,
        addressLine1,
        addressLine2: quickServiceAddressLine2.trim() || undefined,
        city,
        state,
        postalCode,
        notes: quickServiceNotes.trim() || undefined,
        active: true,
        isPrimary: activeExisting.length === 0,
        source: quickServiceAddressSource,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const nextServiceAddresses = [...selectedCustomer.serviceAddresses, nextAddress];

      const nextServiceAddressesForFirestore = nextServiceAddresses.map((addr) => ({
        ...addr,
        label: addr.label ?? null,
        addressLine2: addr.addressLine2 ?? null,
        notes: addr.notes ?? null,
        source: addr.source ?? null,
      }));

      await updateDoc(doc(db, "customers", selectedCustomer.id), {
        serviceAddresses: nextServiceAddressesForFirestore,
        updatedAt: timestamp,
      });

      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === selectedCustomer.id
            ? {
                ...customer,
                serviceAddresses: nextServiceAddresses,
              }
            : customer
        )
      );

      setSelectedServiceAddressId(nextAddress.id);
      setQuickAddServiceLocationOpen(false);
      resetQuickAddServiceLocationForm();
    } catch (err: unknown) {
      setQuickAddError(
        err instanceof Error ? err.message : "Failed to add service location."
      );
    } finally {
      setQuickAddSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedCustomer) {
      setError("Please search for and select a customer.");
      return;
    }

    const chosenAddress =
      availableServiceAddresses.find((addr) => addr.id === selectedServiceAddressId) ??
      availableServiceAddresses[0];

    if (!chosenAddress) {
      setError("Please select a service address.");
      return;
    }

    if (!issueSummary.trim()) {
      setError("Please enter an issue summary.");
      return;
    }

    const hours = Number(estimatedDurationHours);

    if (!Number.isFinite(hours) || hours < 1) {
      setError("Estimated duration must be at least 1 hour.");
      return;
    }

    if (!Number.isInteger(hours * 2)) {
      setError("Estimated duration must use 0.5 hour increments.");
      return;
    }

    if (scheduleNowEnabled) {
      if (!canDispatch) {
        setError("You do not have permission to schedule trips.");
        return;
      }

      if (!selectedDate.trim()) {
        setError("Trip date is required.");
        return;
      }

      if (!selectedPrimaryUid.trim()) {
        setError("Primary technician is required when Schedule Now is enabled.");
        return;
      }

      if (
        !selectedStartTime.trim() ||
        !selectedEndTime.trim() ||
        selectedEndTime <= selectedStartTime
      ) {
        setError("Enter a valid start and end time.");
        return;
      }

      if (selectedDateHolidays.length > 0 && !holidayOverrideEnabled) {
        setError(
          `Selected day is a company holiday (${selectedDateHolidays
            .map((holiday) => holiday.name)
            .join(", ")}). Enable Holiday Override to continue.`
        );
        return;
      }

      if (selectedOverlapConflicts.length > 0 && !dispatchOverrideEnabled) {
        setError(
          "One or more selected crew members already have an overlapping trip. Enable Dispatch Override to continue."
        );
        return;
      }

      if (dispatchOverrideEnabled && !dispatchOverrideReason.trim()) {
        setError("Dispatch override reason is required.");
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
        setError(
          "One or more selected crew members have a hard conflict. Pick a different slot or use holiday / dispatch override when allowed."
        );
        return;
      }
    }

    setError("");
    setSaving(true);

    try {
      const timestamp = nowIso();
      const estimatedDurationMinutes = Math.round(hours * 60);

      const ticketRef = doc(collection(db, "serviceTickets"));
      const batch = writeBatch(db);

      const helperUid = scheduleNowEnabled ? selectedHelperUid.trim() || "" : "";
      const secondaryTechUid = scheduleNowEnabled
        ? selectedSecondaryUid.trim() || ""
        : "";
      const secondaryHelperUid = scheduleNowEnabled
        ? selectedSecondaryHelperUid.trim() || ""
        : "";
      const primaryUid = scheduleNowEnabled ? selectedPrimaryUid.trim() : null;

      const primaryName = primaryUid ? findTechName(primaryUid) || "Unnamed Technician" : null;
      const helperName = helperUid ? findHelperName(helperUid) || "Unnamed Helper" : null;
      const secondaryTechName = secondaryTechUid
        ? findTechName(secondaryTechUid) || "Unnamed Technician"
        : null;
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Unnamed Helper"
        : null;

      const assignedTechnicianIds: string[] = [];

      if (primaryUid) assignedTechnicianIds.push(primaryUid);
      if (secondaryTechUid && !assignedTechnicianIds.includes(secondaryTechUid)) {
        assignedTechnicianIds.push(secondaryTechUid);
      }
      if (helperUid && !assignedTechnicianIds.includes(helperUid)) {
        assignedTechnicianIds.push(helperUid);
      }
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      const nextTicketStatus: TicketStatus = scheduleNowEnabled ? "scheduled" : status;

      batch.set(ticketRef, {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

        serviceAddressId: chosenAddress.isBillingFallback ? null : chosenAddress.id,
        serviceAddressLabel: chosenAddress.label ?? null,
        serviceAddressLine1: chosenAddress.addressLine1,
        serviceAddressLine2: chosenAddress.addressLine2 ?? null,
        serviceCity: chosenAddress.city,
        serviceState: chosenAddress.state,
        servicePostalCode: chosenAddress.postalCode,

        issueSummary: issueSummary.trim(),
        issueDetails: issueDetails.trim() || null,

        status: nextTicketStatus,
        estimatedDurationMinutes,

        scheduledDate: scheduleNowEnabled ? selectedDate : null,
        scheduledStartTime: scheduleNowEnabled ? selectedStartTime : null,
        scheduledEndTime: scheduleNowEnabled ? selectedEndTime : null,

        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryName,

        primaryTechnicianId: primaryUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperUid ? [helperUid] : null,
        helperNames: helperName ? [helperName] : null,
        assignedTechnicianIds: assignedTechnicianIds.length ? assignedTechnicianIds : null,

        internalNotes: internalNotes.trim() || null,

        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      if (scheduleNowEnabled && primaryUid && primaryName) {
        const tripRef = doc(collection(db, "trips"));

        const dispatchOverridePayload =
          dispatchOverrideEnabled && selectedOverlapConflicts.length > 0
            ? {
                enabled: true,
                reason: dispatchOverrideReason.trim(),
                createdAt: timestamp,
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

        const tripEstimatedDurationMinutes = getMinutesBetween(
          selectedStartTime,
          selectedEndTime
        );

        batch.set(tripRef, {
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
            primaryTechUid: primaryUid,
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
            serviceTicketId: ticketRef.id,
            projectId: null,
            projectStageKey: null,
          },
          previewTitle: selectedCustomer.displayName || "Customer",
          previewSubtitle: issueSummary.trim() || "Service Ticket",
          estimatedDurationMinutes: tripEstimatedDurationMinutes,
          notes: tripNotes.trim() || null,
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
          createdAt: timestamp,
          createdByUid: appUser?.uid || null,
          updatedAt: timestamp,
          updatedByUid: appUser?.uid || null,
        });
      }

      await batch.commit();

      router.push(`/service-tickets/${ticketRef.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create service ticket.");
    } finally {
      setSaving(false);
    }
  }

  const scheduleSummary = useMemo(() => {
    if (!scheduleNowEnabled) return "Not scheduled";

    const windowLabel =
      selectedWindow === "custom"
        ? `${formatTime12h(selectedStartTime)}–${formatTime12h(selectedEndTime)}`
        : selectedWindow === "all_day"
          ? "All Day"
          : selectedWindow === "pm"
            ? "PM"
            : "AM";

    return `${selectedDate} • ${windowLabel} • ${findTechName(selectedPrimaryUid) || "No tech"}`;
  }, [
    scheduleNowEnabled,
    selectedDate,
    selectedWindow,
    selectedStartTime,
    selectedEndTime,
    selectedPrimaryUid,
    currentTechnicians,
  ]);

  return (
    <ProtectedPage fallbackTitle="New Service Ticket">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 980, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
                New Service Ticket
              </Typography>
              <Typography variant="body1" sx={{ color: "text.secondary", mt: 1 }}>
                Create the ticket first, or expand Schedule Now when dispatch needs to assign
                the trip immediately.
              </Typography>
            </Box>

            {customersLoading ? (
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ py: 5 }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">
                      Loading customers…
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {customersError ? <Alert severity="error">{customersError}</Alert> : null}

            {!customersLoading && !customersError ? (
              <Box component="form" onSubmit={handleSubmit}>
                <Card variant="outlined" sx={{ borderRadius: 4, overflow: "hidden" }}>
                  <CardContent sx={{ p: 0 }}>
                    <Stack divider={<Divider />} spacing={0}>
                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          {error ? <Alert severity="error">{error}</Alert> : null}

                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <PersonSearchRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Customer
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Search by customer name, phone, email, or address.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Search customer"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Start typing to find a customer"
                            fullWidth
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <SearchRoundedIcon />
                                </InputAdornment>
                              ),
                            }}
                          />

                          {selectedCustomer ? (
                            <Card
                              variant="outlined"
                              sx={{
                                borderRadius: 3,
                                bgcolor: "action.hover",
                                borderColor: "primary.main",
                              }}
                            >
                              <CardContent>
                                <Stack spacing={1.5}>
                                  <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1.5}
                                    justifyContent="space-between"
                                    alignItems={{ xs: "flex-start", sm: "center" }}
                                  >
                                    <Box>
                                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                        {selectedCustomer.displayName}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        {selectedCustomer.phonePrimary || "No primary phone"}
                                      </Typography>
                                      {selectedCustomer.email ? (
                                        <Typography variant="body2" color="text.secondary">
                                          {selectedCustomer.email}
                                        </Typography>
                                      ) : null}
                                    </Box>

                                    <Button
                                      type="button"
                                      variant="text"
                                      onClick={handleClearSelectedCustomer}
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    >
                                      Change customer
                                    </Button>
                                  </Stack>

                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip label="Customer selected" color="primary" />
                                    <Chip
                                      label={`${activeServiceAddressCount} saved service location${
                                        activeServiceAddressCount === 1 ? "" : "s"
                                      }`}
                                      variant="outlined"
                                    />
                                  </Stack>

                                  <Typography variant="body2" color="text.secondary">
                                    Billing address:{" "}
                                    {formatAddress({
                                      addressLine1: selectedCustomer.billingAddressLine1,
                                      addressLine2: selectedCustomer.billingAddressLine2,
                                      city: selectedCustomer.billingCity,
                                      state: selectedCustomer.billingState,
                                      postalCode: selectedCustomer.billingPostalCode,
                                    }) || "—"}
                                  </Typography>
                                </Stack>
                              </CardContent>
                            </Card>
                          ) : searchReady ? (
                            filteredCustomers.length === 0 ? (
                              <Card
                                variant="outlined"
                                sx={{
                                  borderRadius: 4,
                                  borderStyle: "dashed",
                                  bgcolor: "background.default",
                                }}
                              >
                                <CardContent>
                                  <Typography variant="body2" color="text.secondary">
                                    No matching customers found.
                                  </Typography>
                                </CardContent>
                              </Card>
                            ) : (
                              <Stack spacing={1.25}>
                                {filteredCustomers.map((customer) => (
                                  <Card
                                    key={customer.id}
                                    variant="outlined"
                                    sx={{ borderRadius: 4, overflow: "hidden" }}
                                  >
                                    <CardActionArea onClick={() => handleSelectCustomer(customer.id)}>
                                      <CardContent>
                                        <Stack spacing={0.75}>
                                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                            {customer.displayName}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            {customer.phonePrimary || "No phone"}
                                          </Typography>
                                          {customer.email ? (
                                            <Typography variant="caption" color="text.secondary">
                                              {customer.email}
                                            </Typography>
                                          ) : null}
                                          <Typography variant="caption" color="text.secondary">
                                            {formatAddress({
                                              addressLine1: customer.billingAddressLine1,
                                              addressLine2: customer.billingAddressLine2,
                                              city: customer.billingCity,
                                              state: customer.billingState,
                                              postalCode: customer.billingPostalCode,
                                            }) || "No billing address"}
                                          </Typography>
                                        </Stack>
                                      </CardContent>
                                    </CardActionArea>
                                  </Card>
                                ))}
                              </Stack>
                            )
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Type at least 2 characters to search.
                            </Typography>
                          )}

                          <Stack spacing={1.5} sx={{ pt: 1 }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <HomeWorkRoundedIcon color="primary" />
                              <Box>
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                  Service Location
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Choose where the work will be performed, or quick add a new
                                  location for this customer.
                                </Typography>
                              </Box>
                            </Stack>

                            <TextField
                              select
                              label="Service address"
                              value={selectedServiceAddressId}
                              onChange={(e) => {
                                const nextValue = String(e.target.value);

                                if (nextValue === "__quick_add__") {
                                  setQuickAddServiceLocationOpen(true);
                                  setQuickAddError("");
                                  return;
                                }

                                setSelectedServiceAddressId(nextValue);
                              }}
                              fullWidth
                              required
                              disabled={!selectedCustomer}
                              helperText={
                                selectedCustomer
                                  ? "Choose an existing location, or quick add a new one from this list."
                                  : "Select a customer first."
                              }
                            >
                              <MenuItem value="">
                                {selectedCustomer
                                  ? "Select a service address"
                                  : "Select a customer first"}
                              </MenuItem>

                              {availableServiceAddresses.map((addr) => (
                                <MenuItem key={addr.id} value={addr.id}>
                                  {addr.label ? `${addr.label} — ` : ""}
                                  {addr.addressLine1}, {addr.city}, {addr.state}{" "}
                                  {addr.postalCode}
                                  {addr.isPrimary ? " (Primary)" : ""}
                                </MenuItem>
                              ))}

                              {selectedCustomer ? (
                                <MenuItem
                                  value="__quick_add__"
                                  sx={{
                                    mt: 0.5,
                                    borderTop: "1px solid",
                                    borderColor: "divider",
                                    color: "primary.main",
                                    fontWeight: 800,
                                  }}
                                >
                                  + Quick Add Service Location
                                </MenuItem>
                              ) : null}
                            </TextField>

                            {selectedServiceAddress ? (
                              <Card
                                variant="outlined"
                                sx={{ borderRadius: 3, bgcolor: "background.default" }}
                              >
                                <CardContent sx={{ py: 2 }}>
                                  <Stack spacing={0.75}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                      Selected location
                                    </Typography>
                                    <Typography variant="body2">
                                      {selectedServiceAddress.label || "Service Address"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {formatAddress({
                                        addressLine1: selectedServiceAddress.addressLine1,
                                        addressLine2: selectedServiceAddress.addressLine2,
                                        city: selectedServiceAddress.city,
                                        state: selectedServiceAddress.state,
                                        postalCode: selectedServiceAddress.postalCode,
                                      }) || "—"}
                                    </Typography>
                                  </Stack>
                                </CardContent>
                              </Card>
                            ) : null}

                            {selectedCustomer && quickAddServiceLocationOpen ? (
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: { xs: 2, sm: 2.5 },
                                  borderRadius: 4,
                                  bgcolor: "background.default",
                                }}
                              >
                                <Stack spacing={2}>
                                  <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                      Quick Add Service Location
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      Add a new service location to this customer, then use it for
                                      this ticket.
                                    </Typography>
                                  </Box>

                                  <TextField
                                    label="Label"
                                    value={quickServiceLabel}
                                    onChange={(e) => setQuickServiceLabel(e.target.value)}
                                    fullWidth
                                    placeholder="Home, Rental House, Shop, Weekend House..."
                                    disabled={quickAddSaving}
                                  />

                                  <AddressAutocompleteField
                                    label="Search address"
                                    value={quickServiceAddressSearch}
                                    onChange={(value) => {
                                      setQuickServiceAddressSearch(value);
                                      markQuickServiceAddressManual();
                                    }}
                                    onSelectAddress={handleQuickServiceGoogleAddressSelected}
                                    helperText="Start typing to search for a real address, or keep entering it manually below."
                                    placeholder="Start typing a service address..."
                                    disabled={quickAddSaving}
                                  />

                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                      size="small"
                                      label={
                                        quickServiceAddressSource === "google_places"
                                          ? "Google suggested"
                                          : "Manual entry"
                                      }
                                      color={
                                        quickServiceAddressSource === "google_places"
                                          ? "primary"
                                          : "default"
                                      }
                                      variant={
                                        quickServiceAddressSource === "google_places"
                                          ? "filled"
                                          : "outlined"
                                      }
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    />
                                  </Stack>

                                  <TextField
                                    label="Address line 1"
                                    value={quickServiceAddressLine1}
                                    onChange={(e) => {
                                      setQuickServiceAddressLine1(e.target.value);
                                      markQuickServiceAddressManual();
                                    }}
                                    required
                                    fullWidth
                                    disabled={quickAddSaving}
                                  />

                                  <TextField
                                    label="Address line 2"
                                    value={quickServiceAddressLine2}
                                    onChange={(e) => {
                                      setQuickServiceAddressLine2(e.target.value);
                                      markQuickServiceAddressManual();
                                    }}
                                    fullWidth
                                    disabled={quickAddSaving}
                                  />

                                  <Box
                                    sx={{
                                      display: "grid",
                                      gridTemplateColumns: {
                                        xs: "1fr",
                                        sm: "repeat(3, minmax(0, 1fr))",
                                      },
                                      gap: 2,
                                    }}
                                  >
                                    <TextField
                                      label="City"
                                      value={quickServiceCity}
                                      onChange={(e) => {
                                        setQuickServiceCity(e.target.value);
                                        markQuickServiceAddressManual();
                                      }}
                                      required
                                      fullWidth
                                      disabled={quickAddSaving}
                                    />

                                    <TextField
                                      label="State"
                                      value={quickServiceState}
                                      onChange={(e) => {
                                        setQuickServiceState(e.target.value);
                                        markQuickServiceAddressManual();
                                      }}
                                      required
                                      fullWidth
                                      disabled={quickAddSaving}
                                    />

                                    <TextField
                                      label="Postal code"
                                      value={quickServicePostalCode}
                                      onChange={(e) => {
                                        setQuickServicePostalCode(e.target.value);
                                        markQuickServiceAddressManual();
                                      }}
                                      required
                                      fullWidth
                                      disabled={quickAddSaving}
                                    />
                                  </Box>

                                  <TextField
                                    label="Notes"
                                    value={quickServiceNotes}
                                    onChange={(e) => setQuickServiceNotes(e.target.value)}
                                    multiline
                                    minRows={3}
                                    fullWidth
                                    disabled={quickAddSaving}
                                    placeholder="Gate code, unit note, access details, etc."
                                  />

                                  {quickAddError ? (
                                    <Alert severity="error">{quickAddError}</Alert>
                                  ) : null}

                                  <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1.5}
                                    justifyContent="flex-end"
                                  >
                                    <Button
                                      type="button"
                                      variant="outlined"
                                      onClick={() => {
                                        setQuickAddServiceLocationOpen(false);
                                        resetQuickAddServiceLocationForm();
                                      }}
                                      disabled={quickAddSaving}
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    >
                                      Cancel
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="contained"
                                      startIcon={
                                        quickAddSaving ? (
                                          <CircularProgress size={18} color="inherit" />
                                        ) : (
                                          <AddHomeRoundedIcon />
                                        )
                                      }
                                      onClick={handleQuickAddServiceLocation}
                                      disabled={quickAddSaving}
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    >
                                      {quickAddSaving ? "Saving..." : "Add & Use Location"}
                                    </Button>
                                  </Stack>
                                </Stack>
                              </Paper>
                            ) : null}
                          </Stack>
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <BuildCircleRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Work Order Details
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Add the core issue and current ticket status.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Issue summary"
                            value={issueSummary}
                            onChange={(e) => setIssueSummary(e.target.value)}
                            fullWidth
                            required
                            placeholder="Ex: Water heater not heating"
                          />

                          <TextField
                            label="Issue details"
                            value={issueDetails}
                            onChange={(e) => setIssueDetails(e.target.value)}
                            fullWidth
                            multiline
                            minRows={4}
                            placeholder="Add symptoms, prior history, access info, or anything the field crew should know."
                          />

                          <Box
                            sx={{
                              display: "grid",
                              gap: 2,
                              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            }}
                          >
                            <TextField
                              select
                              label="Initial ticket status"
                              value={status}
                              onChange={(e) => setStatus(e.target.value as TicketStatus)}
                              fullWidth
                              disabled={scheduleNowEnabled}
                              helperText={
                                scheduleNowEnabled
                                  ? "Schedule Now will create this ticket as Scheduled."
                                  : "Usually New when first creating a ticket."
                              }
                            >
                              <MenuItem value="new">New</MenuItem>
                              <MenuItem value="scheduled">Scheduled</MenuItem>
                              <MenuItem value="in_progress">In Progress</MenuItem>
                              <MenuItem value="follow_up">Follow Up</MenuItem>
                              <MenuItem value="completed">Completed</MenuItem>
                              <MenuItem value="cancelled">Cancelled</MenuItem>
                            </TextField>

                            <TextField
                              label="Estimated duration (hours)"
                              type="number"
                              inputProps={{ min: 1, step: 0.5 }}
                              value={estimatedDurationHours}
                              onChange={(e) => setEstimatedDurationHours(e.target.value)}
                              fullWidth
                              required
                              helperText="Minimum 1 hour. Use 0.5 hour increments."
                            />
                          </Box>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip
                              label={`Ticket Status: ${
                                scheduleNowEnabled ? "Scheduled" : getStatusLabel(status)
                              }`}
                              variant="outlined"
                            />
                            <Chip
                              label={`Est. ${estimatedDurationHours || "—"} hr`}
                              variant="outlined"
                            />
                          </Stack>
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2}>
                          <Paper
                            variant="outlined"
                            sx={{
                              borderRadius: 1,
                              overflow: "hidden",
                              borderColor: scheduleNowEnabled
                                ? alpha(theme.palette.primary.main, 0.45)
                                : "divider",
                              bgcolor: scheduleNowEnabled
                                ? alpha(theme.palette.primary.main, 0.035)
                                : "background.paper",
                            }}
                          >
                            <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={2}
                                alignItems={{ xs: "stretch", sm: "center" }}
                                justifyContent="space-between"
                              >
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                  <ScheduleRoundedIcon color="primary" />
                                  <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                      Schedule Now — Optional
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      Collapsed by default. Expand only when dispatch wants to
                                      create the ticket and schedule the first trip now.
                                    </Typography>
                                  </Box>
                                </Stack>

                                <Button
                                  type="button"
                                  variant={scheduleNowExpanded ? "contained" : "outlined"}
                                  onClick={() => {
                                    setScheduleNowExpanded((prev) => !prev);
                                    if (!scheduleNowExpanded) setScheduleNowEnabled(true);
                                  }}
                                  endIcon={
                                    scheduleNowExpanded ? (
                                      <ExpandLessRoundedIcon />
                                    ) : (
                                      <ExpandMoreRoundedIcon />
                                    )
                                  }
                                  disabled={!canDispatch}
                                  sx={{ borderRadius: 99, fontWeight: 800 }}
                                >
                                  {scheduleNowExpanded ? "Hide Scheduler" : "Schedule Now"}
                                </Button>
                              </Stack>

                              {!canDispatch ? (
                                <Alert severity="info" sx={{ mt: 2, borderRadius: 3 }}>
                                  Only Admin, Dispatcher, and Manager roles can schedule during
                                  ticket creation.
                                </Alert>
                              ) : null}

                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                                <Chip
                                  icon={<CalendarMonthRoundedIcon />}
                                  label={scheduleSummary}
                                  color={scheduleNowEnabled ? "primary" : "default"}
                                  variant={scheduleNowEnabled ? "filled" : "outlined"}
                                  sx={{ borderRadius: 99 }}
                                />
                                {assignedTeamNames.length ? (
                                  <Chip
                                    icon={<AssignmentIndRoundedIcon />}
                                    label={assignedTeamNames.join(", ")}
                                    variant="outlined"
                                    sx={{ borderRadius: 99 }}
                                  />
                                ) : null}
                              </Stack>
                            </Box>

                            <Collapse in={scheduleNowExpanded} unmountOnExit>
                              <Divider />

                              <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
                                <Stack spacing={2.5}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        checked={scheduleNowEnabled}
                                        onChange={(e) =>
                                          setScheduleNowEnabled(e.target.checked)
                                        }
                                      />
                                    }
                                    label="Create a scheduled trip when this ticket is created"
                                  />

                                  {assignmentError ? (
                                    <Alert severity="error">{assignmentError}</Alert>
                                  ) : null}

                                  {staffLoading ? (
                                    <Stack direction="row" spacing={2} alignItems="center">
                                      <CircularProgress size={20} />
                                      <Typography variant="body2" color="text.secondary">
                                        Loading employee roster…
                                      </Typography>
                                    </Stack>
                                  ) : (
                                    <>
                                      <Box>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                          Next Business Days
                                        </Typography>
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                          sx={{ mt: 0.5 }}
                                        >
                                          Pick a working day first, then choose an available tech
                                          and time block.
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
                                                holiday.active !== false &&
                                                holiday.date === dayIso
                                            )
                                            .map((holiday) => holiday.name);

                                          return (
                                            <Card
                                              key={dayIso}
                                              elevation={0}
                                              sx={{
                                                borderRadius: 1,
                                                border: `1px solid ${
                                                  isSelected
                                                    ? alpha(theme.palette.primary.main, 0.5)
                                                    : theme.palette.divider
                                                }`,
                                                bgcolor: isSelected
                                                  ? alpha(theme.palette.primary.main, 0.08)
                                                  : theme.palette.background.paper,
                                                overflow: "hidden",
                                              }}
                                            >
                                              <CardActionArea
                                                onClick={() => setSelectedDate(dayIso)}
                                              >
                                                <CardContent sx={{ p: 1.5 }}>
                                                  <Stack spacing={1}>
                                                    <Stack
                                                      direction="row"
                                                      justifyContent="space-between"
                                                      alignItems="flex-start"
                                                      spacing={1}
                                                    >
                                                      <Box>
                                                        <Typography
                                                          variant="overline"
                                                          sx={{ lineHeight: 1 }}
                                                        >
                                                          {formatDayShort(dayIso)}
                                                        </Typography>
                                                        <Typography
                                                          variant="subtitle1"
                                                          fontWeight={800}
                                                        >
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
                                                        sx={{
                                                          width: "fit-content",
                                                          borderRadius: 999,
                                                        }}
                                                      />
                                                    ) : (
                                                      <Chip
                                                        size="small"
                                                        icon={<CalendarMonthRoundedIcon />}
                                                        label="Working Day"
                                                        variant="outlined"
                                                        sx={{
                                                          width: "fit-content",
                                                          borderRadius: 999,
                                                        }}
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
                                          type="button"
                                          variant="outlined"
                                          onClick={() =>
                                            setVisibleBusinessDayCount((prev) => prev + 7)
                                          }
                                          sx={{ borderRadius: 99, fontWeight: 700 }}
                                        >
                                          Show More Days
                                        </Button>
                                      </Stack>

                                      <DispatchAvailabilityPlanner
                                        date={selectedDate}
                                        technicians={currentTechnicians.map((tech) => ({
                                          uid: tech.uid,
                                          displayName: tech.displayName,
                                        }))}
                                        slotStatusByTech={slotStatusByTech}
                                        selectedPrimaryUid={selectedPrimaryUid}
                                        selectedWindow={selectedWindow}
                                        selectedCrewSummary={selectedCrewSummary}
                                        holidayNames={holidayNames}
                                        holidayOverrideEnabled={holidayOverrideEnabled}
                                        canOverrideHoliday={canDispatch}
                                        onHolidayOverrideChange={setHolidayOverrideEnabled}
                                        onPickSlot={handlePickSlot}
                                      />

                                      <Box
                                        sx={{
                                          display: "grid",
                                          gap: 2,
                                          gridTemplateColumns: {
                                            xs: "1fr",
                                            md: "1fr 1fr",
                                          },
                                        }}
                                      >
                                        <TextField
                                          select
                                          label="Primary Technician"
                                          value={selectedPrimaryUid}
                                          onChange={(e) =>
                                            setSelectedPrimaryUid(e.target.value)
                                          }
                                        >
                                          <MenuItem value="">Select a technician…</MenuItem>
                                          {currentTechnicians.map((tech) => (
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
                                          <MenuItem value="am">
                                            Morning (8:00–12:00)
                                          </MenuItem>
                                          <MenuItem value="pm">
                                            Afternoon (1:00–5:00)
                                          </MenuItem>
                                          <MenuItem value="all_day">
                                            All Day (8:00–5:00)
                                          </MenuItem>
                                          <MenuItem value="custom">Custom</MenuItem>
                                        </TextField>
                                      </Box>

                                      {selectedWindow === "custom" ? (
                                        <Box
                                          sx={{
                                            display: "grid",
                                            gap: 2,
                                            gridTemplateColumns: {
                                              xs: "1fr",
                                              md: "1fr 1fr",
                                            },
                                          }}
                                        >
                                          <TextField
                                            type="time"
                                            label="Start Time"
                                            value={selectedStartTime}
                                            onChange={(e) =>
                                              setSelectedStartTime(e.target.value)
                                            }
                                            InputLabelProps={{ shrink: true }}
                                          />

                                          <TextField
                                            type="time"
                                            label="End Time"
                                            value={selectedEndTime}
                                            onChange={(e) =>
                                              setSelectedEndTime(e.target.value)
                                            }
                                            InputLabelProps={{ shrink: true }}
                                          />
                                        </Box>
                                      ) : null}

                                      <Box
                                        sx={{
                                          display: "grid",
                                          gap: 2,
                                          gridTemplateColumns: {
                                            xs: "1fr",
                                            md: "1fr 1fr",
                                          },
                                        }}
                                      >
                                        <TextField
                                          select
                                          label="Secondary Technician (optional)"
                                          value={selectedSecondaryUid}
                                          onChange={(e) =>
                                            setSelectedSecondaryUid(e.target.value)
                                          }
                                        >
                                          <MenuItem value="">— None —</MenuItem>
                                          {currentTechnicians
                                            .filter((tech) => tech.uid !== selectedPrimaryUid)
                                            .map((tech) => (
                                              <MenuItem key={tech.uid} value={tech.uid}>
                                                {tech.displayName}
                                              </MenuItem>
                                            ))}
                                        </TextField>

                                        <Box sx={{ display: "flex", alignItems: "center" }}>
                                          <FormControlLabel
                                            control={
                                              <Checkbox
                                                checked={useDefaultHelper}
                                                onChange={(e) =>
                                                  setUseDefaultHelper(e.target.checked)
                                                }
                                              />
                                            }
                                            label="Use default helper pairing"
                                          />
                                        </Box>
                                      </Box>

                                      <Box
                                        sx={{
                                          display: "grid",
                                          gap: 2,
                                          gridTemplateColumns: {
                                            xs: "1fr",
                                            md: "1fr 1fr",
                                          },
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
                                          {helpers.map((helper) => (
                                            <MenuItem key={helper.uid} value={helper.uid}>
                                              {helper.name} ({helper.laborRole})
                                            </MenuItem>
                                          ))}
                                        </TextField>

                                        <TextField
                                          select
                                          label="Secondary Helper (optional)"
                                          value={selectedSecondaryHelperUid}
                                          onChange={(e) =>
                                            setSelectedSecondaryHelperUid(e.target.value)
                                          }
                                        >
                                          <MenuItem value="">— None —</MenuItem>
                                          {helpers.map((helper) => (
                                            <MenuItem key={helper.uid} value={helper.uid}>
                                              {helper.name} ({helper.laborRole})
                                            </MenuItem>
                                          ))}
                                        </TextField>
                                      </Box>

                                      {selectedOverlapConflicts.length > 0 ? (
                                        <Paper
                                          variant="outlined"
                                          sx={{
                                            p: 1.5,
                                            borderRadius: 3,
                                            borderColor: alpha(
                                              theme.palette.warning.main,
                                              0.4
                                            ),
                                            bgcolor: alpha(theme.palette.warning.main, 0.06),
                                          }}
                                        >
                                          <Stack spacing={1.25}>
                                            <Alert
                                              severity="warning"
                                              variant="outlined"
                                              sx={{ borderRadius: 2 }}
                                            >
                                              One or more selected crew members already have an
                                              overlapping trip in this time slot. You can still
                                              dispatch this service trip by using Dispatch Override.
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
                                                      sx={{
                                                        mt: "2px",
                                                        color: "primary.main",
                                                      }}
                                                    />
                                                  ) : conflict.tripType === "project" ? (
                                                    <ConstructionRoundedIcon
                                                      fontSize="small"
                                                      sx={{
                                                        mt: "2px",
                                                        color: "secondary.main",
                                                      }}
                                                    />
                                                  ) : (
                                                    <ScheduleRoundedIcon
                                                      fontSize="small"
                                                      sx={{
                                                        mt: "2px",
                                                        color: "text.secondary",
                                                      }}
                                                    />
                                                  )}

                                                  <Box>
                                                    <Typography
                                                      variant="body2"
                                                      color="text.secondary"
                                                    >
                                                      <strong>{conflict.memberName}</strong>{" "}
                                                      already assigned to{" "}
                                                      <strong>{conflict.previewTitle}</strong>
                                                    </Typography>

                                                    {conflict.previewSubtitle ? (
                                                      <Typography
                                                        variant="caption"
                                                        color="text.secondary"
                                                      >
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

                                            <FormControlLabel
                                              control={
                                                <Checkbox
                                                  checked={dispatchOverrideEnabled}
                                                  onChange={(e) =>
                                                    setDispatchOverrideEnabled(
                                                      e.target.checked
                                                    )
                                                  }
                                                />
                                              }
                                              label="Enable Dispatch Override for this overlapping service dispatch"
                                            />

                                            {dispatchOverrideEnabled ? (
                                              <TextField
                                                label="Dispatch Override Reason"
                                                value={dispatchOverrideReason}
                                                onChange={(e) =>
                                                  setDispatchOverrideReason(e.target.value)
                                                }
                                                multiline
                                                minRows={3}
                                                placeholder="Example: emergency no-water call, quick diagnostic, high-priority customer, etc."
                                              />
                                            ) : null}
                                          </Stack>
                                        </Paper>
                                      ) : null}

                                      <TextField
                                        label="Trip Notes"
                                        multiline
                                        minRows={3}
                                        value={tripNotes}
                                        onChange={(e) => setTripNotes(e.target.value)}
                                        placeholder="Optional scheduling or dispatch notes"
                                      />

                                      <Paper
                                        variant="outlined"
                                        sx={{
                                          p: 1.5,
                                          borderRadius: 1,
                                          bgcolor: alpha(theme.palette.primary.main, 0.03),
                                        }}
                                      >
                                        <Stack spacing={1}>
                                          <Typography variant="subtitle2" fontWeight={800}>
                                            Selected Schedule Summary
                                          </Typography>

                                          <Typography variant="body2" color="text.secondary">
                                            {selectedDate} •{" "}
                                            {selectedWindow === "custom"
                                              ? `Custom (${formatTime12h(
                                                  selectedStartTime
                                                )}–${formatTime12h(selectedEndTime)})`
                                              : selectedWindow === "all_day"
                                                ? "All Day"
                                                : selectedWindow === "pm"
                                                  ? "PM"
                                                  : "AM"}
                                          </Typography>

                                          <Typography variant="body2" color="text.secondary">
                                            Primary Tech:{" "}
                                            {findTechName(selectedPrimaryUid) || "—"}
                                          </Typography>

                                          <Typography variant="body2" color="text.secondary">
                                            Helper: {findHelperName(selectedHelperUid) || "—"}
                                          </Typography>

                                          {dispatchOverrideEnabled &&
                                          selectedOverlapConflicts.length > 0 ? (
                                            <Typography variant="body2" color="warning.main">
                                              Dispatch Override: Enabled
                                            </Typography>
                                          ) : null}
                                        </Stack>
                                      </Paper>

                                      {availabilityLoading ? (
                                        <Alert
                                          severity="info"
                                          variant="outlined"
                                          sx={{ borderRadius: 3 }}
                                        >
                                          Loading availability for {selectedDate}...
                                        </Alert>
                                      ) : null}
                                    </>
                                  )}
                                </Stack>
                              </Box>
                            </Collapse>
                          </Paper>
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <NotesRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Internal Notes
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Office-only notes, reminders, or special handling details.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Internal notes"
                            value={internalNotes}
                            onChange={(e) => setInternalNotes(e.target.value)}
                            fullWidth
                            multiline
                            minRows={3}
                            placeholder="Ex: Customer prefers afternoon arrival, gate code, special follow-up needed, waiting on parts, etc."
                          />
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 4,
                    position: "sticky",
                    bottom: 16,
                    zIndex: 2,
                    bgcolor: "background.paper",
                    mt: 2,
                    boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.08)}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          Ready to create this ticket?
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {scheduleNowEnabled
                            ? "This will create the service ticket and scheduled trip together."
                            : "This will create the service ticket without scheduling a trip."}
                        </Typography>
                      </Box>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={() => router.push("/service-tickets")}
                          disabled={saving || quickAddSaving}
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        >
                          Cancel
                        </Button>

                        <Button
                          type="submit"
                          variant="contained"
                          disabled={saving || quickAddSaving || availabilityLoading}
                          startIcon={
                            saving ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : scheduleNowEnabled ? (
                              <CheckCircleRoundedIcon />
                            ) : (
                              <AddTaskRoundedIcon />
                            )
                          }
                          sx={{ borderRadius: 99, fontWeight: 800 }}
                        >
                          {saving
                            ? "Creating…"
                            : scheduleNowEnabled
                              ? "Create & Schedule Ticket"
                              : "Create Service Ticket"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}