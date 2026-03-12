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
  serviceAddressLine2?: string | null;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;
};

type TechFilterValue = "ALL" | "UNASSIGNED" | string; // string = tech uid

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
  const wd = d.getDay(); // 0 Sun .. 6 Sat
  return wd === 0 || wd === 6;
}

function startOfWorkWeek(d: Date) {
  // Monday as start
  const wd = d.getDay(); // 0..6
  const diffToMon = (wd + 6) % 7; // Mon=0, Tue=1,... Sun=6
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
  // Mon..Fri
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStartMonday, i));
}

function formatDow(d: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatShort(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatWindow(w?: string) {
  const x = (w || "").toLowerCase();
  if (x === "am") return "AM";
  if (x === "pm") return "PM";
  if (x === "all_day") return "All Day";
  if (x === "custom") return "Custom";
  return w || "—";
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

function crewLine(t: TripDoc) {
  const c = t.crew || {};
  const tech = c.primaryTechName || "Unassigned";
  const helper = c.helperName ? ` • Helper: ${c.helperName}` : "";
  const secondTech = c.secondaryTechName ? ` • 2nd Tech: ${c.secondaryTechName}` : "";
  const secondHelper = c.secondaryHelperName ? ` • 2nd Helper: ${c.secondaryHelperName}` : "";
  return `Tech: ${tech}${helper}${secondTech}${secondHelper}`;
}

function primaryTechUid(t: TripDoc) {
  return String(t.crew?.primaryTechUid || "").trim();
}

function monthCalendarWorkWeeks(anchor: Date) {
  // Build a month calendar grid with Mon–Fri columns, multiple rows.
  // We compute the first Monday shown (may be in previous month),
  // and the last Friday shown (may be in next month), but we only render
  // dates that are within the target month (others are "empty").
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  const firstOfMonth = new Date(y, m, 1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const lastOfMonth = new Date(y, m + 1, 0);
  lastOfMonth.setHours(0, 0, 0, 0);

  // find monday on/before the first of month
  const gridStart = startOfWorkWeek(firstOfMonth);

  // find friday on/after lastOfMonth
  let gridEnd = new Date(lastOfMonth);
  // move to friday of that week
  const wd = gridEnd.getDay(); // 0..6
  const diffToFri = (5 - wd + 7) % 7;
  gridEnd = addDays(gridEnd, diffToFri);

  const weeks: Array<Array<Date | null>> = [];
  let cur = new Date(gridStart);

  while (cur <= gridEnd) {
    // one work week row (Mon..Fri)
    const row: Array<Date | null> = [];
    for (let i = 0; i < 5; i++) {
      const d = addDays(cur, i);
      // include only if within month; else null
      if (d.getMonth() === m) row.push(d);
      else row.push(null);
    }
    weeks.push(row);

    // next week
    cur = addDays(cur, 7);
  }

  return weeks;
}

export default function SchedulePage() {
  const { appUser } = useAuthContext();

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "office_display";

  // URL params: ?view=week|month|day&date=YYYY-MM-DD
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

  // Service ticket summaries (for cards)
  const [ticketMap, setTicketMap] = useState<Record<string, TicketSummary>>({});

  // hydrate from query params once on mount
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

  // keep URL in sync (nice for refresh/share)
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

  // For querying trips, we still compute a date range:
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

    // week
    const weekStart = startOfWorkWeek(anchorDate);
    const weekDays = workWeekDays(weekStart);
    return { startIso: toIsoDate(weekDays[0]), endIso: toIsoDate(weekDays[weekDays.length - 1]) };
  }, [view, anchorIso, anchorDate]);

  // Load active technicians
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

  // Load trips for the range
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
    setLoading(tripsLoading || techsLoading);
  }, [tripsLoading, techsLoading]);

  // Build list of serviceTicketIds currently in range (for card details)
  const serviceTicketIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      const id = String(t.link?.serviceTicketId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  // Load ticket summaries (best-effort) for visible range
  useEffect(() => {
    let cancelled = false;

    async function loadTicketSummaries() {
      if (serviceTicketIdsInRange.length === 0) return;

      // only fetch missing
      const missing = serviceTicketIdsInRange.filter((id) => !ticketMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, TicketSummary> = {};
      try {
        // We’ll do individual getDoc calls (simple + reliable).
        // If you ever want to optimize, we can chunk/where-in, but this is fine for schedule ranges.
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
              serviceAddressLine2: d.serviceAddressLine2 ?? null,
              serviceCity: String(d.serviceCity ?? ""),
              serviceState: String(d.serviceState ?? ""),
              servicePostalCode: String(d.servicePostalCode ?? ""),
            };
          })
        );
      } catch {
        // ignore (best effort)
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

  // Filter trips based on filters
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const s = normalizeStatus(t.status);

      if (hideCompleted && isCompletedStatus(s)) return false;

      if (statusFilter !== "ALL") {
        if (normalizeStatus(statusFilter) !== s) return false;
      }

      const uid = primaryTechUid(t);
      if (techFilter === "ALL") return true;
      if (techFilter === "UNASSIGNED") return !uid;
      return uid === techFilter;
    });
  }, [trips, hideCompleted, statusFilter, techFilter]);

  // Build tech rows INCLUDING Unassigned (only show if it has trips OR filter is UNASSIGNED)
  const rows = useMemo(() => {
    const out: Array<{ key: string; label: string; uid: string | null }> = [];

    const unassignedHasTrips = filteredTrips.some((t) => !primaryTechUid(t));
    if (unassignedHasTrips || techFilter === "UNASSIGNED") {
      out.push({ key: "UNASSIGNED", label: "Unassigned", uid: null });
    }

    // If a specific tech is selected, just show them (plus unassigned only if filter is unassigned)
    if (techFilter !== "ALL" && techFilter !== "UNASSIGNED") {
      const match = techs.find((t) => t.uid === techFilter);
      if (match) out.push({ key: match.uid, label: match.name, uid: match.uid });
      return out;
    }

    // Otherwise show all techs
    for (const t of techs) out.push({ key: t.uid, label: t.name, uid: t.uid });
    return out;
  }, [techs, filteredTrips, techFilter]);

  // Map filtered trips into day buckets for Month view calendar
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

  // Map filtered trips into grid for Week/Day (rows per tech + optional unassigned)
  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const t of filteredTrips) {
      const d = (t.date || "").trim();
      if (!d) continue;

      const uid = primaryTechUid(t) || "UNASSIGNED";

      if (!out.has(uid)) out.set(uid, new Map());
      const byDate = out.get(uid)!;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(t);
    }

    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort(compareTripTime);
        byDate.set(d, list);
      }
    }

    return out;
  }, [filteredTrips]);

  // navigation
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

  function renderTripCard(t: TripDoc, opts?: { showTechName?: boolean }) {
    const badgeStyle = statusBadgeStyle(t.status);

    const timeText =
      (t.startTime || t.endTime)
        ? `${t.startTime || "—"} – ${t.endTime || "—"} • ${formatWindow(t.timeWindow)}`
        : `${formatWindow(t.timeWindow)}`;

    const isService = (t.type || "").toLowerCase() === "service";
    const ticketId = String(t.link?.serviceTicketId || "").trim();
    const ticket = ticketId ? ticketMap[ticketId] : undefined;

    const header =
      isService
        ? `🔧 Service Ticket: ${ticket?.issueSummary || "Service Ticket"}`
        : (t.type || "").toLowerCase() === "project"
          ? "📐 Project"
          : "🧳 Trip";

    const customerLine =
      isService && ticket
        ? `${ticket.customerDisplayName || "Customer"} — ${ticket.serviceAddressLine1 || ""}${ticket.serviceCity ? `, ${ticket.serviceCity}` : ""}${ticket.serviceState ? `, ${ticket.serviceState}` : ""}${ticket.servicePostalCode ? ` ${ticket.servicePostalCode}` : ""}`
        : "";

    const showTechName = Boolean(opts?.showTechName);
    const techName = t.crew?.primaryTechName || "";

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
            {header}
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

        <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
          {timeText}
          {customerLine ? <span style={{ color: "#777" }}> • {customerLine}</span> : null}
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
          {crewLine(t)}
        </div>

        {ticketId ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            Ticket: <strong>{ticketId}</strong>
          </div>
        ) : null}
      </Link>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Schedule">
      <AppShell appUser={appUser}>
        {/* Header */}
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
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
            />
            <span style={{ fontSize: 13, fontWeight: 800 }}>Hide completed</span>
          </label>

          <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
            Showing <strong>{filteredTrips.length}</strong> trip(s)
          </div>
        </div>

        {techsError ? <p style={{ color: "red", marginTop: 12 }}>{techsError}</p> : null}
        {tripsError ? <p style={{ color: "red", marginTop: 12 }}>{tripsError}</p> : null}

        {loading ? <p style={{ marginTop: 16 }}>Loading schedule...</p> : null}

        {/* MONTH VIEW (Calendar grid) */}
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
                          <div key={`empty-${idx}-${cIdx}`} style={{ borderRight: "1px solid #eee", padding: 10, background: "#fbfbfb" }} />
                        );
                      }

                      const iso = toIsoDate(cellDate);
                      const dayTrips = tripsByDate[iso] || [];

                      return (
                        <div
                          key={iso}
                          style={{
                            borderRight: cIdx < 4 ? "1px solid #eee" : undefined,
                            padding: 10,
                            verticalAlign: "top",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ fontWeight: 900 }}>{cellDate.getDate()}</div>
                            <div style={{ fontSize: 11, color: "#777" }}>{iso}</div>
                          </div>

                          {dayTrips.length === 0 ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: "#bbb" }}>—</div>
                          ) : (
                            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                              {dayTrips.slice(0, 6).map((t) => {
                                // In month view, if ALL techs, show tech name on card header.
                                const showTechName = techFilter === "ALL";
                                return renderTripCard(t, { showTechName });
                              })}
                              {dayTrips.length > 6 ? (
                                <div style={{ fontSize: 12, color: "#777" }}>
                                  +{dayTrips.length - 6} more…
                                </div>
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

        {/* WEEK + DAY VIEWS (Tech rows grid) */}
        {!loading && view !== "month" ? (
          <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, overflow: "auto", background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(900, 220 + daysForWeekOrDay.length * 230) }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, textAlign: "left", padding: 10, borderBottom: "1px solid #eee", width: 220 }}>
                    Technician
                  </th>

                  {daysForWeekOrDay.map((d) => {
                    const iso = toIsoDate(d);
                    return (
                      <th key={iso} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee", minWidth: 230 }}>
                        <div style={{ fontWeight: 900 }}>{formatDow(d)}</div>
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

                          return (
                            <td key={`${r.key}_${iso}`} style={{ verticalAlign: "top", borderBottom: "1px solid #f0f0f0", padding: 10 }}>
                              {cellTrips.length === 0 ? (
                                <div style={{ color: "#bbb", fontSize: 12 }}>—</div>
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
      </AppShell>
    </ProtectedPage>
  );
}