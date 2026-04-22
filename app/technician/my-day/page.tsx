// app/technician/my-day/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import SharedTripCard from "../../../components/trips/SharedTripCard";
import { alpha, useTheme } from "@mui/material/styles";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import AccessTimeFilledRoundedIcon from "@mui/icons-material/AccessTimeFilledRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { formatTimeRange12h } from "../../../src/lib/time-format";

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

type TripLink = {
  projectId?: string | null;
  projectStageKey?: string | null;
  serviceTicketId?: string | null;
};

type TripConfirmedEntry = {
  hours: number;
  note?: string | null;
  confirmedAt: string;
};

type Trip = {
  id: string;
  active: boolean;
  type?: "project" | "service" | string;
  status?: string;
  date?: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string;
  endTime?: string;
  crew?: TripCrew;
  link?: TripLink;
  cancelReason?: string | null;
  confirmedBy?: Record<string, TripConfirmedEntry> | null;
  completedAt?: string | null;
  completedByUid?: string | null;
  timerState?: string | null;
};

type DailyCrewOverride = {
  id: string;
  active: boolean;
  date: string;
  helperUid: string;
  assignedTechUid: string;
  note?: string | null;
};

type MyDayItem = {
  id: string;
  headerText: string;
  titleMeta?: string;
  subLine: string;
  techText: string;
  helperText?: string;
  secondaryTechText?: string;
  secondaryHelperText?: string;
  issueDetailsText?: string;
  followUpText?: string;
  status: string;
  sortKey: string;
  href: string;
  tripType?: string;
  tripDate?: string;
  tripWindow?: string;
  tripStartTime?: string;
  tripEndTime?: string;
  projectId?: string | null;
  projectStageKey?: string | null;
  timerState?: string;
  isActive?: boolean;
  isPaused?: boolean;
};

type EmployeeOption = {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
};

type ServiceTicketLite = {
  id: string;
  issueSummary?: string;
  issueDetails?: string;
  status?: string;
  customerDisplayName?: string;
  customerPhone?: string;
  serviceAddressLabel?: string;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string;
  serviceCity?: string;
  serviceState?: string;
  servicePostalCode?: string;
};

type ProjectLite = {
  id: string;
  projectName?: string;
  serviceAddressLabel?: string;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string;
  serviceCity?: string;
  serviceState?: string;
  servicePostalCode?: string;
};

type CompanyHoliday = {
  id: string;
  holidayDate: string;
  name: string;
  active: boolean;
  scheduleBlocked?: boolean;
};

type CompanyEvent = {
  id: string;
  date: string;
  title: string;
  active: boolean;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  type?: string | null;
  appliesToRoles?: string[] | null;
  appliesToUids?: string[] | null;
  appliesToNames?: string[] | null;
};

type PtoRequestLite = {
  id: string;
  employeeId: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
  status: string;
  notes?: string | null;
  active?: boolean;
};

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

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function uniqueTrimmedStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeStatus(s?: string) {
  return (s || "").toLowerCase().trim();
}

function normalizeRole(role?: string | null) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function formatRoleLabel(role?: string | null) {
  const raw = normalizeRole(role);
  if (!raw) return "Employee";
  return raw
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function eventAppliesToUid(e: CompanyEvent, uid?: string | null, role?: string | null) {
  const cleanUid = String(uid || "").trim();
  const attendeeUids = uniqueTrimmedStrings(e.appliesToUids || []);
  if (attendeeUids.length > 0) {
    if (!cleanUid) return false;
    return attendeeUids.includes(cleanUid);
  }

  const roles = uniqueTrimmedStrings(e.appliesToRoles || []).map((item) => normalizeRole(item));
  if (roles.length === 0) return true;
  return roles.includes(normalizeRole(role));
}

function formatWindow(window?: string) {
  const w = (window || "").toLowerCase();
  if (w === "am") return "Morning (8 AM–12 PM)";
  if (w === "pm") return "Afternoon (1 PM–5 PM)";
  if (w === "all_day") return "All Day (8 AM–5 PM)";
  return window || "—";
}

function formatTripTimeLine(timeWindow?: string, startTime?: string, endTime?: string) {
  const range = formatTimeRange12h(startTime, endTime);
  if (range) return range;
  return formatWindow(timeWindow);
}

function formatType(type?: string) {
  const t = (type || "").toLowerCase();
  if (t === "project") return "Project";
  if (t === "service") return "Service";
  return type ? type : "Trip";
}

function buildHref(trip: Trip) {
  const link = trip.link;
  if (!link) return "/trips";

  if (String(trip.type || "").toLowerCase() === "project") {
    if (link.projectId) return `/projects/${link.projectId}`;
    return `/trips/${trip.id}`;
  }

  if (link.serviceTicketId) return `/service-tickets/${link.serviceTicketId}`;
  if (link.projectId) return `/projects/${link.projectId}`;
  return "/trips";
}

function isUidInCrew(uid: string, crew?: TripCrew) {
  if (!uid) return false;
  return (
    crew?.primaryTechUid === uid ||
    crew?.helperUid === uid ||
    crew?.secondaryTechUid === uid ||
    crew?.secondaryHelperUid === uid
  );
}

function crewDisplay(crew?: TripCrew) {
  const primary = crew?.primaryTechName || crew?.primaryTechUid || "Unassigned";

  const helper =
    crew?.helperName || crew?.helperUid
      ? `Helper: ${crew?.helperName || crew?.helperUid}`
      : undefined;

  const secondaryTech =
    crew?.secondaryTechName || crew?.secondaryTechUid
      ? `2nd Tech: ${crew?.secondaryTechName || crew?.secondaryTechUid}`
      : undefined;

  const secondaryHelper =
    crew?.secondaryHelperName || crew?.secondaryHelperUid
      ? `2nd Helper: ${crew?.secondaryHelperName || crew?.secondaryHelperUid}`
      : undefined;

  return { primary, helper, secondaryTech, secondaryHelper };
}

function buildAddressLine(t: ServiceTicketLite) {
  const parts: string[] = [];
  const line1 = safeStr(t.serviceAddressLine1).trim();
  const line2 = safeStr(t.serviceAddressLine2).trim();
  const city = safeStr(t.serviceCity).trim();
  const state = safeStr(t.serviceState).trim();
  const zip = safeStr(t.servicePostalCode).trim();

  if (line1) parts.push(line1);
  if (line2) parts.push(line2);

  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);

  return parts.filter(Boolean).join(" • ");
}

function buildServiceTicketHeader(t?: ServiceTicketLite) {
  const customerName = safeStr(t?.customerDisplayName).trim();
  const summary = safeStr(t?.issueSummary).trim();

  if (customerName && summary) return `${customerName}: ${summary}`;
  if (customerName) return customerName;
  if (summary) return summary;
  return "Service Ticket";
}

function buildProjectAddressLine(p: ProjectLite) {
  const parts: string[] = [];
  const line1 = safeStr(p.serviceAddressLine1).trim();
  const line2 = safeStr(p.serviceAddressLine2).trim();
  const city = safeStr(p.serviceCity).trim();
  const state = safeStr(p.serviceState).trim();
  const zip = safeStr(p.servicePostalCode).trim();

  if (line1) parts.push(line1);
  if (line2) parts.push(line2);

  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);

  return parts.filter(Boolean).join(" • ");
}

function normalizeTimerState(timerState?: string | null, status?: string) {
  const ts = String(timerState || "").toLowerCase().trim();
  if (ts === "running" || ts === "paused" || ts === "complete") return ts;

  const s = normalizeStatus(status);
  if (s === "in_progress") return "running";
  if (s === "complete" || s === "completed" || s === "cancelled") return "complete";
  return "not_started";
}

function timeSortKey(startTime?: string, window?: string) {
  const st = safeStr(startTime);
  if (st) return st;

  const w = (window || "").toLowerCase();
  if (w === "am") return "08:00";
  if (w === "pm") return "13:00";
  if (w === "all_day") return "08:00";
  return "99:99";
}

function formatEventTime(e: CompanyEvent) {
  const w = String(e.timeWindow || "").toLowerCase();
  if (w === "all_day") return "All Day";
  if (w === "am") return "Morning (8 AM–12 PM)";
  if (w === "pm") return "Afternoon (1 PM–5 PM)";

  const range = formatTimeRange12h(e.startTime, e.endTime);
  if (range) return range;

  return "—";
}

function isoDateFallsInRange(targetIso: string, startIso?: string, endIso?: string) {
  const target = safeStr(targetIso);
  const start = safeStr(startIso);
  const end = safeStr(endIso) || start;

  if (!target || !start) return false;
  return target >= start && target <= end;
}

function formatPtoDateRange(startDate?: string, endDate?: string) {
  const start = safeStr(startDate);
  const end = safeStr(endDate) || start;
  if (!start) return "—";
  if (start === end) return start;
  return `${start} → ${end}`;
}

async function startProjectTripFromMyDay(args: {
  tripId: string;
  startedByUid: string;
}) {
  const { tripId, startedByUid } = args;

  if (!tripId) throw new Error("Missing tripId.");

  const stamp = nowIso();
  const tripRef = doc(db, "trips", tripId);

  const result = await runTransaction(db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip not found.");

    const tripData = tripSnap.data() as any;
    const tripType = String(tripData.type || "").toLowerCase();
    if (tripType !== "project") throw new Error("Only project trips can be started from My Day.");

    const status = normalizeStatus(tripData.status);
    const timerState = normalizeTimerState(tripData.timerState, tripData.status);

    if (status === "cancelled") throw new Error("This trip has been cancelled.");
    if (status === "complete" || status === "completed") {
      throw new Error("This trip is already complete.");
    }
    if (timerState === "running" || timerState === "paused") {
      return {
        alreadyStarted: true,
        projectId: String(tripData.link?.projectId || "").trim() || null,
        projectStageKey: String(tripData.link?.projectStageKey || "").trim() || null,
      };
    }

    tx.update(tripRef, {
      status: "in_progress",
      timerState: "running",
      actualStartAt: tripData.actualStartAt ?? stamp,
      actualEndAt: null,
      completedAt: null,
      completedByUid: null,
      active: true,
      updatedAt: stamp,
      updatedByUid: startedByUid || null,
    });

    return {
      alreadyStarted: false,
      projectId: String(tripData.link?.projectId || "").trim() || null,
      projectStageKey: String(tripData.link?.projectStageKey || "").trim() || null,
    };
  });

  const safeStage = String(result.projectStageKey || "").trim();
  if (
    result.projectId &&
    (safeStage === "roughIn" || safeStage === "topOutVent" || safeStage === "trimFinish")
  ) {
    try {
      await updateDoc(doc(db, "projects", result.projectId), {
        [`${safeStage}.status`]: "in_progress",
        updatedAt: stamp,
      });
    } catch {
      // non-blocking stage status update
    }
  }

  return result;
}

async function startServiceTripFromMyDay(args: {
  tripId: string;
  startedByUid: string;
}) {
  const { tripId, startedByUid } = args;

  if (!tripId) throw new Error("Missing tripId.");

  const stamp = nowIso();
  const tripRef = doc(db, "trips", tripId);

  const result = await runTransaction(db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip not found.");

    const tripData = tripSnap.data() as any;
    const tripType = String(tripData.type || "").toLowerCase();
    if (tripType !== "service") throw new Error("Only service trips can be started from My Day.");

    const status = normalizeStatus(tripData.status);
    const timerState = normalizeTimerState(tripData.timerState, tripData.status);

    if (status === "cancelled") throw new Error("This trip has been cancelled.");
    if (status === "complete" || status === "completed") {
      throw new Error("This trip is already complete.");
    }

    if (timerState === "running" || timerState === "paused") {
      return {
        alreadyStarted: true,
        serviceTicketId: String(tripData.link?.serviceTicketId || "").trim() || null,
      };
    }

    tx.update(tripRef, {
      status: "in_progress",
      timerState: "running",
      actualStartAt: tripData.actualStartAt ?? stamp,
      actualEndAt: null,
      completedAt: null,
      completedByUid: null,
      active: true,
      updatedAt: stamp,
      updatedByUid: startedByUid || null,
    });

    return {
      alreadyStarted: false,
      serviceTicketId: String(tripData.link?.serviceTicketId || "").trim() || null,
    };
  });

  return result;
}

function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactElement;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.25}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="space-between"
    >
      <Stack direction="row" spacing={1} alignItems="center">
        {icon ? (
          <Box sx={{ display: "grid", placeItems: "center", color: "primary.light" }}>{icon}</Box>
        ) : null}

        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: "1rem", md: "1.05rem" },
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </Typography>

          {subtitle ? (
            <Typography sx={{ mt: 0.35, color: "text.secondary", fontSize: 13, fontWeight: 500 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Stack>
  );
}

function SectionSurface({ children }: { children: React.ReactNode }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {children}
    </Card>
  );
}

export default function TechnicianMyDayPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [override, setOverride] = useState<DailyCrewOverride | null>(null);
  const [error, setError] = useState("");

  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeUid, setSelectedEmployeeUid] = useState<string>("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [ticketById, setTicketById] = useState<Record<string, ServiceTicketLite>>({});
  const [projectById, setProjectById] = useState<Record<string, ProjectLite>>({});
  const [followUpByTicketId, setFollowUpByTicketId] = useState<Record<string, string>>({});

  const [startBusyTripId, setStartBusyTripId] = useState<string>("");

  const [showCompleted, setShowCompleted] = useState(false);

  const [holiday, setHoliday] = useState<CompanyHoliday | null>(null);
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);
  const [currentPto, setCurrentPto] = useState<PtoRequestLite | null>(null);

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const myUid = appUser?.uid || "";
  const myRole = appUser?.role || "";
  const myName = (appUser as any)?.displayName || (appUser as any)?.name || "Me";

  const isHelperRole = myRole === "helper" || myRole === "apprentice";

  const canViewOtherEmployees =
    myRole === "admin" || myRole === "dispatcher" || myRole === "manager";

  const whoUid = useMemo(() => {
    return canViewOtherEmployees ? (selectedEmployeeUid || myUid) : myUid;
  }, [canViewOtherEmployees, selectedEmployeeUid, myUid]);

  useEffect(() => {
    if (!selectedEmployeeUid && myUid) {
      setSelectedEmployeeUid(myUid);
    }
  }, [selectedEmployeeUid, myUid]);

  useEffect(() => {
    async function loadEmployees() {
      if (!canViewOtherEmployees) {
        setEmployeesLoading(false);
        return;
      }

      setEmployeesLoading(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const items: EmployeeOption[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              uid: String(data.uid ?? d.id),
              displayName: String(data.displayName ?? "Unnamed"),
              role: String(data.role ?? ""),
              active: Boolean(data.active ?? false),
            };
          })
          .filter((user) => user.active)
          .filter((user) => ["technician", "helper", "apprentice"].includes(normalizeRole(user.role)));

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setEmployees(items);
      } catch {
        setEmployees([]);
      } finally {
        setEmployeesLoading(false);
      }
    }

    loadEmployees();
  }, [canViewOtherEmployees]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) => {
      const haystack = `${employee.displayName} ${employee.role} ${formatRoleLabel(employee.role)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, employeeSearch]);

  function getSelectedEmployeeInfo(uid: string) {
    if (!uid) return { uid: "", displayName: "Employee", role: "technician" };

    if (uid === myUid) {
      return { uid, displayName: myName, role: myRole || "technician" };
    }

    const match = employees.find((employee) => employee.uid === uid);
    if (match) return { uid, displayName: match.displayName, role: match.role || "technician" };

    return { uid, displayName: uid, role: "technician" };
  }

  const selectedEmployeeInfo = useMemo(
    () => getSelectedEmployeeInfo(whoUid),
    [whoUid, employees, myUid, myName, myRole]
  );

  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];

    const holidayQ = query(
      collection(db, "companyHolidays"),
      where("holidayDate", "==", todayIso),
      where("active", "==", true)
    );

    unsubs.push(
      onSnapshot(
        holidayQ,
        (snap) => {
          if (!snap.empty) {
            const hdoc = snap.docs[0];
            const d = hdoc.data() as any;

            setHoliday({
              id: hdoc.id,
              holidayDate: String(d.holidayDate ?? todayIso),
              name: String(d.name ?? d.title ?? "Holiday"),
              active: typeof d.active === "boolean" ? d.active : true,
              scheduleBlocked: typeof d.scheduleBlocked === "boolean" ? d.scheduleBlocked : undefined,
            });
          } else {
            setHoliday(null);
          }
        },
        () => {
          setHoliday(null);
        }
      )
    );

    const eventsQ = query(
      collection(db, "companyEvents"),
      where("date", "==", todayIso),
      where("active", "==", true)
    );

    unsubs.push(
      onSnapshot(
        eventsQ,
        (snap) => {
          const events: CompanyEvent[] = snap.docs
            .map((ds) => {
              const d = ds.data() as any;
              return {
                id: ds.id,
                date: String(d.date ?? todayIso),
                title: String(d.title ?? d.name ?? "Meeting"),
                active: typeof d.active === "boolean" ? d.active : true,
                timeWindow: d.timeWindow ?? null,
                startTime: d.startTime ?? null,
                endTime: d.endTime ?? null,
                location: d.location ?? null,
                notes: d.notes ?? d.description ?? null,
                type: d.type ?? null,
                appliesToRoles: Array.isArray(d.appliesToRoles) ? d.appliesToRoles : null,
                appliesToUids: Array.isArray(d.appliesToUids) ? d.appliesToUids : null,
                appliesToNames: Array.isArray(d.appliesToNames) ? d.appliesToNames : null,
              };
            })
            .filter((event) => event.active)
            .filter((event) => eventAppliesToUid(event, selectedEmployeeInfo.uid, selectedEmployeeInfo.role));

          events.sort((a, b) =>
            String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99"))
          );

          setCompanyEvents(events);
        },
        () => {
          setCompanyEvents([]);
        }
      )
    );

    const tripsQ = query(collection(db, "trips"), where("date", "==", todayIso));

    unsubs.push(
      onSnapshot(
        tripsQ,
        (snap) => {
          const todayTripItems: Trip[] = snap.docs.map((docSnap) => {
            const d = docSnap.data() as any;
            return {
              id: docSnap.id,
              active: typeof d.active === "boolean" ? d.active : true,
              type: d.type ?? undefined,
              status: d.status ?? undefined,
              date: d.date ?? undefined,
              timeWindow: d.timeWindow ?? undefined,
              startTime: d.startTime ?? undefined,
              endTime: d.endTime ?? undefined,
              crew: d.crew ?? undefined,
              link: d.link ?? undefined,
              cancelReason: d.cancelReason ?? null,
              confirmedBy: (d.confirmedBy ?? null) as any,
              completedAt: d.completedAt ?? null,
              completedByUid: d.completedByUid ?? null,
              timerState: d.timerState ?? null,
            };
          });

          setTrips(todayTripItems);
          setLoading(false);
        },
        (err) => {
          setError(err instanceof Error ? err.message : "Failed to load My Day.");
          setLoading(false);
        }
      )
    );

    if (whoUid) {
      const ptoQ = query(collection(db, "ptoRequests"), where("employeeId", "==", whoUid));

      unsubs.push(
        onSnapshot(
          ptoQ,
          (snap) => {
            const matches = snap.docs
              .map((ds) => {
                const d = ds.data() as any;
                return {
                  id: ds.id,
                  employeeId: String(d.employeeId || "").trim(),
                  employeeName: String(d.employeeName || "").trim() || undefined,
                  startDate: String(d.startDate || "").trim(),
                  endDate: String(d.endDate || d.startDate || "").trim(),
                  status: String(d.status || "").trim().toLowerCase(),
                  notes: d.notes ?? null,
                  active: typeof d.active === "boolean" ? d.active : true,
                } as PtoRequestLite;
              })
              .filter((pto) => pto.active !== false)
              .filter((pto) => pto.status === "approved")
              .filter((pto) => isoDateFallsInRange(todayIso, pto.startDate, pto.endDate))
              .sort((a, b) => {
                const aKey = `${a.startDate}_${a.endDate}_${a.id}`;
                const bKey = `${b.startDate}_${b.endDate}_${b.id}`;
                return bKey.localeCompare(aKey);
              });

            setCurrentPto(matches[0] || null);
          },
          () => {
            setCurrentPto(null);
          }
        )
      );
    } else {
      setCurrentPto(null);
    }

    if (!canViewOtherEmployees && isHelperRole && whoUid) {
      const overrideQ = query(
        collection(db, "dailyCrewOverrides"),
        where("date", "==", todayIso),
        where("helperUid", "==", whoUid),
        where("active", "==", true)
      );

      unsubs.push(
        onSnapshot(
          overrideQ,
          (snap) => {
            if (!snap.empty) {
              const docSnap = snap.docs[0];
              const d = docSnap.data() as any;
              setOverride({
                id: docSnap.id,
                active: typeof d.active === "boolean" ? d.active : true,
                date: d.date ?? todayIso,
                helperUid: d.helperUid ?? "",
                assignedTechUid: d.assignedTechUid ?? "",
                note: d.note ?? null,
              });
            } else {
              setOverride(null);
            }
          },
          () => {
            setOverride(null);
          }
        )
      );
    } else {
      setOverride(null);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [todayIso, whoUid, isHelperRole, canViewOtherEmployees, selectedEmployeeInfo.uid, selectedEmployeeInfo.role]);

  const visibleTrips = useMemo(() => {
    if (!whoUid) return [];

    const explicitCrewTrips = trips
      .filter((trip) => trip.active !== false)
      .filter((trip) => isUidInCrew(whoUid, trip.crew));

    if (!canViewOtherEmployees && isHelperRole && override?.assignedTechUid) {
      const overrideTechTrips = trips
        .filter((trip) => trip.active !== false)
        .filter((trip) => (trip.crew?.primaryTechUid || "") === override.assignedTechUid);

      const merged = [...explicitCrewTrips, ...overrideTechTrips];
      const byId = new Map<string, Trip>();
      for (const trip of merged) byId.set(trip.id, trip);
      return Array.from(byId.values());
    }

    return explicitCrewTrips;
  }, [trips, whoUid, isHelperRole, override, canViewOtherEmployees]);

  const visibleServiceTicketIds = useMemo(
    () =>
      Array.from(
        new Set(
          visibleTrips.map((trip) => String(trip.link?.serviceTicketId || "").trim()).filter(Boolean)
        )
      ),
    [visibleTrips]
  );

  const visibleProjectIds = useMemo(
    () =>
      Array.from(
        new Set(
          visibleTrips.map((trip) => String(trip.link?.projectId || "").trim()).filter(Boolean)
        )
      ),
    [visibleTrips]
  );

  useEffect(() => {
    if (visibleServiceTicketIds.length === 0) {
      setTicketById({});
      return;
    }

    setTicketById({});
    const unsubs: Array<() => void> = [];

    for (const tid of visibleServiceTicketIds) {
      const ref = doc(db, "serviceTickets", tid);
      unsubs.push(
        onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) return;
            const d = snap.data() as any;

            setTicketById((prev) => ({
              ...prev,
              [tid]: {
                id: tid,
                issueSummary: d.issueSummary ?? "",
                issueDetails: d.issueDetails ?? "",
                status: d.status ?? "",
                customerDisplayName: d.customerDisplayName ?? "",
                customerPhone: d.customerPhone ?? d.phone ?? "",
                serviceAddressLabel: d.serviceAddressesLabel ?? d.serviceAddressLabel ?? "",
                serviceAddressLine1: d.serviceAddressLine1 ?? "",
                serviceAddressLine2: d.serviceAddressLine2 ?? "",
                serviceCity: d.serviceCity ?? "",
                serviceState: d.serviceState ?? "",
                servicePostalCode: d.servicePostalCode ?? "",
              },
            }));
          },
          () => {
            // ignore live ticket errors for now
          }
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [visibleServiceTicketIds]);

  useEffect(() => {
    if (visibleProjectIds.length === 0) {
      setProjectById({});
      return;
    }

    setProjectById({});
    const unsubs: Array<() => void> = [];

    for (const pid of visibleProjectIds) {
      const ref = doc(db, "projects", pid);

      unsubs.push(
        onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) return;
            const d = snap.data() as any;

            setProjectById((prev) => ({
              ...prev,
              [pid]: {
                id: pid,
                projectName: d.projectName ?? "",
                serviceAddressLabel: d.serviceAddressLabel ?? "",
                serviceAddressLine1: d.serviceAddressLine1 ?? "",
                serviceAddressLine2: d.serviceAddressLine2 ?? "",
                serviceCity: d.serviceCity ?? "",
                serviceState: d.serviceState ?? "",
                servicePostalCode: d.servicePostalCode ?? "",
              },
            }));
          },
          () => {
            // ignore live project errors for now
          }
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [visibleProjectIds]);

  useEffect(() => {
    async function loadFollowUpNotes() {
      if (visibleServiceTicketIds.length === 0) {
        setFollowUpByTicketId({});
        return;
      }

      const followUpMap: Record<string, string> = {};

      await Promise.all(
        visibleServiceTicketIds.map(async (tid) => {
          try {
            const ticket = ticketById[tid];
            if (!ticket) return;
            if (normalizeStatus(ticket.status) !== "follow_up") return;

            const qTrip = query(
              collection(db, "trips"),
              where("link.serviceTicketId", "==", tid),
              where("outcome", "==", "follow_up"),
              orderBy("updatedAt", "desc")
            );

            const snap = await getDocs(qTrip);
            if (snap.empty) return;

            const d = snap.docs[0].data() as any;
            const note = String(d.followUpNotes ?? "").trim();
            if (note) followUpMap[tid] = note;
          } catch {
            // ignore
          }
        })
      );

      setFollowUpByTicketId(followUpMap);
    }

    loadFollowUpNotes();
  }, [visibleServiceTicketIds, ticketById]);

  const items = useMemo(() => {
    const mapped: MyDayItem[] = visibleTrips
      .filter((trip) => {
        const s = normalizeStatus(trip.status);
        if (!showCompleted && (s === "complete" || s === "completed")) return false;
        return true;
      })
      .map((trip) => {
        const crew = crewDisplay(trip.crew);
        const href = buildHref(trip);

        const timeText = formatTripTimeLine(trip.timeWindow, trip.startTime, trip.endTime);

        const status = normalizeStatus(trip.status) || "planned";
        const timerState = normalizeTimerState(trip.timerState, trip.status);
        const isPaused = status === "in_progress" && timerState === "paused";
        const isActive = status === "in_progress";

        const serviceTicketId = trip.link?.serviceTicketId || "";
        const st = serviceTicketId ? ticketById[serviceTicketId] : undefined;

        const projectId = trip.link?.projectId || "";
        const projectInfo = projectId ? projectById[projectId] : undefined;

        let headerText = "";
        let titleMeta = "";

        if ((trip.type || "").toLowerCase() === "service") {
          headerText = buildServiceTicketHeader(st);
          titleMeta = st ? buildAddressLine(st) : "";
        } else if ((trip.type || "").toLowerCase() === "project") {
          const projectName = safeStr(projectInfo?.projectName).trim() || "Untitled Job";
          const projectAddress = projectInfo ? buildProjectAddressLine(projectInfo) : "";
          headerText = projectName;
          titleMeta = projectAddress;
        } else {
          headerText = `${formatType(trip.type)} • ${((trip.type || "") as string) || "Trip"}`;
        }

        const subLine = timeText;

        const issueDetailsText =
          (trip.type || "").toLowerCase() === "service"
            ? safeStr(st?.issueDetails).trim() || safeStr(st?.issueSummary).trim() || ""
            : "";

        const followUpText =
          (trip.type || "").toLowerCase() === "service" && serviceTicketId
            ? safeStr(followUpByTicketId[serviceTicketId]).trim() || ""
            : "";

        const activeBoost = isActive ? (isPaused ? "1" : "0") : "2";
        const tKey = timeSortKey(trip.startTime, trip.timeWindow);
        const sortKey = `${activeBoost}_${tKey}_${trip.id}`;

        return {
          id: trip.id,
          headerText,
          titleMeta,
          subLine,
          techText: `Tech: ${crew.primary}`,
          helperText: crew.helper,
          secondaryTechText: crew.secondaryTech,
          secondaryHelperText: crew.secondaryHelper,
          issueDetailsText,
          followUpText,
          status,
          sortKey,
          href,
          tripType: trip.type || "",
          tripDate: trip.date || "",
          tripWindow: trip.timeWindow || "",
          tripStartTime: trip.startTime || "",
          tripEndTime: trip.endTime || "",
          projectId: trip.link?.projectId ?? null,
          projectStageKey: trip.link?.projectStageKey ?? null,
          timerState,
          isActive,
          isPaused,
        };
      });

    mapped.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return mapped;
  }, [visibleTrips, ticketById, projectById, followUpByTicketId, showCompleted]);

  const banner = useMemo(() => {
    if (!whoUid) return null;

    if (!canViewOtherEmployees && isHelperRole) {
      if (override?.assignedTechUid) {
        return {
          title: "Override active",
          text: "Today you are reassigned to a different technician.",
          sub: `Assigned Tech UID: ${override.assignedTechUid}${override.note ? ` • Note: ${override.note}` : ""}`,
        };
      }

      return {
        title: "Pairing active",
        text: "Today you are using your normal crew pairing. Overrides apply if set by admin.",
        sub: "",
      };
    }

    return null;
  }, [whoUid, isHelperRole, override, canViewOtherEmployees]);

  async function handleStartProjectFromCard(item: MyDayItem) {
    if (String(item.tripType || "").toLowerCase() !== "project") return;

    const allowed = whoUid === myUid || canViewOtherEmployees;
    if (!allowed) return;

    setStartBusyTripId(item.id);
    setError("");

    try {
      const res = await startProjectTripFromMyDay({
        tripId: item.id,
        startedByUid: myUid || whoUid,
      });

      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === item.id
            ? {
                ...trip,
                status: "in_progress",
                timerState: "running",
                completedAt: null,
                completedByUid: null,
                active: true,
              }
            : trip
        )
      );

      if (res.alreadyStarted) {
        window.location.href = `/projects/${item.projectId}`;
      }
    } catch (e: any) {
      setError(e?.message || "Failed to start project work.");
    } finally {
      setStartBusyTripId("");
    }
  }

  async function handleStartServiceFromCard(item: MyDayItem) {
    if (String(item.tripType || "").toLowerCase() !== "service") return;

    const allowed = whoUid === myUid || canViewOtherEmployees;
    if (!allowed) return;

    setStartBusyTripId(item.id);
    setError("");

    try {
      const res = await startServiceTripFromMyDay({
        tripId: item.id,
        startedByUid: myUid || whoUid,
      });

      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === item.id
            ? {
                ...trip,
                status: "in_progress",
                timerState: "running",
                completedAt: null,
                completedByUid: null,
                active: true,
              }
            : trip
        )
      );

      if (res.alreadyStarted) {
        window.location.href = item.href;
      }
    } catch (e: any) {
      setError(e?.message || "Failed to start service work.");
    } finally {
      setStartBusyTripId("");
    }
  }

  const holidayBlocks = Boolean(holiday?.scheduleBlocked);

  return (
    <ProtectedPage
      fallbackTitle="My Day"
      allowedRoles={[
        "admin",
        "dispatcher",
        "manager",
        "technician",
        "helper",
        "apprentice",
      ]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1240, mx: "auto" }}>
          <Stack spacing={3}>
            <Box sx={{ px: { xs: 0.25, md: 0.5 }, pt: { xs: 0.5, md: 0.75 } }}>
              <Stack spacing={1.5}>
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.85rem", md: "2.15rem" },
                    lineHeight: 1.04,
                    fontWeight: 800,
                    letterSpacing: "-0.035em",
                  }}
                >
                  My Day
                </Typography>

                <Stack
                  direction="row"
                  spacing={0.75}
                  flexWrap="wrap"
                  useFlexGap
                  alignItems="center"
                >
                  <Chip
                    size="small"
                    icon={<TodayRoundedIcon sx={{ fontSize: 16 }} />}
                    label={todayIso}
                    variant="outlined"
                    sx={{ borderRadius: 1.5, fontWeight: 500 }}
                  />

                  <FormControlLabel
                    sx={{ m: 0, ml: 0.25 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={showCompleted}
                        onChange={(e) => setShowCompleted(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
                        Show completed trips
                      </Typography>
                    }
                  />
                </Stack>

                {canViewOtherEmployees ? (
                  <Stack spacing={1} sx={{ width: "100%", maxWidth: 360 }}>
                    <TextField
                      size="small"
                      label="Search employees"
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      disabled={employeesLoading}
                      placeholder="Search by name or role…"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <FormControl size="small" sx={{ width: "100%" }}>
                      <InputLabel>Employee</InputLabel>
                      <Select
                        label="Employee"
                        value={selectedEmployeeUid || myUid}
                        onChange={(e: SelectChangeEvent) => setSelectedEmployeeUid(e.target.value)}
                        disabled={employeesLoading}
                      >
                        <MenuItem value={myUid}>Me ({formatRoleLabel(myRole)})</MenuItem>
                        {filteredEmployees.map((employee) => (
                          <MenuItem key={employee.uid} value={employee.uid}>
                            {employee.displayName} ({formatRoleLabel(employee.role)})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                ) : null}

                <Box
                  sx={{
                    display: "grid",
                    gap: 1,
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    width: "100%",
                  }}
                >
                  <Button
                    component={Link}
                    href="/schedule"
                    variant="outlined"
                    startIcon={<CalendarMonthRoundedIcon />}
                    fullWidth
                  >
                    Weekly Schedule
                  </Button>

                  <Button
                    component={Link}
                    href="/time-entries"
                    variant="outlined"
                    startIcon={<AccessTimeFilledRoundedIcon />}
                    fullWidth
                  >
                    Time Entries
                  </Button>
                </Box>
              </Stack>
            </Box>

            {banner ? (
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 4 }}>
                <Typography sx={{ fontWeight: 700 }}>{banner.title}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {banner.text}
                </Typography>
                {banner.sub ? (
                  <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                    {banner.sub}
                  </Typography>
                ) : null}
              </Alert>
            ) : null}

            {currentPto ? (
              <SectionSurface>
                <Box
                  sx={{
                    px: { xs: 2, md: 2.5 },
                    py: 2,
                    borderBottom: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
                    bgcolor: alpha(theme.palette.warning.main, 0.08),
                  }}
                >
                  <SectionHeader
                    title="Approved PTO"
                    subtitle="This employee is out on approved PTO today."
                    icon={<BeachAccessRoundedIcon color="warning" />}
                  />
                </Box>

                <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}>
                  <Stack spacing={1.5}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "flex-start", sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {selectedEmployeeInfo.displayName || currentPto.employeeName || "Employee"}
                      </Typography>

                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          color="warning"
                          variant="filled"
                          label="Approved"
                          sx={{ fontWeight: 700 }}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={formatPtoDateRange(currentPto.startDate, currentPto.endDate)}
                          sx={{ fontWeight: 500 }}
                        />
                      </Stack>
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      PTO coverage includes today.
                    </Typography>

                    {currentPto.notes ? (
                      <Box
                        sx={{
                          pl: 1.25,
                          borderLeft: `3px solid ${alpha(theme.palette.warning.main, 0.45)}`,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 700, color: "warning.dark" }}
                        >
                          PTO notes
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ mt: 0.35, color: "text.secondary", whiteSpace: "pre-wrap" }}
                        >
                          {currentPto.notes}
                        </Typography>
                      </Box>
                    ) : null}
                  </Stack>
                </Box>
              </SectionSurface>
            ) : null}

            {holiday ? (
              <Alert
                severity="warning"
                variant="outlined"
                icon={<CelebrationRoundedIcon />}
                sx={{ borderRadius: 4 }}
              >
                <Typography sx={{ fontWeight: 700 }}>{holiday.name}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {holiday.holidayDate}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                  {holidayBlocks
                    ? "Scheduling is blocked today."
                    : "If any work is scheduled today, it will still appear below."}
                </Typography>
              </Alert>
            ) : null}

            {!loading && companyEvents.length > 0 ? (
              <Stack spacing={1.25}>
                <SectionHeader
                  title={`Company event${companyEvents.length > 1 ? "s" : ""}`}
                  subtitle="Today’s meetings and schedule events for this employee."
                  icon={<CampaignRoundedIcon color="success" />}
                />

                <SectionSurface>
                  <Stack divider={<Divider flexItem />}>
                    {companyEvents.map((event) => (
                      <Box key={event.id} sx={{ px: { xs: 2, md: 2.5 }, py: 1.75 }}>
                        <Stack spacing={1}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            justifyContent="space-between"
                          >
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {event.title}
                            </Typography>

                            <Chip
                              size="small"
                              icon={<TodayRoundedIcon sx={{ fontSize: 16 }} />}
                              label={formatEventTime(event)}
                              color="success"
                              variant="outlined"
                              sx={{ borderRadius: 1.5, fontWeight: 500 }}
                            />
                          </Stack>

                          {event.location ? (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <LocationOnRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                              <Typography variant="body2" color="text.secondary">
                                {event.location}
                              </Typography>
                            </Stack>
                          ) : null}

                          {event.notes ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ whiteSpace: "pre-wrap" }}
                            >
                              {event.notes}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </SectionSurface>
              </Stack>
            ) : null}

            {loading ? (
              <SectionSurface>
                <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                  <Typography variant="body2" color="text.secondary">
                    Loading your day...
                  </Typography>
                </Box>
              </SectionSurface>
            ) : null}

            {error ? (
              <Alert severity="error" sx={{ borderRadius: 4 }}>
                {error}
              </Alert>
            ) : null}

            {!loading && !error ? (
              items.length === 0 ? (
                <Alert severity={currentPto ? "warning" : "info"} variant="outlined" sx={{ borderRadius: 4 }}>
                  {currentPto
                    ? `${selectedEmployeeInfo.displayName || "This employee"} is on approved PTO today.`
                    : holiday
                      ? `No trips scheduled. Today is a company holiday: ${holiday.name}.`
                      : "No trips scheduled for this employee today."}
                </Alert>
              ) : (
                <Stack spacing={1.5}>
                  {items.map((item) => {
                    const isProject = String(item.tripType || "").toLowerCase() === "project";
                    const isService = String(item.tripType || "").toLowerCase() === "service";
                    const isCompleted =
                      item.status === "complete" || item.status === "completed";

                    const canStartProject =
                      isProject &&
                      !item.isActive &&
                      !isCompleted &&
                      item.status !== "cancelled" &&
                      (canViewOtherEmployees || whoUid === myUid);

                    const canStartService =
                      isService &&
                      !item.isActive &&
                      !isCompleted &&
                      item.status !== "cancelled" &&
                      (canViewOtherEmployees || whoUid === myUid);

                    const activeBadge = item.isActive ? (
                      <Chip
                        size="small"
                        label={item.isPaused ? "Paused Trip" : "Active Trip"}
                        sx={{
                          height: 24,
                          borderRadius: 1.5,
                          fontSize: 11,
                          fontWeight: 700,
                          color: item.isPaused ? "warning.dark" : "success.dark",
                          backgroundColor: item.isPaused
                            ? alpha(theme.palette.warning.main, 0.14)
                            : alpha(theme.palette.success.main, 0.14),
                          border: "none",
                        }}
                      />
                    ) : null;

                    return (
                      <Box
                        key={item.id}
                        sx={
                          item.isActive
                            ? {
                                position: "relative",
                                borderRadius: 3,
                                "&::before": {
                                  content: '""',
                                  position: "absolute",
                                  left: 10,
                                  top: 16,
                                  bottom: 16,
                                  width: 4,
                                  borderRadius: 999,
                                  backgroundColor: item.isPaused
                                    ? alpha(theme.palette.warning.main, 0.72)
                                    : alpha(theme.palette.success.main, 0.72),
                                  pointerEvents: "none",
                                  zIndex: 1,
                                },
                              }
                            : undefined
                        }
                      >
                        <Box sx={item.isActive ? { position: "relative", zIndex: 2 } : undefined}>
                          <SharedTripCard
                            title={item.headerText}
                            titleMeta={item.titleMeta}
                            status={item.status}
                            tripType={item.tripType}
                            subtitle={item.subLine}
                            crewChips={
                              <Stack
                                direction="row"
                                spacing={0.6}
                                flexWrap="wrap"
                                useFlexGap
                                sx={{ rowGap: 0.6 }}
                              >
                                <Chip
                                  size="small"
                                  icon={<EngineeringRoundedIcon sx={{ fontSize: 16 }} />}
                                  label={item.techText}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                                {item.helperText ? (
                                  <Chip
                                    size="small"
                                    label={item.helperText}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5 }}
                                  />
                                ) : null}
                                {item.secondaryTechText ? (
                                  <Chip
                                    size="small"
                                    label={item.secondaryTechText}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5 }}
                                  />
                                ) : null}
                                {item.secondaryHelperText ? (
                                  <Chip
                                    size="small"
                                    label={item.secondaryHelperText}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5 }}
                                  />
                                ) : null}
                              </Stack>
                            }
                            detailBlock={
                              item.issueDetailsText ? (
                                <Box
                                  sx={{
                                    pl: 1.25,
                                    borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.34)}`,
                                  }}
                                >
                                  <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <NotesRoundedIcon
                                      sx={{ fontSize: 18, color: "primary.light", mt: 0.1 }}
                                    />
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 700, color: "primary.light" }}
                                      >
                                        Issue
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}
                                      >
                                        {item.issueDetailsText}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                </Box>
                              ) : undefined
                            }
                            followUpBlock={
                              item.followUpText ? (
                                <Box
                                  sx={{
                                    pl: 1.25,
                                    borderLeft: `3px solid ${alpha(theme.palette.warning.main, 0.45)}`,
                                  }}
                                >
                                  <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <WarningAmberRoundedIcon
                                      sx={{ fontSize: 18, color: "warning.dark", mt: 0.1 }}
                                    />
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 700, color: "warning.dark" }}
                                      >
                                        Follow-up notes
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          mt: 0.25,
                                          color: "text.secondary",
                                          whiteSpace: "pre-wrap",
                                        }}
                                      >
                                        {item.followUpText}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                </Box>
                              ) : undefined
                            }
                            trailingContent={
                              activeBadge ? (
                                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                  {activeBadge}
                                </Stack>
                              ) : undefined
                            }
                            footer={
                              isProject ? (
                                item.isActive ? (
                                  <Typography variant="caption" color="text.secondary">
                                    Project trip active — use the bottom trip dock or open the project for details.
                                  </Typography>
                                ) : isCompleted ? (
                                  <Typography variant="body2" color="text.secondary">
                                    Project trip complete — hours are saved during closeout and will appear in{" "}
                                    <strong>Time Entries</strong>.
                                  </Typography>
                                ) : canStartProject ? (
                                  <Button
                                    variant="contained"
                                    fullWidth
                                    startIcon={<PlayArrowRoundedIcon />}
                                    disabled={startBusyTripId === item.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleStartProjectFromCard(item);
                                    }}
                                  >
                                    {startBusyTripId === item.id ? "Starting..." : "Start Work"}
                                  </Button>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    Open the project for full details and workflow actions.
                                  </Typography>
                                )
                              ) : isService ? (
                                item.isActive ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {item.isPaused
                                      ? "Paused trip — open the service ticket to resume or finish."
                                      : "Active trip — open the service ticket for quick actions."}
                                  </Typography>
                                ) : isCompleted ? (
                                  <Typography variant="caption" color="text.secondary">
                                    Service trip complete — open the service ticket for full details if needed.
                                  </Typography>
                                ) : canStartService ? (
                                  <Button
                                    variant="contained"
                                    fullWidth
                                    startIcon={<PlayArrowRoundedIcon />}
                                    disabled={startBusyTripId === item.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleStartServiceFromCard(item);
                                    }}
                                  >
                                    {startBusyTripId === item.id ? "Starting..." : "Start Work"}
                                  </Button>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    Open the service ticket for full details and workflow actions.
                                  </Typography>
                                )
                              ) : undefined
                            }
                            onClick={() => {
                              window.location.href = item.href;
                            }}
                          />
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              )
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}