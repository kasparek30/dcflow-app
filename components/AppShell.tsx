"use client";

import Image from "next/image";
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
import {
  Alert,
  AppBar,
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  SwipeableDrawer,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import TvRoundedIcon from "@mui/icons-material/TvRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import AccessTimeFilledRoundedIcon from "@mui/icons-material/AccessTimeFilledRounded";
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import DirectionsRunRoundedIcon from "@mui/icons-material/DirectionsRunRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";

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
  timerState?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  updatedAt?: string | null;
};

type ActiveTripCard = {
  tripId: string;
  href: string;
  statusLabel: string;
  primaryLine: string;
  secondaryLine: string;
};

type NavEntry = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badgeCount?: number;
};

const DESKTOP_DRAWER_WIDTH = 296;
const MOBILE_BOTTOM_NAV_HEIGHT = 68;
const MOBILE_ACTIVE_TRIP_HEIGHT = 118;

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
      for (const s of idsByQuery) {
        for (const id of s) union.add(id);
      }

      for (const id of Array.from(map.keys())) {
        if (!union.has(id)) map.delete(id);
      }

      const chosen = pickLatestTrip(Array.from(map.values()));
      setTrip(chosen);
    }

    const unsubs: Unsubscribe[] = [];

    qs.forEach((qRef, idx) => {
      const unsub = onSnapshot(
        qRef,
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

async function buildActiveTripCard(trip: TripDoc): Promise<ActiveTripCard> {
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
        secondaryLine = "Tap to return";
      }
    } catch {
      primaryLine = "Service Ticket";
      secondaryLine = "Tap to return";
    }
  } else {
    const type = safeTrim(trip.type).toLowerCase();
    primaryLine = type === "project" ? "Project Trip" : "Active Trip";
    secondaryLine = "Tap to return";
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

function isActivePath(pathname: string, target: string) {
  if (!target) return false;
  if (target === "/") return pathname === "/";
  if (pathname === target) return true;
  return pathname.startsWith(target + "/");
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavEntry[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <List disablePadding sx={{ display: "grid", gap: 0.25 }}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <ListItemButton
            key={item.href}
            selected={active}
            onClick={() => {
              onNavigate?.();
              router.push(item.href);
            }}
            sx={{
              minHeight: 44,
              px: 1.25,
              py: 0.375,
              borderRadius: 1.25,
              "&.Mui-selected": {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
              },
              "&.Mui-selected:hover": {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.18),
              },
              "&:hover": {
                backgroundColor: (theme) =>
                  active
                    ? alpha(theme.palette.primary.main, 0.18)
                    : alpha(theme.palette.common.white, 0.04),
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 36,
                color: active ? "primary.light" : "text.secondary",
              }}
            >
              {item.icon}
            </ListItemIcon>

            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                variant: "body2",
                fontWeight: active ? 500 : 400,
                color: active ? "text.primary" : "text.secondary",
              }}
            />

            {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
              <Badge
                color="error"
                badgeContent={item.badgeCount > 99 ? "99+" : item.badgeCount}
                sx={{
                  "& .MuiBadge-badge": {
                    fontWeight: 700,
                    right: -2,
                  },
                }}
              />
            ) : null}
          </ListItemButton>
        );
      })}
    </List>
  );
}

function BannerCard({
  severity,
  title,
  body,
  action,
}: {
  severity: "warning" | "error";
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Alert
      severity={severity}
      variant="outlined"
      sx={{
        mb: 1.5,
        borderRadius: 1.5,
        alignItems: "flex-start",
        "& .MuiAlert-message": {
          width: "100%",
        },
      }}
      action={action}
    >
      <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="body2">{body}</Typography>
    </Alert>
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

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

  const showDispatch =
    role === "admin" || role === "dispatcher" || role === "manager";

  const showSchedule =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display" ||
    role === "technician";

  const showOfficeDisplay =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";

  const showProjects =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "technician";

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

  const showTimesheetReview =
    role === "admin" || role === "manager" || role === "dispatcher";

  const showPTORequests =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTripSheetOpen, setActiveTripSheetOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const activeTrip = useRealtimeActiveTrip(myUid);
  const [activeTripCard, setActiveTripCard] = useState<ActiveTripCard | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!activeTrip) {
        setActiveTripCard(null);
        return;
      }
      const card = await buildActiveTripCard(activeTrip);
      if (!cancelled) setActiveTripCard(card);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id, activeTrip?.timerState, activeTrip?.link?.serviceTicketId]);

  useEffect(() => {
    if (!activeTripCard) setActiveTripSheetOpen(false);
  }, [activeTripCard]);

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

  const timerState = useMemo(
    () => safeTrim(activeTrip?.timerState).toLowerCase(),
    [activeTrip?.timerState]
  );

  const isPaused = timerState === "paused";
  const hasServiceTicketTarget = Boolean(safeTrim(activeTrip?.link?.serviceTicketId));

  const canQuickAct = useMemo(() => {
    if (!activeTrip) return false;
    const c = activeTrip.crewConfirmed || activeTrip.crew || null;
    const onCrew = userIsOnCrew(myUid, c);
    const elevated =
      role === "admin" || role === "manager" || role === "dispatcher";
    return Boolean(myUid) && (onCrew || elevated);
  }, [activeTrip, myUid, role]);

  const [pillActionBusy, setPillActionBusy] = useState(false);

  async function handleQuickPause() {
    if (!activeTrip || !canQuickAct || pillActionBusy) return;
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
    if (!activeTrip || !canQuickAct || pillActionBusy) return;
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

  function navigateToActiveTrip(action?: "note" | "follow_up" | "resolved") {
    if (!activeTripCard) return;

    if (!hasServiceTicketTarget || !action) {
      router.push(activeTripCard.href);
      setActiveTripSheetOpen(false);
      return;
    }

    const url = new URL(activeTripCard.href, window.location.origin);

    if (action === "note") {
      url.hash = `trip-work-notes-${activeTripCard.tripId}`;
    } else {
      url.searchParams.set("tripAction", action);
      url.searchParams.set("tripId", activeTripCard.tripId);
    }

    router.push(`${url.pathname}${url.search}${url.hash}`);
    setActiveTripSheetOpen(false);
  }

  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    if (!showTimesheetReview) {
      setPendingReviewCount(0);
      return;
    }
    const qRef = query(
      collection(db, "weeklyTimesheets"),
      where("status", "==", "submitted"),
      limit(200)
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => setPendingReviewCount(snap.size || 0),
      () => {}
    );
    return () => unsub();
  }, [showTimesheetReview]);

  const [pendingPtoCount, setPendingPtoCount] = useState(0);

  useEffect(() => {
    if (!showPTORequests) {
      setPendingPtoCount(0);
      return;
    }

    const canReviewPto =
      role === "admin" || role === "manager" || role === "dispatcher";

    if (!canReviewPto) {
      setPendingPtoCount(0);
      return;
    }

    const qRef = query(
      collection(db, "ptoRequests"),
      where("status", "==", "pending"),
      limit(50)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => setPendingPtoCount(snap.size || 0),
      () => setPendingPtoCount(0)
    );

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

    const qRef = query(
      collection(db, "weeklyTimesheets"),
      where("employeeId", "==", uid),
      where("status", "==", "rejected"),
      limit(20)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => setMyRejectedCount(snap.size || 0),
      () => {}
    );

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
      if (
        typeof window !== "undefined" &&
        window.localStorage.getItem(dismissKey) === "1"
      ) {
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

        const ok =
          status === "submitted" ||
          status === "approved" ||
          status === "exported_to_quickbooks" ||
          status === "exported";

        setShowMondayReminder(!ok);
      },
      () => setShowMondayReminder(false)
    );

    return () => unsub();
  }, [myUid, role]);

  function dismissMondayReminderForToday() {
    const dismissKey = `dcflow_missingTimesheetDismissed_${todayKeyLocal()}`;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(dismissKey, "1");
      }
    } catch {}
    setShowMondayReminder(false);
  }

  const [followUpTicketIds, setFollowUpTicketIds] = useState<string[]>([]);
  const [readyToBillTicketIds, setReadyToBillTicketIds] = useState<string[]>([]);

  useEffect(() => {
    if (!showDashboard) {
      setFollowUpTicketIds([]);
      setReadyToBillTicketIds([]);
      return;
    }

    const followUpQuery = query(
      collection(db, "serviceTickets"),
      where("status", "==", "follow_up"),
      limit(100)
    );

    const readyToBillQuery = query(
      collection(db, "serviceTickets"),
      where("billing.status", "==", "ready_to_bill"),
      limit(100)
    );

    const unsubFollowUp = onSnapshot(
      followUpQuery,
      (snap) => {
        setFollowUpTicketIds(snap.docs.map((d) => d.id));
      },
      () => setFollowUpTicketIds([])
    );

    const unsubReady = onSnapshot(
      readyToBillQuery,
      (snap) => {
        setReadyToBillTicketIds(snap.docs.map((d) => d.id));
      },
      () => setReadyToBillTicketIds([])
    );

    return () => {
      unsubFollowUp();
      unsubReady();
    };
  }, [showDashboard]);

  const dashboardAttentionCount = useMemo(() => {
    return new Set([...followUpTicketIds, ...readyToBillTicketIds]).size;
  }, [followUpTicketIds, readyToBillTicketIds]);

  const topNav: NavEntry[] = [
    ...(showDashboard
      ? [
          {
            href: "/dashboard",
            label: "Dashboard",
            icon: <DashboardRoundedIcon />,
            badgeCount: dashboardAttentionCount,
          },
        ]
      : []),
    ...(showDispatch
      ? [{ href: "/dispatch", label: "Dispatcher Board", icon: <MapRoundedIcon /> }]
      : []),
    ...(showMyDay
      ? [{ href: "/technician/my-day", label: "My Day", icon: <TodayRoundedIcon /> }]
      : []),
    ...(showSchedule
      ? [{ href: "/schedule", label: "Schedule", icon: <CalendarMonthRoundedIcon /> }]
      : []),
    ...(showOfficeDisplay
      ? [{ href: "/office-display", label: "Office Display", icon: <TvRoundedIcon /> }]
      : []),
    ...(showProjects
      ? [{ href: "/projects", label: "Projects", icon: <FolderRoundedIcon /> }]
      : []),
    ...(showWorkload
      ? [
          {
            href: "/technician-workload",
            label: "Technician Workload",
            icon: <AssignmentRoundedIcon />,
          },
        ]
      : []),
    { href: "/customers", label: "Customers", icon: <PeopleAltRoundedIcon /> },
    {
      href: "/service-tickets",
      label: "Service Tickets",
      icon: <ReceiptLongRoundedIcon />,
    },
    ...(showTimeEntries
      ? [
          {
            href: "/time-entries",
            label: "Time Entries",
            icon: <AccessTimeFilledRoundedIcon />,
          },
        ]
      : []),
    ...(showWeeklyTimesheet
      ? [
          {
            href: "/weekly-timesheet",
            label: "Weekly Timesheet",
            icon: <ViewWeekRoundedIcon />,
          },
        ]
      : []),
    ...(showPTORequests
      ? [
          {
            href: "/pto-requests",
            label: "PTO Requests",
            icon: <BeachAccessRoundedIcon />,
            badgeCount: pendingPtoCount,
          },
        ]
      : []),
    ...(showTimesheetReview
      ? [
          {
            href: "/timesheet-review",
            label: "Timesheet Review",
            icon: <TaskAltRoundedIcon />,
            badgeCount: pendingReviewCount,
          },
        ]
      : []),
  ];

  const bottomNav: NavEntry[] = [
    ...(showAdmin
      ? [{ href: "/admin", label: "Admin", icon: <AdminPanelSettingsRoundedIcon /> }]
      : []),
  ];

  const mobilePrimaryNav = useMemo<NavEntry[]>(() => {
    const items: NavEntry[] = [];

    if (showMyDay) {
      items.push({
        href: "/technician/my-day",
        label: "My Day",
        icon: <EventNoteRoundedIcon />,
      });
    }

    if (showSchedule) {
      items.push({
        href: "/schedule",
        label: "Schedule",
        icon: <CalendarMonthRoundedIcon />,
      });
    }

    items.push({
      href: "/service-tickets",
      label: "Tickets",
      icon: <ReceiptLongRoundedIcon />,
    });

    return items.slice(0, 3);
  }, [showMyDay, showSchedule]);

  const suppressGlobalActiveTripSurface = false;

  const mobileBottomNavValue = useMemo(() => {
    const activeItem = mobilePrimaryNav.find((item) =>
      isActivePath(pathname, item.href)
    );
    return activeItem?.href ?? "more";
  }, [pathname, mobilePrimaryNav]);

  const mobileBottomPadding =
    MOBILE_BOTTOM_NAV_HEIGHT +
    (activeTripCard && isMobile && !suppressGlobalActiveTripSurface
      ? MOBILE_ACTIVE_TRIP_HEIGHT
      : 0) +
    18;

  const mondayReminderBanner =
    showMondayReminder && showWeeklyTimesheet ? (
      <BannerCard
        severity="warning"
        title="Last week’s timesheet isn’t submitted yet"
        body={
          <>
            Week starting <strong>{prevWeekStart || "—"}</strong>
            {prevWeekStatus ? <> • Status: {prevWeekStatus}</> : null}
          </>
        }
        action={
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={() => router.push("/weekly-timesheet?weekOffset=-1")}
            >
              Review last week
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={dismissMondayReminderForToday}
            >
              Dismiss today
            </Button>
          </Stack>
        }
      />
    ) : null;

  const rejectedBanner =
    myRejectedCount > 0 && showWeeklyTimesheet ? (
      <BannerCard
        severity="error"
        title="Your timesheet was rejected and needs changes"
        body={
          <>
            {myRejectedCount} rejected timesheet{myRejectedCount === 1 ? "" : "s"} found.
          </>
        }
        action={
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => router.push("/weekly-timesheet?showRejected=1")}
          >
            Fix now
          </Button>
        }
      />
    ) : null;

  const drawerContent = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.paper",
      }}
    >
      <Box sx={{ p: 1.25 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 1.5,
            px: 1.25,
            py: 1.25,
            backgroundColor: alpha("#FFFFFF", 0.02),
            border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          }}
        >
          <Box sx={{ position: "relative", width: "100%", height: 52 }}>
            <Image
              src="/brand/dcflow-logo.png"
              alt="DCFlow"
              fill
              sizes="280px"
              style={{ objectFit: "contain" }}
              priority
            />
          </Box>

          <Typography
            variant="caption"
            sx={{ mt: 1, display: "block", color: "text.secondary" }}
          >
            {appUser?.displayName || "Unknown User"} • {appUser?.role || "No Role"}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ px: 1, pb: 1 }}>
        <NavList
          items={topNav}
          pathname={pathname}
          onNavigate={isMobile ? () => setDrawerOpen(false) : undefined}
        />
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ px: 1, pb: 1.25 }}>
        <Divider sx={{ mb: 1 }} />

        {bottomNav.length > 0 ? (
          <NavList
            items={bottomNav}
            pathname={pathname}
            onNavigate={isMobile ? () => setDrawerOpen(false) : undefined}
          />
        ) : null}

        <Box
          sx={{
            mt: bottomNav.length > 0 ? 0.75 : 0,
            "& button": {
              width: "100%",
              justifyContent: "flex-start",
              minHeight: 44,
              borderRadius: 1.25,
            },
          }}
        >
          <LogoutButton />
        </Box>
      </Box>
    </Box>
  );

  const tripAccentMain = isPaused
    ? theme.palette.warning.main
    : theme.palette.primary.main;
  const tripAccentSoft = alpha(tripAccentMain, 0.12);
  const tripAccentBorder = alpha(tripAccentMain, 0.24);

  const collapsedTripDock =
    isMobile &&
    activeTripCard &&
    !activeTripSheetOpen &&
    !suppressGlobalActiveTripSurface ? (
      <Paper
        elevation={6}
        onClick={() => setActiveTripSheetOpen(true)}
        sx={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: MOBILE_BOTTOM_NAV_HEIGHT + 16,
          zIndex: 1201,
          borderRadius: 3,
          border: `1px solid ${tripAccentBorder}`,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: "none",
          boxShadow: theme.shadows[8],
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <Box sx={{ px: 2, pt: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 1,
              backgroundColor: tripAccentSoft,
            }}
          />
        </Box>

        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, pb: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              backgroundColor: tripAccentSoft,
              color: tripAccentMain,
            }}
          >
            <PlayArrowRoundedIcon />
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: tripAccentMain }}>
                {isPaused ? "Paused" : "Running"}
              </Typography>

              <Chip
                size="small"
                label={`${liveMinutes} min`}
                variant="outlined"
                sx={{
                  color: tripAccentMain,
                  backgroundColor: tripAccentSoft,
                  borderColor: tripAccentBorder,
                  fontWeight: 700,
                }}
              />
            </Stack>

            <Typography variant="body2" sx={{ mt: 0.25 }} noWrap>
              {activeTripCard.primaryLine}
            </Typography>

            <Typography variant="caption" color="text.secondary" noWrap>
              {activeTripCard.secondaryLine}
            </Typography>
          </Box>

          <KeyboardArrowUpRoundedIcon sx={{ color: tripAccentMain }} />
        </Stack>
      </Paper>
    ) : null;

  const activeTripBottomSheet =
    isMobile && activeTripCard && !suppressGlobalActiveTripSurface ? (
      <SwipeableDrawer
        anchor="bottom"
        open={activeTripSheetOpen}
        onOpen={() => setActiveTripSheetOpen(true)}
        onClose={() => setActiveTripSheetOpen(false)}
        disableSwipeToOpen={false}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: theme.palette.background.paper,
            backgroundImage: "none",
            pb: "calc(16px + env(safe-area-inset-bottom))",
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 2,
              backgroundColor: tripAccentSoft,
            }}
          />

          <Stack spacing={2}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  backgroundColor: tripAccentSoft,
                  color: tripAccentMain,
                }}
              >
                <PlayArrowRoundedIcon />
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: tripAccentMain }}>
                  {isPaused ? "Paused" : "Running"}
                </Typography>
                <Typography variant="body2" noWrap>
                  {activeTripCard.primaryLine}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {activeTripCard.secondaryLine}
                </Typography>
              </Box>

              <IconButton onClick={() => setActiveTripSheetOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={700}>
              Trip Actions
            </Typography>

            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
              {canQuickAct ? (
                isPaused ? (
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<PlayArrowRoundedIcon />}
                    disabled={pillActionBusy}
                    onClick={async () => {
                      await handleQuickResume();
                      setActiveTripSheetOpen(false);
                    }}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<PauseRoundedIcon />}
                    disabled={pillActionBusy}
                    onClick={async () => {
                      await handleQuickPause();
                      setActiveTripSheetOpen(false);
                    }}
                  >
                    Pause Timer
                  </Button>
                )
              ) : (
                <Button
                  variant="outlined"
                  color={isPaused ? "warning" : "primary"}
                  startIcon={<ArrowOutwardRoundedIcon />}
                  onClick={() => {
                    router.push(activeTripCard.href);
                    setActiveTripSheetOpen(false);
                  }}
                >
                  Open Trip
                </Button>
              )}

              <Button
                variant="outlined"
                color={isPaused ? "warning" : "primary"}
                startIcon={<ReceiptLongRoundedIcon />}
                onClick={() => {
                  router.push(activeTripCard.href);
                  setActiveTripSheetOpen(false);
                }}
              >
                {hasServiceTicketTarget ? "Open Ticket" : "Open Trip"}
              </Button>

              {hasServiceTicketTarget ? (
                <>
                  <Button
                    variant="outlined"
                    color={isPaused ? "warning" : "primary"}
                    startIcon={<NoteAltOutlinedIcon />}
                    onClick={() => navigateToActiveTrip("note")}
                  >
                    Add Note
                  </Button>

                  <Button
                    variant="outlined"
                    color={isPaused ? "warning" : "primary"}
                    startIcon={<ArrowOutwardRoundedIcon />}
                    onClick={() => navigateToActiveTrip("follow_up")}
                  >
                    Follow-Up
                  </Button>

                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckRoundedIcon />}
                    sx={{ gridColumn: "1 / -1" }}
                    onClick={() => navigateToActiveTrip("resolved")}
                  >
                    Resolved
                  </Button>
                </>
              ) : null}
            </Box>
          </Stack>
        </Box>
      </SwipeableDrawer>
    ) : null;

  if (!isMobile) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          backgroundColor: "background.default",
          overflow: "hidden",
        }}
      >
        <Drawer
          variant="permanent"
          PaperProps={{
            sx: {
              width: DESKTOP_DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
          sx={{
            width: DESKTOP_DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DESKTOP_DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          {drawerContent}
        </Drawer>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: "100vh",
            overflow: "auto",
            backgroundColor: "background.default",
          }}
        >
          <Box
            sx={{
              maxWidth: 1600,
              mx: "auto",
              px: { xs: 2, md: 3 },
              py: 3,
            }}
          >
            {rejectedBanner}
            {mondayReminderBanner}
            {children}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar sx={{ minHeight: 64, px: 1.5 }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 1 }}
          >
            <MenuRoundedIcon />
          </IconButton>

          <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
            <WaterDropRoundedIcon color="primary" sx={{ fontSize: 18 }} />
            <Box minWidth={0}>
              <Typography variant="subtitle2">DCFlow</Typography>
              <Typography variant="caption" color="text.secondary">
                {appUser?.displayName || "Unknown User"}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1 }} />

          {activeTripCard ? (
            <Chip
              icon={<DirectionsRunRoundedIcon />}
              label={`${isPaused ? "Paused" : "Running"} • ${liveMinutes}m`}
              size="small"
              sx={{
                color: isPaused ? "warning.main" : "primary.main",
                backgroundColor: isPaused
                  ? alpha(theme.palette.warning.main, 0.12)
                  : alpha(theme.palette.primary.main, 0.12),
                border: `1px solid ${
                  isPaused
                    ? alpha(theme.palette.warning.main, 0.22)
                    : alpha(theme.palette.primary.main, 0.22)
                }`,
              }}
            />
          ) : null}
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: "84vw",
            maxWidth: 360,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          px: 1.5,
          pt: 1.5,
          pb: `${mobileBottomPadding}px`,
        }}
      >
        {rejectedBanner}
        {mondayReminderBanner}
        {children}
      </Box>

      {collapsedTripDock}
      {activeTripBottomSheet}

      <Paper
        elevation={0}
        sx={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 1200,
          borderRadius: 2.5,
          overflow: "hidden",
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          backgroundColor: "background.paper",
        }}
      >
        <BottomNavigation
          showLabels
          value={mobileBottomNavValue}
          onChange={(_, nextValue) => {
            if (nextValue === "more") {
              setDrawerOpen(true);
              return;
            }
            router.push(nextValue);
          }}
          sx={{
            height: MOBILE_BOTTOM_NAV_HEIGHT,
            background: "transparent",
          }}
        >
          {mobilePrimaryNav.map((item) => (
            <BottomNavigationAction
              key={item.href}
              label={item.label}
              value={item.href}
              icon={item.icon}
            />
          ))}

          <BottomNavigationAction
            label="More"
            value="more"
            icon={<MoreHorizRoundedIcon />}
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}