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
  Timestamp,
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

  // optional fields if present
  outcome?: string | null;
  readyToBillAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
};

type TechRow = {
  uid: string;
  name: string;
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

function monthWorkdays(anchor: Date) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);

  const days: Date[] = [];
  let cur = new Date(first);
  cur.setHours(0, 0, 0, 0);

  while (cur <= last) {
    if (!isWeekend(cur)) days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return days;
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

function tripTitle(t: TripDoc) {
  const type = (t.type || "").toLowerCase();
  if (type === "service") return "🔧 Service";
  if (type === "project") return "📐 Project";
  return "🧳 Trip";
}

function crewLine(t: TripDoc) {
  const c = t.crew || {};
  const tech = c.primaryTechName || "Unassigned";
  const helper = c.helperName ? ` • Helper: ${c.helperName}` : "";
  const secondTech = c.secondaryTechName ? ` • 2nd Tech: ${c.secondaryTechName}` : "";
  const secondHelper = c.secondaryHelperName ? ` • 2nd Helper: ${c.secondaryHelperName}` : "";
  return `Tech: ${tech}${helper}${secondTech}${secondHelper}`;
}

function statusBadgeStyle(status?: string) {
  const s = (status || "").toLowerCase();
  // simple, readable defaults (no hard dependency on CSS framework)
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

export default function SchedulePage() {
  const { appUser } = useAuthContext();

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  // URL params: ?view=week|month|day&date=YYYY-MM-DD
  const [view, setView] = useState<ViewMode>("week");
  const [anchorIso, setAnchorIso] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // If today is weekend, default to next Monday-ish experience by snapping to Monday of current week
    const mon = startOfWorkWeek(d);
    return toIsoDate(mon);
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [techsLoading, setTechsLoading] = useState(true);
  const [techs, setTechs] = useState<TechRow[]>([]);
  const [techsError, setTechsError] = useState("");

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

  // hydrate from query params once on mount
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const v = (url.searchParams.get("view") || "").toLowerCase();
      const d = (url.searchParams.get("date") || "").trim();

      if (v === "day" || v === "week" || v === "month") setView(v);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchorIso(d);
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
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }, [view, anchorIso]);

  // compute days for the active view
  const anchorDate = useMemo(() => fromIsoDate(anchorIso), [anchorIso]);

  const days = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      // if weekend, still show it? you said minus weekends for month view.
      // For day view, we’ll auto-skip weekends via navigation buttons (prev/next workday).
      return [d];
    }

    if (view === "month") {
      return monthWorkdays(anchorDate);
    }

    // week default: show Mon–Fri
    const weekStart = startOfWorkWeek(anchorDate);
    return workWeekDays(weekStart);
  }, [view, anchorIso, anchorDate]);

  // range bounds for trips query (inclusive)
  const range = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    const startIso = toIsoDate(first);
    const endIso = toIsoDate(last);
    return { startIso, endIso };
  }, [days]);

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
        // Firestore does not support "between" on string dates without index design;
        // but with YYYY-MM-DD strings, lexicographic ordering works.
        // Query: date >= startIso && date <= endIso (needs composite index if ordering)
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
    // overall loading gate (simple)
    setLoading(tripsLoading || techsLoading);
  }, [tripsLoading, techsLoading]);

  // map trips into grid: techUid -> dateIso -> TripDoc[]
  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const t of trips) {
      const d = (t.date || "").trim();
      if (!d) continue;

      const primaryUid = String(t.crew?.primaryTechUid || "").trim();
      if (!primaryUid) continue;

      if (!out.has(primaryUid)) out.set(primaryUid, new Map());
      const byDate = out.get(primaryUid)!;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(t);
    }

    // sort each cell by time
    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort(compareTripTime);
        byDate.set(d, list);
      }
    }

    return out;
  }, [trips]);

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
    // week
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
    // week
    const nextWeek = addDays(startOfWorkWeek(fromIsoDate(anchorIso)), 7);
    setAnchorIso(toIsoDate(nextWeek));
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (view === "day") {
      // snap to next workday if weekend
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

  const titleText = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Day (${formatDow(d)} ${formatShort(d)})`;
    }
    if (view === "month") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Month (${d.getMonth() + 1}/${d.getFullYear()})`;
    }
    const d0 = days[0];
    const d1 = days[days.length - 1];
    return `Schedule • Week (${formatShort(d0)} – ${formatShort(d1)})`;
  }, [view, anchorIso, days]);

  return (
    <ProtectedPage fallbackTitle="Schedule">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{titleText}</h1>
            <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
              Default: Work Week (Mon–Fri). Toggle Day/Week/Month as needed.
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

        {error ? <p style={{ color: "red", marginTop: 12 }}>{error}</p> : null}
        {techsError ? <p style={{ color: "red", marginTop: 12 }}>{techsError}</p> : null}
        {tripsError ? <p style={{ color: "red", marginTop: 12 }}>{tripsError}</p> : null}

        {loading ? <p style={{ marginTop: 16 }}>Loading schedule...</p> : null}

        {!loading ? (
          <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, overflow: "auto", background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(900, 220 + days.length * 190) }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, textAlign: "left", padding: 10, borderBottom: "1px solid #eee", width: 220 }}>
                    Technician
                  </th>
                  {days.map((d) => {
                    const iso = toIsoDate(d);
                    return (
                      <th key={iso} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee", minWidth: 190 }}>
                        <div style={{ fontWeight: 900 }}>{formatDow(d)}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>{iso}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {techs.length === 0 ? (
                  <tr>
                    <td colSpan={1 + days.length} style={{ padding: 14, color: "#666" }}>
                      No active technicians found.
                    </td>
                  </tr>
                ) : (
                  techs.map((tech) => {
                    return (
                      <tr key={tech.uid}>
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
                          {tech.name}
                        </td>

                        {days.map((d) => {
                          const iso = toIsoDate(d);
                          const cellTrips = grid.get(tech.uid)?.get(iso) || [];

                          return (
                            <td key={`${tech.uid}_${iso}`} style={{ verticalAlign: "top", borderBottom: "1px solid #f0f0f0", padding: 10 }}>
                              {cellTrips.length === 0 ? (
                                <div style={{ color: "#bbb", fontSize: 12 }}>—</div>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {cellTrips.map((t) => {
                                    const badgeStyle = statusBadgeStyle(t.status);
                                    const timeText =
                                      (t.startTime || t.endTime)
                                        ? `${t.startTime || "—"} – ${t.endTime || "—"} • ${formatWindow(t.timeWindow)}`
                                        : `${formatWindow(t.timeWindow)}`;

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
                                          <div style={{ fontWeight: 900 }}>
                                            {tripTitle(t)}
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
                                        </div>

                                        <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                                          {crewLine(t)}
                                        </div>

                                        {t.link?.serviceTicketId ? (
                                          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                                            Ticket: <strong>{t.link.serviceTicketId}</strong>
                                          </div>
                                        ) : null}
                                      </Link>
                                    );
                                  })}
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
            Note: You’re seeing the global Schedule grid, but we can restrict this later if you want role-based visibility.
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}