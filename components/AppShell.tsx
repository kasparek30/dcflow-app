"use client";

import Link from "next/link";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
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

  timerState?: string | null; // not_started | running | paused | complete
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;

  updatedAt?: string | null;
};

type ActiveTripPill = {
  tripId: string;
  href: string;
  statusLabel: string;
  primaryLine: string;
  secondaryLine: string;
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
      query(base, where("active", "==", true), where("status", "==", "in_progress"), where("crew.primaryTechUid", "==", u), limit(10)),
      query(base, where("active", "==", true), where("status", "==", "in_progress"), where("crew.helperUid", "==", u), limit(10)),
      query(base, where("active", "==", true), where("status", "==", "in_progress"), where("crew.secondaryTechUid", "==", u), limit(10)),
      query(base, where("active", "==", true), where("status", "==", "in_progress"), where("crew.secondaryHelperUid", "==", u), limit(10)),
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
        () => recompute()
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

  return { tripId, href, statusLabel, primaryLine, secondaryLine };
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekMondayIsoForDate(d: Date) {
  const base = new Date(d);
  base.setHours(12, 0, 0, 0);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  return toIsoDate(monday);
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function isMondayLocalNow() {
  const d = new Date();
  return d.getDay() === 1;
}

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Badge({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 999,
        background: "#e11d48",
        color: "white",
        fontWeight: 900,
        fontSize: 12,
        lineHeight: "18px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
      }}
      aria-label={`${count} pending`}
      title={`${count} pending`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AppShell({ children, appUser }: { children: ReactNode; appUser: AppUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile(900);

  const BRAND = useMemo(
    () => ({
      sidebarBg: "#070A10",
      sidebarBg2: "#0B1220",
      sidebarBorder: "rgba(255,255,255,0.08)",
      text: "rgba(255,255,255,0.92)",
      subtext: "rgba(255,255,255,0.60)",

      blue: "#1e90ff",
      blueSoft: "rgba(30,144,255,0.18)",
      blueBorder: "rgba(30,144,255,0.30)",

      itemBg: "rgba(255,255,255,0.04)",
      itemHover: "rgba(255,255,255,0.07)",
      itemBorder: "rgba(255,255,255,0.08)",
      activeGlow: "0 10px 30px rgba(30,144,255,0.12)",
    }),
    []
  );

  const role = appUser?.role;
  const myUid = safeTrim(appUser?.uid);

  const showDashboard = role === "admin" || role === "dispatcher" || role === "manager" || role === "billing" || role === "office_display";
  const showAdmin = role === "admin";
  const showMyDay =
    role === "admin" || role === "dispatcher" || role === "manager" || role === "technician" || role === "helper" || role === "apprentice";
  const showTechnician = role === "technician" || role === "admin";
  const showDispatch = role === "admin" || role === "dispatcher" || role === "manager";
  const showSchedule = role === "admin" || role === "dispatcher" || role === "manager" || role === "office_display";
  const showOfficeDisplay = role === "admin" || role === "dispatcher" || role === "manager" || role === "office_display";
  const showProjects = role === "admin" || role === "dispatcher" || role === "manager";

  // ✅ removed per your request
  const showWorkload = false;

  const showTimeEntries =
    role === "admin" || role === "manager" || role === "dispatcher" || role === "technician" || role === "helper" || role === "apprentice";
  const showWeeklyTimesheet =
    role === "admin" || role === "manager" || role === "dispatcher" || role === "technician" || role === "helper" || role === "apprentice";
  const showTimesheetReview = role === "admin" || role === "manager" || role === "dispatcher";
  const showPTORequests =
    role === "admin" || role === "manager" || role === "dispatcher" || role === "technician" || role === "helper" || role === "apprentice";

  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => setDrawerOpen(false), [pathname]);

  const activeTrip = useRealtimeActiveTrip(myUid);
  const [pill, setPill] = useState<ActiveTripPill | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!activeTrip) {
        setPill(null);
        return;
      }
      const p = await buildActiveTripPill(activeTrip);
      if (!cancelled) setPill(p);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, activeTrip?.timerState, activeTrip?.link?.serviceTicketId]);

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

  const canQuickAct = useMemo(() => {
    if (!activeTrip) return false;
    const c = activeTrip.crewConfirmed || activeTrip.crew || null;
    const onCrew = userIsOnCrew(myUid, c);
    const elevated = role === "admin" || role === "manager" || role === "dispatcher";
    return Boolean(myUid) && (onCrew || elevated);
  }, [activeTrip, myUid, role]);

  const [pillActionBusy, setPillActionBusy] = useState(false);

  async function handleQuickPause() {
    if (!activeTrip || !canQuickAct || pillActionBusy) return;
    setPillActionBusy(true);
    try {
      const tripRef = doc(db, "trips", activeTrip.id);
      const now = new Date().toISOString();
      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks) ? [...activeTrip.pauseBlocks] : [];
      const openIdx = findOpenPauseIndex(curBlocks);
      if (openIdx !== -1) return;
      curBlocks.push({ startAt: now, endAt: null });

      await updateDoc(tripRef, { timerState: "paused", pauseBlocks: curBlocks, updatedAt: now, updatedByUid: myUid || null } as any);
    } finally {
      setPillActionBusy(false);
    }
  }

  async function handleQuickResume() {
    if (!activeTrip || !canQuickAct || pillActionBusy) return;
    setPillActionBusy(true);
    try {
      const tripRef = doc(db, "trips", activeTrip.id);
      const now = new Date().toISOString();
      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks) ? [...activeTrip.pauseBlocks] : [];
      const openIdx = findOpenPauseIndex(curBlocks);
      if (openIdx === -1) return;
      curBlocks[openIdx] = { ...curBlocks[openIdx], endAt: now };

      await updateDoc(tripRef, { timerState: "running", pauseBlocks: curBlocks, updatedAt: now, updatedByUid: myUid || null } as any);
    } finally {
      setPillActionBusy(false);
    }
  }

  const DOCK_HEIGHT = 66;
  const DOCK_SAFE_GAP = 12;
  const DOCK_TOTAL = DOCK_HEIGHT + DOCK_SAFE_GAP;

  const bottomBarHeight = isMobile ? DOCK_TOTAL : 0;
  const pillHeight = isMobile && pill ? 66 : 0;
  const bottomPadding = bottomBarHeight + pillHeight + (isMobile ? 14 : 0);

  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  useEffect(() => {
    if (!showTimesheetReview) {
      setPendingReviewCount(0);
      return;
    }
    const q = query(collection(db, "weeklyTimesheets"), where("status", "==", "submitted"), limit(200));
    const unsub = onSnapshot(q, (snap) => setPendingReviewCount(snap.size || 0), () => {});
    return () => unsub();
  }, [showTimesheetReview]);

  const [pendingPtoCount, setPendingPtoCount] = useState(0);
  useEffect(() => {
    if (!showPTORequests) {
      setPendingPtoCount(0);
      return;
    }
    const canReviewPto = role === "admin" || role === "manager" || role === "dispatcher";
    if (!canReviewPto) {
      setPendingPtoCount(0);
      return;
    }
    const q = query(collection(db, "ptoRequests"), where("status", "==", "pending"), limit(50));
    const unsub = onSnapshot(q, (snap) => setPendingPtoCount(snap.size || 0), () => setPendingPtoCount(0));
    return () => unsub();
  }, [showPTORequests, role]);

  const [myRejectedCount, setMyRejectedCount] = useState(0);
  useEffect(() => {
    const uid = safeTrim(myUid);
    if (!uid) {
      setMyRejectedCount(0);
      return;
    }
    const canReceive =
      role === "technician" || role === "helper" || role === "apprentice" || role === "dispatcher" || role === "manager" || role === "admin";
    if (!canReceive) {
      setMyRejectedCount(0);
      return;
    }
    const q = query(collection(db, "weeklyTimesheets"), where("employeeId", "==", uid), where("status", "==", "rejected"), limit(20));
    const unsub = onSnapshot(q, (snap) => setMyRejectedCount(snap.size || 0), () => {});
    return () => unsub();
  }, [myUid, role]);

  const [showMondayReminder, setShowMondayReminder] = useState(false);
  const [prevWeekStart, setPrevWeekStart] = useState<string>("");
  const [prevWeekStatus, setPrevWeekStatus] = useState<string>("");

  useEffect(() => {
    const uid = safeTrim(myUid);
    if (!uid) {
      setShowMondayReminder(false);
      return;
    }

    const canReceive =
      role === "technician" || role === "helper" || role === "apprentice" || role === "dispatcher" || role === "manager" || role === "admin";

    if (!canReceive) {
      setShowMondayReminder(false);
      return;
    }

    if (!isMondayLocalNow()) {
      setShowMondayReminder(false);
      return;
    }

    const dismissKey = `dcflow_missingTimesheetDismissed_${todayKeyLocal()}`;
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(dismissKey) === "1") {
        setShowMondayReminder(false);
        return;
      }
    } catch {}

    const now = new Date();
    const thisMonIso = getWeekMondayIsoForDate(now);
    const thisMon = new Date(`${thisMonIso}T12:00:00`);
    const prevMon = new Date(thisMon);
    prevMon.setDate(thisMon.getDate() - 7);
    const prevMonIso = toIsoDate(prevMon);

    setPrevWeekStart(prevMonIso);

    const tsId = buildWeeklyTimesheetId(uid, prevMonIso);
    const tsRef = doc(db, "weeklyTimesheets", tsId);

    const unsub = onSnapshot(
      tsRef,
      (snap) => {
        if (!snap.exists()) {
          setPrevWeekStatus("missing");
          setShowMondayReminder(true);
          return;
        }
        const d: any = snap.data();
        const status = safeTrim(d.status).toLowerCase() || "draft";
        setPrevWeekStatus(status);

        const ok = status === "submitted" || status === "approved" || status === "exported_to_quickbooks" || status === "exported";
        setShowMondayReminder(!ok);
      },
      () => setShowMondayReminder(false)
    );

    return () => unsub();
  }, [myUid, role]);

  function dismissMondayReminderForToday() {
    const dismissKey = `dcflow_missingTimesheetDismissed_${todayKeyLocal()}`;
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(dismissKey, "1");
    } catch {}
    setShowMondayReminder(false);
  }

  const mondayReminderBanner =
    showMondayReminder && showWeeklyTimesheet ? (
      <div style={{ border: "1px solid #f59e0b", background: "#fff7ed", borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 1000 }}>⏰ Last week’s timesheet isn’t submitted yet</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#7c2d12", fontWeight: 800 }}>
              Week starting <strong>{prevWeekStart || "—"}</strong> {prevWeekStatus ? `• Status: ${prevWeekStatus}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.push("/weekly-timesheet?weekOffset=-1")}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #c2410c", background: "#f97316", color: "white", cursor: "pointer", fontWeight: 1000 }}
            >
              Review last week
            </button>

            <button
              type="button"
              onClick={dismissMondayReminderForToday}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 900 }}
            >
              Dismiss today
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const rejectedBanner =
    myRejectedCount > 0 && showWeeklyTimesheet ? (
      <div style={{ border: "1px solid #ef4444", background: "#fff1f2", borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 1000 }}>
            ❗ Your timesheet was rejected and needs changes
            <div style={{ marginTop: 6, fontSize: 12, color: "#7f1d1d", fontWeight: 800 }}>
              {myRejectedCount} rejected timesheet{myRejectedCount === 1 ? "" : "s"} found.
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/weekly-timesheet?showRejected=1")}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #991b1b", background: "#dc2626", color: "white", cursor: "pointer", fontWeight: 1000 }}
          >
            Fix now
          </button>
        </div>
      </div>
    ) : null;

  function isActivePath(target: string) {
    if (!target) return false;
    if (target === "/") return pathname === "/";
    if (pathname === target) return true;
    return pathname?.startsWith(target + "/");
  }

  function NavItem(props: { href: string; label: string; icon: string; right?: ReactNode }) {
    const { href, label, icon, right } = props;
    const active = isActivePath(href);
    const [hover, setHover] = useState(false);

    // slightly tighter sizing to ensure no-scroll sidebar fits top-to-bottom
    const bg = active ? BRAND.blueSoft : hover ? BRAND.itemHover : BRAND.itemBg;
    const border = active ? BRAND.blueBorder : BRAND.itemBorder;

    return (
      <Link
        href={href}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          textDecoration: "none",
          color: BRAND.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "9px 10px",
          borderRadius: 14,
          border: `1px solid ${border}`,
          background: bg,
          boxShadow: active ? BRAND.activeGlow : "none",
          position: "relative",
          overflow: "hidden",
        }}
        aria-current={active ? "page" : undefined}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 9,
            bottom: 9,
            width: 3,
            borderRadius: 99,
            background: active ? BRAND.blue : "transparent",
            boxShadow: active ? "0 0 0 4px rgba(30,144,255,0.10)" : "none",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, paddingLeft: 6 }}>
          <div style={{ width: 20, textAlign: "center", fontSize: 15, opacity: active ? 1 : 0.9 }}>{icon}</div>
          <div style={{ fontWeight: active ? 950 : 850, fontSize: 12.5, letterSpacing: "-0.1px" }}>{label}</div>
        </div>

        {right ? <div style={{ display: "flex", alignItems: "center" }}>{right}</div> : null}
      </Link>
    );
  }

  const desktopNavTop = (
    <div style={{ display: "grid", gap: 8 }}>
      {showDashboard ? <NavItem href="/dashboard" label="Dashboard" icon="🏠" /> : null}
      {showDispatch ? <NavItem href="/dispatch" label="Dispatcher Board" icon="🧭" /> : null}
      {showMyDay ? <NavItem href="/technician/my-day" label="My Day" icon="📅" /> : null}
      {showSchedule ? <NavItem href="/schedule" label="Schedule" icon="🗓️" /> : null}
      {showOfficeDisplay ? <NavItem href="/office-display" label="Office Display" icon="📺" /> : null}
      {showProjects ? <NavItem href="/projects" label="Projects" icon="🏗️" /> : null}
      {showWorkload ? <NavItem href="/technician-workload" label="Technician Workload" icon="📊" /> : null}

      <div style={{ height: 2 }} />

      <NavItem href="/customers" label="Customers" icon="👥" />
      <NavItem href="/service-tickets" label="Service Tickets" icon="🧾" />

      <div style={{ height: 2 }} />

      {showTimeEntries ? <NavItem href="/time-entries" label="Time Entries" icon="⏱️" /> : null}
      {showWeeklyTimesheet ? <NavItem href="/weekly-timesheet" label="Weekly Timesheet" icon="🗂️" /> : null}

      {showPTORequests ? <NavItem href="/pto-requests" label="PTO Requests" icon="🌴" right={<Badge count={pendingPtoCount} />} /> : null}

      {showTimesheetReview ? (
        <NavItem href="/timesheet-review" label="Timesheet Review" icon="✅" right={<Badge count={pendingReviewCount} />} />
      ) : null}

      {showTechnician ? <NavItem href="/technician" label="Technician" icon="🧰" /> : null}
    </div>
  );

  const desktopNavBottom = (
    <div style={{ display: "grid", gap: 8 }}>
      {showAdmin ? <NavItem href="/admin" label="Admin" icon="⚙️" /> : null}
      <LogoutButton />
    </div>
  );

  // Mobile drawer left as-is from your previous version (not the focus here)
  const mobileMoreDrawer = (
    <>
      {drawerOpen ? <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9998 }} /> : null}

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
            style={{ marginTop: 10, padding: "8px 12px", border: "1px solid #ccc", borderRadius: 10, background: "white", cursor: "pointer", fontWeight: 800, width: "fit-content" }}
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
            {showTimeEntries ? <Link href="/time-entries">Time Entries</Link> : null}
            {showWeeklyTimesheet ? <Link href="/weekly-timesheet">Weekly Timesheet</Link> : null}

            {showPTORequests ? (
              <Link href="/pto-requests" style={{ display: "inline-flex", alignItems: "center" }}>
                PTO Requests
                <Badge count={pendingPtoCount} />
              </Link>
            ) : null}

            {showTimesheetReview ? (
              <Link href="/timesheet-review" style={{ display: "inline-flex", alignItems: "center" }}>
                Timesheet Review
                <Badge count={pendingReviewCount} />
              </Link>
            ) : null}

            {showTechnician ? <Link href="/technician">Technician</Link> : null}
            <Link href="/customers">Customers</Link>
            <Link href="/service-tickets">Service Tickets</Link>

            {showAdmin ? (
              <>
                <div style={{ height: 10 }} />
                <Link href="/admin">Admin</Link>
              </>
            ) : null}

            <div style={{ height: 10 }} />
            <LogoutButton />
          </div>
        </div>
      </div>
    </>
  );

  // Minimal mobile dock kept (unchanged)
  function DockTab(args: { label: string; icon: string; onClick: () => void; active: boolean }) {
    const { label, icon, onClick, active } = args;
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, height: DOCK_HEIGHT, userSelect: "none", WebkitTapHighlightColor: "transparent" }}
        aria-current={active ? "page" : undefined}
      >
        <div style={{ width: 40, height: 32, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: active ? "rgba(0,0,0,0.06)" : "transparent", border: active ? "1px solid rgba(0,0,0,0.08)" : "1px solid transparent" }}>
          <div style={{ fontSize: 19, lineHeight: "19px" }}>{icon}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: active ? 950 : 800, color: active ? "#111" : "#555", letterSpacing: "-0.1px" }}>{label}</div>
      </button>
    );
  }

  const mobileDock = (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9997, display: "flex", justifyContent: "center", paddingBottom: DOCK_SAFE_GAP, pointerEvents: "none" }}>
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
        <DockTab label="My Day" icon="📅" onClick={() => router.push("/technician/my-day")} active={isActivePath("/technician/my-day")} />
        <DockTab label="Schedule" icon="🗓️" onClick={() => router.push("/schedule")} active={isActivePath("/schedule")} />
        <DockTab label="Tickets" icon="🧾" onClick={() => router.push("/service-tickets")} active={isActivePath("/service-tickets")} />
        <DockTab label="More" icon="☰" onClick={() => setDrawerOpen(true)} active={drawerOpen} />
      </div>
    </div>
  );

  const activeTripPill = isMobile && pill ? (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: DOCK_TOTAL + 10, zIndex: 9996 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", background: isPaused ? "#d97706" : "#1f8f3a", border: `1px solid ${isPaused ? "#b45309" : "#177a30"}`, borderRadius: 14, padding: "10px 10px", boxShadow: "0 10px 25px rgba(0,0,0,0.18)" }}>
        <Link href={pill.href} style={{ flex: 1, minWidth: 0, display: "flex", gap: 10, alignItems: "center", textDecoration: "none", color: "inherit" }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.92)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 1000, color: "white", fontSize: 13 }}>
                {pill.statusLabel} • {liveMinutes} min
              </div>
              <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.92)", fontSize: 11, whiteSpace: "nowrap" }}>Tap to return</div>
            </div>
            <div style={{ marginTop: 2, color: "white", fontWeight: 900, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pill.primaryLine}
            </div>
            <div style={{ marginTop: 2, color: "rgba(255,255,255,0.92)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pill.secondaryLine}
            </div>
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center" }}>
          {canQuickAct ? (
            isPaused ? (
              <button type="button" onClick={handleQuickResume} disabled={pillActionBusy} style={{ width: 46, height: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.18)", color: "white", fontWeight: 1000, cursor: pillActionBusy ? "not-allowed" : "pointer" }} title="Resume">
                ▶
              </button>
            ) : (
              <button type="button" onClick={handleQuickPause} disabled={pillActionBusy} style={{ width: 46, height: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.18)", color: "white", fontWeight: 1000, cursor: pillActionBusy ? "not-allowed" : "pointer" }} title="Pause">
                ❚❚
              </button>
            )
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 900 }} title="Not assigned to this trip">
              —
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // ✅ Desktop shell: NO sidebar scroll, main content scrolls
  if (!isMobile) {
    return (
      <div style={{ height: "100vh", display: "flex", background: "#fff", overflow: "hidden" }}>
        {/* Sidebar fixed height, NO scrolling */}
        <aside
          style={{
            width: 280,
            height: "100vh",
            overflow: "hidden",
            padding: 14,
            color: BRAND.text,
            background: `radial-gradient(1200px 400px at 10% 0%, rgba(30,144,255,0.10), transparent 45%), linear-gradient(180deg, ${BRAND.sidebarBg}, ${BRAND.sidebarBg2})`,
            borderRight: `1px solid ${BRAND.sidebarBorder}`,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* ✅ Logo header */}
          <div
            style={{
              borderRadius: 18,
              border: `1px solid ${BRAND.itemBorder}`,
              background: "rgba(255,255,255,0.03)",
              padding: 12,
            }}
          >
            <img
              src="/brand/dcflow-logo.png"
              alt="DCFlow"
              style={{
                width: "100%",
                height: 56,
                objectFit: "contain",
                display: "block",
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: BRAND.subtext, fontWeight: 800 }}>
              {appUser?.displayName || "Unknown User"} • {appUser?.role || "No Role"}
            </div>
          </div>

          {/* Nav + bottom section, sized to fit */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "grid", gap: 8 }}>{desktopNavTop}</div>

            <div style={{ flex: 1 }} />

            <div style={{ borderTop: `1px solid ${BRAND.itemBorder}`, paddingTop: 10, display: "grid", gap: 8 }}>
              {desktopNavBottom}
            </div>
          </div>
        </aside>

        {/* Main area scrolls independently */}
        <main style={{ flex: 1, height: "100vh", overflowY: "auto", padding: 24 }}>
          {rejectedBanner}
          {mondayReminderBanner}
          {children}
        </main>
      </div>
    );
  }

  // Mobile shell
  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      {mobileMoreDrawer}
      <main style={{ padding: 14, paddingBottom: bottomPadding }}>
        {rejectedBanner}
        {mondayReminderBanner}
        {children}
      </main>
      {activeTripPill}
      {mobileDock}
    </div>
  );
}