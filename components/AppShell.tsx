"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "./LogoutButton";
import type { AppUser } from "../src/types/app-user";
import { db } from "../src/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  limit,
  type Unsubscribe,
} from "firebase/firestore";

type PauseBlock = {
  startAt: string;
  endAt: string | null;
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

type TripLink = {
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TripDoc = {
  id: string;
  active?: boolean;
  status?: string;
  type?: string;

  date?: string;
  timeWindow?: string;
  startTime?: string;
  endTime?: string;

  crew?: TripCrew | null;
  crewConfirmed?: TripCrew | null;
  link?: TripLink | null;

  // timer bits
  timerState?: string | null; // not_started | running | paused | complete
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;

  updatedAt?: string | null;
};

type ActiveTripPill = {
  tripId: string;
  href: string;
  statusLabel: string; // "Running" | "Paused"
  primaryLine: string; // customer
  secondaryLine: string; // issue summary
};

function useIsMobile(breakpointPx = 900) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < breakpointPx);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpointPx]);
  return isMobile;
}

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function truncate(s: string, max = 44) {
  const x = (s || "").trim();
  if (x.length <= max) return x;
  return x.slice(0, max - 1) + "…";
}

function parseIsoMs(iso?: string | null) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

function minutesBetweenMs(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

function sumPausedMinutes(pauseBlocks?: PauseBlock[] | null) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return 0;
  let total = 0;
  for (const p of pauseBlocks) {
    const s = parseIsoMs(p?.startAt || null);
    const e = parseIsoMs(p?.endAt || null);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    total += minutesBetweenMs(s, e);
  }
  return total;
}

function findOpenPauseIndex(pauseBlocks?: PauseBlock[] | null) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return -1;
  for (let i = pauseBlocks.length - 1; i >= 0; i--) {
    const b = pauseBlocks[i];
    if (b?.startAt && !b?.endAt) return i;
  }
  return -1;
}

function userIsOnCrew(uid: string, crew?: TripCrew | null) {
  const u = safeTrim(uid);
  if (!u) return false;
  const c = crew || {};
  return (
    safeTrim(c.primaryTechUid) === u ||
    safeTrim(c.helperUid) === u ||
    safeTrim(c.secondaryTechUid) === u ||
    safeTrim(c.secondaryHelperUid) === u
  );
}

function pickLatestTrip(trips: TripDoc[]) {
  if (!trips.length) return null;

  const scored = trips
    .map((t) => {
      const updated = safeTrim(t.updatedAt);
      const started = safeTrim(t.actualStartAt);
      const ts = updated || started || "";
      const ms = ts ? new Date(ts).getTime() : 0;
      return { t, ms };
    })
    .sort((a, b) => (b.ms || 0) - (a.ms || 0));

  return scored[0]?.t ?? null;
}

/**
 * ✅ Realtime “find my in_progress trip”.
 * We listen to 4 small queries (crew slot fields), dedupe results,
 * AND (critical) remove trips that no longer match queries.
 *
 * This fixes the “pill stays until navigation” issue.
 */
function useRealtimeActiveTrip(uid: string) {
  const [trip, setTrip] = useState<TripDoc | null>(null);

  useEffect(() => {
    const u = safeTrim(uid);
    if (!u) {
      setTrip(null);
      return;
    }

    const base = collection(db, "trips");

    const qs = [
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.primaryTechUid", "==", u),
        limit(10)
      ),
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.helperUid", "==", u),
        limit(10)
      ),
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.secondaryTechUid", "==", u),
        limit(10)
      ),
      query(
        base,
        where("active", "==", true),
        where("status", "==", "in_progress"),
        where("crew.secondaryHelperUid", "==", u),
        limit(10)
      ),
    ];

    const map = new Map<string, TripDoc>();
    const idsByQuery = qs.map(() => new Set<string>());

    function upsertFromDoc(id: string, d: any) {
      map.set(id, {
        id,
        active: typeof d.active === "boolean" ? d.active : true,
        status: d.status ?? undefined,
        type: d.type ?? undefined,
        date: d.date ?? undefined,
        timeWindow: d.timeWindow ?? undefined,
        startTime: d.startTime ?? undefined,
        endTime: d.endTime ?? undefined,
        crew: d.crew ?? null,
        crewConfirmed: d.crewConfirmed ?? null,
        link: d.link ?? null,
        timerState: d.timerState ?? null,
        actualStartAt: d.actualStartAt ?? null,
        actualEndAt: d.actualEndAt ?? null,
        pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : null,
        updatedAt: d.updatedAt ?? null,
      });
    }

    function recompute() {
      const union = new Set<string>();
      for (const s of idsByQuery) for (const id of s) union.add(id);

      for (const id of Array.from(map.keys())) {
        if (!union.has(id)) map.delete(id);
      }

      const chosen = pickLatestTrip(Array.from(map.values()));
      setTrip(chosen);
    }

    const unsubs: Unsubscribe[] = [];

    qs.forEach((q, idx) => {
      const unsub = onSnapshot(
        q,
        (snap) => {
          const idsThisSnap = new Set<string>();
          snap.docs.forEach((ds) => {
            idsThisSnap.add(ds.id);
            upsertFromDoc(ds.id, ds.data() as any);
          });

          idsByQuery[idx] = idsThisSnap;
          recompute();
        },
        () => {
          recompute();
        }
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((fn) => fn());
      map.clear();
      setTrip(null);
    };
  }, [uid]);

  return trip;
}

async function buildActiveTripPill(trip: TripDoc): Promise<ActiveTripPill> {
  const serviceTicketId = safeTrim(trip.link?.serviceTicketId);
  const tripId = trip.id;

  let href = `/trips/${tripId}`;
  let primaryLine = "Active Trip";
  let secondaryLine = "Tap to return";

  if (serviceTicketId) {
    href = `/service-tickets/${serviceTicketId}`;

    try {
      const ticketSnap = await getDoc(doc(db, "serviceTickets", serviceTicketId));
      if (ticketSnap.exists()) {
        const td = ticketSnap.data() as any;
        const issue = safeTrim(td.issueSummary) || "Service Ticket";
        const cust = safeTrim(td.customerDisplayName) || "Customer";
        primaryLine = truncate(cust, 40);
        secondaryLine = truncate(issue, 52);
      } else {
        primaryLine = "Service Ticket";
        secondaryLine = `Trip ${tripId}`;
      }
    } catch {
      primaryLine = "Service Ticket";
      secondaryLine = `Trip ${tripId}`;
    }
  } else {
    const type = safeTrim(trip.type).toLowerCase();
    primaryLine = type === "project" ? "Project Trip" : "Active Trip";
    secondaryLine = `Trip ${tripId}`;
  }

  const ts = safeTrim(trip.timerState).toLowerCase();
  const statusLabel = ts === "paused" ? "Paused" : "Running";

  return {
    tripId,
    href,
    statusLabel,
    primaryLine,
    secondaryLine,
  };
}

export default function AppShell({
  children,
  appUser,
}: {
  children: ReactNode;
  appUser: AppUser | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile(900);

  const role = appUser?.role;
  const myUid = safeTrim(appUser?.uid);

  const showDashboard =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "billing" ||
    role === "office_display";

  const showAdmin = role === "admin";

  const showMyDay =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showTechnician = role === "technician" || role === "admin";
  const showDispatch = role === "admin" || role === "dispatcher" || role === "manager";

  const showSchedule =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";

  const showOfficeDisplay =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";

  const showProjects = role === "admin" || role === "dispatcher" || role === "manager";
  const showWorkload = role === "admin" || role === "dispatcher" || role === "manager";

  const showTimeEntries =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showWeeklyTimesheet =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const showTimesheetReview = role === "admin" || role === "manager" || role === "dispatcher";

  const showPTORequests =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  // Mobile “More” drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // ✅ Realtime active trip (instant)
  const activeTrip = useRealtimeActiveTrip(myUid);

  // pill data
  const [pill, setPill] = useState<ActiveTripPill | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!activeTrip) {
        setPill(null);
        return;
      }
      const p = await buildActiveTripPill(activeTrip);
      if (cancelled) return;
      setPill(p);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, activeTrip?.timerState, activeTrip?.link?.serviceTicketId]);

  // ✅ local “live minutes” ticker (every 1s) – does NOT affect status, just the display
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!activeTrip) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [activeTrip?.id]);

  const liveMinutes = useMemo(() => {
    if (!activeTrip) return 0;

    const startMs = parseIsoMs(activeTrip.actualStartAt || null);
    if (!Number.isFinite(startMs)) return 0;

    const pausedMins = sumPausedMinutes(activeTrip.pauseBlocks || null);
    const grossMins = minutesBetweenMs(startMs, nowMs);

    return Math.max(0, grossMins - pausedMins);
  }, [activeTrip, nowMs]);

  const timerState = useMemo(() => safeTrim(activeTrip?.timerState).toLowerCase(), [activeTrip?.timerState]);
  const isPaused = timerState === "paused";
  const isRunning = timerState === "running" || timerState === "" || timerState === "in_progress";

  // Can act? (tech on crew OR admin/manager/dispatcher)
  const canQuickAct = useMemo(() => {
    if (!activeTrip) return false;
    const c = activeTrip.crewConfirmed || activeTrip.crew || null;
    const onCrew = userIsOnCrew(myUid, c);
    const elevated = role === "admin" || role === "manager" || role === "dispatcher";
    return Boolean(myUid) && (onCrew || elevated);
  }, [activeTrip, myUid, role]);

  const [pillActionBusy, setPillActionBusy] = useState(false);

  async function handleQuickPause() {
    if (!activeTrip) return;
    if (!canQuickAct) return;
    if (pillActionBusy) return;

    setPillActionBusy(true);
    try {
      const tripRef = doc(db, "trips", activeTrip.id);
      const now = new Date().toISOString();

      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks)
        ? [...activeTrip.pauseBlocks]
        : [];

      const openIdx = findOpenPauseIndex(curBlocks);
      if (openIdx !== -1) return;

      curBlocks.push({ startAt: now, endAt: null });

      await updateDoc(tripRef, {
        timerState: "paused",
        pauseBlocks: curBlocks,
        updatedAt: now,
        updatedByUid: myUid || null,
      } as any);
    } finally {
      setPillActionBusy(false);
    }
  }

  async function handleQuickResume() {
    if (!activeTrip) return;
    if (!canQuickAct) return;
    if (pillActionBusy) return;

    setPillActionBusy(true);
    try {
      const tripRef = doc(db, "trips", activeTrip.id);
      const now = new Date().toISOString();

      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks)
        ? [...activeTrip.pauseBlocks]
        : [];

      const openIdx = findOpenPauseIndex(curBlocks);
      if (openIdx === -1) return;

      curBlocks[openIdx] = { ...curBlocks[openIdx], endAt: now };

      await updateDoc(tripRef, {
        timerState: "running",
        pauseBlocks: curBlocks,
        updatedAt: now,
        updatedByUid: myUid || null,
      } as any);
    } finally {
      setPillActionBusy(false);
    }
  }

  // --- iOS-style mobile dock metrics ---
  const DOCK_HEIGHT = 66; // visual height of dock
  const DOCK_SAFE_GAP = 12; // gap from screen bottom
  const DOCK_TOTAL = DOCK_HEIGHT + DOCK_SAFE_GAP;

  // padding so pill + bottom dock don’t cover content
  const bottomBarHeight = isMobile ? DOCK_TOTAL : 0;
  const pillHeight = isMobile && pill ? 66 : 0;
  const bottomPadding = bottomBarHeight + pillHeight + (isMobile ? 14 : 0);

  const desktopNav = (
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginBottom: "20px",
      }}
    >
      {showDashboard ? <Link href="/dashboard">Dashboard</Link> : null}
      {showDispatch ? <Link href="/dispatch">Dispatcher Board</Link> : null}
      {showMyDay ? <Link href="/technician/my-day">My Day</Link> : null}
      {showSchedule ? <Link href="/schedule">Schedule</Link> : null}
      {showOfficeDisplay ? <Link href="/office-display">Office Display</Link> : null}
      {showProjects ? <Link href="/projects">Projects</Link> : null}
      {showWorkload ? <Link href="/technician-workload">Technician Workload</Link> : null}
      {showTimeEntries ? <Link href="/time-entries">Time Entries</Link> : null}
      {showWeeklyTimesheet ? <Link href="/weekly-timesheet">Weekly Timesheet</Link> : null}
      {showPTORequests ? <Link href="/pto-requests">PTO Requests</Link> : null}
      {showTimesheetReview ? <Link href="/timesheet-review">Timesheet Review</Link> : null}
      {showAdmin ? <Link href="/admin">Admin</Link> : null}
      {showTechnician ? <Link href="/technician">Technician</Link> : null}
      <Link href="/customers">Customers</Link>
      <Link href="/service-tickets">Service Tickets</Link>
    </nav>
  );

  const mobileMoreDrawer = (
    <>
      {drawerOpen ? (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 9998,
          }}
        />
      ) : null}

      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "84vw",
          maxWidth: 360,
          background: "white",
          borderLeft: "1px solid #eee",
          boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
          zIndex: 9999,
          transform: drawerOpen ? "translateX(0)" : "translateX(105%)",
          transition: "transform 180ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Menu</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            {appUser?.displayName || "Unknown User"} • {appUser?.role || "No Role"}
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            style={{
              marginTop: 10,
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
              width: "fit-content",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 14, overflow: "auto" }}>
          <div style={{ display: "grid", gap: 10 }}>
            {showDashboard ? <Link href="/dashboard">Dashboard</Link> : null}
            {showDispatch ? <Link href="/dispatch">Dispatcher Board</Link> : null}
            {showSchedule ? <Link href="/schedule">Schedule</Link> : null}
            {showOfficeDisplay ? <Link href="/office-display">Office Display</Link> : null}
            {showProjects ? <Link href="/projects">Projects</Link> : null}
            {showWorkload ? <Link href="/technician-workload">Technician Workload</Link> : null}
            {showTimeEntries ? <Link href="/time-entries">Time Entries</Link> : null}
            {showWeeklyTimesheet ? <Link href="/weekly-timesheet">Weekly Timesheet</Link> : null}
            {showPTORequests ? <Link href="/pto-requests">PTO Requests</Link> : null}
            {showTimesheetReview ? <Link href="/timesheet-review">Timesheet Review</Link> : null}
            {showAdmin ? <Link href="/admin">Admin</Link> : null}
            {showTechnician ? <Link href="/technician">Technician</Link> : null}
            <Link href="/customers">Customers</Link>
            <Link href="/service-tickets">Service Tickets</Link>

            <div style={{ height: 10 }} />
            <LogoutButton />
          </div>
        </div>
      </div>
    </>
  );

  // --- iOS-style dock tab helpers ---
  function isActivePath(target: string) {
    if (!target) return false;
    if (target === "/") return pathname === "/";
    if (pathname === target) return true;
    return pathname?.startsWith(target + "/");
  }

  function DockTab(args: {
    label: string;
    icon: string;
    onClick: () => void;
    active: boolean;
  }) {
    const { label, icon, onClick, active } = args;

    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          height: DOCK_HEIGHT,
          userSelect: "none",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-current={active ? "page" : undefined}
      >
        <div
          style={{
            width: 40,
            height: 32,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "rgba(0,0,0,0.06)" : "transparent",
            border: active ? "1px solid rgba(0,0,0,0.08)" : "1px solid transparent",
          }}
        >
          <div style={{ fontSize: 19, lineHeight: "19px" }}>{icon}</div>
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: active ? 950 : 800,
            color: active ? "#111" : "#555",
            letterSpacing: "-0.1px",
          }}
        >
          {label}
        </div>
      </button>
    );
  }

  const mobileDock = (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9997,
        display: "flex",
        justifyContent: "center",
        paddingBottom: DOCK_SAFE_GAP,
        pointerEvents: "none", // allow only the dock itself to receive clicks
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          width: "min(520px, calc(100vw - 24px))",
          height: DOCK_HEIGHT,
          borderRadius: 999,
          padding: "0 10px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          alignItems: "center",
          background: "rgba(255,255,255,0.86)",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <DockTab
          label="My Day"
          icon="📅"
          onClick={() => router.push("/technician/my-day")}
          active={isActivePath("/technician/my-day")}
        />
        <DockTab
          label="Schedule"
          icon="🗓️"
          onClick={() => router.push("/schedule")}
          active={isActivePath("/schedule")}
        />
        <DockTab
          label="Tickets"
          icon="🧾"
          onClick={() => router.push("/service-tickets")}
          active={isActivePath("/service-tickets")}
        />
        <DockTab
          label="More"
          icon="☰"
          onClick={() => setDrawerOpen(true)}
          active={drawerOpen}
        />
      </div>
    </div>
  );

  const pillTheme = useMemo(() => {
    // running = green, paused = orange
    if (isPaused) {
      return {
        bg: "#d97706", // orange
        border: "#b45309",
        dot: "#ffe8c7",
        dotHalo: "rgba(255,232,199,0.25)",
        actionBg: "rgba(255,255,255,0.18)",
      };
    }
    if (isRunning) {
      return {
        bg: "#1f8f3a", // green
        border: "#177a30",
        dot: "#b7ffbf",
        dotHalo: "rgba(183,255,191,0.25)",
        actionBg: "rgba(255,255,255,0.18)",
      };
    }
    return {
      bg: "#1b4fbf", // fallback blue
      border: "#153f99",
      dot: "#cfe1ff",
      dotHalo: "rgba(207,225,255,0.25)",
      actionBg: "rgba(255,255,255,0.18)",
    };
  }, [isPaused, isRunning]);

  const activeTripPill = isMobile && pill ? (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: DOCK_TOTAL + 10, zIndex: 9996 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "stretch",
          background: pillTheme.bg,
          border: `1px solid ${pillTheme.border}`,
          borderRadius: 14,
          padding: "10px 10px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
        }}
      >
        {/* Main tap target */}
        <Link
          href={pill.href}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            gap: 10,
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: pillTheme.dot,
              boxShadow: `0 0 0 4px ${pillTheme.dotHalo}`,
              marginLeft: 2,
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 1000, color: "white", fontSize: 13 }}>
                {pill.statusLabel} • {liveMinutes} min
              </div>
              <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.92)", fontSize: 11, whiteSpace: "nowrap" }}>
                Tap to return
              </div>
            </div>

            <div
              style={{
                marginTop: 2,
                color: "white",
                fontWeight: 900,
                fontSize: 14,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pill.primaryLine}
            </div>

            <div
              style={{
                marginTop: 2,
                color: "rgba(255,255,255,0.92)",
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pill.secondaryLine}
            </div>
          </div>
        </Link>

        {/* Quick action */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {canQuickAct ? (
            isPaused ? (
              <button
                type="button"
                onClick={handleQuickResume}
                disabled={pillActionBusy}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.28)",
                  background: pillTheme.actionBg,
                  color: "white",
                  fontWeight: 1000,
                  cursor: pillActionBusy ? "not-allowed" : "pointer",
                }}
                title="Resume"
              >
                ▶
              </button>
            ) : (
              <button
                type="button"
                onClick={handleQuickPause}
                disabled={pillActionBusy}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.28)",
                  background: pillTheme.actionBg,
                  color: "white",
                  fontWeight: 1000,
                  cursor: pillActionBusy ? "not-allowed" : "pointer",
                }}
                title="Pause"
              >
                ❚❚
              </button>
            )
          ) : (
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.9)",
                fontSize: 12,
                fontWeight: 900,
              }}
              title="Not assigned to this trip"
            >
              —
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // Desktop shell (unchanged)
  if (!isMobile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex" }}>
        <aside
          style={{
            width: "260px",
            borderRight: "1px solid #ddd",
            padding: "16px",
            background: "#fafafa",
          }}
        >
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>DCFlow</h1>

          <div style={{ marginBottom: "20px", fontSize: "14px" }}>
            <div style={{ fontWeight: 600 }}>{appUser?.displayName || "Unknown User"}</div>
            <div style={{ color: "#666", marginTop: "4px" }}>{appUser?.role || "No Role"}</div>
          </div>

          {desktopNav}
          <LogoutButton />
        </aside>

        <main style={{ flex: 1, padding: "24px" }}>{children}</main>
      </div>
    );
  }

  // Mobile shell
  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      {mobileMoreDrawer}

      <main style={{ padding: 14, paddingBottom: bottomPadding }}>{children}</main>

      {activeTripPill}
      {mobileDock}
    </div>
  );
}