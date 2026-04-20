// app/trips/[tripId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import NoteAltRoundedIcon from "@mui/icons-material/NoteAltRounded";
import EditCalendarRoundedIcon from "@mui/icons-material/EditCalendarRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

type TripTimeWindow = "am" | "pm" | "all_day" | "custom";
type TripCloseoutDecision =
  | "done_today"
  | "stage_complete"
  | "project_complete"
  | "more_time_needed";

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

type TripDoc = {
  id: string;

  active: boolean;
  type: "service" | "project";
  status: string;

  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;

  crew?: TripCrew;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  };

  notes?: string | null;
  cancelReason?: string | null;

  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;

  sourceKey?: string;

  timerState?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;

  completedAt?: string | null;
  completedByUid?: string | null;

  closeoutDecision?: TripCloseoutDecision | null;
  closeoutNotes?: string | null;
  closeoutAt?: string | null;
  closeoutByUid?: string | null;

  needsMoreTime?: boolean | null;
  requestedReturnDate?: string | null;
  estimatedHoursRemaining?: number | null;

  completedEarly?: boolean | null;
  cancelledFutureTripCount?: number | null;
};

type ProjectLite = {
  id: string;
  projectName?: string;
  projectType?: string;
  active?: boolean;
  roughIn?: {
    status?: string;
    completedDate?: string | null;
  } | null;
  topOutVent?: {
    status?: string;
    completedDate?: string | null;
  } | null;
  trimFinish?: {
    status?: string;
    completedDate?: string | null;
  } | null;
  completedAt?: string | null;
  completedByUid?: string | null;
  completionNotes?: string | null;
  additionalTripRequested?: boolean | null;
  additionalTripRequestedAt?: string | null;
  additionalTripRequestedByUid?: string | null;
  additionalTripRequestedForStage?: string | null;
  additionalTripRequestedNote?: string | null;
  additionalTripRequestedReturnDate?: string | null;
  additionalTripRequestedHoursRemaining?: number | null;
};

type Props = {
  params: Promise<{ tripId: string }>;
};

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWindow(w: string) {
  if (w === "am") return "AM";
  if (w === "pm") return "PM";
  if (w === "all_day") return "All Day";
  if (w === "custom") return "Custom";
  return w || "—";
}

function stageLabel(stageKey?: string | null) {
  const key = String(stageKey || "").trim();
  if (key === "roughIn") return "Rough-In";
  if (key === "topOutVent") return "Top-Out / Vent";
  if (key === "trimFinish") return "Trim / Finish";
  if (key === "tm_work") return "T&M Work";
  return key || "—";
}

function normalizeTripStatus(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed") return "complete";
  return s;
}

function normalizeTimerState(timerState?: string | null, status?: string | null) {
  const ts = String(timerState || "").trim().toLowerCase();
  if (ts === "running" || ts === "paused" || ts === "complete") return ts;

  const s = normalizeTripStatus(status);
  if (s === "in_progress") return "running";
  if (s === "complete" || s === "cancelled") return "complete";
  return "not_started";
}

function parseIsoMs(iso?: string | null) {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

function minutesBetweenMs(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

function sumPausedMinutes(
  pauseBlocks?: PauseBlock[] | null,
  referenceNowMs: number = Date.now()
) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return 0;

  let total = 0;

  for (const p of pauseBlocks) {
    const s = parseIsoMs(p?.startAt || null);
    const e = p?.endAt ? parseIsoMs(p.endAt) : referenceNowMs;

    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    total += minutesBetweenMs(s, e);
  }

  return total;
}

function findOpenPauseIndex(pauseBlocks?: PauseBlock[] | null) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return -1;

  for (let i = pauseBlocks.length - 1; i >= 0; i -= 1) {
    if (pauseBlocks[i]?.startAt && !pauseBlocks[i]?.endAt) return i;
  }

  return -1;
}

function formatDurationMinutes(totalMinutes: number) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;

  if (hours <= 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

function compareTripSequence(a: TripDoc, b: TripDoc) {
  const aKey = `${safeTrim(a.date)}_${safeTrim(a.startTime) || "00:00"}_${a.id}`;
  const bKey = `${safeTrim(b.date)}_${safeTrim(b.startTime) || "00:00"}_${b.id}`;
  return aKey.localeCompare(bKey);
}

function isTimeMaterialsProject(projectType?: string) {
  const value = safeTrim(projectType).toLowerCase();
  return (
    value === "time_materials" ||
    value === "time+materials" ||
    value === "time_and_materials"
  );
}

function isUserOnCrew(uid: string, crew?: TripCrew) {
  const safeUid = safeTrim(uid);
  if (!safeUid) return false;

  return (
    safeTrim(crew?.primaryTechUid) === safeUid ||
    safeTrim(crew?.helperUid) === safeUid ||
    safeTrim(crew?.secondaryTechUid) === safeUid ||
    safeTrim(crew?.secondaryHelperUid) === safeUid
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            {icon}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              ) : null}
            </Box>
          </Stack>

          {action ? <Stack direction="row" spacing={1}>{action}</Stack> : null}
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>{children}</CardContent>
    </Card>
  );
}

export default function TripDetailPage({ params }: Props) {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const myUid = safeTrim(appUser?.uid);
  const role = safeTrim(appUser?.role);

  const canDispatch =
    role === "admin" || role === "dispatcher" || role === "manager";

  const [loading, setLoading] = useState(true);
  const [tripId, setTripId] = useState("");
  const [trip, setTrip] = useState<TripDoc | null>(null);
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [date, setDate] = useState("");
  const [timeWindow, setTimeWindow] = useState<TripTimeWindow>("am");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [closeoutChoice, setCloseoutChoice] =
    useState<TripCloseoutDecision>("done_today");
  const [closeoutNotes, setCloseoutNotes] = useState("");
  const [requestedReturnDate, setRequestedReturnDate] = useState("");
  const [estimatedHoursRemaining, setEstimatedHoursRemaining] = useState("");
  const [closeoutSaving, setCloseoutSaving] = useState(false);
  const [closeoutError, setCloseoutError] = useState("");

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!trip) return;

    const timerState = normalizeTimerState(trip.timerState, trip.status);
    if (timerState !== "running" && timerState !== "paused") return;

    const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [trip?.id, trip?.timerState, trip?.status]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      setSaveMsg("");

      try {
        const resolved = await params;
        const id = resolved.tripId;
        setTripId(id);

        const tripSnap = await getDoc(doc(db, "trips", id));
        if (!tripSnap.exists()) {
          setError("Trip not found.");
          setLoading(false);
          return;
        }

        const d = tripSnap.data() as any;

        const item: TripDoc = {
          id: tripSnap.id,
          active: d.active ?? true,
          type: d.type ?? "service",
          status: d.status ?? "planned",
          date: d.date ?? "",
          timeWindow: d.timeWindow ?? "custom",
          startTime: d.startTime ?? "",
          endTime: d.endTime ?? "",
          crew: d.crew ?? undefined,
          link: d.link ?? undefined,
          notes: d.notes ?? null,
          cancelReason: d.cancelReason ?? null,
          createdAt: d.createdAt ?? undefined,
          createdByUid: d.createdByUid ?? null,
          updatedAt: d.updatedAt ?? undefined,
          updatedByUid: d.updatedByUid ?? null,
          sourceKey: d.sourceKey ?? undefined,
          timerState: d.timerState ?? null,
          actualStartAt: d.actualStartAt ?? null,
          actualEndAt: d.actualEndAt ?? null,
          pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : null,
          completedAt: d.completedAt ?? null,
          completedByUid: d.completedByUid ?? null,
          closeoutDecision: d.closeoutDecision ?? null,
          closeoutNotes: d.closeoutNotes ?? null,
          closeoutAt: d.closeoutAt ?? null,
          closeoutByUid: d.closeoutByUid ?? null,
          needsMoreTime: d.needsMoreTime ?? null,
          requestedReturnDate: d.requestedReturnDate ?? null,
          estimatedHoursRemaining:
            typeof d.estimatedHoursRemaining === "number"
              ? d.estimatedHoursRemaining
              : null,
          completedEarly: d.completedEarly ?? null,
          cancelledFutureTripCount:
            typeof d.cancelledFutureTripCount === "number"
              ? d.cancelledFutureTripCount
              : null,
        };

        setTrip(item);

        setDate(item.date || "");
        setTimeWindow((item.timeWindow as TripTimeWindow) || "custom");
        setStartTime(item.startTime || "08:00");
        setEndTime(item.endTime || "12:00");
        setNotes(item.notes ?? "");
        setCancelReason(item.cancelReason ?? "");

        if (item.link?.projectId) {
          const projectSnap = await getDoc(doc(db, "projects", item.link.projectId));
          if (projectSnap.exists()) {
            const pd = projectSnap.data() as any;
            setProject({
              id: projectSnap.id,
              projectName: pd.projectName ?? "",
              projectType: pd.projectType ?? "",
              active: pd.active ?? true,
              roughIn: pd.roughIn ?? null,
              topOutVent: pd.topOutVent ?? null,
              trimFinish: pd.trimFinish ?? null,
              completedAt: pd.completedAt ?? null,
              completedByUid: pd.completedByUid ?? null,
              completionNotes: pd.completionNotes ?? null,
              additionalTripRequested: pd.additionalTripRequested ?? null,
              additionalTripRequestedAt: pd.additionalTripRequestedAt ?? null,
              additionalTripRequestedByUid: pd.additionalTripRequestedByUid ?? null,
              additionalTripRequestedForStage:
                pd.additionalTripRequestedForStage ?? null,
              additionalTripRequestedNote: pd.additionalTripRequestedNote ?? null,
              additionalTripRequestedReturnDate:
                pd.additionalTripRequestedReturnDate ?? null,
              additionalTripRequestedHoursRemaining:
                typeof pd.additionalTripRequestedHoursRemaining === "number"
                  ? pd.additionalTripRequestedHoursRemaining
                  : null,
            });
          } else {
            setProject(null);
          }
        } else {
          setProject(null);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load trip.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  const isProjectTrip = trip?.type === "project";
  const isServiceTrip = trip?.type === "service";
  const normalizedStatus = normalizeTripStatus(trip?.status);
  const normalizedTimer = normalizeTimerState(trip?.timerState, trip?.status);
  const isPaused = normalizedTimer === "paused";
  const isRunning = normalizedTimer === "running";
  const isComplete = normalizedStatus === "complete";
  const isCancelled = normalizedStatus === "cancelled";
  const isTmProject = isTimeMaterialsProject(project?.projectType);

  const canOperateProjectTrip = useMemo(() => {
    if (!trip || !isProjectTrip) return false;
    const elevated = canDispatch;
    return Boolean(myUid) && (elevated || isUserOnCrew(myUid, trip.crew));
  }, [trip, isProjectTrip, myUid, canDispatch]);

  const supportsStageCloseout = useMemo(() => {
    if (!isProjectTrip) return false;
    if (isTmProject) return false;
    return Boolean(safeTrim(trip?.link?.projectStageKey));
  }, [isProjectTrip, isTmProject, trip?.link?.projectStageKey]);

  const liveMinutes = useMemo(() => {
    if (!trip?.actualStartAt) return 0;

    const startMs = parseIsoMs(trip.actualStartAt);
    if (!Number.isFinite(startMs)) return 0;

    const endMs =
      normalizedTimer === "complete"
        ? parseIsoMs(trip.actualEndAt || null)
        : nowMs;

    const safeEndMs = Number.isFinite(endMs) ? endMs : nowMs;

    const grossMinutes = minutesBetweenMs(startMs, safeEndMs);
    const pausedMinutes = sumPausedMinutes(trip.pauseBlocks || null, safeEndMs);

    return Math.max(0, grossMinutes - pausedMinutes);
  }, [trip?.actualStartAt, trip?.actualEndAt, trip?.pauseBlocks, normalizedTimer, nowMs]);

  const backLink = useMemo(() => {
    const serviceTicketId = safeTrim(trip?.link?.serviceTicketId);
    const projectId = safeTrim(trip?.link?.projectId);

    if (serviceTicketId) {
      return {
        href: `/service-tickets/${serviceTicketId}`,
        label: "Back to Service Ticket",
      };
    }

    if (projectId) {
      return {
        href: `/projects/${projectId}`,
        label: "Back to Project",
      };
    }

    return { href: "/schedule", label: "Back to Weekly Schedule" };
  }, [trip]);

  const crewSummary = useMemo(() => {
    const c = trip?.crew || {};
    return {
      primary: c.primaryTechName || "Unassigned",
      helper: c.helperName || "—",
      secondaryTech: c.secondaryTechName || "—",
      secondaryHelper: c.secondaryHelperName || "—",
    };
  }, [trip]);

  const currentStageLabel = useMemo(() => {
    return stageLabel(trip?.link?.projectStageKey || null);
  }, [trip?.link?.projectStageKey]);

  function patchProjectStageLocally(
    stageKey: string | null | undefined,
    patch: Record<string, unknown>
  ) {
    const safeStage = safeTrim(stageKey);
    if (!safeStage) return;

    setProject((prev) => {
      if (!prev) return prev;
      const existing = (prev as any)[safeStage] || {};
      return {
        ...prev,
        [safeStage]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trip || !canDispatch) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    const nextDate = safeTrim(date);
    const nextStart = safeTrim(startTime);
    const nextEnd = safeTrim(endTime);

    if (!nextDate) {
      setSaving(false);
      setError("Date is required.");
      return;
    }

    if (!nextStart || !nextEnd) {
      setSaving(false);
      setError("Start and end time are required.");
      return;
    }

    if (nextEnd <= nextStart) {
      setSaving(false);
      setError("End time must be after start time.");
      return;
    }

    try {
      const stamp = nowIso();

      await updateDoc(doc(db, "trips", trip.id), {
        date: nextDate,
        timeWindow: timeWindow || "custom",
        startTime: nextStart,
        endTime: nextEnd,
        notes: safeTrim(notes) ? safeTrim(notes) : null,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          date: nextDate,
          timeWindow: timeWindow || "custom",
          startTime: nextStart,
          endTime: nextEnd,
          notes: safeTrim(notes) ? safeTrim(notes) : null,
          updatedAt: stamp,
          updatedByUid: myUid || null,
        };
      });

      setSaveMsg("✅ Trip updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update trip.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelTrip() {
    if (!trip || !canDispatch) return;

    const reason = safeTrim(cancelReason);
    if (!reason) {
      setError("Cancel reason is required.");
      return;
    }

    setCancelling(true);
    setError("");
    setSaveMsg("");

    try {
      const stamp = nowIso();

      await updateDoc(doc(db, "trips", trip.id), {
        status: "cancelled",
        active: false,
        cancelReason: reason,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "cancelled",
          active: false,
          cancelReason: reason,
          updatedAt: stamp,
          updatedByUid: myUid || null,
        };
      });

      setSaveMsg("✅ Trip cancelled (kept for history).");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel trip.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleStartProjectWork() {
    if (!trip || !isProjectTrip || !canOperateProjectTrip || actionBusy) return;
    if (isCancelled || isComplete) return;

    setActionBusy(true);
    setError("");
    setSaveMsg("");

    try {
      const stamp = nowIso();
      const tripRef = doc(db, "trips", trip.id);

      await updateDoc(tripRef, {
        status: "in_progress",
        timerState: "running",
        actualStartAt: trip.actualStartAt || stamp,
        actualEndAt: null,
        completedAt: null,
        completedByUid: null,
        updatedAt: stamp,
        updatedByUid: myUid || null,
        active: true,
      });

      if (trip.link?.projectId && trip.link?.projectStageKey && !isTmProject) {
        const projectRef = doc(db, "projects", trip.link.projectId);
        const stagePath = `${trip.link.projectStageKey}.status`;

        try {
          await updateDoc(projectRef, {
            [stagePath]: "in_progress",
            updatedAt: stamp,
          });
          patchProjectStageLocally(trip.link.projectStageKey, { status: "in_progress" });
        } catch {
          // non-blocking
        }
      }

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "in_progress",
          timerState: "running",
          actualStartAt: prev.actualStartAt || stamp,
          actualEndAt: null,
          completedAt: null,
          completedByUid: null,
          updatedAt: stamp,
          updatedByUid: myUid || null,
          active: true,
        };
      });

      setSaveMsg("✅ Project work started.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start project work.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePauseProjectWork() {
    if (!trip || !isProjectTrip || !canOperateProjectTrip || actionBusy) return;
    if (!isRunning) return;

    setActionBusy(true);
    setError("");
    setSaveMsg("");

    try {
      const stamp = nowIso();
      const tripRef = doc(db, "trips", trip.id);
      const pauseBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];

      if (findOpenPauseIndex(pauseBlocks) === -1) {
        pauseBlocks.push({ startAt: stamp, endAt: null });
      }

      await updateDoc(tripRef, {
        timerState: "paused",
        pauseBlocks,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          timerState: "paused",
          pauseBlocks,
          updatedAt: stamp,
          updatedByUid: myUid || null,
        };
      });

      setSaveMsg("⏸️ Project work paused.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to pause project work.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleResumeProjectWork() {
    if (!trip || !isProjectTrip || !canOperateProjectTrip || actionBusy) return;
    if (!isPaused) return;

    setActionBusy(true);
    setError("");
    setSaveMsg("");

    try {
      const stamp = nowIso();
      const tripRef = doc(db, "trips", trip.id);
      const pauseBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];
      const openIdx = findOpenPauseIndex(pauseBlocks);

      if (openIdx !== -1) {
        pauseBlocks[openIdx] = {
          ...pauseBlocks[openIdx],
          endAt: stamp,
        };
      }

      await updateDoc(tripRef, {
        timerState: "running",
        pauseBlocks,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          timerState: "running",
          pauseBlocks,
          updatedAt: stamp,
          updatedByUid: myUid || null,
        };
      });

      setSaveMsg("▶️ Project work resumed.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resume project work.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStopProjectWork() {
    if (!trip || !isProjectTrip || !canOperateProjectTrip || actionBusy) return;
    if (!isRunning && !isPaused) return;

    setActionBusy(true);
    setError("");
    setSaveMsg("");

    try {
      const stamp = nowIso();
      const tripRef = doc(db, "trips", trip.id);
      const pauseBlocks = Array.isArray(trip.pauseBlocks) ? [...trip.pauseBlocks] : [];
      const openIdx = findOpenPauseIndex(pauseBlocks);

      if (openIdx !== -1) {
        pauseBlocks[openIdx] = {
          ...pauseBlocks[openIdx],
          endAt: stamp,
        };
      }

      await updateDoc(tripRef, {
        status: "complete",
        timerState: "complete",
        actualStartAt: trip.actualStartAt || stamp,
        actualEndAt: stamp,
        pauseBlocks,
        completedAt: stamp,
        completedByUid: myUid || null,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "complete",
          timerState: "complete",
          actualStartAt: prev.actualStartAt || stamp,
          actualEndAt: stamp,
          pauseBlocks,
          completedAt: stamp,
          completedByUid: myUid || null,
          updatedAt: stamp,
          updatedByUid: myUid || null,
        };
      });

      setCloseoutChoice("done_today");
      setCloseoutNotes("");
      setRequestedReturnDate("");
      setEstimatedHoursRemaining("");
      setCloseoutError("");
      setCloseoutOpen(true);
      setSaveMsg("✅ Today's project work was logged. Choose the closeout result below.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to stop project work.");
    } finally {
      setActionBusy(false);
    }
  }

  async function submitProjectCloseout() {
    if (!trip || !project || !isProjectTrip) return;

    const projectId = safeTrim(trip.link?.projectId);
    if (!projectId) {
      setCloseoutError("This project trip is missing a linked project.");
      return;
    }

    const stageKey = safeTrim(trip.link?.projectStageKey);
    const closeoutNoteText = safeTrim(closeoutNotes);
    const returnDate = safeTrim(requestedReturnDate);
    const hoursRemainingText = safeTrim(estimatedHoursRemaining);
    const hoursRemainingNumber =
      hoursRemainingText === "" ? null : Number(hoursRemainingText);

    if (
      closeoutChoice === "more_time_needed" &&
      hoursRemainingText !== "" &&
      (!Number.isFinite(hoursRemainingNumber) || Number(hoursRemainingNumber) <= 0)
    ) {
      setCloseoutError("Estimated hours remaining must be a number greater than 0.");
      return;
    }

    if (closeoutChoice === "stage_complete" && !stageKey) {
      setCloseoutError("This trip does not have a stage to complete.");
      return;
    }

    setCloseoutSaving(true);
    setCloseoutError("");
    setError("");
    setSaveMsg("");

    try {
      const stamp = nowIso();
      const batch = writeBatch(db);
      const tripRef = doc(db, "trips", trip.id);
      const projectRef = doc(db, "projects", projectId);

      const projectUpdates: Record<string, unknown> = {
        updatedAt: stamp,
      };

      const tripUpdates: Record<string, unknown> = {
        closeoutDecision: closeoutChoice,
        closeoutNotes: closeoutNoteText || null,
        closeoutAt: stamp,
        closeoutByUid: myUid || null,
        needsMoreTime: closeoutChoice === "more_time_needed",
        requestedReturnDate:
          closeoutChoice === "more_time_needed" ? returnDate || null : null,
        estimatedHoursRemaining:
          closeoutChoice === "more_time_needed" ? hoursRemainingNumber : null,
        updatedAt: stamp,
        updatedByUid: myUid || null,
      };

      let cancelledFutureTripCount = 0;

      const tripsSnap = await getDocs(
        query(
          collection(db, "trips"),
          where("link.projectId", "==", projectId),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        )
      );

      const relatedTrips: TripDoc[] = tripsSnap.docs.map((ds) => {
        const d = ds.data() as any;
        return {
          id: ds.id,
          active: d.active ?? true,
          type: d.type ?? "project",
          status: d.status ?? "planned",
          date: d.date ?? "",
          timeWindow: d.timeWindow ?? "all_day",
          startTime: d.startTime ?? "",
          endTime: d.endTime ?? "",
          crew: d.crew ?? undefined,
          link: d.link ?? undefined,
          notes: d.notes ?? null,
          cancelReason: d.cancelReason ?? null,
        };
      });

      const current = relatedTrips.find((x) => x.id === trip.id) || trip;

      const futureTrips = relatedTrips.filter((candidate) => {
        if (candidate.id === current.id) return false;
        if (candidate.active === false) return false;

        const status = normalizeTripStatus(candidate.status);
        if (status === "cancelled") return false;

        const isFuture = compareTripSequence(candidate, current) > 0;
        if (!isFuture) return false;

        if (closeoutChoice === "stage_complete") {
          return safeTrim(candidate.link?.projectStageKey) === stageKey;
        }

        if (closeoutChoice === "project_complete") {
          return true;
        }

        return false;
      });

      if (closeoutChoice === "done_today") {
        if (stageKey && !isTmProject) {
          projectUpdates[`${stageKey}.status`] = "in_progress";
        }

        projectUpdates.additionalTripRequested = false;
        projectUpdates.additionalTripRequestedAt = null;
        projectUpdates.additionalTripRequestedByUid = null;
        projectUpdates.additionalTripRequestedForStage = null;
        projectUpdates.additionalTripRequestedNote = null;
        projectUpdates.additionalTripRequestedReturnDate = null;
        projectUpdates.additionalTripRequestedHoursRemaining = null;
      }

      if (closeoutChoice === "stage_complete") {
        projectUpdates[`${stageKey}.status`] = "complete";
        projectUpdates[`${stageKey}.completedDate`] = trip.date || isoTodayLocal();

        projectUpdates.additionalTripRequested = false;
        projectUpdates.additionalTripRequestedAt = null;
        projectUpdates.additionalTripRequestedByUid = null;
        projectUpdates.additionalTripRequestedForStage = null;
        projectUpdates.additionalTripRequestedNote = null;
        projectUpdates.additionalTripRequestedReturnDate = null;
        projectUpdates.additionalTripRequestedHoursRemaining = null;

        for (const futureTrip of futureTrips) {
          batch.update(doc(db, "trips", futureTrip.id), {
            status: "cancelled",
            active: false,
            cancelReason: `Stage completed early from trip ${trip.id}`,
            updatedAt: stamp,
            updatedByUid: myUid || null,
          });
          cancelledFutureTripCount += 1;
        }
      }

      if (closeoutChoice === "project_complete") {
        if (stageKey && !isTmProject) {
          projectUpdates[`${stageKey}.status`] = "complete";
          projectUpdates[`${stageKey}.completedDate`] = trip.date || isoTodayLocal();
        }

        projectUpdates.active = false;
        projectUpdates.completedAt = stamp;
        projectUpdates.completedByUid = myUid || null;
        projectUpdates.completionNotes = closeoutNoteText || null;

        projectUpdates.additionalTripRequested = false;
        projectUpdates.additionalTripRequestedAt = null;
        projectUpdates.additionalTripRequestedByUid = null;
        projectUpdates.additionalTripRequestedForStage = null;
        projectUpdates.additionalTripRequestedNote = null;
        projectUpdates.additionalTripRequestedReturnDate = null;
        projectUpdates.additionalTripRequestedHoursRemaining = null;

        for (const futureTrip of futureTrips) {
          batch.update(doc(db, "trips", futureTrip.id), {
            status: "cancelled",
            active: false,
            cancelReason: `Project completed early from trip ${trip.id}`,
            updatedAt: stamp,
            updatedByUid: myUid || null,
          });
          cancelledFutureTripCount += 1;
        }
      }

      if (closeoutChoice === "more_time_needed") {
        if (stageKey && !isTmProject) {
          projectUpdates[`${stageKey}.status`] = "in_progress";
        }

        projectUpdates.active = true;
        projectUpdates.additionalTripRequested = true;
        projectUpdates.additionalTripRequestedAt = stamp;
        projectUpdates.additionalTripRequestedByUid = myUid || null;
        projectUpdates.additionalTripRequestedForStage = stageKey || null;
        projectUpdates.additionalTripRequestedNote = closeoutNoteText || null;
        projectUpdates.additionalTripRequestedReturnDate = returnDate || null;
        projectUpdates.additionalTripRequestedHoursRemaining = hoursRemainingNumber;
      }

      tripUpdates.completedEarly = cancelledFutureTripCount > 0;
      tripUpdates.cancelledFutureTripCount = cancelledFutureTripCount;

      batch.update(tripRef, tripUpdates);
      batch.update(projectRef, projectUpdates);

      await batch.commit();

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          closeoutDecision: closeoutChoice,
          closeoutNotes: closeoutNoteText || null,
          closeoutAt: stamp,
          closeoutByUid: myUid || null,
          needsMoreTime: closeoutChoice === "more_time_needed",
          requestedReturnDate:
            closeoutChoice === "more_time_needed" ? returnDate || null : null,
          estimatedHoursRemaining:
            closeoutChoice === "more_time_needed" ? hoursRemainingNumber : null,
          completedEarly: cancelledFutureTripCount > 0,
          cancelledFutureTripCount,
          updatedAt: stamp,
          updatedByUid: myUid || null,
        };
      });

      if (closeoutChoice === "done_today") {
        if (stageKey && !isTmProject) {
          patchProjectStageLocally(stageKey, { status: "in_progress" });
        }

        setProject((prev) =>
          prev
            ? {
                ...prev,
                additionalTripRequested: false,
                additionalTripRequestedAt: null,
                additionalTripRequestedByUid: null,
                additionalTripRequestedForStage: null,
                additionalTripRequestedNote: null,
                additionalTripRequestedReturnDate: null,
                additionalTripRequestedHoursRemaining: null,
              }
            : prev
        );

        setSaveMsg("✅ Project closeout saved as done for today.");
      }

      if (closeoutChoice === "stage_complete") {
        patchProjectStageLocally(stageKey, {
          status: "complete",
          completedDate: trip.date || isoTodayLocal(),
        });

        setProject((prev) =>
          prev
            ? {
                ...prev,
                additionalTripRequested: false,
                additionalTripRequestedAt: null,
                additionalTripRequestedByUid: null,
                additionalTripRequestedForStage: null,
                additionalTripRequestedNote: null,
                additionalTripRequestedReturnDate: null,
                additionalTripRequestedHoursRemaining: null,
              }
            : prev
        );

        setSaveMsg(
          `✅ Stage marked complete.${cancelledFutureTripCount > 0 ? ` ${cancelledFutureTripCount} future trip(s) cancelled.` : ""}`
        );
      }

      if (closeoutChoice === "project_complete") {
        if (stageKey && !isTmProject) {
          patchProjectStageLocally(stageKey, {
            status: "complete",
            completedDate: trip.date || isoTodayLocal(),
          });
        }

        setProject((prev) =>
          prev
            ? {
                ...prev,
                active: false,
                completedAt: stamp,
                completedByUid: myUid || null,
                completionNotes: closeoutNoteText || null,
                additionalTripRequested: false,
                additionalTripRequestedAt: null,
                additionalTripRequestedByUid: null,
                additionalTripRequestedForStage: null,
                additionalTripRequestedNote: null,
                additionalTripRequestedReturnDate: null,
                additionalTripRequestedHoursRemaining: null,
              }
            : prev
        );

        setSaveMsg(
          `✅ Entire project marked complete.${cancelledFutureTripCount > 0 ? ` ${cancelledFutureTripCount} future trip(s) cancelled.` : ""}`
        );
      }

      if (closeoutChoice === "more_time_needed") {
        if (stageKey && !isTmProject) {
          patchProjectStageLocally(stageKey, { status: "in_progress" });
        }

        setProject((prev) =>
          prev
            ? {
                ...prev,
                active: true,
                additionalTripRequested: true,
                additionalTripRequestedAt: stamp,
                additionalTripRequestedByUid: myUid || null,
                additionalTripRequestedForStage: stageKey || null,
                additionalTripRequestedNote: closeoutNoteText || null,
                additionalTripRequestedReturnDate: returnDate || null,
                additionalTripRequestedHoursRemaining: hoursRemainingNumber,
              }
            : prev
        );

        setSaveMsg("✅ More-time-needed request saved for office follow-up.");
      }

      setCloseoutOpen(false);
    } catch (err: unknown) {
      setCloseoutError(
        err instanceof Error ? err.message : "Failed to save project closeout."
      );
    } finally {
      setCloseoutSaving(false);
    }
  }

  const showOpenCloseoutButton =
    isProjectTrip &&
    isComplete &&
    !isCancelled &&
    !safeTrim(trip?.closeoutDecision);

  const closeoutChoiceLabel = useMemo(() => {
    if (!trip?.closeoutDecision) return "";
    if (trip.closeoutDecision === "done_today") return "Done for today";
    if (trip.closeoutDecision === "stage_complete") return "Stage complete";
    if (trip.closeoutDecision === "project_complete") {
      return supportsStageCloseout ? "Project complete" : "Work complete";
    }
    if (trip.closeoutDecision === "more_time_needed") return "More time needed";
    return trip.closeoutDecision;
  }, [trip?.closeoutDecision, supportsStageCloseout]);

  return (
    <ProtectedPage fallbackTitle="Trip Detail">
      <AppShell appUser={appUser}>
        <Dialog
          open={closeoutOpen}
          onClose={closeoutSaving ? undefined : () => setCloseoutOpen(false)}
          fullWidth
          maxWidth="sm"
          PaperProps={{ sx: { borderRadius: 4 } }}
        >
          <DialogTitle>Project Closeout</DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="info" variant="outlined">
                Stopping a project trip only logs <strong>today’s work session</strong>.
                Choose what should happen to the stage or project next.
              </Alert>

              <RadioGroup
                value={closeoutChoice}
                onChange={(e) =>
                  setCloseoutChoice(e.target.value as TripCloseoutDecision)
                }
              >
                <FormControlLabel
                  value="done_today"
                  control={<Radio />}
                  label="Done for today"
                />

                {supportsStageCloseout ? (
                  <FormControlLabel
                    value="stage_complete"
                    control={<Radio />}
                    label={`Mark ${currentStageLabel} complete`}
                  />
                ) : null}

                <FormControlLabel
                  value="project_complete"
                  control={<Radio />}
                  label={supportsStageCloseout ? "Mark entire project complete" : "Work complete"}
                />

                <FormControlLabel
                  value="more_time_needed"
                  control={<Radio />}
                  label="More time needed"
                />
              </RadioGroup>

              {closeoutChoice === "more_time_needed" ? (
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                    },
                  }}
                >
                  <TextField
                    label="Requested Return Date"
                    type="date"
                    value={requestedReturnDate}
                    onChange={(e) => setRequestedReturnDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    disabled={closeoutSaving}
                    fullWidth
                  />

                  <TextField
                    label="Estimated Hours Remaining"
                    type="number"
                    inputProps={{ min: 0.25, step: 0.25 }}
                    value={estimatedHoursRemaining}
                    onChange={(e) => setEstimatedHoursRemaining(e.target.value)}
                    disabled={closeoutSaving}
                    fullWidth
                  />
                </Box>
              ) : null}

              {(closeoutChoice === "stage_complete" ||
                closeoutChoice === "project_complete") ? (
                <Alert severity="warning" variant="outlined">
                  Any future scheduled project trips that are no longer needed will be
                  cancelled and kept for history.
                </Alert>
              ) : null}

              <TextField
                label="Closeout Notes"
                value={closeoutNotes}
                onChange={(e) => setCloseoutNotes(e.target.value)}
                multiline
                minRows={4}
                disabled={closeoutSaving}
                placeholder={
                  closeoutChoice === "more_time_needed"
                    ? "What remains, what is needed next, or why another trip is required..."
                    : "Optional field notes for office/admin..."
                }
                fullWidth
              />

              {closeoutError ? <Alert severity="error">{closeoutError}</Alert> : null}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button
              onClick={() => setCloseoutOpen(false)}
              disabled={closeoutSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={submitProjectCloseout}
              disabled={closeoutSaving}
              variant="contained"
            >
              {closeoutSaving ? "Saving..." : "Save Closeout"}
            </Button>
          </DialogActions>
        </Dialog>

        <Box
          sx={{
            minHeight: "100%",
            bgcolor: "background.default",
            px: { xs: 1, sm: 2, md: 3 },
            py: { xs: 2, md: 3 },
          }}
        >
          {loading ? <Typography>Loading trip...</Typography> : null}
          {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
          {saveMsg ? <Alert severity="success" sx={{ mb: 2 }}>{saveMsg}</Alert> : null}

          {!loading && trip ? (
            <Stack spacing={2.5} sx={{ maxWidth: 1100 }}>
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 2, sm: 3 },
                  borderRadius: 4,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  background:
                    theme.palette.mode === "light"
                      ? `linear-gradient(180deg, ${alpha(
                          theme.palette.primary.main,
                          0.06
                        )}, ${alpha(theme.palette.primary.main, 0.01)})`
                      : undefined,
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                >
                  <Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        icon={isProjectTrip ? <ConstructionRoundedIcon /> : <TaskAltRoundedIcon />}
                        label={isProjectTrip ? "Project Trip" : "Service Trip"}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={normalizeTripStatus(trip.status).replaceAll("_", " ").toUpperCase()}
                        color={
                          normalizedStatus === "cancelled"
                            ? "error"
                            : normalizedStatus === "complete"
                            ? "success"
                            : normalizedStatus === "in_progress"
                            ? "warning"
                            : "default"
                        }
                        variant="outlined"
                        size="small"
                      />
                      {isProjectTrip && project?.projectType ? (
                        <Chip
                          label={project.projectType}
                          variant="outlined"
                          size="small"
                        />
                      ) : null}
                    </Stack>

                    <Typography variant="h4" sx={{ fontWeight: 900, mt: 1.25 }}>
                      Trip • {trip.date} • {formatWindow(String(trip.timeWindow || ""))} •{" "}
                      {trip.startTime}-{trip.endTime}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      Trip ID:{" "}
                      <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                        {tripId}
                      </Box>
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      Status: <strong>{trip.status}</strong> • Active:{" "}
                      <strong>{String(trip.active)}</strong>
                    </Typography>
                  </Box>

                  <Button
                    component={Link}
                    href={backLink.href}
                    variant="outlined"
                    startIcon={<ArrowBackRoundedIcon />}
                  >
                    {backLink.label}
                  </Button>
                </Stack>
              </Paper>

              {isProjectTrip ? (
                <SectionCard
                  title="Project Work Session"
                  subtitle={
                    isTmProject
                      ? "Time + Materials trips work as daily labor sessions with explicit closeout."
                      : "Stopping the timer ends today’s work only. Stage and project completion are separate closeout decisions."
                  }
                  icon={<ScheduleRoundedIcon color="primary" />}
                  action={
                    <Chip
                      label={
                        normalizedTimer === "running"
                          ? "Running"
                          : normalizedTimer === "paused"
                          ? "Paused"
                          : normalizedTimer === "complete"
                          ? "Stopped"
                          : "Not started"
                      }
                      color={
                        normalizedTimer === "running"
                          ? "success"
                          : normalizedTimer === "paused"
                          ? "warning"
                          : normalizedTimer === "complete"
                          ? "default"
                          : "default"
                      }
                      variant="outlined"
                      size="small"
                    />
                  }
                >
                  <Stack spacing={2}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 4,
                        bgcolor: alpha(theme.palette.primary.main, 0.03),
                      }}
                    >
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={2}
                        alignItems={{ xs: "flex-start", md: "center" }}
                        justifyContent="space-between"
                      >
                        <Box>
                          <Typography variant="overline" color="text.secondary">
                            Logged session time
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 900 }}>
                            {formatDurationMinutes(liveMinutes)}
                          </Typography>

                          <Stack
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            useFlexGap
                            sx={{ mt: 1 }}
                          >
                            {project?.projectName ? (
                              <Chip
                                size="small"
                                label={project.projectName}
                                variant="outlined"
                              />
                            ) : null}

                            {supportsStageCloseout ? (
                              <Chip
                                size="small"
                                label={currentStageLabel}
                                variant="outlined"
                              />
                            ) : (
                              <Chip
                                size="small"
                                label="T&M / Non-stage project work"
                                variant="outlined"
                              />
                            )}
                          </Stack>
                        </Box>

                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                        >
                          <Button
                            variant="contained"
                            startIcon={<PlayArrowRoundedIcon />}
                            onClick={handleStartProjectWork}
                            disabled={
                              actionBusy ||
                              !canOperateProjectTrip ||
                              isCancelled ||
                              isComplete ||
                              normalizedTimer === "running" ||
                              normalizedTimer === "paused"
                            }
                          >
                            Start Work
                          </Button>

                          <Button
                            variant="outlined"
                            startIcon={<PauseRoundedIcon />}
                            onClick={handlePauseProjectWork}
                            disabled={
                              actionBusy ||
                              !canOperateProjectTrip ||
                              isCancelled ||
                              !isRunning
                            }
                          >
                            Pause
                          </Button>

                          <Button
                            variant="outlined"
                            startIcon={<PlayArrowRoundedIcon />}
                            onClick={handleResumeProjectWork}
                            disabled={
                              actionBusy ||
                              !canOperateProjectTrip ||
                              isCancelled ||
                              !isPaused
                            }
                          >
                            Resume
                          </Button>

                          <Button
                            variant="contained"
                            color="warning"
                            startIcon={<StopRoundedIcon />}
                            onClick={handleStopProjectWork}
                            disabled={
                              actionBusy ||
                              !canOperateProjectTrip ||
                              isCancelled ||
                              (!isRunning && !isPaused)
                            }
                          >
                            Stop Work
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>

                    {!canOperateProjectTrip ? (
                      <Typography variant="body2" color="text.secondary">
                        Only assigned crew members or Admin / Dispatcher / Manager can run the
                        project trip timer.
                      </Typography>
                    ) : null}

                    {showOpenCloseoutButton ? (
                      <Alert
                        severity="info"
                        variant="outlined"
                        action={
                          <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                              setCloseoutChoice("done_today");
                              setCloseoutNotes(safeTrim(trip.closeoutNotes));
                              setRequestedReturnDate(
                                safeTrim(trip.requestedReturnDate)
                              );
                              setEstimatedHoursRemaining(
                                trip.estimatedHoursRemaining != null
                                  ? String(trip.estimatedHoursRemaining)
                                  : ""
                              );
                              setCloseoutError("");
                              setCloseoutOpen(true);
                            }}
                          >
                            Open Closeout
                          </Button>
                        }
                      >
                        This trip was stopped, but the project closeout decision has not been saved yet.
                      </Alert>
                    ) : null}

                    {trip.closeoutDecision ? (
                      <Alert severity="success" variant="outlined">
                        <Typography sx={{ fontWeight: 700 }}>
                          Closeout: {closeoutChoiceLabel}
                        </Typography>

                        {trip.closeoutNotes ? (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {trip.closeoutNotes}
                          </Typography>
                        ) : null}

                        {trip.needsMoreTime ? (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            Requested return date:{" "}
                            <strong>{trip.requestedReturnDate || "—"}</strong> • Estimated hours
                            remaining:{" "}
                            <strong>
                              {trip.estimatedHoursRemaining != null
                                ? trip.estimatedHoursRemaining
                                : "—"}
                            </strong>
                          </Typography>
                        ) : null}

                        {trip.cancelledFutureTripCount ? (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            Future trips cancelled: <strong>{trip.cancelledFutureTripCount}</strong>
                          </Typography>
                        ) : null}
                      </Alert>
                    ) : null}
                  </Stack>
                </SectionCard>
              ) : null}

              <SectionCard
                title="Crew"
                subtitle="Assigned crew on this trip"
                icon={<EngineeringRoundedIcon color="primary" />}
              >
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                    },
                  }}
                >
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Primary Tech
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {crewSummary.primary}
                    </Typography>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Helper
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {crewSummary.helper}
                    </Typography>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Secondary Tech
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {crewSummary.secondaryTech}
                    </Typography>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Secondary Helper
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {crewSummary.secondaryHelper}
                    </Typography>
                  </Paper>
                </Box>
              </SectionCard>

              <SectionCard
                title="Linked To"
                subtitle="Where this trip belongs"
                icon={<TaskAltRoundedIcon color="primary" />}
              >
                <Stack spacing={1.25}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Type:</strong> {trip.type}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    <strong>Service Ticket:</strong>{" "}
                    {trip.link?.serviceTicketId ? (
                      <Link href={`/service-tickets/${trip.link.serviceTicketId}`}>
                        {trip.link.serviceTicketId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    <strong>Project:</strong>{" "}
                    {trip.link?.projectId ? (
                      <Link href={`/projects/${trip.link.projectId}`}>
                        {trip.link.projectId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    <strong>Project Stage:</strong> {trip.link?.projectStageKey || "—"}
                  </Typography>

                  {project?.projectType ? (
                    <Typography variant="body2" color="text.secondary">
                      <strong>Project Type:</strong> {project.projectType}
                    </Typography>
                  ) : null}

                  <Typography variant="caption" color="text.disabled">
                    SourceKey: {trip.sourceKey || "—"}
                  </Typography>
                </Stack>
              </SectionCard>

              <SectionCard
                title="Edit / Reschedule"
                subtitle="Dispatch-only trip editing"
                icon={<EditCalendarRoundedIcon color="primary" />}
              >
                {!canDispatch ? (
                  <Typography color="text.secondary">
                    Only Admin / Dispatcher / Manager can edit trips.
                  </Typography>
                ) : (
                  <Box component="form" onSubmit={handleSave}>
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                          },
                        }}
                      >
                        <TextField
                          label="Date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          disabled={saving || cancelling}
                          fullWidth
                        />

                        <TextField
                          label="Time Window"
                          select
                          value={timeWindow}
                          onChange={(e) =>
                            setTimeWindow(e.target.value as TripTimeWindow)
                          }
                          disabled={saving || cancelling}
                          fullWidth
                        >
                          <MenuItem value="am">AM</MenuItem>
                          <MenuItem value="pm">PM</MenuItem>
                          <MenuItem value="all_day">All Day</MenuItem>
                          <MenuItem value="custom">Custom</MenuItem>
                        </TextField>

                        <TextField
                          label="Start Time"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          disabled={saving || cancelling}
                          fullWidth
                        />

                        <TextField
                          label="End Time"
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          disabled={saving || cancelling}
                          fullWidth
                        />
                      </Box>

                      <TextField
                        label="Notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        multiline
                        minRows={3}
                        disabled={saving || cancelling}
                        fullWidth
                      />

                      <Button
                        type="submit"
                        variant="contained"
                        sx={{ width: "fit-content" }}
                        disabled={saving || cancelling}
                      >
                        {saving ? "Saving..." : "Save Trip Changes"}
                      </Button>
                    </Stack>
                  </Box>
                )}
              </SectionCard>

              <SectionCard
                title="Cancel Trip"
                subtitle="Cancelling keeps the trip for history and audit"
                icon={<CancelRoundedIcon color="error" />}
              >
                <Stack spacing={2}>
                  <Alert severity="warning" variant="outlined" icon={<WarningAmberRoundedIcon />}>
                    Cancelling sets <strong>active=false</strong> and <strong>status=cancelled</strong>,
                    but the trip remains in the system for history.
                  </Alert>

                  <TextField
                    label="Cancel Reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    disabled={!canDispatch || cancelling || saving}
                    placeholder="Customer rescheduled, rain day, tech out sick..."
                    fullWidth
                  />

                  <Button
                    type="button"
                    variant="outlined"
                    color="error"
                    onClick={handleCancelTrip}
                    disabled={!canDispatch || cancelling || saving}
                    sx={{ width: "fit-content" }}
                  >
                    {cancelling ? "Cancelling..." : "Cancel Trip"}
                  </Button>
                </Stack>
              </SectionCard>
            </Stack>
          ) : null}
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}