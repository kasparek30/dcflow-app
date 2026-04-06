"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import {
  Alert,
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
  FormControl,
  FormControlLabel,
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
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

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
  confirmed?: TripConfirmedEntry | null;
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromIsoDate(iso: string) {
  const [y, m, day] = iso.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, day || 1);
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function getPayrollWeekBounds(entryDateIso: string) {
  const [y, m, d] = entryDateIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);

  const wd = dt.getDay();
  const diffToMon = (wd + 6) % 7;
  const weekStart = new Date(dt);
  weekStart.setDate(weekStart.getDate() - diffToMon);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return { weekStartDate: toIsoDate(weekStart), weekEndDate: toIsoDate(weekEnd) };
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function formatWindow(window?: string) {
  const w = (window || "").toLowerCase();
  if (w === "am") return "AM (8–12)";
  if (w === "pm") return "PM (1–5)";
  if (w === "all_day") return "All Day (8–5)";
  return window || "—";
}

function formatType(type?: string) {
  const t = (type || "").toLowerCase();
  if (t === "project") return "Project";
  if (t === "service") return "Service";
  return type ? type : "Trip";
}

function stageLabel(stageKey?: string | null) {
  const s = stageKey || "";
  if (s === "roughIn") return "Rough-In";
  if (s === "topOutVent") return "Top-Out / Vent";
  if (s === "trimFinish") return "Trim / Finish";
  return s;
}

function buildHref(link?: TripLink) {
  if (!link) return "/trips";
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
  const label = safeStr(t.serviceAddressLabel).trim();
  const line1 = safeStr(t.serviceAddressLine1).trim();
  const line2 = safeStr(t.serviceAddressLine2).trim();
  const city = safeStr(t.serviceCity).trim();
  const state = safeStr(t.serviceState).trim();
  const zip = safeStr(t.servicePostalCode).trim();

  if (label) parts.push(label);
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);

  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);

  return parts.filter(Boolean).join(" • ");
}

function normalizeStatus(s?: string) {
  return (s || "").toLowerCase().trim();
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

function defaultHoursForTrip(timeWindow?: string, startTime?: string, endTime?: string) {
  const w = String(timeWindow || "").toLowerCase();
  if (w === "all_day") return 8;
  if (w === "am") return 4;
  if (w === "pm") return 4;

  const parse = (t?: string) => {
    if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
    const [hh, mm] = t.split(":").map((x) => Number(x));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const s = parse(startTime);
  const e = parse(endTime);
  if (s != null && e != null && e > s) {
    return Math.round(((e - s) / 60) * 4) / 4;
  }
  return 8;
}

function crewUidsForConfirm(crew?: TripCrew | null) {
  const uids = [
    String(crew?.primaryTechUid || "").trim(),
    String(crew?.helperUid || "").trim(),
    String(crew?.secondaryTechUid || "").trim(),
    String(crew?.secondaryHelperUid || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(uids));
}

function formatEventTime(e: CompanyEvent) {
  const w = String(e.timeWindow || "").toLowerCase();
  if (w === "all_day") return "All Day";
  if (w === "am") return "AM (8–12)";
  if (w === "pm") return "PM (1–5)";
  const st = String(e.startTime || "").trim();
  const et = String(e.endTime || "").trim();
  if (st && et) return `${st}–${et}`;
  if (st) return `Starts ${st}`;
  return "—";
}

async function confirmProjectTripForEmployee(args: {
  tripId: string;
  tripDate: string;
  projectId: string;
  projectStageKey?: string | null;
  uid: string;
  displayName: string;
  role: string;
  hours: number;
  note?: string;
}) {
  const { tripId, tripDate, projectId, projectStageKey, uid, displayName, role, hours, note } = args;

  if (!uid) throw new Error("Missing uid.");
  if (!tripId) throw new Error("Missing tripId.");
  if (!projectId) throw new Error("Missing projectId.");
  if (!tripDate) throw new Error("Missing trip date.");

  const hrs = Number(hours);
  if (!Number.isFinite(hrs) || hrs <= 0) throw new Error("Hours must be a number > 0.");

  const now = nowIso();
  const { weekStartDate, weekEndDate } = getPayrollWeekBounds(tripDate);
  const timesheetId = buildWeeklyTimesheetId(uid, weekStartDate);
  const timeEntryId = `trip_${tripId}_${uid}`;

  const tripRef = doc(db, "trips", tripId);
  const timesheetRef = doc(db, "weeklyTimesheets", timesheetId);
  const timeEntryRef = doc(db, "timeEntries", timeEntryId);

  const result = await runTransaction(db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip not found.");

    const tripData = tripSnap.data() as any;
    const tripType = String(tripData.type || "").toLowerCase();
    if (tripType !== "project") throw new Error("Only project trips can be confirmed for payroll.");

    const crew: TripCrew | null = (tripData.crew ?? null) as any;
    const requiredUids = crewUidsForConfirm(crew);
    const existingConfirmedBy: Record<string, TripConfirmedEntry> = (tripData.confirmedBy ?? {}) as any;

    const nextConfirmedBy: Record<string, TripConfirmedEntry> = {
      ...existingConfirmedBy,
      [uid]: {
        hours: hrs,
        note: note ? String(note).trim() : null,
        confirmedAt: now,
      },
    };

    const allConfirmed = requiredUids.length > 0 && requiredUids.every((u) => Boolean((nextConfirmedBy as any)[u]));

    tx.set(
      timesheetRef,
      {
        employeeId: uid,
        employeeName: displayName || "Employee",
        employeeRole: role || "technician",
        weekStartDate,
        weekEndDate,
        status: "draft",
        submittedAt: null,
        submittedByUid: null,
        createdAt: now,
        createdByUid: uid,
        updatedAt: now,
        updatedByUid: uid,
      },
      { merge: true }
    );

    tx.set(
      timeEntryRef,
      {
        employeeId: uid,
        employeeName: displayName || "Employee",
        employeeRole: role || "technician",
        entryDate: tripDate,
        weekStartDate,
        weekEndDate,
        timesheetId,
        category: "project",
        payType: "regular",
        billable: true,
        source: "trip_daily_confirm",
        hours: hrs,
        hoursSource: hrs,
        hoursLocked: true,
        tripId,
        projectId,
        projectStageKey: projectStageKey || null,
        entryStatus: "draft",
        notes: note ? String(note).trim() : null,
        createdAt: now,
        createdByUid: uid,
        updatedAt: now,
        updatedByUid: uid,
      },
      { merge: true }
    );

    const tripPatch: any = {
      confirmedBy: nextConfirmedBy,
      updatedAt: now,
      updatedByUid: uid,
    };

    if (allConfirmed) {
      tripPatch.status = "complete";
      tripPatch.completedAt = now;
      tripPatch.completedByUid = uid;
    }

    tx.update(tripRef, tripPatch);

    return { timeEntryId, timesheetId, tripCompleted: allConfirmed };
  });

  return result;
}

function MyDaySection({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactElement;
  children: React.ReactNode;
}) {
  return (
    <Card elevation={0} sx={{ borderRadius: 4 }}>
      <Box sx={{ px: { xs: 2, md: 2.5 }, pt: { xs: 2, md: 2.5 }, pb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {icon ? (
            <Box sx={{ display: "grid", placeItems: "center", color: "primary.light" }}>{icon}</Box>
          ) : null}
          <Box>
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
      </Box>

      <Divider />

      <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>{children}</Box>
    </Card>
  );
}

export default function TechnicianMyDayPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [override, setOverride] = useState<DailyCrewOverride | null>(null);
  const [error, setError] = useState("");

  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeUid, setSelectedEmployeeUid] = useState<string>("");

  const [ticketById, setTicketById] = useState<Record<string, ServiceTicketLite>>({});
  const [followUpByTicketId, setFollowUpByTicketId] = useState<Record<string, string>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTripId, setConfirmTripId] = useState<string>("");
  const [confirmHours, setConfirmHours] = useState<string>("8");
  const [confirmNote, setConfirmNote] = useState<string>("");
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string>("");

  const [showCompleted, setShowCompleted] = useState(false);

  const [holiday, setHoliday] = useState<CompanyHoliday | null>(null);
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);

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
          .filter((u) => u.active)
          .filter((u) => ["technician", "helper", "apprentice"].includes(u.role));

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setEmployees(items);
      } catch {
        // ignore
      } finally {
        setEmployeesLoading(false);
      }
    }

    loadEmployees();
  }, [canViewOtherEmployees]);

  function getSelectedEmployeeInfo(uid: string) {
    if (!uid) return { uid: "", displayName: "Employee", role: "technician" };

    if (uid === myUid) {
      return { uid, displayName: myName, role: myRole || "technician" };
    }

    const match = employees.find((e) => e.uid === uid);
    if (match) return { uid, displayName: match.displayName, role: match.role || "technician" };

    return { uid, displayName: uid, role: "technician" };
  }

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
              };
            })
            .filter((e) => e.active);

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
  }, [todayIso, whoUid, isHelperRole, canViewOtherEmployees]);

  useEffect(() => {
    async function loadRecent() {
      try {
        const start = addDays(fromIsoDate(todayIso), -14);
        start.setHours(0, 0, 0, 0);
        const startIso = toIsoDate(start);

        let recentSnap;
        try {
          recentSnap = await getDocs(
            query(
              collection(db, "trips"),
              where("date", ">=", startIso),
              where("date", "<", todayIso),
              orderBy("date", "desc"),
              limit(120)
            )
          );
        } catch {
          recentSnap = await getDocs(
            query(
              collection(db, "trips"),
              where("date", ">=", startIso),
              where("date", "<", todayIso),
              orderBy("date", "desc"),
              limit(60)
            )
          );
        }

        const recentItems: Trip[] = recentSnap.docs.map((ds) => {
          const d = ds.data() as any;
          return {
            id: ds.id,
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

        setRecentTrips(recentItems);
      } catch {
        setRecentTrips([]);
      }
    }

    loadRecent();
  }, [todayIso]);

  const visibleTrips = useMemo(() => {
    if (!whoUid) return [];

    const explicitCrewTrips = trips
      .filter((t) => t.active !== false)
      .filter((t) => isUidInCrew(whoUid, t.crew));

    if (!canViewOtherEmployees && isHelperRole && override?.assignedTechUid) {
      const overrideTechTrips = trips
        .filter((t) => t.active !== false)
        .filter((t) => (t.crew?.primaryTechUid || "") === override.assignedTechUid);

      const merged = [...explicitCrewTrips, ...overrideTechTrips];
      const byId = new Map<string, Trip>();
      for (const t of merged) byId.set(t.id, t);
      return Array.from(byId.values());
    }

    return explicitCrewTrips;
  }, [trips, whoUid, isHelperRole, override, canViewOtherEmployees]);

  const visibleServiceTicketIds = useMemo(
    () =>
      Array.from(
        new Set(
          visibleTrips.map((t) => String(t.link?.serviceTicketId || "").trim()).filter(Boolean)
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
    async function loadFollowUpNotes() {
      if (visibleServiceTicketIds.length === 0) {
        setFollowUpByTicketId({});
        return;
      }

      const followUpMap: Record<string, string> = {};

      await Promise.all(
        visibleServiceTicketIds.map(async (tid) => {
          try {
            const t = ticketById[tid];
            if (!t) return;
            if (normalizeStatus(t.status) !== "follow_up") return;

            const qTrip = query(
              collection(db, "trips"),
              where("link.serviceTicketId", "==", tid),
              where("outcome", "==", "follow_up"),
              orderBy("updatedAt", "desc"),
              limit(1)
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

  const unconfirmedPastTrips = useMemo(() => {
    if (!whoUid) return [];

    const out = recentTrips
      .filter((t) => t.active !== false)
      .filter((t) => String(t.type || "").toLowerCase() === "project")
      .filter((t) => {
        const s = normalizeStatus(t.status);
        if (s === "cancelled") return false;
        return true;
      })
      .filter((t) => isUidInCrew(whoUid, t.crew))
      .filter((t) => {
        const confirmed = t.confirmedBy ? (t.confirmedBy as any)[whoUid] : null;
        return !confirmed;
      })
      .filter((t) => {
        const d = String(t.date || "").trim();
        if (!d) return false;
        return d < todayIso;
      });

    out.sort((a, b) => {
      const aKey = `${a.date || ""}_${timeSortKey(a.startTime, a.timeWindow)}_${a.id}`;
      const bKey = `${b.date || ""}_${timeSortKey(b.startTime, b.timeWindow)}_${b.id}`;
      return bKey.localeCompare(aKey);
    });

    return out.slice(0, 20);
  }, [recentTrips, whoUid, todayIso]);

  const items = useMemo(() => {
    const mapped: MyDayItem[] = visibleTrips
      .filter((t) => {
        const s = normalizeStatus(t.status);
        if (!showCompleted && (s === "complete" || s === "completed")) return false;
        return true;
      })
      .map((t) => {
        const crew = crewDisplay(t.crew);
        const href = buildHref(t.link);

        const windowText = formatWindow(t.timeWindow);
        const timeText =
          t.startTime || t.endTime
            ? `${t.startTime || "—"} - ${t.endTime || "—"} • ${windowText}`
            : windowText;

        const status = normalizeStatus(t.status) || "planned";
        const timerState = normalizeTimerState(t.timerState, t.status);
        const isPaused = status === "in_progress" && timerState === "paused";
        const isActive = status === "in_progress";

        const serviceTicketId = t.link?.serviceTicketId || "";
        const st = serviceTicketId ? ticketById[serviceTicketId] : undefined;

        let headerText = "";
        if ((t.type || "").toLowerCase() === "service") {
          const summary = safeStr(st?.issueSummary).trim() || "Service Ticket";
          headerText = `Service Ticket: ${summary}`;
        } else if ((t.type || "").toLowerCase() === "project") {
          const stage = stageLabel(t.link?.projectStageKey || null);
          headerText = stage ? `${formatType(t.type)} • ${stage}` : `${formatType(t.type)}`;
        } else {
          headerText = `${formatType(t.type)} • ${((t.type || "") as string) || "Trip"}`;
        }

        let subLine = timeText;
        if (st) {
          const cust = safeStr(st.customerDisplayName).trim();
          const addr = buildAddressLine(st);
          const right = [cust, addr].filter(Boolean).join(" — ");
          if (right) subLine = `${timeText} • ${right}`;
        }

        const issueDetailsText =
          (t.type || "").toLowerCase() === "service" ? (safeStr(st?.issueDetails).trim() || "") : "";

        const followUpText =
          (t.type || "").toLowerCase() === "service" && serviceTicketId
            ? (safeStr(followUpByTicketId[serviceTicketId]).trim() || "")
            : "";

        const activeBoost = isActive ? (isPaused ? "1" : "0") : "2";
        const tKey = timeSortKey(t.startTime, t.timeWindow);
        const sortKey = `${activeBoost}_${tKey}_${t.id}`;

        const confirmed = whoUid && t.confirmedBy ? ((t.confirmedBy as any)[whoUid] as any) : null;

        return {
          id: t.id,
          headerText,
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
          tripType: t.type || "",
          tripDate: t.date || "",
          tripWindow: t.timeWindow || "",
          tripStartTime: t.startTime || "",
          tripEndTime: t.endTime || "",
          projectId: t.link?.projectId ?? null,
          projectStageKey: t.link?.projectStageKey ?? null,
          confirmed: confirmed || null,
          timerState,
          isActive,
          isPaused,
        };
      });

    mapped.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return mapped;
  }, [visibleTrips, ticketById, followUpByTicketId, whoUid, showCompleted]);

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

  function openConfirmModalFromTrip(t: Trip) {
    setConfirmErr("");
    const suggested = defaultHoursForTrip(t.timeWindow, t.startTime, t.endTime);
    setConfirmHours(String(suggested));
    setConfirmNote("");
    setConfirmTripId(t.id);
    setConfirmOpen(true);
  }

  function openConfirmModal(item: MyDayItem) {
    setConfirmErr("");
    const suggested = defaultHoursForTrip(item.tripWindow, item.tripStartTime, item.tripEndTime);
    setConfirmHours(String(suggested));
    setConfirmNote("");
    setConfirmTripId(item.id);
    setConfirmOpen(true);
  }

  function closeConfirmModal() {
    if (confirmSaving) return;
    setConfirmOpen(false);
    setConfirmTripId("");
    setConfirmErr("");
    setConfirmSaving(false);
    setConfirmNote("");
  }

  async function submitConfirm() {
    if (!whoUid) {
      setConfirmErr("Missing employee uid.");
      return;
    }

    const allKnownTrips = [...trips, ...recentTrips];
    const trip = allKnownTrips.find((t) => t.id === confirmTripId);

    if (!trip) {
      setConfirmErr("Trip not found. Try refreshing.");
      return;
    }

    const type = String(trip.type || "").toLowerCase();
    if (type !== "project") {
      setConfirmErr("Only project trips can be confirmed for payroll.");
      return;
    }

    const tripDate = String(trip.date || "").trim();
    const projectId = String(trip.link?.projectId || "").trim();
    const stageKey = String(trip.link?.projectStageKey || "").trim() || null;

    if (!tripDate) {
      setConfirmErr("Trip is missing a date.");
      return;
    }
    if (!projectId) {
      setConfirmErr("Trip is missing projectId.");
      return;
    }

    const hrs = Number(confirmHours);
    if (!Number.isFinite(hrs) || hrs <= 0) {
      setConfirmErr("Hours must be a number greater than 0.");
      return;
    }

    const allowed = whoUid === myUid || canViewOtherEmployees;
    if (!allowed) {
      setConfirmErr("You do not have permission to confirm for this employee.");
      return;
    }

    setConfirmSaving(true);
    setConfirmErr("");

    try {
      const emp = getSelectedEmployeeInfo(whoUid);

      const res = await confirmProjectTripForEmployee({
        tripId: trip.id,
        tripDate,
        projectId,
        projectStageKey: stageKey,
        uid: emp.uid,
        displayName: emp.displayName,
        role: emp.role,
        hours: hrs,
        note: confirmNote.trim() || undefined,
      });

      const confirmedAt = nowIso();

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                status: res.tripCompleted ? "complete" : t.status,
                confirmedBy: {
                  ...(t.confirmedBy || {}),
                  [emp.uid]: {
                    hours: hrs,
                    note: confirmNote.trim() || null,
                    confirmedAt,
                  },
                },
              }
            : t
        )
      );

      setRecentTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                status: res.tripCompleted ? "complete" : t.status,
                confirmedBy: {
                  ...(t.confirmedBy || {}),
                  [emp.uid]: {
                    hours: hrs,
                    note: confirmNote.trim() || null,
                    confirmedAt,
                  },
                },
              }
            : t
        )
      );

      closeConfirmModal();
    } catch (e: any) {
      setConfirmErr(e?.message || "Failed to confirm trip.");
    } finally {
      setConfirmSaving(false);
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
            <Card elevation={0} sx={{ borderRadius: 4 }}>
              <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack
                  direction={{ xs: "column", lg: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", lg: "center" }}
                  justifyContent="space-between"
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="h4"
                      sx={{
                        fontSize: { xs: "1.7rem", md: "2.15rem" },
                        lineHeight: 1.04,
                        fontWeight: 800,
                        letterSpacing: "-0.035em",
                      }}
                    >
                      My Day
                    </Typography>

                    <Typography
                      sx={{
                        mt: 0.85,
                        color: "text.secondary",
                        fontSize: { xs: 13, md: 14 },
                        fontWeight: 500,
                      }}
                    >
                      Daily work view for trips, company events, confirmations, and schedule context.
                    </Typography>

                    <Stack
                      direction="row"
                      spacing={0.75}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mt: 1.5 }}
                    >
                      <Chip
                        size="small"
                        icon={<TodayRoundedIcon sx={{ fontSize: 16 }} />}
                        label={todayIso}
                        variant="outlined"
                        sx={{ borderRadius: 1.5, fontWeight: 500 }}
                      />

                      {showCompleted ? (
                        <Chip
                          size="small"
                          label="Completed trips visible"
                          variant="outlined"
                          sx={{ borderRadius: 1.5, fontWeight: 500 }}
                        />
                      ) : null}
                    </Stack>
                  </Box>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    sx={{ width: { xs: "100%", lg: "auto" } }}
                  >
                    {canViewOtherEmployees ? (
                      <FormControl size="small" sx={{ minWidth: 250 }}>
                        <InputLabel>Employee</InputLabel>
                        <Select
                          label="Employee"
                          value={selectedEmployeeUid || myUid}
                          onChange={(e: SelectChangeEvent) => setSelectedEmployeeUid(e.target.value)}
                          disabled={employeesLoading}
                        >
                          <MenuItem value={myUid}>Me</MenuItem>
                          {employees.map((u) => (
                            <MenuItem key={u.uid} value={u.uid}>
                              {u.displayName} ({u.role})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : null}

                    <Button
                      component={Link}
                      href="/schedule"
                      variant="outlined"
                      startIcon={<CalendarMonthRoundedIcon />}
                    >
                      Weekly Schedule
                    </Button>

                    <Button
                      component={Link}
                      href="/time-entries"
                      variant="outlined"
                      startIcon={<AccessTimeFilledRoundedIcon />}
                    >
                      Time Entries
                    </Button>
                  </Stack>
                </Stack>

                <FormControlLabel
                  sx={{ mt: 1.5 }}
                  control={
                    <Checkbox
                      checked={showCompleted}
                      onChange={(e) => setShowCompleted(e.target.checked)}
                    />
                  }
                  label="Show completed trips"
                />
              </Box>
            </Card>

            {banner ? (
              <Alert severity="info" variant="outlined">
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

            {!loading && !error && unconfirmedPastTrips.length > 0 ? (
              <MyDaySection
                title="Needs confirmation"
                subtitle="Past project trips still waiting for payroll hours confirmation."
                icon={<WarningAmberRoundedIcon color="warning" />}
              >
                <Stack spacing={1.25}>
                  {unconfirmedPastTrips.map((t) => {
                    const crew = crewDisplay(t.crew);
                    const timeText =
                      t.startTime || t.endTime
                        ? `${t.startTime || "—"} - ${t.endTime || "—"} • ${formatWindow(t.timeWindow)}`
                        : formatWindow(t.timeWindow);

                    return (
                      <Card key={t.id} variant="outlined" sx={{ borderRadius: 3 }}>
                        <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
                          <Stack spacing={1.25}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                              alignItems={{ xs: "flex-start", sm: "center" }}
                              justifyContent="space-between"
                            >
                              <Stack spacing={0.5}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  Project • {t.date}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {timeText}
                                </Typography>
                              </Stack>

                              <Button
                                variant="contained"
                                color="success"
                                startIcon={<TaskAltRoundedIcon />}
                                onClick={() => openConfirmModalFromTrip(t)}
                              >
                                Confirm Hours
                              </Button>
                            </Stack>

                            <Stack
                              direction="row"
                              spacing={0.6}
                              flexWrap="wrap"
                              useFlexGap
                              sx={{ rowGap: 0.6 }}
                            >
                              <Chip size="small" label={`Tech: ${crew.primary}`} variant="outlined" />
                              {crew.helper ? <Chip size="small" label={crew.helper} variant="outlined" /> : null}
                              {crew.secondaryTech ? (
                                <Chip size="small" label={crew.secondaryTech} variant="outlined" />
                              ) : null}
                              {crew.secondaryHelper ? (
                                <Chip size="small" label={crew.secondaryHelper} variant="outlined" />
                              ) : null}
                            </Stack>

                            <Typography variant="caption" color="text.secondary">
                              Trip ID: {t.id}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              </MyDaySection>
            ) : null}

            {holiday ? (
              <Alert severity="warning" variant="outlined" icon={<CelebrationRoundedIcon />}>
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
              <MyDaySection
                title={`Company event${companyEvents.length > 1 ? "s" : ""}`}
                subtitle="Today’s meetings and company-wide schedule events."
                icon={<CampaignRoundedIcon color="success" />}
              >
                <Stack spacing={1.25}>
                  {companyEvents.map((e) => (
                    <Card key={e.id} variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
                        <Stack spacing={1}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            justifyContent="space-between"
                          >
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {e.title}
                            </Typography>

                            <Chip
                              size="small"
                              icon={<TodayRoundedIcon sx={{ fontSize: 16 }} />}
                              label={formatEventTime(e)}
                              color="success"
                              variant="outlined"
                              sx={{ borderRadius: 1.5, fontWeight: 500 }}
                            />
                          </Stack>

                          {e.location ? (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <LocationOnRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                              <Typography variant="body2" color="text.secondary">
                                {e.location}
                              </Typography>
                            </Stack>
                          ) : null}

                          {e.notes ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ whiteSpace: "pre-wrap" }}
                            >
                              {e.notes}
                            </Typography>
                          ) : null}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </MyDaySection>
            ) : null}

            {loading ? (
              <Card elevation={0} sx={{ borderRadius: 4 }}>
                <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                  <Typography variant="body2" color="text.secondary">
                    Loading your day...
                  </Typography>
                </Box>
              </Card>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}

            {!loading && !error ? (
              <MyDaySection
                title="Assigned work"
                subtitle="Today’s scheduled trips for the selected employee."
                icon={<GroupsRoundedIcon />}
              >
                {items.length === 0 ? (
                  <Alert severity="info" variant="outlined">
                    {holiday
                      ? `No trips scheduled. Today is a company holiday: ${holiday.name}.`
                      : "No trips scheduled for this employee today."}
                  </Alert>
                ) : (
                  <Stack spacing={1.5}>
                    {items.map((item) => {
                      const isProject = String(item.tripType || "").toLowerCase() === "project";
                      const isService = String(item.tripType || "").toLowerCase() === "service";
                      const canConfirm = isProject && (canViewOtherEmployees || whoUid === myUid);

                      const activeBadge = item.isActive ? (
                        <Chip
                          size="small"
                          color={item.isPaused ? "warning" : "success"}
                          variant="outlined"
                          label={item.isPaused ? "Paused Trip" : "Active Trip"}
                          sx={{
                            height: 24,
                            borderRadius: 1.5,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        />
                      ) : null;

                      const confirmedBadge =
                        isProject && item.confirmed ? (
                          <Chip
                            size="small"
                            icon={<TaskAltRoundedIcon sx={{ fontSize: 16 }} />}
                            label={`Confirmed (${Number(item.confirmed.hours).toFixed(2)}h)`}
                            color="success"
                            variant="outlined"
                            sx={{
                              height: 24,
                              borderRadius: 1.5,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          />
                        ) : null;

                      return (
                        <Box
                          key={item.id}
                          sx={
                            item.isActive
                              ? item.isPaused
                                ? {
                                    p: 0.5,
                                    borderRadius: 4,
                                    border: `1px solid ${alpha(theme.palette.warning.main, 0.38)}`,
                                    background: `linear-gradient(180deg, ${alpha(
                                      theme.palette.warning.light,
                                      0.16
                                    )} 0%, ${alpha(theme.palette.warning.main, 0.08)} 100%)`,
                                    boxShadow: `0 14px 28px ${alpha(theme.palette.warning.main, 0.08)}`,
                                  }
                                : {
                                    p: 0.5,
                                    borderRadius: 4,
                                    border: `1px solid ${alpha(theme.palette.success.main, 0.32)}`,
                                    background: `linear-gradient(180deg, ${alpha(
                                      theme.palette.success.light,
                                      0.15
                                    )} 0%, ${alpha(theme.palette.success.main, 0.07)} 100%)`,
                                    boxShadow: `0 16px 30px ${alpha(theme.palette.success.main, 0.08)}`,
                                  }
                              : undefined
                          }
                        >
                          <SharedTripCard
                            title={item.headerText}
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
                                    px: 1.25,
                                    py: 1,
                                    borderRadius: 2,
                                    border: `1px solid ${alpha(theme.palette.primary.main, 0.28)}`,
                                    backgroundColor: alpha(theme.palette.primary.main, 0.06),
                                  }}
                                >
                                  <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <NotesRoundedIcon sx={{ fontSize: 18, color: "primary.light", mt: 0.1 }} />
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.light" }}>
                                        Issue
                                      </Typography>
                                      <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}>
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
                                    px: 1.25,
                                    py: 1,
                                    borderRadius: 2,
                                    border: "1px solid #FFE2A8",
                                    backgroundColor: "#FFF7E6",
                                  }}
                                >
                                  <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <WarningAmberRoundedIcon sx={{ fontSize: 18, color: "#7A4B00", mt: 0.1 }} />
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography variant="caption" sx={{ fontWeight: 700, color: "#7A4B00" }}>
                                        Follow-up notes
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        sx={{ mt: 0.25, color: "#7A4B00", whiteSpace: "pre-wrap" }}
                                      >
                                        {item.followUpText}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                </Box>
                              ) : undefined
                            }
                            trailingContent={
                              activeBadge || confirmedBadge ? (
                                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                  {activeBadge}
                                  {confirmedBadge}
                                </Stack>
                              ) : undefined
                            }
                            footer={
                              isProject ? (
                                !item.confirmed ? (
                                  <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1.25}
                                    alignItems={{ xs: "stretch", sm: "center" }}
                                    justifyContent="space-between"
                                  >
                                    <Box>
                                      <Typography variant="body2" color="text.secondary">
                                        Confirm your project hours for payroll.
                                      </Typography>
                                      {!canConfirm ? (
                                        <Typography variant="caption" color="text.secondary">
                                          Only the employee or Admin/Dispatcher/Manager can confirm project hours.
                                        </Typography>
                                      ) : null}
                                    </Box>

                                    <Button
                                      variant="contained"
                                      color="success"
                                      startIcon={<TaskAltRoundedIcon />}
                                      disabled={!canConfirm}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!canConfirm) return;
                                        openConfirmModal(item);
                                      }}
                                    >
                                      Confirm Trip
                                    </Button>
                                  </Stack>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    Confirmed time will appear in <strong>Time Entries</strong> for payroll.
                                  </Typography>
                                )
                              ) : isService ? (
                                <Typography variant="caption" color="text.secondary">
                                  {item.isActive
                                    ? item.isPaused
                                      ? "Paused trip — open the service ticket to resume or finish."
                                      : "Active trip — open the service ticket for quick actions."
                                    : "Open the service ticket for full details and workflow actions."}
                                </Typography>
                              ) : undefined
                            }
                            onClick={() => {
                              window.location.href = item.href;
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </MyDaySection>
            ) : null}
          </Stack>
        </Box>

        <Dialog open={confirmOpen} onClose={closeConfirmModal} fullWidth maxWidth="sm">
          <DialogTitle>Confirm Project Trip</DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Enter hours spent on this project. This creates a <strong>locked draft time entry</strong>.
              </Typography>

              <TextField
                label="Hours"
                type="number"
                inputProps={{ min: 0.25, step: 0.25 }}
                value={confirmHours}
                onChange={(e) => setConfirmHours(e.target.value)}
                disabled={confirmSaving}
                fullWidth
              />

              <Typography variant="caption" color="text.secondary">
                Tip: If you worked 6 hours on the project, you can log the other 2 hours as a separate manual entry.
              </Typography>

              <TextField
                label="Note (optional)"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                disabled={confirmSaving}
                multiline
                minRows={3}
                placeholder="What did you work on?"
                fullWidth
              />

              {confirmErr ? <Alert severity="error">{confirmErr}</Alert> : null}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={closeConfirmModal} disabled={confirmSaving}>
              Cancel
            </Button>
            <Button onClick={submitConfirm} disabled={confirmSaving} variant="contained" color="success">
              {confirmSaving ? "Confirming…" : "Confirm Hours"}
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}