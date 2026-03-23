// app/office-display/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type TechRow = { uid: string; name: string };

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
  startTime?: string;
  endTime?: string;

  crew?: TripCrew | null;
  link?: TripLink | null;

  timerState?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CompanyEvent = {
  id: string;
  active: boolean;
  type: "meeting" | string;
  title: string;
  date: string; // YYYY-MM-DD
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  blocksSchedule?: boolean;
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
  serviceAddressLine1?: string;
  serviceCity?: string;
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

// Monday-start week (Mon–Fri)
function startOfWorkWeek(d: Date) {
  const wd = d.getDay(); // 0 Sun .. 6 Sat
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

function formatIsoMDY(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

function formatDowShort(d: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatTime12h(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(hhRaw) || !Number.isFinite(mmRaw)) return "—";
  let hh = hhRaw;
  const mm = mmRaw;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mm === 0) return `${hh}${ampm}`;
  return `${hh}:${pad2(mm)}${ampm}`;
}

function normalizeStatus(s?: string) {
  return String(s || "").trim().toLowerCase();
}

function statusPillStyle(status?: string) {
  const s = normalizeStatus(status);
  if (s === "in_progress") return { bg: "rgba(59,130,246,0.14)", bd: "rgba(59,130,246,0.35)", tx: "#dbeafe" };
  if (s === "planned") return { bg: "rgba(99,102,241,0.14)", bd: "rgba(99,102,241,0.35)", tx: "#e0e7ff" };
  if (s === "complete" || s === "completed") return { bg: "rgba(148,163,184,0.14)", bd: "rgba(148,163,184,0.30)", tx: "#e2e8f0" };
  if (s === "cancelled") return { bg: "rgba(248,113,113,0.12)", bd: "rgba(248,113,113,0.28)", tx: "#fee2e2" };
  return { bg: "rgba(251,191,36,0.14)", bd: "rgba(251,191,36,0.28)", tx: "#ffedd5" };
}

function tripDisplayTitle(t: TripDoc, ticket?: TicketSummary, project?: ProjectSummary) {
  const type = normalizeStatus(t.type);
  if (type === "service") return ticket?.issueSummary || "Service Trip";
  if (type === "project") return project?.name || "Project Trip";
  return "Trip";
}

function tripDisplaySubtitle(t: TripDoc, ticket?: TicketSummary) {
  const type = normalizeStatus(t.type);
  if (type === "service") return ticket?.customerDisplayName || "";
  return "";
}

function tripDisplayLocation(t: TripDoc, ticket?: TicketSummary, project?: ProjectSummary) {
  const type = normalizeStatus(t.type);
  if (type === "service") {
    const a1 = ticket?.serviceAddressLine1 || "";
    const c = ticket?.serviceCity || "";
    return [a1, c].filter(Boolean).join(", ");
  }
  if (type === "project") {
    const a1 = project?.serviceAddressLine1 || "";
    const c = project?.serviceCity || "";
    return [a1, c].filter(Boolean).join(", ");
  }
  return "";
}

function tripTimeText(t: TripDoc) {
  const w = String(t.timeWindow || "").toLowerCase();
  if (w === "all_day") return "All Day";
  if (w === "am") return "AM";
  if (w === "pm") return "PM";
  const st = t.startTime ? formatTime12h(t.startTime) : "—";
  const et = t.endTime ? formatTime12h(t.endTime) : "—";
  return `${st}–${et}`;
}

function tripRowUids(t: TripDoc): string[] {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
  ].filter(Boolean);
  return Array.from(new Set(uids));
}

export default function OfficeDisplayPage() {
  const { appUser } = useAuthContext();

  const [weekOffset, setWeekOffset] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [techs, setTechs] = useState<TechRow[]>([]);
  const [trips, setTrips] = useState<TripDoc[]>([]);
  const [eventsByDate, setEventsByDate] = useState<Record<string, CompanyEvent[]>>({});

  const [ticketMap, setTicketMap] = useState<Record<string, TicketSummary>>({});
  const [projectMap, setProjectMap] = useState<Record<string, ProjectSummary>>({});

  const [lastUpdated, setLastUpdated] = useState<string>("");

  const anchor = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const wk = startOfWorkWeek(today);
    return addDays(wk, weekOffset * 7);
  }, [weekOffset]);

  const days = useMemo(() => {
    // Mon–Fri
    return [0, 1, 2, 3, 4].map((i) => {
      const d = addDays(anchor, i);
      const iso = toIsoDate(d);
      return { d, iso };
    });
  }, [anchor]);

  const weekStartIso = days[0]?.iso || "";
  const weekEndIso = days[days.length - 1]?.iso || "";

  // Hard lock: no scrollbars anywhere (TV mode)
  useEffect(() => {
    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // Realtime: techs, trips, events
  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];

    // Tech rows
    const qUsers = query(collection(db, "users"));
    unsubs.push(
      onSnapshot(
        qUsers,
        (snap) => {
          const items = snap.docs
            .map((ds) => {
              const d = ds.data() as any;
              return {
                uid: String(d.uid ?? ds.id),
                name: String(d.displayName ?? "Unnamed"),
                role: String(d.role ?? ""),
                active: Boolean(d.active ?? false),
              };
            })
            .filter((u) => u.active && u.role === "technician")
            .map((u) => ({ uid: u.uid, name: u.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

          setTechs(items);
          setLastUpdated(new Date().toLocaleTimeString());
        },
        (e) => {
          setError(e?.message || "Failed to load technicians.");
        }
      )
    );

    // Trips for week
    const qTrips = query(
      collection(db, "trips"),
      where("active", "==", true),
      where("date", ">=", weekStartIso),
      where("date", "<=", weekEndIso),
      orderBy("date", "asc"),
      orderBy("startTime", "asc")
    );

    unsubs.push(
      onSnapshot(
        qTrips,
        (snap) => {
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
              timerState: d.timerState ?? null,
              createdAt: d.createdAt ?? undefined,
              updatedAt: d.updatedAt ?? undefined,
            };
          });

          setTrips(items);
          setLastUpdated(new Date().toLocaleTimeString());
          setLoading(false);
        },
        (e) => {
          setError(e?.message || "Failed to load trips.");
          setLoading(false);
        }
      )
    );

    // Meetings / companyEvents for week
    const qEvents = query(
      collection(db, "companyEvents"),
      where("active", "==", true),
      where("date", ">=", weekStartIso),
      where("date", "<=", weekEndIso),
      orderBy("date", "asc")
    );

    unsubs.push(
      onSnapshot(
        qEvents,
        (snap) => {
          const map: Record<string, CompanyEvent[]> = {};
          for (const day of days) map[day.iso] = [];

          for (const ds of snap.docs) {
            const d = ds.data() as any;
            const date = String(d.date || "").trim();
            if (!date || !map[date]) continue;

            const ev: CompanyEvent = {
              id: ds.id,
              active: typeof d.active === "boolean" ? d.active : true,
              type: String(d.type ?? "meeting"),
              title: String(d.title ?? d.name ?? "Meeting"),
              date,
              timeWindow: d.timeWindow ?? "am",
              startTime: d.startTime ?? null,
              endTime: d.endTime ?? null,
              location: d.location ?? null,
              notes: d.notes ?? null,
              blocksSchedule: typeof d.blocksSchedule === "boolean" ? d.blocksSchedule : true,
            };

            if (!ev.active) continue;
            map[date].push(ev);
          }

          // stable sort
          for (const k of Object.keys(map)) {
            map[k].sort((a, b) => String(a.timeWindow || "").localeCompare(String(b.timeWindow || "")) || a.title.localeCompare(b.title));
          }

          setEventsByDate(map);
          setLastUpdated(new Date().toLocaleTimeString());
        },
        (e) => {
          setError(e?.message || "Failed to load meetings.");
        }
      )
    );

    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartIso, weekEndIso]);

  // Load ticket/project summaries for trips (best-effort, cached)
  const idsKey = useMemo(() => {
    const st = new Set<string>();
    const pj = new Set<string>();
    for (const t of trips) {
      const sid = String(t.link?.serviceTicketId || "").trim();
      if (sid) st.add(sid);
      const pid = String(t.link?.projectId || "").trim();
      if (pid) pj.add(pid);
    }
    return {
      service: Array.from(st).sort().join("|"),
      project: Array.from(pj).sort().join("|"),
    };
  }, [trips]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const serviceIds = idsKey.service ? idsKey.service.split("|").filter(Boolean) : [];
      const projectIds = idsKey.project ? idsKey.project.split("|").filter(Boolean) : [];

      // Tickets
      if (serviceIds.length) {
        const missing = serviceIds.filter((id) => !ticketMap[id]);
        if (missing.length) {
          const next: Record<string, TicketSummary> = {};
          await Promise.all(
            missing.map(async (id) => {
              try {
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
              } catch {}
            })
          );
          if (!cancelled && Object.keys(next).length) {
            setTicketMap((prev) => ({ ...prev, ...next }));
          }
        }
      }

      // Projects
      if (projectIds.length) {
        const missing = projectIds.filter((id) => !projectMap[id]);
        if (missing.length) {
          const next: Record<string, ProjectSummary> = {};
          await Promise.all(
            missing.map(async (id) => {
              try {
                const snap = await getDoc(doc(db, "projects", id));
                if (!snap.exists()) return;
                const d = snap.data() as any;
                next[id] = {
                  id,
                  name: String(d.name ?? d.projectName ?? d.title ?? "Project"),
                  serviceAddressLine1: String(d.serviceAddressLine1 ?? ""),
                  serviceCity: String(d.serviceCity ?? ""),
                };
              } catch {}
            })
          );
          if (!cancelled && Object.keys(next).length) {
            setProjectMap((prev) => ({ ...prev, ...next }));
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey.service, idsKey.project]);

  // Build rows: technicians + Unassigned if needed
  const rows = useMemo(() => {
    const out: Array<{ key: string; label: string; uid: string | null }> = [];
    const unassignedHasTrips = trips.some((t) => (t.date && t.date >= weekStartIso && t.date <= weekEndIso) && tripRowUids(t).length === 0);
    if (unassignedHasTrips) out.push({ key: "UNASSIGNED", label: "Unassigned", uid: null });
    for (const t of techs) out.push({ key: t.uid, label: t.name, uid: t.uid });
    return out;
  }, [techs, trips, weekStartIso, weekEndIso]);

  // Grid: rowUid -> dateIso -> trips
  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();
    for (const day of days) out.set(day.iso, new Map()); // not used directly, just ensures day list known

    for (const t of trips) {
      const dateIso = String(t.date || "").trim();
      if (!dateIso) continue;
      if (dateIso < weekStartIso || dateIso > weekEndIso) continue;

      const rowUids = tripRowUids(t);
      const targets = rowUids.length ? rowUids : ["UNASSIGNED"];

      for (const uid of targets) {
        if (!out.has(uid)) out.set(uid, new Map());
        const byDate = out.get(uid)!;
        if (!byDate.has(dateIso)) byDate.set(dateIso, []);
        byDate.get(dateIso)!.push(t);
      }
    }

    // sort trips in each cell
    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort((a, b) => {
          const aKey = `${a.startTime || "99:99"}_${a.endTime || "99:99"}_${a.id}`;
          const bKey = `${b.startTime || "99:99"}_${b.endTime || "99:99"}_${b.id}`;
          return aKey.localeCompare(bKey);
        });
        byDate.set(d, list);
      }
    }

    return out;
  }, [trips, days, weekStartIso, weekEndIso]);

  const weekLabel = useMemo(() => {
    // Show Mon–Fri range
    return `Week • ${formatIsoMDY(weekStartIso)} – ${formatIsoMDY(weekEndIso)}`;
  }, [weekStartIso, weekEndIso]);

  const topRightInfo = useMemo(() => {
    const lu = lastUpdated || "—";
    return `Auto-refresh: live • Last updated: ${lu}`;
  }, [lastUpdated]);

  const canControlWeek =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "office_display";

  // Limit per-cell cards so we never need scrolling
  function renderTripCard(t: TripDoc) {
    const sid = String(t.link?.serviceTicketId || "").trim();
    const pid = String(t.link?.projectId || "").trim();
    const ticket = sid ? ticketMap[sid] : undefined;
    const project = pid ? projectMap[pid] : undefined;

    const title = tripDisplayTitle(t, ticket, project);
    const subtitle = tripDisplaySubtitle(t, ticket);
    const location = tripDisplayLocation(t, ticket, project);
    const timeText = tripTimeText(t);

    const pill = statusPillStyle(t.status);

    return (
      <div
        key={t.id}
        style={{
          border: "1px solid rgba(148,163,184,0.22)",
          borderRadius: 14,
          padding: 12,
          background: "rgba(2,6,23,0.55)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontWeight: 950, fontSize: 16, lineHeight: 1.2, letterSpacing: 0.2 }}>
            {normalizeStatus(t.type) === "project" ? "📐 " : "🔧 "}
            {title}
          </div>

          <div
            style={{
              fontSize: 12,
              fontWeight: 950,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${pill.bd}`,
              background: pill.bg,
              color: pill.tx,
              whiteSpace: "nowrap",
            }}
          >
            {(t.status || "—").replaceAll("_", " ")}
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: "rgba(226,232,240,0.92)", fontWeight: 800 }}>
          {timeText}
          {subtitle ? ` • ${subtitle}` : ""}
        </div>

        {location ? (
          <div style={{ marginTop: 6, fontSize: 13, color: "rgba(148,163,184,0.95)" }}>{location}</div>
        ) : null}
      </div>
    );
  }

  function renderMeetingsForDay(dayIso: string) {
    const list = eventsByDate[dayIso] || [];
    if (!list.length) return null;

    // TV-safe: show up to 2, then +N
    const head = list.slice(0, 2);
    const extra = list.length - head.length;

    return (
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {head.map((e) => {
          const w = String(e.timeWindow || "").toLowerCase();
          const time =
            w === "all_day"
              ? "All Day"
              : w === "am"
                ? "AM"
                : w === "pm"
                  ? "PM"
                  : e.startTime && e.endTime
                    ? `${formatTime12h(String(e.startTime))}–${formatTime12h(String(e.endTime))}`
                    : "Custom";

          return (
            <div
              key={e.id}
              style={{
                border: "1px solid rgba(16,185,129,0.28)",
                background: "rgba(16,185,129,0.10)",
                borderRadius: 14,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontWeight: 950, color: "rgba(209,250,229,0.96)", fontSize: 14 }}>
                📣 {e.title}
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "rgba(167,243,208,0.92)", fontWeight: 800 }}>
                {time}
                {e.location ? ` • ${e.location}` : ""}
              </div>
            </div>
          );
        })}
        {extra > 0 ? (
          <div style={{ fontSize: 12.5, fontWeight: 900, color: "rgba(167,243,208,0.92)" }}>
            +{extra} more meeting(s)
          </div>
        ) : null}
      </div>
    );
  }

  // Layout sizing (no scrolling)
  const headerH = 108;
  const outerPad = 18;
  const gridH = `calc(100vh - ${headerH}px - ${outerPad * 2}px)`;

  const logoSrc = "/dcflow-logo.png"; // ✅ Put the uploaded logo into /public/dcflow-logo.png

  return (
    <ProtectedPage fallbackTitle="Office Display">
      <main
        style={{
          minHeight: "100vh",
          height: "100vh",
          overflow: "hidden",
          background:
            "radial-gradient(1200px 700px at 20% 0%, rgba(59,130,246,0.18), rgba(2,6,23,0) 60%), radial-gradient(900px 600px at 80% 10%, rgba(99,102,241,0.14), rgba(2,6,23,0) 55%), #050816",
          color: "white",
          padding: outerPad,
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: headerH,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "14px 16px",
            borderRadius: 18,
            border: "1px solid rgba(148,163,184,0.22)",
            background: "rgba(2,6,23,0.55)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <img
              src={logoSrc}
              alt="DCFlow"
              style={{
                height: 78,
                width: "auto",
                display: "block",
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.45))",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ textAlign: "right", lineHeight: 1.25 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: 0.3 }}>{weekLabel}</div>
              <div style={{ marginTop: 6, fontSize: 13.5, color: "rgba(203,213,225,0.92)", fontWeight: 800 }}>
                {topRightInfo}
              </div>
              {error ? (
                <div style={{ marginTop: 6, fontSize: 13.5, color: "rgba(252,165,165,0.95)", fontWeight: 950 }}>
                  {error}
                </div>
              ) : null}
            </div>

            {canControlWeek ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setWeekOffset((p) => p - 1)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.25)",
                    background: "rgba(15,23,42,0.75)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(59,130,246,0.35)",
                    background: "rgba(59,130,246,0.14)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 950,
                  }}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((p) => p + 1)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.25)",
                    background: "rgba(15,23,42,0.75)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Next →
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Main grid (NO SCROLL) */}
        <div
          style={{
            marginTop: 14,
            height: gridH,
            overflow: "hidden",
            borderRadius: 18,
            border: "1px solid rgba(148,163,184,0.18)",
            background: "rgba(2,6,23,0.35)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
          }}
        >
          {/* Weekday headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `280px repeat(${days.length}, 1fr)`,
              borderBottom: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(2,6,23,0.55)",
            }}
          >
            <div style={{ padding: 14, fontWeight: 1000, color: "rgba(226,232,240,0.95)" }}>
              Technician
            </div>

            {days.map(({ d, iso }) => (
              <div
                key={iso}
                style={{
                  padding: 14,
                  borderLeft: "1px solid rgba(148,163,184,0.12)",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: 0.2 }}>
                    {formatDowShort(d)}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.95)", fontWeight: 900 }}>
                    {formatIsoMDY(iso)}
                  </div>
                </div>
                {renderMeetingsForDay(iso)}
              </div>
            ))}
          </div>

          {/* Body rows */}
          <div
            style={{
              height: `calc(${gridH} - 1px - 132px)`, // subtract header-ish chunk (safe)
              // NOTE: we avoid scroll by using fractional row heights
              display: "grid",
              gridTemplateRows: `repeat(${Math.max(1, rows.length)}, 1fr)`,
              overflow: "hidden",
            }}
          >
            {rows.map((r) => (
              <div
                key={r.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: `280px repeat(${days.length}, 1fr)`,
                  borderTop: "1px solid rgba(148,163,184,0.10)",
                  minHeight: 0,
                }}
              >
                {/* Tech name */}
                <div
                  style={{
                    padding: 14,
                    borderRight: "1px solid rgba(148,163,184,0.12)",
                    background: "rgba(2,6,23,0.45)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontWeight: 1000, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.label}
                  </div>
                </div>

                {/* Cells */}
                {days.map(({ iso }) => {
                  const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;
                  const cellTrips = grid.get(rowKey)?.get(iso) || [];

                  // TV-safe: show up to 2 trip cards, then +N
                  const head = cellTrips.slice(0, 2);
                  const extra = cellTrips.length - head.length;

                  return (
                    <div
                      key={`${r.key}_${iso}`}
                      style={{
                        padding: 12,
                        borderLeft: "1px solid rgba(148,163,184,0.10)",
                        overflow: "hidden",
                        display: "grid",
                        alignContent: "start",
                        gap: 10,
                        minHeight: 0,
                      }}
                    >
                      {head.length === 0 ? (
                        <div
                          style={{
                            border: "1px dashed rgba(148,163,184,0.22)",
                            borderRadius: 14,
                            padding: 12,
                            background: "rgba(2,6,23,0.30)",
                            color: "rgba(148,163,184,0.95)",
                            fontSize: 13,
                            fontWeight: 900,
                          }}
                        >
                          —
                        </div>
                      ) : (
                        <>
                          {head.map(renderTripCard)}
                          {extra > 0 ? (
                            <div style={{ fontSize: 13, fontWeight: 1000, color: "rgba(203,213,225,0.92)" }}>
                              +{extra} more…
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer strip (tiny) */}
          <div
            style={{
              height: 48,
              borderTop: "1px solid rgba(148,163,184,0.12)",
              background: "rgba(2,6,23,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              gap: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 12.5, color: "rgba(148,163,184,0.95)", fontWeight: 900 }}>
              Live updates: Trips + Meetings + Technicians
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {loading ? (
                <div style={{ fontSize: 12.5, color: "rgba(203,213,225,0.92)", fontWeight: 900 }}>
                  Loading…
                </div>
              ) : null}

              <Link
                href="/schedule"
                style={{
                  fontSize: 12.5,
                  fontWeight: 950,
                  color: "rgba(219,234,254,0.95)",
                  textDecoration: "none",
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(59,130,246,0.30)",
                  background: "rgba(59,130,246,0.12)",
                }}
              >
                Open Schedule →
              </Link>
            </div>
          </div>
        </div>

        {/* Quick note for you (won’t show on TV much) */}
        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(148,163,184,0.85)" }}>
          Logo path expected at <strong>/public/dcflow-logo.png</strong>.
        </div>
      </main>
    </ProtectedPage>
  );
}