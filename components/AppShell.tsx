// components/AppShell.tsx
// components/AppShell.tsx
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

// -----------------------------
// Timesheet helpers (AppShell UI notifications)
// -----------------------------
function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekMondayIsoForDate(d: Date) {
  const base = new Date(d);
  base.setHours(12, 0, 0, 0);
  const day = base.getDay(); // Sun 0 ... Sat 6
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

  // ✅ Remove Technician Workload for admins (unnecessary right now)
  const showWorkload = false;

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

      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks) ? [...activeTrip.pauseBlocks] : [];

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

      const curBlocks: PauseBlock[] = Array.isArray(activeTrip.pauseBlocks) ? [...activeTrip.pauseBlocks] : [];

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
  const DOCK_HEIGHT = 66;
  const DOCK_SAFE_GAP = 12;
  const DOCK_TOTAL = DOCK_HEIGHT + DOCK_SAFE_GAP;

  // padding so pill + bottom dock don’t cover content
  const bottomBarHeight = isMobile ? DOCK_TOTAL : 0;
  const pillHeight = isMobile && pill ? 66 : 0;
  const bottomPadding = bottomBarHeight + pillHeight + (isMobile ? 14 : 0);

  // -----------------------------
  // ✅ Admin/Manager badge: submitted timesheets waiting review
  // -----------------------------
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    if (!showTimesheetReview) {
      setPendingReviewCount(0);
      return;
    }

    const q = query(collection(db, "weeklyTimesheets"), where("status", "==", "submitted"), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingReviewCount(snap.size || 0);
      },
      () => {
        // ignore
      }
    );

    return () => unsub();
  }, [showTimesheetReview]);

  // ✅ Pending PTO Requests badge (admins/managers/dispatchers)
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

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingPtoCount(snap.size || 0);
      },
      () => {
        setPendingPtoCount(0);
      }
    );

    return () => unsub();
  }, [showPTORequests, role]);

  // -----------------------------
  // ✅ Employee banner: rejected timesheets (so they know)
  // -----------------------------
  const [myRejectedCount, setMyRejectedCount] = useState(0);

  useEffect(() => {
    const uid = safeTrim(myUid);
    if (!uid) {
      setMyRejectedCount(0);
      return;
    }

    const canReceive =
      role === "technician" ||
      role === "helper" ||
      role === "apprentice" ||
      role === "dispatcher" ||
      role === "manager" ||
      role === "admin";

    if (!canReceive) {
      setMyRejectedCount(0);
      return;
    }

    const q = query(collection(db, "weeklyTimesheets"), where("employeeId", "==", uid), where("status", "==", "rejected"), limit(20));

    const unsub = onSnapshot(q, (snap) => setMyRejectedCount(snap.size || 0), () => {});

    return () => unsub();
  }, [myUid, role]);

  // -----------------------------
  // ✅ Monday “previous week not submitted” banner
  // -----------------------------
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
      role === "technician" ||
      role === "helper" ||
      role === "apprentice" ||
      role === "dispatcher" ||
      role === "manager" ||
      role === "admin";

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
    } catch {
      // ignore
    }

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

        const ok =
          status === "submitted" ||
          status === "approved" ||
          status === "exported_to_quickbooks" ||
          status === "exported";
        setShowMondayReminder(!ok);
      },
      () => {
        setShowMondayReminder(false);
      }
    );

    return () => unsub();
  }, [myUid, role]);

  function dismissMondayReminderForToday() {
    const dismissKey = `dcflow_missingTimesheetDismissed_${todayKeyLocal()}`;
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(dismissKey, "1");
    } catch {
      // ignore
    }
    setShowMondayReminder(false);
  }

  const mondayReminderBanner =
    showMondayReminder && showWeeklyTimesheet ? (
      <div
        style={{
          border: "1px solid #f59e0b",
          background: "#fff7ed",
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        }}
      >
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
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #c2410c",
                background: "#f97316",
                color: "white",
                cursor: "pointer",
                fontWeight: 1000,
                whiteSpace: "nowrap",
              }}
            >
              Review last week
            </button>

            <button
              type="button"
              onClick={dismissMondayReminderForToday}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              Dismiss today
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#7c2d12" }}>Tip: submit early so payroll can be approved on time.</div>
      </div>
    ) : null;

  const rejectedBanner =
    myRejectedCount > 0 && showWeeklyTimesheet ? (
      <div
        style={{
          border: "1px solid #ef4444",
          background: "#fff1f2",
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
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
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #991b1b",
              background: "#dc2626",
              color: "white",
              cursor: "pointer",
              fontWeight: 1000,
              whiteSpace: "nowrap",
            }}
          >
            Fix now
          </button>
        </div>
      </div>
    ) : null;

  // -----------------------------
  // ✅ Desktop nav: branded + ordered + Admin at bottom
  // -----------------------------
  function isActivePath(target: string) {
    if (!target) return false;
    if (target === "/") return pathname === "/";
    if (pathname === target) return true;
    return pathname?.startsWith(target + "/");
  }

  function NavLink({
    href,
    label,
    right,
    subtle,
  }: {
    href: string;
    label: string;
    right?: ReactNode;
    subtle?: boolean;
  }) {
    const active = isActivePath(href);

    const baseBg = subtle ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)";
    const hoverBg = subtle ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)";
    const activeBg = "rgba(0,112,208,0.18)";

    return (
      <Link
        href={href}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 14,
          textDecoration: "none",
          color: active ? "white" : "rgba(255,255,255,0.92)",
          background: active ? activeBg : baseBg,
          border: active ? "1px solid rgba(0,112,208,0.45)" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: active ? "0 10px 26px rgba(0,112,208,0.18)" : "none",
          fontWeight: active ? 1000 : 850,
          letterSpacing: "-0.2px",
          transition: "transform 120ms ease, background 120ms ease, border 120ms ease, box-shadow 120ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = active ? activeBg : hoverBg;
          (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = active ? activeBg : baseBg;
          (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0px)";
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {right ? <span style={{ flex: "none" }}>{right}</span> : null}
      </Link>
    );
  }

  const desktopNav = (
    <nav style={{ display: "grid", gap: 10 }}>
      {/* Primary ops (most used) */}
      <NavLink href="/service-tickets" label="Service Tickets" />
      <NavLink href="/customers" label="Customers" />

      {/* Planning */}
      {showDispatch ? <NavLink href="/dispatch" label="Dispatcher Board" /> : null}
      {showSchedule ? <NavLink href="/schedule" label="Schedule" /> : null}
      {showOfficeDisplay ? <NavLink href="/office-display" label="Office Display" /> : null}

      {/* Personal */}
      {showMyDay ? <NavLink href="/technician/my-day" label="My Day" subtle /> : null}

      {/* Projects */}
      {showProjects ? <NavLink href="/projects" label="Projects" subtle /> : null}

      {/* Time */}
      {showTimeEntries ? <NavLink href="/time-entries" label="Time Entries" subtle /> : null}
      {showWeeklyTimesheet ? <NavLink href="/weekly-timesheet" label="Weekly Timesheet" subtle /> : null}

      {showPTORequests ? (
        <NavLink href="/pto-requests" label="PTO Requests" right={<Badge count={pendingPtoCount} />} />
      ) : null}

      {showTimesheetReview ? (
        <NavLink href="/timesheet-review" label="Timesheet Review" right={<Badge count={pendingReviewCount} />} />
      ) : null}

      {/* Technician area (kept) */}
      {showTechnician ? <NavLink href="/technician" label="Technician" subtle /> : null}

      {/* Removed Technician Workload */}
      {showWorkload ? <NavLink href="/technician-workload" label="Technician Workload" subtle /> : null}

      {/* Admin ALWAYS bottom */}
      {showAdmin ? (
        <>
          <div style={{ height: 6 }} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ height: 6 }} />
          <NavLink href="/admin" label="Admin" subtle />
        </>
      ) : null}
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

            {/* removed workload */}
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

            {/* admin at bottom */}
            {showAdmin ? (
              <>
                <div style={{ height: 6 }} />
                <div style={{ height: 1, background: "#eee" }} />
                <div style={{ height: 6 }} />
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

  // --- iOS-style dock tab helpers ---
  function DockTab(args: { label: string; icon: string; onClick: () => void; active: boolean }) {
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
        pointerEvents: "none",
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
        <DockTab label="Schedule" icon="🗓️" onClick={() => router.push("/schedule")} active={isActivePath("/schedule")} />
        <DockTab label="Tickets" icon="🧾" onClick={() => router.push("/service-tickets")} active={isActivePath("/service-tickets")} />
        <DockTab label="More" icon="☰" onClick={() => setDrawerOpen(true)} active={drawerOpen} />
      </div>
    </div>
  );

  const pillTheme = useMemo(() => {
    if (isPaused) {
      return {
        bg: "#d97706",
        border: "#b45309",
        dot: "#ffe8c7",
        dotHalo: "rgba(255,232,199,0.25)",
        actionBg: "rgba(255,255,255,0.18)",
      };
    }
    if (isRunning) {
      return {
        bg: "#1f8f3a",
        border: "#177a30",
        dot: "#b7ffbf",
        dotHalo: "rgba(183,255,191,0.25)",
        actionBg: "rgba(255,255,255,0.18)",
      };
    }
    return {
      bg: "#1b4fbf",
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

  // Desktop shell (branded sidebar)
  if (!isMobile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", background: "#000" }}>
        <aside
          style={{
            width: 320,
            padding: 16,
            color: "white",
            borderRight: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(900px 600px at 20% 0%, rgba(0,112,208,0.24), transparent 60%), linear-gradient(180deg, #05070d 0%, #000 40%, #000 100%)",
          }}
        >
          {/* Brand header */}
          <div
            style={{
              borderRadius: 18,
              padding: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 14px 38px rgba(0,0,0,0.35)",
            }}
          >
            {/* ✅ Use your real file path here. Recommended: put your logo in /public as /dcflow-logo.png */}
            <img
              src="/dcflow-logo.png"
              alt="DCFlow"
              style={{
                width: "100%",
                maxWidth: 260,
                height: "auto",
                display: "block",
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.35))",
              }}
            />

            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 950, fontSize: 14, letterSpacing: "-0.2px" }}>
                {appUser?.displayName || "Unknown User"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
                {appUser?.role || "No Role"}
              </div>
            </div>
          </div>

          {/* Nav */}
          <div style={{ marginTop: 14 }}>{desktopNav}</div>

          {/* Footer actions */}
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ height: 12 }} />
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <LogoutButton />
            </div>
          </div>
        </aside>

        <main
          style={{
            flex: 1,
            padding: 24,
            background: "#fff",
          }}
        >
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