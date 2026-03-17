// app/schedule/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  addDoc,
} from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type ViewMode = "week" | "month" | "day";

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
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TripConfirmedEntry = {
  hours: number;
  note?: string | null;
  confirmedAt: string;
};

type TripDoc = {
  id: string;
  active: boolean;
  type?: "service" | "project" | string;
  status?: string;

  date?: string; // YYYY-MM-DD
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string; // "08:00"
  endTime?: string; // "12:00"

  crew?: TripCrew | null;
  link?: TripLink | null;

  outcome?: string | null;
  readyToBillAt?: string | null;

  confirmedBy?: Record<string, TripConfirmedEntry> | null;

  createdAt?: string;
  updatedAt?: string;
};

type TechRow = {
  uid: string;
  name: string;
};

type TicketSummary = {
  id: string;
  issueSummary: string;
  customerDisplayName: string;
  serviceAddressLine1: string;
  serviceCity: string;
};

type ProjectSummary = {
  id: string;
  name: string;
};

type TechFilterValue = "ALL" | "UNASSIGNED" | string;

type AddTripType = "service" | "project";
type SlotKey = "am" | "pm";

type CompanyHoliday = {
  id: string;
  holidayDate: string; // YYYY-MM-DD
  name: string;
  active: boolean;
  scheduleBlocked?: boolean;
};

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

function isWeekend(d: Date) {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}

function startOfWorkWeek(d: Date) {
  const wd = d.getDay(); // 0..6
  const diffToMon = (wd + 6) % 7;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - diffToMon);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function workWeekDays(weekStartMonday: Date) {
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStartMonday, i));
}

function formatDow(d: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatShort(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function tripHref(t: TripDoc) {
  if (t.link?.serviceTicketId) return `/service-tickets/${t.link.serviceTicketId}`;
  if (t.link?.projectId) return `/projects/${t.link.projectId}`;
  return "/schedule";
}

function statusBadgeStyle(status?: string) {
  const s = (status || "").toLowerCase();
  if (s === "in_progress") {
    return { background: "#eaffea", border: "1px solid #b8e6b8", color: "#1f6b1f" };
  }
  if (s === "planned") {
    return { background: "#eaf2ff", border: "1px solid #c6dbff", color: "#1b4fbf" };
  }
  if (s === "complete" || s === "completed") {
    return { background: "#f3f3f3", border: "1px solid #e3e3e3", color: "#666" };
  }
  return { background: "#fff7e6", border: "1px solid #ffe2a8", color: "#7a4b00" };
}

function compareTripTime(a: TripDoc, b: TripDoc) {
  const aKey = `${a.startTime || "99:99"}_${a.endTime || "99:99"}_${a.id}`;
  const bKey = `${b.startTime || "99:99"}_${b.endTime || "99:99"}_${b.id}`;
  return aKey.localeCompare(bKey);
}

function nextWorkday(d: Date) {
  let cur = addDays(d, 1);
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur;
}

function prevWorkday(d: Date) {
  let cur = addDays(d, -1);
  while (isWeekend(cur)) cur = addDays(cur, -1);
  return cur;
}

function normalizeStatus(s?: string) {
  return (s || "").trim().toLowerCase();
}

function isCompletedStatus(status?: string) {
  const s = normalizeStatus(status);
  return s === "complete" || s === "completed";
}

function primaryTechUid(t: TripDoc) {
  return String(t.crew?.primaryTechUid || "").trim();
}

function isTechOnTrip(t: TripDoc, techUid: string) {
  const uid = String(techUid || "").trim();
  if (!uid) return false;

  const primary = String(t.crew?.primaryTechUid || "").trim();
  const secondary = String(t.crew?.secondaryTechUid || "").trim();

  return primary === uid || secondary === uid;
}

function tripRowUids(t: TripDoc): string[] {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(uids));
}

function formatWindowLabel(w?: string) {
  const x = (w || "").toLowerCase();
  if (x === "am") return "AM";
  if (x === "pm") return "PM";
  if (x === "all_day") return "All Day";
  if (x === "custom") return "Custom";
  return w || "—";
}

function parseHHMM(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return { hh, mm };
}

function minutesFromHHMM(hhmm?: string) {
  const p = parseHHMM(hhmm);
  if (!p) return null;
  return p.hh * 60 + p.mm;
}

function formatTime12h(hhmm?: string) {
  const p = parseHHMM(hhmm);
  if (!p) return "—";
  let hh = p.hh;
  const mm = p.mm;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mm === 0) return `${hh}${ampm}`;
  return `${hh}:${pad2(mm)}${ampm}`;
}

function formatTimeRangeForCard(t: TripDoc) {
  const w = (t.timeWindow || "").toLowerCase();

  if (w === "all_day") return `All Day • All Day`;
  if (w === "am") return `8AM–12Noon • AM`;
  if (w === "pm") return `1PM–5PM • PM`;

  const start = t.startTime ? formatTime12h(t.startTime) : "—";
  const end = t.endTime ? formatTime12h(t.endTime) : "—";
  const label = formatWindowLabel(t.timeWindow);
  return `${start}–${end} • ${label}`;
}

function monthCalendarWorkWeeks(anchor: Date) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  const firstOfMonth = new Date(y, m, 1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const lastOfMonth = new Date(y, m + 1, 0);
  lastOfMonth.setHours(0, 0, 0, 0);

  const gridStart = startOfWorkWeek(firstOfMonth);

  let gridEnd = new Date(lastOfMonth);
  const wd = gridEnd.getDay();
  const diffToFri = (5 - wd + 7) % 7;
  gridEnd = addDays(gridEnd, diffToFri);

  const weeks: Array<Array<Date | null>> = [];
  let cur = new Date(gridStart);

  while (cur <= gridEnd) {
    const row: Array<Date | null> = [];
    for (let i = 0; i < 5; i++) {
      const d = addDays(cur, i);
      if (d.getMonth() === m) row.push(d);
      else row.push(null);
    }
    weeks.push(row);
    cur = addDays(cur, 7);
  }

  return weeks;
}

function crewConfirmUids(t: TripDoc) {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.helperUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
    String(t.crew?.secondaryHelperUid || "").trim(),
  ].filter(Boolean);

  return Array.from(new Set(uids));
}

function confirmationProgress(t: TripDoc) {
  const required = crewConfirmUids(t);
  const confirmedBy = t.confirmedBy || {};
  const confirmedCount = required.filter((uid) => Boolean((confirmedBy as any)[uid])).length;
  return { confirmedCount, requiredCount: required.length };
}

// Slot windows: AM=8-12, PM=13-17
const SLOT_AM_START = 8 * 60;
const SLOT_AM_END = 12 * 60;
const SLOT_PM_START = 13 * 60;
const SLOT_PM_END = 17 * 60;

function tripBlocksSlot(t: TripDoc, slot: SlotKey) {
  const w = String(t.timeWindow || "").toLowerCase();

  // Cancelled/inactive shouldn't block scheduling
  if (t.active === false) return false;
  if (normalizeStatus(t.status) === "cancelled") return false;

  if (w === "all_day") return true;
  if (w === "am") return slot === "am";
  if (w === "pm") return slot === "pm";

  // Custom: check overlap with AM/PM ranges
  const stMin = minutesFromHHMM(t.startTime) ?? null;
  const etMin = minutesFromHHMM(t.endTime) ?? null;
  if (stMin == null || etMin == null || etMin <= stMin) {
    // If custom but times are invalid, treat as blocking all day to avoid overbooking
    return true;
  }

  const [slotStart, slotEnd] =
    slot === "am" ? [SLOT_AM_START, SLOT_AM_END] : [SLOT_PM_START, SLOT_PM_END];

  const overlaps = stMin < slotEnd && etMin > slotStart;
  return overlaps;
}

function computeSlotAvailability(cellTrips: TripDoc[]) {
  const amBusy = cellTrips.some((t) => tripBlocksSlot(t, "am"));
  const pmBusy = cellTrips.some((t) => tripBlocksSlot(t, "pm"));
  return { amBusy, pmBusy, allBusy: amBusy && pmBusy };
}

export default function SchedulePage() {
  const { appUser } = useAuthContext();

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "office_display";

  const canEditSchedule =
    appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";

  const [view, setView] = useState<ViewMode>("week");
  const [anchorIso, setAnchorIso] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const mon = startOfWorkWeek(d);
    return toIsoDate(mon);
  });

  // Filters
  const [techFilter, setTechFilter] = useState<TechFilterValue>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);

  const [loading, setLoading] = useState(true);

  const [techsLoading, setTechsLoading] = useState(true);
  const [techsError, setTechsError] = useState("");
  const [techs, setTechs] = useState<TechRow[]>([]);

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

  // Holidays
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [holidaysError, setHolidaysError] = useState("");
  const [holidayByDate, setHolidayByDate] = useState<Record<string, CompanyHoliday>>({});

  // Service ticket summaries (for cards)
  const [ticketMap, setTicketMap] = useState<Record<string, TicketSummary>>({});
  // Project summaries (for cards)
  const [projectMap, setProjectMap] = useState<Record<string, ProjectSummary>>({});

  // Add Trip modal
  const [addOpen, setAddOpen] = useState(false);
  const [addTechUid, setAddTechUid] = useState("");
  const [addDateIso, setAddDateIso] = useState("");
  const [addSlot, setAddSlot] = useState<SlotKey>("am");
  const [addTripType, setAddTripType] = useState<AddTripType>("service");
  const [addLinkId, setAddLinkId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr] = useState("");

  function findTechName(uid: string) {
    const t = techs.find((x) => x.uid === uid);
    return t?.name || "";
  }

  function slotDefaults(slot: SlotKey) {
    if (slot === "am") return { timeWindow: "am" as const, startTime: "08:00", endTime: "12:00" };
    return { timeWindow: "pm" as const, startTime: "13:00", endTime: "17:00" };
  }

  function openAddModal(args: { techUid: string; dateIso: string; slot: SlotKey }) {
    setAddErr("");
    setAddTechUid(args.techUid);
    setAddDateIso(args.dateIso);
    setAddSlot(args.slot);
    setAddTripType("service");
    setAddLinkId("");
    setAddNotes("");
    setAddOpen(true);
  }

  function closeAddModal() {
    if (addSaving) return;
    setAddOpen(false);
    setAddErr("");
    setAddSaving(false);
    setAddLinkId("");
    setAddNotes("");
  }

  async function submitAddTrip() {
    if (!canEditSchedule) {
      setAddErr("Only Admin/Dispatcher/Manager can schedule trips.");
      return;
    }

    const techUid = String(addTechUid || "").trim();
    const dateIso = String(addDateIso || "").trim();
    const linkId = String(addLinkId || "").trim();

    if (!techUid) {
      setAddErr("Missing technician.");
      return;
    }
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      setAddErr("Missing/invalid date.");
      return;
    }

    // Block scheduling on holidays
    if (holidayByDate[dateIso]) {
      setAddErr(`That date is a company holiday (${holidayByDate[dateIso].name}).`);
      return;
    }

    if (!linkId) {
      setAddErr(addTripType === "service" ? "Enter a Service Ticket ID." : "Enter a Project ID.");
      return;
    }

    setAddSaving(true);
    setAddErr("");

    try {
      const now = nowIso();
      const techName = findTechName(techUid) || "Technician";
      const slot = slotDefaults(addSlot);

      const payload: any = {
        active: true,
        type: addTripType,
        status: "planned",

        date: dateIso,
        timeWindow: slot.timeWindow,
        startTime: slot.startTime,
        endTime: slot.endTime,

        crew: {
          primaryTechUid: techUid,
          primaryTechName: techName,
          helperUid: null,
          helperName: null,
          secondaryTechUid: null,
          secondaryTechName: null,
          secondaryHelperUid: null,
          secondaryHelperName: null,
        },

        link: {
          serviceTicketId: addTripType === "service" ? linkId : null,
          projectId: addTripType === "project" ? linkId : null,
          projectStageKey: addTripType === "project" ? null : null,
        },

        notes: addNotes.trim() || null,
        cancelReason: null,

        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      const created = await addDoc(collection(db, "trips"), payload);

      // Update local state so UI shows instantly
      const newTrip: TripDoc = { id: created.id, ...(payload as any) };
      setTrips((prev) => [...prev, newTrip].sort(compareTripTime));

      closeAddModal();
    } catch (e: any) {
      setAddErr(e?.message || "Failed to add trip.");
    } finally {
      setAddSaving(false);
    }
  }

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const v = (url.searchParams.get("view") || "").toLowerCase();
      const d = (url.searchParams.get("date") || "").trim();

      if (v === "day" || v === "week" || v === "month") setView(v);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchorIso(d);

      const hide = url.searchParams.get("hideCompleted");
      if (hide === "0") setHideCompleted(false);

      const tf = url.searchParams.get("tech");
      if (tf) setTechFilter(tf);

      const sf = url.searchParams.get("status");
      if (sf) setStatusFilter(sf);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      url.searchParams.set("date", anchorIso);
      url.searchParams.set("hideCompleted", hideCompleted ? "1" : "0");
      url.searchParams.set("tech", techFilter);
      url.searchParams.set("status", statusFilter);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }, [view, anchorIso, hideCompleted, techFilter, statusFilter]);

  const anchorDate = useMemo(() => fromIsoDate(anchorIso), [anchorIso]);

  const range = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      const iso = toIsoDate(d);
      return { startIso: iso, endIso: iso };
    }

    if (view === "month") {
      const y = anchorDate.getFullYear();
      const m = anchorDate.getMonth();
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      first.setHours(0, 0, 0, 0);
      last.setHours(0, 0, 0, 0);
      return { startIso: toIsoDate(first), endIso: toIsoDate(last) };
    }

    const weekStart = startOfWorkWeek(anchorDate);
    const weekDays = workWeekDays(weekStart);
    return { startIso: toIsoDate(weekDays[0]), endIso: toIsoDate(weekDays[weekDays.length - 1]) };
  }, [view, anchorIso, anchorDate]);

// Load holidays in range (uses holidayDate from your schema)
useEffect(() => {
  async function loadHolidays() {
    setHolidaysLoading(true);
    setHolidaysError("");

    try {
      // Company holidays are a small dataset. Avoid range/index headaches:
      // load all + filter client-side.
      const snap = await getDocs(collection(db, "companyHolidays"));

      const map: Record<string, CompanyHoliday> = {};

      for (const ds of snap.docs) {
        const d = ds.data() as any;

        const active = typeof d.active === "boolean" ? d.active : true;
        if (!active) continue;

        const iso = String(d.holidayDate || "").trim(); // ✅ your field name
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

        // only keep holidays in current visible range
        if (iso < range.startIso || iso > range.endIso) continue;

        // optional behavior: only show “blocking” holidays (if you want)
        // if (d.scheduleBlocked === false) continue;

        map[iso] = {
          id: ds.id,
          holidayDate: iso,
          name: String(d.name ?? d.title ?? "Holiday"),
          active: true,
          scheduleBlocked: typeof d.scheduleBlocked === "boolean" ? d.scheduleBlocked : undefined,
        };
      }

      setHolidayByDate(map);
    } catch (e: any) {
      setHolidaysError(e?.message || "Failed to load company holidays.");
      setHolidayByDate({});
    } finally {
      setHolidaysLoading(false);
    }
  }

  loadHolidays();
}, [range.startIso, range.endIso]);

  useEffect(() => {
    async function loadTechs() {
      setTechsLoading(true);
      setTechsError("");
      try {
        const snap = await getDocs(collection(db, "users"));
        const items: TechRow[] = snap.docs
          .map((ds) => {
            const d = ds.data() as any;
            return {
              uid: String(d.uid ?? ds.id),
              name: String(d.displayName ?? "Unnamed"),
              role: String(d.role ?? ""),
              active: Boolean(d.active),
            };
          })
          .filter((x) => x.active && x.role === "technician")
          .map((x) => ({ uid: x.uid, name: x.name }));

        items.sort((a, b) => a.name.localeCompare(b.name));
        setTechs(items);
      } catch (e: any) {
        setTechsError(e?.message || "Failed to load technicians.");
      } finally {
        setTechsLoading(false);
      }
    }
    loadTechs();
  }, []);

  useEffect(() => {
    async function loadTrips() {
      setTripsLoading(true);
      setTripsError("");

      try {
        const qTrips = query(
          collection(db, "trips"),
          where("active", "==", true),
          where("date", ">=", range.startIso),
          where("date", "<=", range.endIso),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        );

        const snap = await getDocs(qTrips);

        const items: TripDoc[] = snap.docs.map((ds) => {
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
            crew: d.crew ?? null,
            link: d.link ?? null,
            outcome: d.outcome ?? null,
            readyToBillAt: d.readyToBillAt ?? null,
            confirmedBy: (d.confirmedBy ?? null) as any,
            createdAt: d.createdAt ?? undefined,
            updatedAt: d.updatedAt ?? undefined,
          };
        });

        setTrips(items);
      } catch (e: any) {
        setTripsError(e?.message || "Failed to load trips.");
      } finally {
        setTripsLoading(false);
      }
    }

    loadTrips();
  }, [range.startIso, range.endIso]);

  useEffect(() => {
    setLoading(tripsLoading || techsLoading || holidaysLoading);
  }, [tripsLoading, techsLoading, holidaysLoading]);

  const serviceTicketIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const id = String(t.link?.serviceTicketId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  const projectIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const id = String(t.link?.projectId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  useEffect(() => {
    let cancelled = false;

    async function loadTicketSummaries() {
      if (serviceTicketIdsInRange.length === 0) return;
      const missing = serviceTicketIdsInRange.filter((id) => !ticketMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, TicketSummary> = {};
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, "serviceTickets", id));
            if (!snap.exists()) return;

            const d = snap.data() as any;
            next[id] = {
              id,
              issueSummary: String(d.issueSummary ?? "Service Ticket"),
              customerDisplayName: String(d.customerDisplayName ?? ""),
              serviceAddressLine1: String(d.serviceAddressLine1 ?? ""),
              serviceCity: String(d.serviceCity ?? ""),
            };
          })
        );
      } catch {
        // ignore
      }

      if (!cancelled && Object.keys(next).length) {
        setTicketMap((prev) => ({ ...prev, ...next }));
      }
    }

    loadTicketSummaries();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTicketIdsInRange.join("|")]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectSummaries() {
      if (projectIdsInRange.length === 0) return;
      const missing = projectIdsInRange.filter((id) => !projectMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, ProjectSummary> = {};
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, "projects", id));
            if (!snap.exists()) return;

            const d = snap.data() as any;
            next[id] = {
              id,
              name: String(d.name ?? d.projectName ?? d.title ?? "Project"),
            };
          })
        );
      } catch {
        // ignore
      }

      if (!cancelled && Object.keys(next).length) {
        setProjectMap((prev) => ({ ...prev, ...next }));
      }
    }

    loadProjectSummaries();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsInRange.join("|")]);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const s = normalizeStatus(t.status);

      if (hideCompleted && isCompletedStatus(s)) return false;

      if (statusFilter !== "ALL") {
        if (normalizeStatus(statusFilter) !== s) return false;
      }

      if (techFilter === "ALL") return true;

      if (techFilter === "UNASSIGNED") {
        const hasPrimary = Boolean(String(t.crew?.primaryTechUid || "").trim());
        const hasSecondary = Boolean(String(t.crew?.secondaryTechUid || "").trim());
        return !(hasPrimary || hasSecondary);
      }

      return isTechOnTrip(t, techFilter);
    });
  }, [trips, hideCompleted, statusFilter, techFilter]);

  const rows = useMemo(() => {
    const out: Array<{ key: string; label: string; uid: string | null }> = [];

    const unassignedHasTrips = filteredTrips.some((t) => !primaryTechUid(t));
    if (unassignedHasTrips || techFilter === "UNASSIGNED") {
      out.push({ key: "UNASSIGNED", label: "Unassigned", uid: null });
    }

    if (techFilter !== "ALL" && techFilter !== "UNASSIGNED") {
      const match = techs.find((t) => t.uid === techFilter);
      if (match) out.push({ key: match.uid, label: match.name, uid: match.uid });
      return out;
    }

    for (const t of techs) out.push({ key: t.uid, label: t.name, uid: t.uid });
    return out;
  }, [techs, filteredTrips, techFilter]);

  const tripsByDate = useMemo(() => {
    const map: Record<string, TripDoc[]> = {};
    for (const t of filteredTrips) {
      const d = String(t.date || "").trim();
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(t);
    }
    for (const k of Object.keys(map)) map[k].sort(compareTripTime);
    return map;
  }, [filteredTrips]);

  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const t of filteredTrips) {
      const d = String(t.date || "").trim();
      if (!d) continue;

      const rowUids = tripRowUids(t);
      const targets = rowUids.length ? rowUids : ["UNASSIGNED"];

      for (const uid of targets) {
        if (!out.has(uid)) out.set(uid, new Map());
        const byDate = out.get(uid)!;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(t);
      }
    }

    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort(compareTripTime);
        byDate.set(d, list);
      }
    }

    return out;
  }, [filteredTrips]);

  function goPrev() {
    if (view === "day") {
      const prev = prevWorkday(fromIsoDate(anchorIso));
      setAnchorIso(toIsoDate(prev));
      return;
    }
    if (view === "month") {
      const prev = addMonths(fromIsoDate(anchorIso), -1);
      setAnchorIso(toIsoDate(new Date(prev.getFullYear(), prev.getMonth(), 1)));
      return;
    }
    const prevWeek = addDays(startOfWorkWeek(fromIsoDate(anchorIso)), -7);
    setAnchorIso(toIsoDate(prevWeek));
  }

  function goNext() {
    if (view === "day") {
      const next = nextWorkday(fromIsoDate(anchorIso));
      setAnchorIso(toIsoDate(next));
      return;
    }
    if (view === "month") {
      const next = addMonths(fromIsoDate(anchorIso), 1);
      setAnchorIso(toIsoDate(new Date(next.getFullYear(), next.getMonth(), 1)));
      return;
    }
    const nextWeek = addDays(startOfWorkWeek(fromIsoDate(anchorIso)), 7);
    setAnchorIso(toIsoDate(nextWeek));
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);

    if (view === "day") {
      let cur = d;
      while (isWeekend(cur)) cur = addDays(cur, 1);
      setAnchorIso(toIsoDate(cur));
      return;
    }
    if (view === "month") {
      setAnchorIso(toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(startOfWorkWeek(d)));
  }

  const daysForWeekOrDay = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      return [d];
    }
    const weekStart = startOfWorkWeek(anchorDate);
    return workWeekDays(weekStart);
  }, [view, anchorIso, anchorDate]);

  const monthWeeks = useMemo(() => {
    if (view !== "month") return [];
    return monthCalendarWorkWeeks(anchorDate);
  }, [view, anchorDate]);

  const titleText = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Day (${formatDow(d)} ${formatShort(d)})`;
    }
    if (view === "month") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Month (${d.getMonth() + 1}/${d.getFullYear()})`;
    }
    const d0 = daysForWeekOrDay[0];
    const d1 = daysForWeekOrDay[daysForWeekOrDay.length - 1];
    return `Schedule • Week (${formatShort(d0)} – ${formatShort(d1)})`;
  }, [view, anchorIso, daysForWeekOrDay]);

  function renderHolidayBadge(iso: string) {
    const h = holidayByDate[iso];
    if (!h) return null;

    return (
      <span
        style={{
          marginLeft: 8,
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid #ffe2a8",
          background: "#fff7e6",
          color: "#7a4b00",
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}
        title={h.name}
      >
        🎉 {h.name}
      </span>
    );
  }

  function renderTripCard(t: TripDoc, opts?: { showTechName?: boolean }) {
    const badgeStyle = statusBadgeStyle(t.status);

    const type = (t.type || "").toLowerCase();
    const isService = type === "service";
    const isProject = type === "project";

    const ticketId = String(t.link?.serviceTicketId || "").trim();
    const ticket = ticketId ? ticketMap[ticketId] : undefined;

    const projectId = String(t.link?.projectId || "").trim();
    const project = projectId ? projectMap[projectId] : undefined;

    const titleText =
      isService
        ? (ticket?.issueSummary || "Service Ticket")
        : isProject
          ? (project?.name || "Project")
          : "Trip";

    const icon = isService ? "🔧" : isProject ? "📐" : "🧳";

    const timeText = formatTimeRangeForCard(t);

    const customerLine =
      isService && ticket
        ? `${ticket.customerDisplayName || "Customer"} — ${ticket.serviceAddressLine1 || ""}${ticket.serviceCity ? `, ${ticket.serviceCity}` : ""}`
        : "";

    const showTechName = Boolean(opts?.showTechName);
    const techName = t.crew?.primaryTechName || "";

    const prog = isProject ? confirmationProgress(t) : null;
    const showProgress =
      isProject &&
      prog &&
      prog.requiredCount > 0 &&
      normalizeStatus(t.status) !== "complete" &&
      normalizeStatus(t.status) !== "completed";

    return (
      <Link
        key={t.id}
        href={tripHref(t)}
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 10,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
            {icon} {titleText}
            {showTechName && techName ? (
              <span style={{ marginLeft: 8, fontSize: 12, color: "#666", fontWeight: 800 }}>
                • {techName}
              </span>
            ) : null}
          </div>

          <div
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              ...badgeStyle,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {(t.status || "—").replaceAll("_", " ")}
          </div>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>{timeText}</div>

        {showProgress ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#777", fontWeight: 800 }}>
            Confirmed: {prog!.confirmedCount}/{prog!.requiredCount}
          </div>
        ) : null}

        {customerLine ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{customerLine}</div>
        ) : null}
      </Link>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Schedule">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{titleText}</h1>
            <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
              Week/Day = Technician rows. Month = Calendar grid (Mon–Fri).
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={goPrev}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              ← Prev
            </button>

            <button
              type="button"
              onClick={goToday}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Today
            </button>

            <button
              type="button"
              onClick={goNext}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Next →
            </button>

            <div style={{ width: 10 }} />

            <div style={{ display: "flex", gap: 6, padding: 4, border: "1px solid #ddd", borderRadius: 12, background: "#fafafa" }}>
              <button
                type="button"
                onClick={() => setView("day")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: view === "day" ? "white" : "#f5f5f5",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setView("week")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: view === "week" ? "white" : "#f5f5f5",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setView("month")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: view === "month" ? "white" : "#f5f5f5",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            marginTop: 14,
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            background: "#fafafa",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Technician</div>
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
            >
              <option value="ALL">All</option>
              <option value="UNASSIGNED">Unassigned</option>
              {techs.map((t) => (
                <option key={t.uid} value={t.uid}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>Status</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
            >
              <option value="ALL">All</option>
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="complete">complete</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 18 }}>
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 800 }}>Hide completed</span>
          </label>

          <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
            Showing <strong>{filteredTrips.length}</strong> trip(s)
          </div>
        </div>

        {techsError ? <p style={{ color: "red", marginTop: 12 }}>{techsError}</p> : null}
        {tripsError ? <p style={{ color: "red", marginTop: 12 }}>{tripsError}</p> : null}
        {holidaysError ? <p style={{ color: "red", marginTop: 12 }}>{holidaysError}</p> : null}

        {loading ? <p style={{ marginTop: 16 }}>Loading schedule...</p> : null}

        {/* MONTH VIEW */}
        {!loading && view === "month" ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden", background: "white" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", background: "#fafafa" }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                  <div key={d} style={{ padding: 10, borderRight: "1px solid #eee", fontWeight: 900 }}>
                    {d}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gap: 0 }}>
                {monthWeeks.map((week, idx) => (
                  <div
                    key={`week-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 1fr)",
                      borderTop: "1px solid #eee",
                      minHeight: 140,
                    }}
                  >
                    {week.map((cellDate, cIdx) => {
                      if (!cellDate) {
                        return (
                          <div
                            key={`empty-${idx}-${cIdx}`}
                            style={{ borderRight: "1px solid #eee", padding: 10, background: "#fbfbfb" }}
                          />
                        );
                      }

                      const iso = toIsoDate(cellDate);
                      const dayTrips = tripsByDate[iso] || [];
                      const h = holidayByDate[iso];

                      return (
                        <div
                          key={iso}
                          style={{
                            borderRight: cIdx < 4 ? "1px solid #eee" : undefined,
                            padding: 10,
                            verticalAlign: "top",
                            background: h ? "#fffaf0" : "white",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ fontWeight: 900 }}>{cellDate.getDate()}</div>
                            <div style={{ fontSize: 11, color: "#777" }}>{iso}</div>
                          </div>

                          {h ? (
                            <div style={{ marginTop: 6, fontSize: 12, color: "#7a4b00", fontWeight: 900 }}>
                              🎉 {h.name}
                            </div>
                          ) : null}

                          {dayTrips.length === 0 ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: "#bbb" }}>
                              {h ? "Holiday" : "—"}
                            </div>
                          ) : (
                            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                              {dayTrips.slice(0, 6).map((t) => {
                                const showTechName = techFilter === "ALL";
                                return renderTripCard(t, { showTechName });
                              })}
                              {dayTrips.length > 6 ? (
                                <div style={{ fontSize: 12, color: "#777" }}>+{dayTrips.length - 6} more…</div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* WEEK + DAY VIEWS */}
        {!loading && view !== "month" ? (
          <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, overflow: "auto", background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(900, 220 + daysForWeekOrDay.length * 260) }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid #eee",
                      width: 220,
                    }}
                  >
                    Technician
                  </th>

                  {daysForWeekOrDay.map((d) => {
                    const iso = toIsoDate(d);
                    const h = holidayByDate[iso];
                    return (
                      <th
                        key={iso}
                        style={{
                          textAlign: "left",
                          padding: 10,
                          borderBottom: "1px solid #eee",
                          minWidth: 260,
                          background: h ? "#fffaf0" : "#fafafa",
                        }}
                      >
                        <div style={{ fontWeight: 900, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                          {formatDow(d)}
                          {renderHolidayBadge(iso)}
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>{iso}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={1 + daysForWeekOrDay.length} style={{ padding: 14, color: "#666" }}>
                      No matching technicians/trips.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;

                    return (
                      <tr key={r.key}>
                        <td
                          style={{
                            position: "sticky",
                            left: 0,
                            zIndex: 1,
                            background: "white",
                            borderBottom: "1px solid #f0f0f0",
                            padding: 10,
                            fontWeight: 900,
                            width: 220,
                          }}
                        >
                          {r.label}
                        </td>

                        {daysForWeekOrDay.map((d) => {
                          const iso = toIsoDate(d);
                          const cellTrips = grid.get(rowKey)?.get(iso) || [];
                          const avail = computeSlotAvailability(cellTrips);
                          const holiday = holidayByDate[iso];

                          const canShowPlus =
                            canEditSchedule &&
                            rowKey !== "UNASSIGNED" &&
                            !avail.allBusy &&
                            !holiday; // ✅ do not schedule on holidays

                          return (
                            <td
                              key={`${r.key}_${iso}`}
                              style={{
                                verticalAlign: "top",
                                borderBottom: "1px solid #f0f0f0",
                                padding: 10,
                                background: holiday ? "#fffaf0" : "white",
                              }}
                            >
                              {/* Holiday label */}
                              {holiday ? (
                                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 900, color: "#7a4b00" }}>
                                  🎉 {holiday.name}
                                </div>
                              ) : null}

                              {/* Slot “+” controls */}
                              {canShowPlus ? (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                  {!avail.amBusy ? (
                                    <button
                                      type="button"
                                      onClick={() => openAddModal({ techUid: rowKey, dateIso: iso, slot: "am" })}
                                      style={{
                                        padding: "6px 8px",
                                        borderRadius: 10,
                                        border: "1px solid #c6dbff",
                                        background: "#eaf2ff",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        fontSize: 12,
                                      }}
                                      title="Add AM trip"
                                    >
                                      + AM
                                    </button>
                                  ) : null}

                                  {!avail.pmBusy ? (
                                    <button
                                      type="button"
                                      onClick={() => openAddModal({ techUid: rowKey, dateIso: iso, slot: "pm" })}
                                      style={{
                                        padding: "6px 8px",
                                        borderRadius: 10,
                                        border: "1px solid #c6dbff",
                                        background: "#eaf2ff",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        fontSize: 12,
                                      }}
                                      title="Add PM trip"
                                    >
                                      + PM
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}

                              {cellTrips.length === 0 ? (
                                <div style={{ color: "#bbb", fontSize: 12 }}>
                                  {holiday ? "Holiday" : "—"}
                                </div>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {cellTrips.map((t) => renderTripCard(t))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {!canSeeAll ? (
          <div style={{ marginTop: 12, fontSize: 12, color: "#777" }}>
            Note: We can restrict visibility later if you want role-based schedule access.
          </div>
        ) : null}

        {/* Add Trip Modal */}
        {addOpen ? (
          <div
            onClick={() => closeAddModal()}
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
                maxWidth: 540,
                borderRadius: 16,
                border: "1px solid #ddd",
                background: "white",
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 16 }}>➕ Schedule Trip</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Tech: <strong>{findTechName(addTechUid) || addTechUid}</strong> • Date:{" "}
                <strong>{addDateIso}</strong> • Slot: <strong>{addSlot.toUpperCase()}</strong>
              </div>

              {holidayByDate[addDateIso] ? (
                <div style={{ marginTop: 10, fontSize: 12, color: "#7a4b00", fontWeight: 900 }}>
                  🎉 This date is a company holiday: {holidayByDate[addDateIso].name}
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 900 }}>Trip Type</label>
                  <select
                    value={addTripType}
                    onChange={(e) => setAddTripType(e.target.value as any)}
                    disabled={addSaving}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      marginTop: 6,
                      background: "white",
                    }}
                  >
                    <option value="service">Service Ticket</option>
                    <option value="project">Project</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 900 }}>
                    {addTripType === "service" ? "Service Ticket ID" : "Project ID"}
                  </label>
                  <input
                    value={addLinkId}
                    onChange={(e) => setAddLinkId(e.target.value)}
                    disabled={addSaving}
                    placeholder={addTripType === "service" ? "e.g. ST_12345" : "e.g. proj_ABC123"}
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
                    V1 is “paste the ID”. Next upgrade can be a searchable picker.
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 900 }}>Notes (optional)</label>
                  <textarea
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    rows={3}
                    disabled={addSaving}
                    placeholder="Optional dispatch note…"
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

                {addErr ? <div style={{ fontSize: 12, color: "red" }}>{addErr}</div> : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => closeAddModal()}
                    disabled={addSaving}
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
                    onClick={() => submitAddTrip()}
                    disabled={addSaving || Boolean(holidayByDate[addDateIso])}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #2e7d32",
                      background: "#eaffea",
                      cursor: "pointer",
                      fontWeight: 950,
                      opacity: holidayByDate[addDateIso] ? 0.5 : 1,
                    }}
                  >
                    {addSaving ? "Scheduling..." : "Schedule Trip"}
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