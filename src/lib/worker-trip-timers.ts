import {
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type Firestore,
} from "firebase/firestore";

export type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

export type WorkerTripTimerStatus = "running" | "paused" | "complete";

export type TripParticipationRole = "technician" | "helper";

export type ParticipationWindow = {
  joinedAt: string;
  leftAt: string | null;
  participationRole: TripParticipationRole;
  systemJoinedAt?: string | null;
};

export type WorkerTimeAdjustmentHistoryEntry = {
  previousJoinedAt: string;
  previousLeftAt: string | null;
  effectiveJoinedAt: string;
  effectiveLeftAt: string;
  adjustedAt: string;
  adjustedByUid: string | null;
  adjustedByName: string | null;
  adjustedByRole: string | null;
};

export type WorkerTripTimer = {
  status: WorkerTripTimerStatus;
  startedAt: string;
  endedAt?: string | null;
  pauseBlocks: PauseBlock[];
  updatedAt: string;
  updatedByUid?: string | null;
  workerName?: string | null;
  participationRole?: TripParticipationRole | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  systemAddedAt?: string | null;
  effectiveJoinedAt?: string | null;
  addedMidTrip?: boolean;
  addedByUid?: string | null;
  addedByName?: string | null;
  addedByRole?: string | null;
  removedByUid?: string | null;
  removedByName?: string | null;
  removedByRole?: string | null;
  participationWindows?: ParticipationWindow[];
  timeAdjustmentHistory?: WorkerTimeAdjustmentHistoryEntry[];
};

export type WorkerTimersByUid = Record<string, WorkerTripTimer>;

export type TripTimerCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  primaryTechRole?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  helperRole?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryTechRole?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
  secondaryHelperRole?: string | null;
};

export type CrewChangeHistoryEntry = {
  action: "added" | "removed";
  workerUid: string;
  workerName: string;
  participationRole: TripParticipationRole;
  at: string;
  effectiveAt?: string | null;
  actorUid: string | null;
  actorName: string | null;
  actorRole: string | null;
};

export type TripTimerLike = {
  id: string;
  active?: boolean;
  status?: string | null;
  timerState?: string | null;
  actualStartAt?: string | null;
  startedAt?: string | null;
  actualEndAt?: string | null;
  completedAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  crew?: TripTimerCrew | null;
  crewConfirmed?: TripTimerCrew | null;
  workerTimers?: WorkerTimersByUid | null;
  crewChangeHistory?: CrewChangeHistoryEntry[] | null;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  } | null;
};

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value?: string | null) {
  const status = safeTrim(value).toLowerCase();
  return status === "completed" ? "complete" : status;
}

function normalizeTimerState(value?: string | null, status?: string | null) {
  const timer = safeTrim(value).toLowerCase();
  if (timer === "running" || timer === "paused" || timer === "complete") {
    return timer;
  }

  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "in_progress") return "running";
  if (normalizedStatus === "complete" || normalizedStatus === "cancelled") {
    return "complete";
  }
  return "not_started";
}

export function getCrewUids(crew?: TripTimerCrew | null) {
  return Array.from(
    new Set(
      [
        safeTrim(crew?.primaryTechUid),
        safeTrim(crew?.helperUid),
        safeTrim(crew?.secondaryTechUid),
        safeTrim(crew?.secondaryHelperUid),
      ].filter(Boolean),
    ),
  );
}

export function getTripCrewUids(
  trip: Pick<TripTimerLike, "crew" | "crewConfirmed">,
) {
  return Array.from(
    new Set([
      ...getCrewUids(trip.crew),
      ...getCrewUids(trip.crewConfirmed),
    ]),
  );
}

function parseIsoMs(value?: string | null) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

function minutesBetween(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs) || bMs <= aMs) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

export function findOpenPauseIndex(blocks?: PauseBlock[] | null) {
  if (!Array.isArray(blocks)) return -1;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.startAt && !block.endAt) return index;
  }
  return -1;
}

export function sumWorkerPausedMinutes(
  blocks?: PauseBlock[] | null,
  referenceMs = Date.now(),
) {
  if (!Array.isArray(blocks)) return 0;

  return blocks.reduce((total, block) => {
    const startMs = parseIsoMs(block?.startAt || null);
    const endMs = block?.endAt ? parseIsoMs(block.endAt) : referenceMs;
    return total + minutesBetween(startMs, endMs);
  }, 0);
}

function legacyTimerForWorker(
  trip: TripTimerLike,
  workerUid: string,
  stamp: string,
): WorkerTripTimer | null {
  if (!getTripCrewUids(trip).includes(workerUid)) return null;

  const state = normalizeTimerState(trip.timerState, trip.status);
  if (state === "not_started") return null;

  const startedAt =
    safeTrim(trip.actualStartAt) || safeTrim(trip.startedAt) || stamp;
  const pauseBlocks = Array.isArray(trip.pauseBlocks)
    ? trip.pauseBlocks.map((block) => ({ ...block }))
    : [];
  const crew = trip.crewConfirmed || trip.crew;
  const participationRole = timerRoleFromCrew(crew, workerUid);
  const workerName = timerNameFromCrew(crew, workerUid);

  return {
    status: state === "complete" ? "complete" : state,
    startedAt,
    endedAt:
      state === "complete"
        ? safeTrim(trip.actualEndAt) || safeTrim(trip.completedAt) || stamp
        : null,
    pauseBlocks,
    updatedAt: stamp,
    updatedByUid: null,
    workerName,
    participationRole,
    joinedAt: startedAt,
    leftAt:
      state === "complete"
        ? safeTrim(trip.actualEndAt) || safeTrim(trip.completedAt) || stamp
        : null,
    addedMidTrip: false,
    participationWindows: [
      {
        joinedAt: startedAt,
        leftAt:
          state === "complete"
            ? safeTrim(trip.actualEndAt) || safeTrim(trip.completedAt) || stamp
            : null,
        participationRole,
      },
    ],
  };
}

export function materializeWorkerTimers(
  trip: TripTimerLike,
  stamp: string,
): WorkerTimersByUid {
  const existing =
    trip.workerTimers && typeof trip.workerTimers === "object"
      ? { ...trip.workerTimers }
      : {};

  for (const uid of getTripCrewUids(trip)) {
    if (existing[uid]) continue;
    const legacy = legacyTimerForWorker(trip, uid, stamp);
    if (legacy) existing[uid] = legacy;
  }

  return existing;
}

export function getWorkerTimer(
  trip: TripTimerLike | null | undefined,
  workerUid: string,
  referenceStamp = new Date().toISOString(),
) {
  if (!trip || !workerUid) return null;
  return materializeWorkerTimers(trip, referenceStamp)[workerUid] || null;
}

export function getWorkerTimerStatus(
  trip: TripTimerLike | null | undefined,
  workerUid: string,
) {
  return getWorkerTimer(trip, workerUid)?.status || "not_started";
}

/** Net elapsed minutes, subtracting only pauses within the timer's boundaries.
 * Overlapping pause blocks are merged so they cannot be counted twice. */
function getNetElapsedMinutes(startMs: number, endMs: number, blocks?: PauseBlock[] | null) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  const gross = minutesBetween(startMs, endMs);
  const windows = (blocks || []).map((block) => {
    const begin = parseIsoMs(block.startAt);
    const finish = block.endAt ? parseIsoMs(block.endAt) : endMs;
    return { begin: Math.max(startMs, begin), finish: Math.min(endMs, finish) };
  }).filter(({begin, finish}) => Number.isFinite(begin) && Number.isFinite(finish) && finish > begin)
    .sort((a, b) => a.begin - b.begin);
  let pausedMs = 0;
  let lastEnd = startMs;
  for (const { begin, finish } of windows) {
    pausedMs += Math.max(0, finish - Math.max(begin, lastEnd));
    lastEnd = Math.max(lastEnd, finish);
  }
  return Math.max(0, gross - Math.round(pausedMs / 60000));
}

export function getWorkerTimerMinutesAt(trip: TripTimerLike, workerUid: string, referenceMs: number) {
  const timer = getWorkerTimer(trip, workerUid, new Date(referenceMs).toISOString());
  if (!timer) return null;
  const participationWindows = Array.isArray(timer.participationWindows)
    ? timer.participationWindows.filter((window) => safeTrim(window?.joinedAt))
    : [];
  if (participationWindows.length > 0) {
    return participationWindows.reduce((total, window) => {
      const startMs = parseIsoMs(window.joinedAt);
      const endMs = window.leftAt ? parseIsoMs(window.leftAt) : referenceMs;
      return total + (getNetElapsedMinutes(startMs, endMs, timer.pauseBlocks) || 0);
    }, 0);
  }
  const startMs = parseIsoMs(timer.startedAt);
  const endMs = timer.status === "complete" && timer.endedAt
    ? parseIsoMs(timer.endedAt) : referenceMs;
  return getNetElapsedMinutes(startMs, endMs, timer.pauseBlocks);
}

export function getTripActiveMinutesAt(trip: TripTimerLike, referenceMs: number) {
  const explicitTimerUids = trip.workerTimers && typeof trip.workerTimers === "object"
    ? Object.keys(trip.workerTimers) : [];
  const workerUids = explicitTimerUids.length > 0 ? explicitTimerUids : getTripCrewUids(trip);
  const minutes = workerUids.map(uid => getWorkerTimerMinutesAt(trip, uid, referenceMs))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  // A valid zero-minute timer is meaningful. Do not fall back to gross time.
  if (minutes.length > 0) return Math.max(...minutes);
  const start = parseIsoMs(trip.actualStartAt || trip.startedAt || null);
  const end = trip.actualEndAt || trip.completedAt
    ? parseIsoMs(trip.actualEndAt || trip.completedAt) : referenceMs;
  return getNetElapsedMinutes(start, end, trip.pauseBlocks) ?? 0;
}

export function deriveTripTimerState(workerTimers: WorkerTimersByUid) {
  const timers = Object.values(workerTimers || {});
  if (timers.some((timer) => timer.status === "running")) return "running";
  if (timers.some((timer) => timer.status === "paused")) return "paused";
  if (timers.length > 0 && timers.every((timer) => timer.status === "complete")) {
    return "complete";
  }
  return "not_started";
}

function pauseTimer(
  timer: WorkerTripTimer,
  stamp: string,
  actorUid: string | null,
): WorkerTripTimer {
  if (timer.status !== "running") return timer;
  const pauseBlocks = Array.isArray(timer.pauseBlocks)
    ? timer.pauseBlocks.map((block) => ({ ...block }))
    : [];
  if (findOpenPauseIndex(pauseBlocks) === -1) {
    pauseBlocks.push({ startAt: stamp, endAt: null });
  }
  return {
    ...timer,
    status: "paused",
    pauseBlocks,
    updatedAt: stamp,
    updatedByUid: actorUid,
  };
}

function resumeTimer(
  timer: WorkerTripTimer,
  stamp: string,
  actorUid: string | null,
): WorkerTripTimer {
  const pauseBlocks = Array.isArray(timer.pauseBlocks)
    ? timer.pauseBlocks.map((block) => ({ ...block }))
    : [];
  const openIndex = findOpenPauseIndex(pauseBlocks);
  if (openIndex !== -1) {
    pauseBlocks[openIndex] = { ...pauseBlocks[openIndex], endAt: stamp };
  }
  return {
    ...timer,
    status: "running",
    pauseBlocks,
    endedAt: null,
    updatedAt: stamp,
    updatedByUid: actorUid,
  };
}

function newRunningTimer(
  stamp: string,
  actorUid: string | null,
): WorkerTripTimer {
  return {
    status: "running",
    startedAt: stamp,
    endedAt: null,
    pauseBlocks: [],
    updatedAt: stamp,
    updatedByUid: actorUid,
  };
}

function mapTrip(id: string, data: any): TripTimerLike {
  return {
    id,
    active: data.active !== false,
    status: data.status ?? null,
    timerState: data.timerState ?? null,
    actualStartAt: data.actualStartAt ?? data.startedAt ?? null,
    startedAt: data.startedAt ?? data.actualStartAt ?? null,
    actualEndAt: data.actualEndAt ?? data.completedAt ?? null,
    completedAt: data.completedAt ?? data.actualEndAt ?? null,
    pauseBlocks: Array.isArray(data.pauseBlocks) ? data.pauseBlocks : [],
    crew: data.crew ?? null,
    crewConfirmed: data.crewConfirmed ?? null,
    workerTimers:
      data.workerTimers && typeof data.workerTimers === "object"
        ? data.workerTimers
        : null,
    crewChangeHistory: Array.isArray(data.crewChangeHistory)
      ? data.crewChangeHistory
      : [],
    link:
      data.link && typeof data.link === "object"
        ? {
            serviceTicketId: data.link.serviceTicketId ?? null,
            projectId: data.link.projectId ?? null,
            projectStageKey: data.link.projectStageKey ?? null,
          }
        : null,
  };
}

function normalizeParticipationRole(value: unknown): TripParticipationRole {
  return safeTrim(value).toLowerCase() === "helper" ? "helper" : "technician";
}

function addWorkerToCrewSlots(args: {
  crew?: TripTimerCrew | null;
  workerUid: string;
  workerName: string;
  participationRole: TripParticipationRole;
}) {
  const crew: TripTimerCrew = { ...(args.crew || {}) };
  const workerUid = safeTrim(args.workerUid);

  if (getCrewUids(crew).includes(workerUid)) {
    throw new Error("This employee is already assigned to the trip.");
  }

  if (args.participationRole === "helper") {
    if (!safeTrim(crew.helperUid)) {
      crew.helperUid = workerUid;
      crew.helperName = args.workerName;
      crew.helperRole = "helper";
      return crew;
    }
    if (!safeTrim(crew.secondaryHelperUid)) {
      crew.secondaryHelperUid = workerUid;
      crew.secondaryHelperName = args.workerName;
      crew.secondaryHelperRole = "helper";
      return crew;
    }
    throw new Error("Both helper positions are already filled on this trip.");
  }

  if (!safeTrim(crew.primaryTechUid)) {
    crew.primaryTechUid = workerUid;
    crew.primaryTechName = args.workerName;
    crew.primaryTechRole = "technician";
    return crew;
  }
  if (!safeTrim(crew.secondaryTechUid)) {
    crew.secondaryTechUid = workerUid;
    crew.secondaryTechName = args.workerName;
    crew.secondaryTechRole = "technician";
    return crew;
  }
  throw new Error("Both technician positions are already filled on this trip.");
}

function removeWorkerFromCrewSlots(
  crew: TripTimerCrew | null | undefined,
  workerUid: string,
  allowMissing = false,
) {
  const next: TripTimerCrew = { ...(crew || {}) };
  const uid = safeTrim(workerUid);

  if (safeTrim(next.primaryTechUid) === uid) {
    throw new Error("The primary technician cannot be removed from an active trip.");
  }

  if (safeTrim(next.helperUid) === uid) {
    next.helperUid = null;
    next.helperName = null;
    next.helperRole = null;
    return next;
  }
  if (safeTrim(next.secondaryTechUid) === uid) {
    next.secondaryTechUid = null;
    next.secondaryTechName = null;
    next.secondaryTechRole = null;
    return next;
  }
  if (safeTrim(next.secondaryHelperUid) === uid) {
    next.secondaryHelperUid = null;
    next.secondaryHelperName = null;
    next.secondaryHelperRole = null;
    return next;
  }

  if (allowMissing) return next;
  throw new Error("This employee is not an active secondary crew member.");
}

function timerRoleFromCrew(crew: TripTimerCrew | null | undefined, workerUid: string) {
  const uid = safeTrim(workerUid);
  if (safeTrim(crew?.helperUid) === uid || safeTrim(crew?.secondaryHelperUid) === uid) {
    return "helper" as const;
  }
  return "technician" as const;
}

function timerNameFromCrew(crew: TripTimerCrew | null | undefined, workerUid: string) {
  const uid = safeTrim(workerUid);
  if (safeTrim(crew?.primaryTechUid) === uid) return safeTrim(crew?.primaryTechName) || uid;
  if (safeTrim(crew?.helperUid) === uid) return safeTrim(crew?.helperName) || uid;
  if (safeTrim(crew?.secondaryTechUid) === uid) return safeTrim(crew?.secondaryTechName) || uid;
  if (safeTrim(crew?.secondaryHelperUid) === uid) return safeTrim(crew?.secondaryHelperName) || uid;
  return uid;
}

export async function addWorkerToActiveTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  workerName: string;
  participationRole: TripParticipationRole;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  effectiveStartAt?: string | null;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const workerName = safeTrim(args.workerName) || workerUid;
  const participationRole = normalizeParticipationRole(args.participationRole);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;
  const requestedEffectiveStartAt = safeTrim(args.effectiveStartAt) || null;

  if (!tripId) throw new Error("Missing trip id.");
  if (!workerUid) throw new Error("Select an employee to add.");

  const targetRef = doc(args.db, "trips", tripId);
  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error("Trip not found.");

  const target = mapTrip(tripId, targetSnap.data());
  if (normalizeStatus(target.status) !== "in_progress") {
    throw new Error("Crew can only be added while the trip is in progress.");
  }

  const candidateTrips = await queryTripsForWorker(args.db, workerUid);
  const candidateIds = Array.from(new Set(candidateTrips.map((trip) => trip.id)));
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const liveTargetSnap = await tx.get(targetRef);
    if (!liveTargetSnap.exists()) throw new Error("Trip not found.");
    const liveTarget = mapTrip(tripId, liveTargetSnap.data());

    const otherTrips = new Map<string, TripTimerLike>();
    for (const candidateId of candidateIds) {
      if (candidateId === tripId) continue;
      const snap = await tx.get(doc(args.db, "trips", candidateId));
      if (snap.exists()) otherTrips.set(candidateId, mapTrip(candidateId, snap.data()));
    }

    // Read linked service tickets before any transaction writes so switching a
    // worker does not leave another ticket showing a stale running timer.
    const linkedTicketSnaps = new Map<string, Awaited<ReturnType<typeof tx.get>>>();
    for (const otherTrip of otherTrips.values()) {
      const linkedTicketId = safeTrim(otherTrip.link?.serviceTicketId);
      if (!linkedTicketId || linkedTicketSnaps.has(linkedTicketId)) continue;
      linkedTicketSnaps.set(
        linkedTicketId,
        await tx.get(doc(args.db, "serviceTickets", linkedTicketId)),
      );
    }

    if (normalizeStatus(liveTarget.status) !== "in_progress") {
      throw new Error("This trip is no longer in progress.");
    }
    if (getTripCrewUids(liveTarget).includes(workerUid)) {
      throw new Error("This employee is already assigned to the trip.");
    }

    const recordedAtMs = parseIsoMs(stamp);
    const tripStartedAt =
      safeTrim(liveTarget.actualStartAt) || safeTrim(liveTarget.startedAt) || stamp;
    const tripStartedAtMs = parseIsoMs(tripStartedAt);
    const effectiveStartAt = requestedEffectiveStartAt || stamp;
    const effectiveStartMs = parseIsoMs(effectiveStartAt);
    if (!Number.isFinite(effectiveStartMs)) {
      throw new Error("Enter a valid actual crew start time.");
    }
    if (effectiveStartMs > recordedAtMs) {
      throw new Error("Actual crew start time cannot be in the future.");
    }
    if (Number.isFinite(tripStartedAtMs) && effectiveStartMs < tripStartedAtMs) {
      throw new Error("Crew start time cannot be before the trip started.");
    }

    for (const [candidateId, otherTrip] of otherTrips.entries()) {
      const timers = materializeWorkerTimers(otherTrip, stamp);
      const timer = timers[workerUid];
      if (!timer || timer.status !== "running") continue;
      // A backdated effective join also becomes the worker's stop point on
      // another running trip, preventing overlapping payroll time.
      timers[workerUid] = pauseTimer(timer, effectiveStartAt, actorUid);
      const nextTimerState = deriveTripTimerState(timers);
      tx.update(doc(args.db, "trips", candidateId), {
        workerTimers: timers,
        timerState: nextTimerState,
        updatedAt: stamp,
        updatedByUid: actorUid,
      });

      const linkedTicketId = safeTrim(otherTrip.link?.serviceTicketId);
      const linkedTicketSnap = linkedTicketId
        ? linkedTicketSnaps.get(linkedTicketId)
        : null;
      if (linkedTicketId && linkedTicketSnap?.exists()) {
        const activeTripId = safeTrim((linkedTicketSnap.data() as any).activeTripId);
        if (!activeTripId || activeTripId === candidateId) {
          tx.update(
            doc(args.db, "serviceTickets", linkedTicketId),
            buildLinkedTicketTimerPatch({
              tripId: candidateId,
              timerState: nextTimerState,
              stamp,
              actorUid,
              actorName,
              actorRole,
            }),
          );
        }
      }
    }

    const nextCrew = addWorkerToCrewSlots({
      crew: liveTarget.crew,
      workerUid,
      workerName,
      participationRole,
    });
    const nextConfirmedCrew = addWorkerToCrewSlots({
      crew: liveTarget.crewConfirmed || liveTarget.crew,
      workerUid,
      workerName,
      participationRole,
    });

    const timers = materializeWorkerTimers(liveTarget, stamp);
    const previousTimer = timers[workerUid];
    const targetTimerState = normalizeTimerState(liveTarget.timerState, liveTarget.status);
    const participationWindows = Array.isArray(previousTimer?.participationWindows)
      ? [...previousTimer.participationWindows]
      : [];
    participationWindows.push({
      joinedAt: effectiveStartAt,
      leftAt: null,
      participationRole,
      systemJoinedAt: stamp,
    });

    const gapPauseBlocks = Array.isArray(previousTimer?.pauseBlocks)
      ? previousTimer.pauseBlocks.map((block) => ({ ...block }))
      : [];
    if (previousTimer?.endedAt) {
      gapPauseBlocks.push({ startAt: previousTimer.endedAt, endAt: stamp });
    }
    if (targetTimerState === "paused") {
      gapPauseBlocks.push({ startAt: stamp, endAt: null });
    }

    // If dispatch records that the employee actually joined before the button
    // was clicked, carry over trip pauses from that participation period so
    // only active working time is paid.
    for (const block of liveTarget.pauseBlocks || []) {
      const blockStartMs = parseIsoMs(block.startAt);
      const blockEndMs = block.endAt ? parseIsoMs(block.endAt) : recordedAtMs;
      if (blockEndMs <= effectiveStartMs || blockStartMs >= recordedAtMs) continue;
      const startAt = new Date(Math.max(blockStartMs, effectiveStartMs)).toISOString();
      const endAt = block.endAt
        ? new Date(Math.min(blockEndMs, recordedAtMs)).toISOString()
        : null;
      if (!gapPauseBlocks.some((existing) =>
        existing.startAt === startAt && existing.endAt === endAt)) {
        gapPauseBlocks.push({ startAt, endAt });
      }
    }

    timers[workerUid] = {
      status: targetTimerState === "paused" ? "paused" : "running",
      startedAt: previousTimer?.startedAt || effectiveStartAt,
      endedAt: null,
      pauseBlocks: gapPauseBlocks,
      updatedAt: stamp,
      updatedByUid: actorUid,
      workerName,
      participationRole,
      joinedAt: effectiveStartAt,
      leftAt: null,
      systemAddedAt: stamp,
      effectiveJoinedAt: effectiveStartAt,
      addedMidTrip: true,
      addedByUid: actorUid,
      addedByName: actorName,
      addedByRole: actorRole,
      removedByUid: null,
      removedByName: null,
      removedByRole: null,
      participationWindows,
    };

    const history = Array.isArray(liveTarget.crewChangeHistory)
      ? [...liveTarget.crewChangeHistory]
      : [];
    history.push({
      action: "added",
      workerUid,
      workerName,
      participationRole,
      at: stamp,
      effectiveAt: effectiveStartAt,
      actorUid,
      actorName,
      actorRole,
    });

    tx.update(targetRef, {
      crew: nextCrew,
      crewConfirmed: nextConfirmedCrew,
      workerTimers: timers,
      timerState: deriveTripTimerState(timers),
      crewChangeHistory: history,
      updatedAt: stamp,
      updatedByUid: actorUid,
    });

    return {
      stamp,
      effectiveStartAt,
      crew: nextCrew,
      crewConfirmed: nextConfirmedCrew,
      workerTimers: timers,
    };
  });
}

/**
 * Applies a closeout correction to the most recent participation window.
 * This is intentionally pure: the caller commits the returned workerTimers in
 * the same transaction that creates payroll entries.
 */
export function applyWorkerParticipationAdjustment(args: {
  trip: TripTimerLike;
  workerUid: string;
  effectiveJoinedAt: string;
  effectiveLeftAt: string;
  adjustedAt: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}) {
  const workerUid = safeTrim(args.workerUid);
  const joinedAt = safeTrim(args.effectiveJoinedAt);
  const leftAt = safeTrim(args.effectiveLeftAt);
  const adjustedAt = safeTrim(args.adjustedAt) || new Date().toISOString();
  const joinedMs = parseIsoMs(joinedAt);
  const leftMs = parseIsoMs(leftAt);
  const tripStartMs = parseIsoMs(args.trip.actualStartAt || args.trip.startedAt || null);
  const adjustedMs = parseIsoMs(adjustedAt);

  if (!workerUid) throw new Error("Missing crew member.");
  if (!Number.isFinite(joinedMs) || !Number.isFinite(leftMs)) {
    throw new Error("Enter valid crew start and end times.");
  }
  if (leftMs <= joinedMs) {
    throw new Error("Crew end time must be after their start time.");
  }
  if (Number.isFinite(tripStartMs) && joinedMs < tripStartMs) {
    throw new Error("Crew start time cannot be before the trip started.");
  }
  if (Number.isFinite(adjustedMs) && leftMs > adjustedMs) {
    throw new Error("Crew end time cannot be after trip closeout.");
  }

  const timers = materializeWorkerTimers(args.trip, adjustedAt);
  const timer = timers[workerUid];
  if (!timer || (!timer.addedMidTrip && !timer.removedByUid)) {
    throw new Error("Only partial crew members can use individual crew time.");
  }
  const windows = Array.isArray(timer.participationWindows)
    ? timer.participationWindows.map((window) => ({ ...window }))
    : [];
  const windowIndex = windows.length - 1;
  const currentWindow = windowIndex >= 0
    ? windows[windowIndex]
    : {
        joinedAt: timer.joinedAt || timer.startedAt,
        leftAt: timer.leftAt || timer.endedAt || null,
        participationRole: (timer.participationRole || "helper") as TripParticipationRole,
        systemJoinedAt: timer.systemAddedAt || timer.joinedAt || timer.startedAt,
      };
  const previousJoinedAt = currentWindow.joinedAt;
  const previousLeftAt = currentWindow.leftAt || null;
  const nextWindow = { ...currentWindow, joinedAt, leftAt };
  if (windowIndex >= 0) windows[windowIndex] = nextWindow;
  else windows.push(nextWindow);

  const pauseBlocks = Array.isArray(timer.pauseBlocks)
    ? timer.pauseBlocks.map((block) => ({ ...block }))
    : [];
  for (const block of args.trip.pauseBlocks || []) {
    if (!pauseBlocks.some((existing) =>
      existing.startAt === block.startAt && existing.endAt === block.endAt)) {
      pauseBlocks.push({ ...block });
    }
  }

  const changed = previousJoinedAt !== joinedAt || previousLeftAt !== leftAt;
  const history = Array.isArray(timer.timeAdjustmentHistory)
    ? [...timer.timeAdjustmentHistory]
    : [];
  if (changed) {
    history.push({
      previousJoinedAt,
      previousLeftAt,
      effectiveJoinedAt: joinedAt,
      effectiveLeftAt: leftAt,
      adjustedAt,
      adjustedByUid: safeTrim(args.actorUid) || null,
      adjustedByName: safeTrim(args.actorName) || null,
      adjustedByRole: safeTrim(args.actorRole) || null,
    });
  }

  timers[workerUid] = {
    ...timer,
    status: "complete",
    startedAt: timer.startedAt === previousJoinedAt ? joinedAt : timer.startedAt,
    endedAt: leftAt,
    joinedAt,
    leftAt,
    effectiveJoinedAt: joinedAt,
    pauseBlocks,
    participationWindows: windows,
    timeAdjustmentHistory: history,
    updatedAt: adjustedAt,
    updatedByUid: safeTrim(args.actorUid) || null,
  };
  return timers;
}

export async function removeWorkerFromActiveTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;
  if (!tripId) throw new Error("Missing trip id.");
  if (!workerUid) throw new Error("Missing employee id.");

  const tripRef = doc(args.db, "trips", tripId);
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists()) throw new Error("Trip not found.");
    const trip = mapTrip(tripId, snap.data());
    if (normalizeStatus(trip.status) !== "in_progress") {
      throw new Error("Crew can only be removed while the trip is in progress.");
    }

    const participationRole = timerRoleFromCrew(trip.crew, workerUid);
    const workerName = timerNameFromCrew(trip.crew, workerUid);
    const nextCrew = removeWorkerFromCrewSlots(trip.crew, workerUid);
    const nextConfirmedCrew = removeWorkerFromCrewSlots(
      trip.crewConfirmed || trip.crew,
      workerUid,
      true,
    );

    const timers = materializeWorkerTimers(trip, stamp);
    const current = timers[workerUid];
    if (!current) throw new Error("No active timer was found for this employee.");
    if (current.status === "complete") {
      throw new Error("This employee has already left the trip.");
    }

    const pauseBlocks = Array.isArray(current.pauseBlocks)
      ? current.pauseBlocks.map((block) => ({ ...block }))
      : [];
    const openPauseIndex = findOpenPauseIndex(pauseBlocks);
    if (openPauseIndex !== -1) {
      pauseBlocks[openPauseIndex] = { ...pauseBlocks[openPauseIndex], endAt: stamp };
    }
    const participationWindows = Array.isArray(current.participationWindows)
      ? current.participationWindows.map((window) => ({ ...window }))
      : [];
    let openWindowIndex = -1;
    for (let index = participationWindows.length - 1; index >= 0; index -= 1) {
      if (!participationWindows[index]?.leftAt) {
        openWindowIndex = index;
        break;
      }
    }
    if (openWindowIndex !== -1) {
      participationWindows[openWindowIndex] = {
        ...participationWindows[openWindowIndex],
        leftAt: stamp,
      };
    }

    timers[workerUid] = {
      ...current,
      status: "complete",
      endedAt: stamp,
      pauseBlocks,
      updatedAt: stamp,
      updatedByUid: actorUid,
      workerName: current.workerName || workerName,
      participationRole: current.participationRole || participationRole,
      leftAt: stamp,
      removedByUid: actorUid,
      removedByName: actorName,
      removedByRole: actorRole,
      participationWindows,
    };

    const history = Array.isArray(trip.crewChangeHistory)
      ? [...trip.crewChangeHistory]
      : [];
    history.push({
      action: "removed",
      workerUid,
      workerName,
      participationRole,
      at: stamp,
      actorUid,
      actorName,
      actorRole,
    });

    tx.update(tripRef, {
      crew: nextCrew,
      crewConfirmed: nextConfirmedCrew,
      workerTimers: timers,
      timerState: deriveTripTimerState(timers),
      crewChangeHistory: history,
      updatedAt: stamp,
      updatedByUid: actorUid,
    });

    return { stamp, crew: nextCrew, crewConfirmed: nextConfirmedCrew, workerTimers: timers };
  });
}

async function queryTripsForWorker(db: Firestore, workerUid: string) {
  const base = collection(db, "trips");
  const crewPaths = [
    "crew.primaryTechUid",
    "crew.helperUid",
    "crew.secondaryTechUid",
    "crew.secondaryHelperUid",
    "crewConfirmed.primaryTechUid",
    "crewConfirmed.helperUid",
    "crewConfirmed.secondaryTechUid",
    "crewConfirmed.secondaryHelperUid",
  ];

  const crewSnapshots = await Promise.all(
    crewPaths.map((fieldPath) =>
      getDocs(
        query(
          base,
          where("active", "==", true),
          where("status", "==", "in_progress"),
          where(fieldPath, "==", workerUid),
        ),
      ).catch(() => null),
    ),
  );

  // This catches workers added after a trip began even if the crew fields
  // were not fully synchronized. If Firestore needs an index for this query,
  // the crew/crewConfirmed queries above still provide a safe fallback.
  const timerSnapshot = await getDocs(
    query(
      base,
      where("active", "==", true),
      where("status", "==", "in_progress"),
      where(new FieldPath("workerTimers", workerUid, "status"), "==", "running"),
    ),
  ).catch(() => null);

  // Guaranteed fallback: load the relatively small set of in-progress trips
  // and filter locally. This protects switching when a field-path query is
  // unavailable because of an index/rules gap or when crew fields and
  // workerTimers are temporarily out of sync.
  const inProgressSnapshot = await getDocs(
    query(base, where("status", "==", "in_progress")),
  ).catch(() => null);

  const byId = new Map<string, TripTimerLike>();

  for (const snapshot of [
    ...crewSnapshots,
    timerSnapshot,
    inProgressSnapshot,
  ]) {
    if (!snapshot) continue;

    for (const row of snapshot.docs) {
      const trip = mapTrip(row.id, row.data());
      if (trip.active === false) continue;

      const belongsToWorker =
        getTripCrewUids(trip).includes(workerUid) ||
        Boolean(trip.workerTimers?.[workerUid]);

      if (!belongsToWorker) continue;

      byId.set(row.id, trip);
    }
  }

  return Array.from(byId.values());
}

function buildLinkedTicketTimerPatch(args: {
  tripId: string;
  timerState: string;
  stamp: string;
  actorUid: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}) {
  return {
    activeTripId: args.tripId,
    activeTripTimerState: args.timerState,
    activeTripPaused: args.timerState === "paused",
    updatedAt: args.stamp,
    updatedByUid: args.actorUid,
    updatedByName: args.actorName || null,
    updatedByRole: args.actorRole || null,
  };
}

export async function switchWorkerToTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  startWholeCrewWhenTripNotStarted?: boolean;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;

  if (!tripId) throw new Error("Missing trip id.");
  if (!workerUid) throw new Error("Missing worker id.");

  const targetRef = doc(args.db, "trips", tripId);
  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error("Trip not found.");

  const target = mapTrip(targetSnap.id, targetSnap.data());
  const targetStatus = normalizeStatus(target.status);

  if (targetStatus === "complete" || targetStatus === "cancelled") {
    throw new Error("This trip is no longer available to start.");
  }

  const targetCrewUids = getTripCrewUids(target);

  if (!targetCrewUids.includes(workerUid)) {
    throw new Error("This employee is not assigned to the trip.");
  }

  const targetState = normalizeTimerState(target.timerState, target.status);

  /*
   * Trip timer controls are crew-level operations.
   *
   * When any assigned technician, helper, or apprentice starts or resumes a
   * trip, every assigned crew timer starts/resumes together. Each crew member
   * is also paused from any other running trip before this trip starts.
   *
   * This keeps Start, Pause, Resume, and Closeout symmetrical and prevents a
   * technician from remaining paused while their apprentice resumes the job.
   */
  const shouldStartWholeCrew =
    targetStatus !== "in_progress" && targetState === "not_started";
  const workersToStart = targetCrewUids;

  const candidateTripsById = new Map<string, TripTimerLike>();

  for (const uid of workersToStart) {
    const trips = await queryTripsForWorker(args.db, uid);
    for (const trip of trips) {
      candidateTripsById.set(trip.id, trip);
    }
  }

  candidateTripsById.set(target.id, target);

  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const liveTrips = new Map<string, TripTimerLike>();

    for (const candidateId of candidateTripsById.keys()) {
      const snap = await tx.get(doc(args.db, "trips", candidateId));
      if (snap.exists()) {
        liveTrips.set(candidateId, mapTrip(candidateId, snap.data()));
      }
    }

    const liveTarget = liveTrips.get(tripId);
    if (!liveTarget) throw new Error("Trip not found.");

    const shouldSyncLinkedTickets = args.syncLinkedServiceTicket !== false;
    const linkedTicketIds = new Set<string>();

    if (shouldSyncLinkedTickets) {
      for (const trip of liveTrips.values()) {
        const ticketId = safeTrim(trip.link?.serviceTicketId);
        if (ticketId) linkedTicketIds.add(ticketId);
      }
    }

    const linkedTicketSnaps = new Map<string, Awaited<ReturnType<typeof tx.get>>>();
    for (const ticketId of linkedTicketIds) {
      const ticketRef = doc(args.db, "serviceTickets", ticketId);
      linkedTicketSnaps.set(ticketId, await tx.get(ticketRef));
    }

    const changedPreviousTrips = new Map<
      string,
      { trip: TripTimerLike; timers: WorkerTimersByUid; timerState: string }
    >();

    for (const uid of workersToStart) {
      for (const [candidateId, candidate] of liveTrips.entries()) {
        if (candidateId === tripId) continue;

        const existingChange = changedPreviousTrips.get(candidateId);
        const timers = existingChange
          ? existingChange.timers
          : materializeWorkerTimers(candidate, stamp);
        const current = timers[uid];

        if (!current || current.status !== "running") continue;

        const currentStartedAt = safeTrim(current.startedAt);
        const currentUpdatedAt = safeTrim(current.updatedAt);
        const currentUpdatedByUid = safeTrim(current.updatedByUid);

        timers[uid] = pauseTimer(current, stamp, actorUid);

        // Clean up stale sibling timers created by the former whole-crew start
        // behavior. Only pause a sibling when its timer has the exact same
        // start/update signature and actor as the worker being switched. A
        // coworker who has independently paused, resumed, or otherwise touched
        // their timer will have a different update signature and remains live.
        if (
          currentStartedAt &&
          currentUpdatedAt &&
          currentUpdatedByUid
        ) {
          for (const [siblingUid, siblingTimer] of Object.entries(timers)) {
            if (siblingUid === uid || siblingTimer.status !== "running") {
              continue;
            }

            const siblingUpdatedByUid = safeTrim(
              siblingTimer.updatedByUid,
            );

            const wasAutoStartedTogether =
              safeTrim(siblingTimer.startedAt) === currentStartedAt &&
              safeTrim(siblingTimer.updatedAt) === currentUpdatedAt &&
              siblingUpdatedByUid === currentUpdatedByUid;

            // A timer last updated by somebody other than the employee whose
            // timer it is was started/managed on that employee's behalf. This
            // includes stale whole-crew timers created by the older workflow.
            // Preserve a coworker's timer only after that coworker has
            // personally started or resumed it.
            const wasManagedForSibling =
              Boolean(siblingUpdatedByUid) &&
              siblingUpdatedByUid !== siblingUid;

            if (wasAutoStartedTogether || wasManagedForSibling) {
              timers[siblingUid] = pauseTimer(
                siblingTimer,
                stamp,
                actorUid,
              );
            }
          }
        }

        changedPreviousTrips.set(candidateId, {
          trip: candidate,
          timers,
          timerState: deriveTripTimerState(timers),
        });
      }
    }

    for (const [candidateId, change] of changedPreviousTrips.entries()) {
      tx.update(doc(args.db, "trips", candidateId), {
        workerTimers: change.timers,
        timerState: change.timerState,
        updatedAt: stamp,
        updatedByUid: actorUid,
      });

      const previousTicketId = safeTrim(change.trip.link?.serviceTicketId);
      const previousTicketSnap = previousTicketId
        ? linkedTicketSnaps.get(previousTicketId)
        : null;

      if (previousTicketId && previousTicketSnap?.exists()) {
        const previousTicket = previousTicketSnap.data() as any;
        const activeTripId = safeTrim(previousTicket.activeTripId);

        if (!activeTripId || activeTripId === candidateId) {
          tx.update(
            doc(args.db, "serviceTickets", previousTicketId),
            buildLinkedTicketTimerPatch({
              tripId: candidateId,
              timerState: change.timerState,
              stamp,
              actorUid,
              actorName,
              actorRole,
            }),
          );
        }
      }
    }

    const targetTimers = materializeWorkerTimers(liveTarget, stamp);

    for (const uid of workersToStart) {
      const current = targetTimers[uid];
      targetTimers[uid] = current
        ? resumeTimer(current, stamp, actorUid)
        : newRunningTimer(stamp, actorUid);
    }

    const targetPatch = {
      status: "in_progress",
      timerState: deriveTripTimerState(targetTimers),
      workerTimers: targetTimers,
      actualStartAt: liveTarget.actualStartAt || stamp,
      actualEndAt: null,
      active: true,
      updatedAt: stamp,
      updatedByUid: actorUid,
    };

    tx.update(targetRef, targetPatch);

    const linkedServiceTicketId = shouldSyncLinkedTickets
      ? safeTrim(liveTarget.link?.serviceTicketId)
      : "";
    const linkedTicketSnap = linkedServiceTicketId
      ? linkedTicketSnaps.get(linkedServiceTicketId)
      : null;

    let linkedServiceTicketUpdated = false;

    if (linkedServiceTicketId && linkedTicketSnap?.exists()) {
      const liveTicket = linkedTicketSnap.data() as any;
      const liveTicketStatus = safeTrim(liveTicket.status).toLowerCase();

      if (
        liveTicketStatus !== "invoiced" &&
        liveTicketStatus !== "cancelled"
      ) {
        tx.update(doc(args.db, "serviceTickets", linkedServiceTicketId), {
          status: "in_progress",
          scheduledTripId: liveTicket.scheduledTripId || tripId,
          ...buildLinkedTicketTimerPatch({
            tripId,
            timerState: targetPatch.timerState,
            stamp,
            actorUid,
            actorName,
            actorRole,
          }),
        });

        linkedServiceTicketUpdated = true;
      }
    }

    return {
      tripId,
      workerUid,
      startedCrewUids: workersToStart,
      startedWholeCrew: workersToStart.length > 1,
      stamp,
      workerTimers: targetTimers,
      timerState: targetPatch.timerState,
      linkedServiceTicketId: linkedServiceTicketId || null,
      linkedServiceTicketUpdated,
      linkedServiceTicketStatus: linkedServiceTicketUpdated
        ? "in_progress"
        : null,
    };
  });
}

export async function pauseWorkerOnTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;

  if (!tripId) throw new Error("Missing trip id.");
  if (!workerUid) throw new Error("Missing worker id.");

  const tripRef = doc(args.db, "trips", tripId);
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists()) throw new Error("Trip not found.");

    const trip = mapTrip(tripId, snap.data());
    const linkedServiceTicketId =
      args.syncLinkedServiceTicket === false
        ? ""
        : safeTrim(trip.link?.serviceTicketId);
    const linkedTicketRef = linkedServiceTicketId
      ? doc(args.db, "serviceTickets", linkedServiceTicketId)
      : null;
    const linkedTicketSnap = linkedTicketRef
      ? await tx.get(linkedTicketRef)
      : null;

    const timers = materializeWorkerTimers(trip, stamp);
    const current = timers[workerUid];

    if (!current) {
      throw new Error("No timer exists for this employee on the trip.");
    }

    if (current.status !== "paused") {
      if (current.status !== "running") {
        throw new Error("This employee's timer is not running.");
      }

      timers[workerUid] = pauseTimer(current, stamp, actorUid);
    }

    const timerState = deriveTripTimerState(timers);

    tx.update(tripRef, {
      workerTimers: timers,
      timerState,
      updatedAt: stamp,
      updatedByUid: actorUid,
    });

    if (linkedTicketRef && linkedTicketSnap?.exists()) {
      const liveTicket = linkedTicketSnap.data() as any;
      const activeTripId = safeTrim(liveTicket.activeTripId);

      if (!activeTripId || activeTripId === tripId) {
        tx.update(
          linkedTicketRef,
          buildLinkedTicketTimerPatch({
            tripId,
            timerState,
            stamp,
            actorUid,
            actorName,
            actorRole,
          }),
        );
      }
    }

    return { workerTimers: timers, timerState, stamp };
  });
}

export async function pauseAllWorkersOnTrip(args: {
  db: Firestore;
  tripId: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;

  if (!tripId) throw new Error("Missing trip id.");

  const tripRef = doc(args.db, "trips", tripId);
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists()) throw new Error("Trip not found.");

    const trip = mapTrip(tripId, snap.data());
    const linkedServiceTicketId =
      args.syncLinkedServiceTicket === false
        ? ""
        : safeTrim(trip.link?.serviceTicketId);
    const linkedTicketRef = linkedServiceTicketId
      ? doc(args.db, "serviceTickets", linkedServiceTicketId)
      : null;
    const linkedTicketSnap = linkedTicketRef
      ? await tx.get(linkedTicketRef)
      : null;

    const timers = materializeWorkerTimers(trip, stamp);
    const crewUids = getTripCrewUids(trip);

    if (crewUids.length === 0) {
      throw new Error("No assigned crew was found on this trip.");
    }

    let changed = false;
    for (const uid of crewUids) {
      const current = timers[uid];
      if (!current || current.status !== "running") continue;
      timers[uid] = pauseTimer(current, stamp, actorUid);
      changed = true;
    }

    const timerState = deriveTripTimerState(timers);

    if (changed) {
      tx.update(tripRef, {
        workerTimers: timers,
        timerState,
        updatedAt: stamp,
        updatedByUid: actorUid,
      });
    }

    if (linkedTicketRef && linkedTicketSnap?.exists()) {
      const liveTicket = linkedTicketSnap.data() as any;
      const activeTripId = safeTrim(liveTicket.activeTripId);

      if (!activeTripId || activeTripId === tripId) {
        tx.update(
          linkedTicketRef,
          buildLinkedTicketTimerPatch({
            tripId,
            timerState,
            stamp,
            actorUid,
            actorName,
            actorRole,
          }),
        );
      }
    }

    return {
      workerTimers: timers,
      timerState,
      stamp,
      affectedWorkerUids: crewUids.filter(
        (uid) => timers[uid]?.status === "paused",
      ),
    };
  });
}

export async function resumeWorkerOnTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  return switchWorkerToTrip({
    db: args.db,
    tripId: args.tripId,
    workerUid: args.workerUid,
    actorUid: args.actorUid,
    actorName: args.actorName,
    actorRole: args.actorRole,
    startWholeCrewWhenTripNotStarted: false,
    syncLinkedServiceTicket: args.syncLinkedServiceTicket,
  });
}

export async function resumeAllWorkersOnTrip(args: {
  db: Firestore;
  tripId: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const actorUid = safeTrim(args.actorUid) || null;

  if (!tripId) throw new Error("Missing trip id.");

  const tripRef = doc(args.db, "trips", tripId);
  const initialSnap = await getDoc(tripRef);
  if (!initialSnap.exists()) throw new Error("Trip not found.");

  const initialTrip = mapTrip(tripId, initialSnap.data());
  const status = normalizeStatus(initialTrip.status);

  if (status === "complete" || status === "cancelled") {
    throw new Error("This trip is no longer available to resume.");
  }

  const crewUids = getTripCrewUids(initialTrip);
  if (crewUids.length === 0) {
    throw new Error("No assigned crew was found on this trip.");
  }

  // switchWorkerToTrip now performs one atomic crew-wide start/resume and
  // pauses every crew member from any other running trip.
  return switchWorkerToTrip({
    db: args.db,
    tripId,
    workerUid: crewUids[0],
    actorUid,
    actorName: args.actorName,
    actorRole: args.actorRole,
    startWholeCrewWhenTripNotStarted: true,
    syncLinkedServiceTicket: args.syncLinkedServiceTicket,
  });
}

export function completeAllWorkerTimers(
  trip: TripTimerLike,
  stamp: string,
  actorUid?: string | null,
) {
  const timers = materializeWorkerTimers(trip, stamp);
  for (const [uid, timer] of Object.entries(timers)) {
    // A worker removed before trip closeout already has an authoritative
    // endedAt/leftAt. Never extend that employee's paid time to trip closeout.
    if (timer.status === "complete" && timer.endedAt) continue;
    const pauseBlocks = Array.isArray(timer.pauseBlocks)
      ? timer.pauseBlocks.map((block) => ({ ...block }))
      : [];
    const openIndex = findOpenPauseIndex(pauseBlocks);
    if (openIndex !== -1) {
      pauseBlocks[openIndex] = { ...pauseBlocks[openIndex], endAt: stamp };
    }
    const participationWindows = Array.isArray(timer.participationWindows)
      ? timer.participationWindows.map((window) => ({ ...window }))
      : [];
    for (let index = participationWindows.length - 1; index >= 0; index -= 1) {
      if (!participationWindows[index]?.leftAt) {
        participationWindows[index] = {
          ...participationWindows[index],
          leftAt: stamp,
        };
        break;
      }
    }
    timers[uid] = {
      ...timer,
      status: "complete",
      endedAt: stamp,
      leftAt: timer.leftAt || stamp,
      pauseBlocks,
      participationWindows,
      updatedAt: stamp,
      updatedByUid: safeTrim(actorUid) || null,
    };
  }
  return timers;
}
