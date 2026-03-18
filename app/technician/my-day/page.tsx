// app/technician/my-day/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  setDoc,
  runTransaction,
} from "firebase/firestore";
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
  status?: string; // planned | in_progress | complete | cancelled | etc

  date?: string; // YYYY-MM-DD
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm

  crew?: TripCrew;
  link?: TripLink;

  cancelReason?: string | null;

  confirmedBy?: Record<string, TripConfirmedEntry> | null;

  // optional fields written by transaction
  completedAt?: string | null;
  completedByUid?: string | null;
};

type DailyCrewOverride = {
  id: string;
  active: boolean;
  date: string; // YYYY-MM-DD
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

  // For confirm
  tripType?: string;
  tripDate?: string;
  tripWindow?: string;
  tripStartTime?: string;
  tripEndTime?: string;
  projectId?: string | null;
  projectStageKey?: string | null;

  confirmed?: TripConfirmedEntry | null;
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
  holidayDate: string; // YYYY-MM-DD
  name: string;
  active: boolean;
  scheduleBlocked?: boolean;
};

type CompanyEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  active: boolean;

  timeWindow?: "am" | "pm" | "all_day" | "custom" | string | null;
  startTime?: string | null; // "08:00"
  endTime?: string | null; // "09:00"
  location?: string | null;
  notes?: string | null;
  type?: string | null; // meeting, etc
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

// Monday-start payroll week bounds
function getPayrollWeekBounds(entryDateIso: string) {
  const [y, m, d] = entryDateIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);

  const wd = dt.getDay(); // 0 Sun .. 6 Sat
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
  if (t === "project") return "📐 Project";
  if (t === "service") return "🔧 Service";
  return type ? `🧩 ${type}` : "🧩 Trip";
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

export default function TechnicianMyDayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);

  // Today trips
  const [trips, setTrips] = useState<Trip[]>([]);

  // ✅ NEW: recent past project trips for “missed confirm”
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);

  const [override, setOverride] = useState<DailyCrewOverride | null>(null);
  const [error, setError] = useState("");

  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeUid, setSelectedEmployeeUid] = useState<string>("");

  const [ticketById, setTicketById] = useState<Record<string, ServiceTicketLite>>({});
  const [followUpByTicketId, setFollowUpByTicketId] = useState<Record<string, string>>({});

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTripId, setConfirmTripId] = useState<string>("");
  const [confirmHours, setConfirmHours] = useState<string>("8");
  const [confirmNote, setConfirmNote] = useState<string>("");
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string>("");

  // UI toggle
  const [showCompleted, setShowCompleted] = useState(false);

  const [holiday, setHoliday] = useState<CompanyHoliday | null>(null);

  // Company events (meetings)
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const myUid = appUser?.uid || "";
  const myRole = appUser?.role || "";
  const myName = (appUser as any)?.displayName || (appUser as any)?.name || "Me";

  const isHelperRole = myRole === "helper" || myRole === "apprentice";

  const canViewOtherEmployees =
    myRole === "admin" || myRole === "dispatcher" || myRole === "manager";

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
        // best effort
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

  // Load today: holiday, company events, today trips, override, enrichment,
  // PLUS recent past project trips so missed confirms are visible.
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const whoUid = canViewOtherEmployees ? (selectedEmployeeUid || myUid) : myUid;

        // ---- Load company holiday (today) — uses holidayDate schema ----
        try {
          const hsnap = await getDocs(
            query(
              collection(db, "companyHolidays"),
              where("holidayDate", "==", todayIso),
              where("active", "==", true)
            )
          );

          if (!hsnap.empty) {
            const hdoc = hsnap.docs[0];
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
        } catch {
          setHoliday(null);
        }

        // ---- Load company events (meetings) for today ----
        try {
          let esnap;
          try {
            esnap = await getDocs(
              query(
                collection(db, "companyEvents"),
                where("date", "==", todayIso),
                where("active", "==", true),
                orderBy("startTime", "asc")
              )
            );
          } catch {
            esnap = await getDocs(
              query(
                collection(db, "companyEvents"),
                where("date", "==", todayIso),
                where("active", "==", true)
              )
            );
          }

          const events: CompanyEvent[] = esnap.docs
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
        } catch {
          setCompanyEvents([]);
        }

        // ---- Pull trips for today only ----
        const tripsSnap = await getDocs(
          query(collection(db, "trips"), where("date", "==", todayIso))
        );

        const todayTripItems: Trip[] = tripsSnap.docs.map((docSnap) => {
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
          };
        });

        // ---- Load daily crew override for THIS helper (if helper/apprentice) ----
        let foundOverride: DailyCrewOverride | null = null;

        if (isHelperRole && whoUid) {
          const overrideSnap = await getDocs(
            query(
              collection(db, "dailyCrewOverrides"),
              where("date", "==", todayIso),
              where("helperUid", "==", whoUid),
              where("active", "==", true)
            )
          );

          if (!overrideSnap.empty) {
            const docSnap = overrideSnap.docs[0];
            const d = docSnap.data() as any;
            foundOverride = {
              id: docSnap.id,
              active: typeof d.active === "boolean" ? d.active : true,
              date: d.date ?? todayIso,
              helperUid: d.helperUid ?? "",
              assignedTechUid: d.assignedTechUid ?? "",
              note: d.note ?? null,
            };
          }
        }

        setTrips(todayTripItems);
        setOverride(foundOverride);

        // ✅ NEW: Load recent past trips for missed confirmations
        // We keep the query broad (date range) and filter client-side to avoid complex indexes.
        // Default: last 14 days (includes weekends; fine).
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
          // Fallback: smaller query (still date constrained)
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
          };
        });

        setRecentTrips(recentItems);

        // ---- Enrich: load service ticket docs for TODAY trips (fast) ----
        const ticketIds = Array.from(
          new Set(todayTripItems.map((t) => t.link?.serviceTicketId || "").filter(Boolean))
        );

        const nextTicketMap: Record<string, ServiceTicketLite> = {};
        await Promise.all(
          ticketIds.map(async (tid) => {
            try {
              const snap = await getDoc(doc(db, "serviceTickets", tid));
              if (!snap.exists()) return;

              const d = snap.data() as any;
              nextTicketMap[tid] = {
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
              };
            } catch {
              // ignore
            }
          })
        );
        setTicketById(nextTicketMap);

        // ---- Enrich: follow-up notes (best effort) ----
        const followUpMap: Record<string, string> = {};
        await Promise.all(
          ticketIds.map(async (tid) => {
            try {
              const t = nextTicketMap[tid];
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
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load My Day (trips).");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [todayIso, myUid, isHelperRole, canViewOtherEmployees, selectedEmployeeUid]);

  const whoUid = useMemo(() => {
    return canViewOtherEmployees ? (selectedEmployeeUid || myUid) : myUid;
  }, [canViewOtherEmployees, selectedEmployeeUid, myUid]);

  const visibleTrips = useMemo(() => {
    if (!whoUid) return [];

    const explicitCrewTrips = trips
      .filter((t) => t.active !== false)
      .filter((t) => isUidInCrew(whoUid, t.crew));

    // Helper override behavior (for seeing schedule)
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

  // ✅ Unconfirmed past trips (project-only) that this employee needs to confirm
  const unconfirmedPastTrips = useMemo(() => {
    if (!whoUid) return [];

    const out = recentTrips
      .filter((t) => t.active !== false)
      .filter((t) => String(t.type || "").toLowerCase() === "project")
      .filter((t) => {
        const s = normalizeStatus(t.status);
        if (s === "cancelled") return false;
        // If complete, still might be missing one person's confirm? In theory no,
        // but we still allow confirm if missing.
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
      return bKey.localeCompare(aKey); // newest first
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

        // Service ticket enrichment (today only)
        const serviceTicketId = t.link?.serviceTicketId || "";
        const st = serviceTicketId ? ticketById[serviceTicketId] : undefined;

        let headerText = "";
        if ((t.type || "").toLowerCase() === "service") {
          const summary = safeStr(st?.issueSummary).trim() || "Service Ticket";
          headerText = `🔧 Service Ticket: ${summary}`;
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

        // Sorting:
        // - in_progress to top
        // - otherwise by actual time
        const inProgBoost = status === "in_progress" ? "0" : "1";
        const tKey = timeSortKey(t.startTime, t.timeWindow);
        const sortKey = `${inProgBoost}_${tKey}_${t.id}`;

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
          title: "✅ Override Active",
          text: `Today you are reassigned to a different technician for today.`,
          sub: `Assigned Tech UID: ${override.assignedTechUid}${override.note ? ` • Note: ${override.note}` : ""}`,
        };
      }

      return {
        title: "✅ Pairing Active",
        text: "Today you are using your normal crew pairing. (Overrides apply if set by admin.)",
        sub: "",
      };
    }

    return null;
  }, [whoUid, isHelperRole, override, canViewOtherEmployees]);

  function statusStyles(status: string) {
    if (status === "in_progress") {
      return { border: "1px solid #b7e3c2", background: "#f2fff6" };
    }
    if (status === "planned") {
      return { border: "1px solid #b7cff5", background: "#f4f8ff" };
    }
    if (status === "complete" || status === "completed") {
      return { border: "1px solid #eee", background: "#fafafa" };
    }
    return { border: "1px solid #ddd", background: "white" };
  }

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

    // IMPORTANT: confirm may be for TODAY trips OR past unconfirmed trips.
    const allKnownTrips = [...trips, ...recentTrips];
    const trip = allKnownTrips.find((t) => t.id === confirmTripId);

    if (!trip) {
      setConfirmErr("Trip not found (try refreshing).");
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
      setConfirmErr("Hours must be a number > 0.");
      return;
    }

    // Permission rule:
    // - employee can confirm for self
    // - admin/dispatcher/manager can confirm while viewing another employee
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

      // Update local state (today trips + recent trips)
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
    <ProtectedPage fallbackTitle="My Day">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>My Day</h1>
            <p style={{ marginTop: "6px", color: "#666" }}>
              Today: <strong>{todayIso}</strong>
            </p>
            <p style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
              Trips-driven view (scheduling + time capture)
            </p>

            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              <span style={{ fontSize: 13, fontWeight: 800 }}>Show completed trips</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {canViewOtherEmployees ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#666", fontWeight: 800 }}>Employee</span>
                <select
                  value={selectedEmployeeUid || ""}
                  onChange={(e) => setSelectedEmployeeUid(e.target.value)}
                  disabled={employeesLoading}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    background: "white",
                  }}
                >
                  <option value={myUid}>Me</option>
                  {employees.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <Link
              href="/schedule"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Weekly Schedule
            </Link>

            <Link
              href="/time-entries"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Time Entries
            </Link>
          </div>
        </div>

        {banner ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              background: "#fafafa",
              maxWidth: "980px",
            }}
          >
            <div style={{ fontWeight: 900 }}>{banner.title}</div>
            <div style={{ marginTop: "6px", color: "#555", fontSize: "13px" }}>{banner.text}</div>
            {banner.sub ? (
              <div style={{ marginTop: "6px", color: "#777", fontSize: "12px" }}>{banner.sub}</div>
            ) : null}
          </div>
        ) : null}

        {/* ✅ Unconfirmed Past Trips Banner */}
        {!loading && !error && unconfirmedPastTrips.length > 0 ? (
          <div
            style={{
              marginTop: 14,
              border: "1px solid #ffe2a8",
              borderRadius: 12,
              padding: 12,
              background: "#fff7e6",
              maxWidth: 980,
            }}
          >
            <div style={{ fontWeight: 950 }}>⚠️ Unconfirmed Project Trips</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#7a4b00", fontWeight: 800 }}>
              You have <strong>{unconfirmedPastTrips.length}</strong> past trip(s) that still need hours confirmed.
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {unconfirmedPastTrips.map((t) => {
                const crew = crewDisplay(t.crew);
                const timeText =
                  t.startTime || t.endTime
                    ? `${t.startTime || "—"} - ${t.endTime || "—"} • ${formatWindow(t.timeWindow)}`
                    : formatWindow(t.timeWindow);

                return (
                  <div
                    key={t.id}
                    style={{
                      border: "1px solid #ffe2a8",
                      borderRadius: 12,
                      background: "white",
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 950 }}>
                        📐 Project • {t.date} • {timeText}
                      </div>
                      <button
                        type="button"
                        onClick={() => openConfirmModalFromTrip(t)}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #2e7d32",
                          borderRadius: 10,
                          background: "#eaffea",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                      >
                        ✅ Confirm Hours
                      </button>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                      Crew: <strong>{crew.primary}</strong>
                      {crew.helper ? ` • ${crew.helper}` : ""}
                      {crew.secondaryTech ? ` • ${crew.secondaryTech}` : ""}
                      {crew.secondaryHelper ? ` • ${crew.secondaryHelper}` : ""}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
                      Trip ID: {t.id}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Holiday */}
        {holiday ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #ffe2a8",
              borderRadius: "12px",
              padding: "12px",
              background: "#fff7e6",
              maxWidth: "980px",
            }}
          >
            <div style={{ fontWeight: 950 }}>🎉 Company Holiday</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#7a4b00", fontWeight: 900 }}>
              {holiday.name} • {holiday.holidayDate}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#7a4b00" }}>
              {holidayBlocks ? "Scheduling is blocked today." : "If any work is scheduled today, it will still appear below."}
            </div>
          </div>
        ) : null}

        {/* Company Events (Meetings) */}
        {!loading && companyEvents.length > 0 ? (
          <div
            style={{
              marginTop: 14,
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              background: "#fafafa",
              maxWidth: 980,
            }}
          >
            <div style={{ fontWeight: 950 }}>📣 Company Event{companyEvents.length > 1 ? "s" : ""}</div>
            <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
              {companyEvents.map((e) => (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    background: "white",
                    padding: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 950 }}>
                      📣 {e.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>
                      {formatEventTime(e)}
                    </div>
                  </div>

                  {e.location ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                      Location: <strong>{e.location}</strong>
                    </div>
                  ) : null}

                  {e.notes ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#555", whiteSpace: "pre-wrap" }}>
                      {e.notes}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {loading ? <p style={{ marginTop: "16px" }}>Loading your day...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <div style={{ marginTop: "16px", maxWidth: "980px" }}>
            {items.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #ccc",
                  borderRadius: "12px",
                  padding: "14px",
                  background: "white",
                  color: "#666",
                }}
              >
                {holiday ? `No trips scheduled. Today is a company holiday: ${holiday.name}.` : "No trips scheduled for this employee today."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {items.map((item) => {
                  const styles = statusStyles(item.status);
                  const isProject = String(item.tripType || "").toLowerCase() === "project";
                  const canConfirm = isProject && (canViewOtherEmployees || whoUid === myUid);

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      style={{
                        display: "block",
                        borderRadius: "12px",
                        padding: "12px",
                        textDecoration: "none",
                        color: "inherit",
                        ...(styles as any),
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 950, fontSize: "15px" }}>{item.headerText}</div>

                        {isProject && item.confirmed ? (
                          <div
                            style={{
                              fontSize: 12,
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "1px solid #b7e3c2",
                              background: "#eaffea",
                              color: "#1f6b1f",
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                            }}
                            title={item.confirmed.note ? `Note: ${item.confirmed.note}` : "Confirmed"}
                          >
                            ✅ Confirmed ({Number(item.confirmed.hours).toFixed(2)}h)
                          </div>
                        ) : null}
                      </div>

                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#333" }}>
                        {item.subLine}
                      </div>

                      <div style={{ marginTop: "8px", fontSize: "12px", color: "#555" }}>
                        {item.techText}
                      </div>
                      {item.helperText ? <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>{item.helperText}</div> : null}
                      {item.secondaryTechText ? <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>{item.secondaryTechText}</div> : null}
                      {item.secondaryHelperText ? <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>{item.secondaryHelperText}</div> : null}

                      {item.issueDetailsText ? (
                        <div
                          style={{
                            marginTop: "10px",
                            paddingTop: "10px",
                            borderTop: "1px solid rgba(0,0,0,0.06)",
                            fontSize: "12px",
                            color: "#444",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          <strong>Issue:</strong> {item.issueDetailsText}
                        </div>
                      ) : null}

                      {item.followUpText ? (
                        <div style={{ marginTop: "8px", fontSize: "12px", color: "#6a4b00", whiteSpace: "pre-wrap" }}>
                          <strong>Follow-up notes:</strong> {item.followUpText}
                        </div>
                      ) : null}

                      {isProject ? (
                        <div
                          style={{
                            marginTop: "12px",
                            paddingTop: "10px",
                            borderTop: "1px solid rgba(0,0,0,0.06)",
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {!item.confirmed ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!canConfirm) return;
                                openConfirmModal(item);
                              }}
                              disabled={!canConfirm}
                              style={{
                                padding: "8px 12px",
                                border: "1px solid #2e7d32",
                                borderRadius: "10px",
                                background: canConfirm ? "#eaffea" : "#f5f5f5",
                                cursor: canConfirm ? "pointer" : "not-allowed",
                                fontWeight: 900,
                              }}
                            >
                              ✅ Confirm Trip
                            </button>
                          ) : (
                            <div style={{ fontSize: 12, color: "#666" }}>
                              Confirmed time will appear in <strong>Time Entries</strong> for payroll.
                            </div>
                          )}

                          {!canConfirm ? (
                            <div style={{ fontSize: 12, color: "#999" }}>
                              Only the employee (or Admin/Dispatcher/Manager) can confirm project hours.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* Confirm Modal */}
        {confirmOpen ? (
          <div
            onClick={() => {
              if (!confirmSaving) closeConfirmModal();
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 14,
              zIndex: 9999,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 520,
                borderRadius: 16,
                border: "1px solid #ddd",
                background: "white",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 16 }}>✅ Confirm Project Trip</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Enter hours spent on this project. This creates a <strong>locked draft time entry</strong>.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 900 }}>Hours</label>
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={confirmHours}
                    onChange={(e) => setConfirmHours(e.target.value)}
                    disabled={confirmSaving}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      marginTop: 6,
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                    Tip: If you worked 6 hours on the project, you can log the other 2 hours as a separate manual entry.
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 900 }}>Note (optional)</label>
                  <textarea
                    value={confirmNote}
                    onChange={(e) => setConfirmNote(e.target.value)}
                    rows={3}
                    disabled={confirmSaving}
                    placeholder="What did you work on? (optional)"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      marginTop: 6,
                    }}
                  />
                </div>

                {confirmErr ? <div style={{ fontSize: 12, color: "red" }}>{confirmErr}</div> : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => closeConfirmModal()}
                    disabled={confirmSaving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => submitConfirm()}
                    disabled={confirmSaving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #2e7d32",
                      background: "#eaffea",
                      cursor: "pointer",
                      fontWeight: 950,
                    }}
                  >
                    {confirmSaving ? "Confirming..." : "Confirm Hours"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}